import type { Citation, PaperChunk, PaperInfo, PaperSelection } from '../types';

const MAX_CHUNK_LENGTH = 3_200;
const MAX_CONTEXT_LENGTH = 18_000;
const MAX_CONTEXT_CHUNKS = 6;

function sectionHeading(line: string) {
  const value = line.trim();
  if (!value || value.length > 110) return undefined;
  if (/^(abstract|introduction|background|related work|method|methodology|experiments?|results?|discussion|limitations?|conclusion|references)$/i.test(value)) return value;
  if (/^\d+(?:\.\d+)*\s+[A-Z][^\n]{2,90}$/.test(value)) return value;
  return undefined;
}

export function chunksFromPages(paperId: string, pages: string[]) {
  const chunks: PaperChunk[] = [];
  pages.forEach((pageText, index) => {
    const page = index + 1;
    const lines = pageText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    let section: string | undefined;
    let buffer = '';
    let chunkIndex = 0;
    const flush = () => {
      const text = buffer.trim();
      if (!text) return;
      chunks.push({
        id: `${paperId}:p${page}:${chunkIndex}`,
        paperId,
        page,
        section,
        text,
      });
      chunkIndex += 1;
      buffer = '';
    };
    for (const line of lines) {
      const heading = sectionHeading(line);
      if (heading) section = heading;
      if (buffer.length + line.length > MAX_CHUNK_LENGTH) flush();
      buffer += `${buffer ? '\n' : ''}${line}`;
    }
    flush();
  });
  return chunks;
}

export function pagesFromLegacyText(text: string) {
  if (!text.trim()) return [];
  const matches = [...text.matchAll(/\[Page (\d+)\]\n([\s\S]*?)(?=\n\n\[Page \d+\]\n|$)/g)];
  if (!matches.length) return [text];
  const pages: string[] = [];
  for (const match of matches) pages[Number(match[1]) - 1] = match[2].trim();
  return pages.map((page) => page || '');
}

function terms(value: string) {
  return new Set(
    value.toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length > 2)
      .slice(0, 80),
  );
}

function relevance(chunk: PaperChunk, queryTerms: Set<string>, currentPage?: number) {
  let score = currentPage === chunk.page ? 40 : currentPage && Math.abs(currentPage - chunk.page) === 1 ? 18 : 0;
  const haystack = chunk.text.toLocaleLowerCase();
  for (const term of queryTerms) if (haystack.includes(term)) score += 2;
  return score;
}

export function buildPaperContext({
  paper,
  chunks,
  selection,
  question,
}: {
  paper: PaperInfo | null;
  chunks: PaperChunk[];
  selection: PaperSelection | null;
  question: string;
}) {
  if (!paper) return 'No active paper detected.';
  const metadata = [
    `Title: ${paper.title}`,
    paper.authors ? `Authors: ${paper.authors}` : '',
    `Source: ${paper.source}`,
    `URL: ${paper.url}`,
    `Current page: ${paper.currentPage || 'unknown'}`,
  ].filter(Boolean).join('\n');
  const selected = selection
    ? `\n\nSELECTED TEXT (Page ${selection.page})\n${selection.text.slice(0, 8_000)}`
    : '';
  const queryTerms = terms(`${question} ${selection?.text || ''}`);
  const ranked = [...chunks].sort((left, right) =>
    relevance(right, queryTerms, paper.currentPage) - relevance(left, queryTerms, paper.currentPage),
  );
  let length = metadata.length + selected.length;
  const included: PaperChunk[] = [];
  for (const chunk of ranked) {
    const entryLength = chunk.text.length + 80;
    if (length + entryLength > MAX_CONTEXT_LENGTH) continue;
    included.push(chunk);
    length += entryLength;
    if (included.length >= MAX_CONTEXT_CHUNKS) break;
  }
  included.sort((left, right) => left.page - right.page);
  const excerpts = included.map((chunk) =>
    `\n\n[Page ${chunk.page}${chunk.section ? ` · ${chunk.section}` : ''}]\n${chunk.text}`,
  ).join('');
  return `${metadata}${selected}\n\nRELEVANT PAPER EXCERPTS${excerpts || '\n[No PDF text was available. Ask the user to attach or reopen the PDF.]'}`;
}

export function citationsFromAnswer(answer: string, chunks: PaperChunk[]): Citation[] {
  const pages = new Set<number>();
  for (const match of answer.matchAll(/\[(?:p(?:age)?\.?\s*)?(\d+)(?::[^\]]+)?\]/gi)) {
    const page = Number(match[1]);
    if (page > 0) pages.add(page);
  }
  return [...pages].slice(0, 8).map((page) => {
    const chunk = chunks.find((candidate) => candidate.page === page);
    return {
      page,
      label: chunk?.section || `Page ${page}`,
      excerpt: chunk?.text.slice(0, 240) || '',
    };
  });
}
