import type { PaperInfo } from '../../types';

export function normalizeIdentifier(value?: string): string | undefined {
  const normalized = value?.trim().toLocaleLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');
  return normalized || undefined;
}

export function normalizeText(value?: string): string {
  return (value || '')
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeTagName(value: string): string {
  return normalizeText(value);
}

export function firstAuthor(value?: string): string {
  return normalizeText(value?.split(/,|;|\band\b/iu)[0]);
}

export function canonicalUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|download|source|ref)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLocaleLowerCase();
    return url.toString();
  } catch {
    return rawUrl.trim() || undefined;
  }
}

export interface IdentityCandidate {
  kind: 'doi' | 'arxiv' | 'openreview' | 'content-hash' | 'title-author' | 'url';
  value: string;
  exact: boolean;
}

export function identityCandidates(paper: PaperInfo): IdentityCandidate[] {
  const candidates: Array<IdentityCandidate | undefined> = [
    normalizeIdentifier(paper.doi)
      ? { kind: 'doi', value: normalizeIdentifier(paper.doi)!, exact: true }
      : undefined,
    normalizeIdentifier(paper.arxivId)
      ? { kind: 'arxiv', value: normalizeIdentifier(paper.arxivId)!, exact: true }
      : undefined,
    normalizeIdentifier(paper.openReviewId)
      ? { kind: 'openreview', value: normalizeIdentifier(paper.openReviewId)!, exact: true }
      : undefined,
    normalizeIdentifier(paper.contentHash)
      ? { kind: 'content-hash', value: normalizeIdentifier(paper.contentHash)!, exact: true }
      : undefined,
    normalizeText(paper.title) && firstAuthor(paper.authors)
      ? {
          kind: 'title-author',
          value: `${normalizeText(paper.title)}|${firstAuthor(paper.authors)}`,
          exact: false,
        }
      : undefined,
    canonicalUrl(paper.url)
      ? { kind: 'url', value: canonicalUrl(paper.url)!, exact: false }
      : undefined,
  ];
  return candidates.filter((candidate): candidate is IdentityCandidate => Boolean(candidate));
}

export function titleSimilarity(left: PaperInfo, right: PaperInfo): number {
  const a = new Set(normalizeText(left.title).split(' ').filter(Boolean));
  const b = new Set(normalizeText(right.title).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function isPossibleDuplicate(left: PaperInfo, right: PaperInfo): boolean {
  const leftExact = new Set(identityCandidates(left).filter((item) => item.exact).map((item) => `${item.kind}:${item.value}`));
  if (identityCandidates(right).some((item) => item.exact && leftExact.has(`${item.kind}:${item.value}`))) return true;
  return firstAuthor(left.authors) === firstAuthor(right.authors) && titleSimilarity(left, right) >= 0.82;
}
