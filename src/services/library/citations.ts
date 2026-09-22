import { Cite, type CSL, type CSLName } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';
import '@citation-js/plugin-ris';
import type { PaperInfo } from '../../types';
import { importPaperToLibrary, updatePaperMetadata } from '../../repositories/libraryRepository';
import {
  canonicalUrl,
  identityCandidates,
  isPossibleDuplicate,
  normalizeIdentifier,
} from './paperIdentity';

export type CitationFormat = 'apa' | 'mla' | 'chicago' | 'ieee' | 'bibtex';
export type ReferenceExportFormat = 'bibtex' | 'ris';
export type ImportDisposition = 'new' | 'update' | 'duplicate';

export interface ImportPreviewItem {
  id: string;
  paper: PaperInfo;
  disposition: ImportDisposition;
  existingPaperId?: string;
  warnings: string[];
}

export interface ImportPreview {
  items: ImportPreviewItem[];
  errors: string[];
}

function authorText(author?: CSLName[]): string | undefined {
  const names = author
    ?.map((name) => name.literal || [name.given, name.family].filter(Boolean).join(' '))
    .filter(Boolean);
  return names?.length ? names.join(', ') : undefined;
}

function issuedYear(item: CSL): string | undefined {
  const value = item.issued?.['date-parts']?.[0]?.[0];
  return value === undefined ? undefined : String(value);
}

function paperFromCsl(item: CSL): PaperInfo {
  const title = item.title?.trim() || 'Untitled reference';
  const doi = normalizeIdentifier(item.DOI);
  const url = (item.URL ? canonicalUrl(item.URL) : doi ? `https://doi.org/${doi}` : '') || '';
  return {
    id: `paper:import:${crypto.randomUUID()}`,
    shortTitle: item['title-short']?.trim() || title.slice(0, 80),
    title,
    authors: authorText(item.author),
    year: issuedYear(item),
    source: item['container-title'] || item.publisher || 'Imported reference',
    url,
    doi,
    abstract: item.abstract,
    journal: item['container-title'],
    favorite: false,
    readStatus: 'unread',
    libraryState: 'saved',
  };
}

function exactMatch(imported: PaperInfo, existing: PaperInfo[]): PaperInfo | undefined {
  const candidates = new Set(identityCandidates(imported).map(({ kind, value }) => `${kind}:${value}`));
  return existing.find((paper) =>
    identityCandidates(paper).some(({ kind, value }) =>
      kind !== 'title-author' && candidates.has(`${kind}:${value}`),
    ),
  );
}

export function previewReferenceImport(input: string, existing: PaperInfo[]): ImportPreview {
  const trimmed = input.trim();
  if (!trimmed) return { items: [], errors: ['Choose a BibTeX or RIS file, or paste reference data.'] };
  try {
    const cite = new Cite(trimmed);
    if (!cite.data.length) return { items: [], errors: ['No references were found in the supplied data.'] };
    const items = cite.data.map((item) => {
      const paper = paperFromCsl(item);
      const exact = exactMatch(paper, existing);
      const possible = exact
        ? undefined
        : existing.find((candidate) => isPossibleDuplicate(paper, candidate));
      const warnings: string[] = [];
      if (!paper.authors) warnings.push('Missing authors');
      if (!paper.year) warnings.push('Missing year');
      if (!paper.doi && !paper.url) warnings.push('Missing DOI or URL');
      return {
        id: crypto.randomUUID(),
        paper,
        disposition: exact ? 'update' as const : possible ? 'duplicate' as const : 'new' as const,
        existingPaperId: exact?.id || possible?.id,
        warnings,
      };
    });
    return { items, errors: [] };
  } catch (error) {
    return {
      items: [],
      errors: [error instanceof Error ? error.message : 'The reference data could not be parsed.'],
    };
  }
}

export async function commitReferenceImport(items: ImportPreviewItem[]): Promise<PaperInfo[]> {
  const saved: PaperInfo[] = [];
  for (const item of items) {
    if (item.disposition === 'duplicate') continue;
    if (item.disposition === 'update' && item.existingPaperId) {
      saved.push(await updatePaperMetadata(item.existingPaperId, {
        title: item.paper.title,
        shortTitle: item.paper.shortTitle,
        authors: item.paper.authors,
        year: item.paper.year,
        abstract: item.paper.abstract,
        journal: item.paper.journal,
        doi: item.paper.doi,
      }));
      continue;
    }
    saved.push(await importPaperToLibrary(item.paper));
  }
  return saved;
}

function namesFromText(authors?: string): CSLName[] | undefined {
  const names = authors
    ?.split(/\s*(?:;|\band\b)\s*|\s*,\s*(?=[A-Z][a-z]+(?:\s|$))/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((literal) => ({ literal }));
  return names?.length ? names : undefined;
}

export function paperToCsl(paper: PaperInfo): CSL {
  const year = Number.parseInt(paper.year || '', 10);
  return {
    id: paper.id,
    type: 'article-journal',
    title: paper.title,
    'title-short': paper.shortTitle,
    author: namesFromText(paper.authors),
    issued: Number.isFinite(year) ? { 'date-parts': [[year]] } : undefined,
    'container-title': paper.journal || paper.source || undefined,
    DOI: paper.doi,
    URL: paper.url || undefined,
    abstract: paper.abstract,
  };
}

export function exportReferences(papers: PaperInfo[], format: ReferenceExportFormat): string {
  return new Cite(papers.map(paperToCsl)).format(format);
}

function authorLead(paper: PaperInfo): string {
  return paper.authors?.trim() || 'Unknown author';
}

function quotedTitle(paper: PaperInfo): string {
  return `“${paper.title}.”`;
}

export function formatCitation(paper: PaperInfo, format: CitationFormat): string {
  if (format === 'bibtex') return exportReferences([paper], 'bibtex').trim();
  if (format === 'apa') {
    return new Cite([paperToCsl(paper)])
      .format('bibliography', { style: 'apa', format: 'text' })
      .trim();
  }
  const author = authorLead(paper);
  const year = paper.year || 'n.d.';
  const venue = paper.journal || paper.source || '';
  const doi = paper.doi ? `https://doi.org/${paper.doi}` : paper.url;
  const suffix = [venue, doi].filter(Boolean).join(', ');
  if (format === 'mla') return `${author}. ${quotedTitle(paper)} ${suffix}${suffix ? '.' : ''}`.trim();
  if (format === 'chicago') return `${author}. ${year}. ${quotedTitle(paper)} ${suffix}${suffix ? '.' : ''}`.trim();
  return `${author}, “${paper.title},” ${venue}${venue ? ', ' : ''}${year}${doi ? `, ${doi}` : ''}.`;
}
