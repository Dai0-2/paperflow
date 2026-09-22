import type { PaperInfo } from '../../types';
import { normalizeIdentifier } from './paperIdentity';

export type MetadataPatch = Partial<Pick<
  PaperInfo,
  'title' | 'shortTitle' | 'authors' | 'year' | 'abstract' | 'journal' | 'doi' | 'arxivId' | 'openReviewId'
>>;

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (value && typeof value === 'object' && 'value' in value) {
    return textValue((value as { value?: unknown }).value);
  }
  return undefined;
}

function yearValue(value: unknown): string | undefined {
  if (!Array.isArray(value) || !Array.isArray(value[0])) return undefined;
  const year = value[0][0];
  return typeof year === 'number' || typeof year === 'string' ? String(year) : undefined;
}

async function requestPermission(originPattern: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return;
  const granted = await chrome.permissions.request({ origins: [originPattern] });
  if (!granted) throw new Error('PaperFlow needs temporary access to the metadata provider.');
}

async function refreshCrossref(doi: string, fetcher: typeof fetch): Promise<MetadataPatch> {
  await requestPermission('https://api.crossref.org/*');
  const response = await fetcher(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!response.ok) throw new Error(`Crossref returned ${response.status}.`);
  const payload = await response.json() as {
    message?: {
      title?: unknown[];
      author?: Array<{ given?: unknown; family?: unknown }>;
      abstract?: unknown;
      'container-title'?: unknown[];
      DOI?: unknown;
      issued?: { 'date-parts'?: unknown };
      published?: { 'date-parts'?: unknown };
    };
  };
  const message = payload.message;
  if (!message) throw new Error('Crossref returned an invalid response.');
  const title = textValue(message.title?.[0]);
  const authors = message.author
    ?.map((author) => [textValue(author.given), textValue(author.family)].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');
  return {
    title,
    shortTitle: title?.slice(0, 80),
    authors: authors || undefined,
    year: yearValue(message.issued?.['date-parts']) || yearValue(message.published?.['date-parts']),
    abstract: textValue(message.abstract)?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    journal: textValue(message['container-title']?.[0]),
    doi: normalizeIdentifier(textValue(message.DOI)) || doi,
  };
}

async function refreshArxiv(arxivId: string, fetcher: typeof fetch): Promise<MetadataPatch> {
  const response = await fetcher(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`);
  if (!response.ok) throw new Error(`arXiv returned ${response.status}.`);
  const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
  const entry = xml.querySelector('entry');
  if (!entry) throw new Error('arXiv did not return a matching paper.');
  const title = entry.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim();
  const authors = [...entry.querySelectorAll('author > name')]
    .map((node) => node.textContent?.trim())
    .filter((value): value is string => Boolean(value))
    .join(', ');
  return {
    title,
    shortTitle: title?.slice(0, 80),
    authors: authors || undefined,
    year: entry.querySelector('published')?.textContent?.slice(0, 4),
    abstract: entry.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim(),
    journal: entry.querySelector('journal_ref')?.textContent?.trim(),
    arxivId,
  };
}

async function refreshOpenReview(openReviewId: string, fetcher: typeof fetch): Promise<MetadataPatch> {
  await requestPermission('https://api2.openreview.net/*');
  const response = await fetcher(`https://api2.openreview.net/notes?forum=${encodeURIComponent(openReviewId)}&limit=1`);
  if (!response.ok) throw new Error(`OpenReview returned ${response.status}.`);
  const payload = await response.json() as {
    notes?: Array<{
      content?: Record<string, unknown>;
      cdate?: number;
    }>;
  };
  const note = payload.notes?.[0];
  if (!note) throw new Error('OpenReview did not return a matching paper.');
  const title = textValue(note.content?.title);
  const rawAuthors = note.content?.authors;
  const authors = Array.isArray(rawAuthors)
    ? rawAuthors.map(textValue).filter((value): value is string => Boolean(value)).join(', ')
    : textValue(rawAuthors);
  return {
    title,
    shortTitle: title?.slice(0, 80),
    authors: authors || undefined,
    year: note.cdate ? String(new Date(note.cdate).getUTCFullYear()) : undefined,
    abstract: textValue(note.content?.abstract),
    journal: textValue(note.content?.venue),
    openReviewId,
  };
}

export async function refreshPaperMetadata(
  paper: PaperInfo,
  fetcher: typeof fetch = fetch,
): Promise<MetadataPatch> {
  if (paper.doi) return refreshCrossref(normalizeIdentifier(paper.doi) || paper.doi, fetcher);
  if (paper.arxivId) return refreshArxiv(normalizeIdentifier(paper.arxivId) || paper.arxivId, fetcher);
  if (paper.openReviewId) {
    return refreshOpenReview(normalizeIdentifier(paper.openReviewId) || paper.openReviewId, fetcher);
  }
  throw new Error('Add a DOI, arXiv ID, or OpenReview ID before refreshing metadata.');
}
