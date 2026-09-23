import type { PaperAlias, PaperInfo } from '../types';

export const SCHOLAR_READER_EXTENSION_ID = 'dahenjhkoodjbpjheillcadbppiidmhp';
const SCHOLAR_READER_ORIGIN = `chrome-extension://${SCHOLAR_READER_EXTENSION_ID}`;
const VIEWER_URL_PARAMETERS = ['file', 'url', 'pdf'] as const;

function cleanTitle(raw: string) {
  return raw.replace(/\.pdf\s*$/i, '').replace(/\s+[|·-]\s+(Google Scholar PDF Reader|Google Drive|Chrome)$/i, '').replace(/\s+/g, ' ').trim();
}

function decodeViewerParameter(raw: string): string {
  let decoded = raw;
  for (let attempt = 0; attempt < 1; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

export function unwrapViewerUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'chrome-extension:' || url.hostname !== SCHOLAR_READER_EXTENSION_ID) {
      return raw;
    }
    const embedded = VIEWER_URL_PARAMETERS
      .map((parameter) => url.searchParams.get(parameter))
      .find((value): value is string => Boolean(value));
    if (!embedded) return raw;
    const decoded = decodeViewerParameter(embedded);
    const target = new URL(decoded);
    return /^https?:$/.test(target.protocol) ? target.toString() : raw;
  } catch { return raw; }
}

function sourceFor(url: string) {
  if (/arxiv\.org/i.test(url)) return 'arXiv';
  if (/openreview\.net/i.test(url)) return 'OpenReview';
  if (/chrome-extension:/i.test(url)) return 'PDF Reader';
  if (/\.pdf(?:$|[?#])/i.test(url)) return 'PDF';
  return 'Web paper';
}

function normalizeUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|download|source|ref)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function normalizeTitle(raw: string) {
  return cleanTitle(raw).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function extractIdentifiers(url: string, title: string) {
  const arxivId = url.match(/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/i)?.[1];
  const openReviewId = url.match(/[?&]id=([^&#]+)/i)?.[1];
  const doi = decodeURIComponent(`${url} ${title}`).match(/\b10\.\d{4,9}\/[-._;()/:a-z0-9]+\b/i)?.[0]?.replace(/[).,;]+$/, '').toLowerCase();
  return { arxivId, openReviewId, doi };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

function stableId(url: string, title: string) {
  const { doi, arxivId, openReviewId } = extractIdentifiers(url, title);
  if (doi) return `doi:${doi}`;
  const arxiv = arxivId;
  if (arxiv) return `arxiv:${arxiv}`;
  if (openReviewId) return `openreview:${openReviewId}`;
  return `paper:${stableHash(`${normalizeUrl(url)}|${normalizeTitle(title)}`)}`;
}

export function aliasesForPaper(paper: PaperInfo): PaperAlias[] {
  const identifiers = extractIdentifiers(paper.url, paper.title);
  const aliases: PaperAlias[] = [];
  const add = (kind: PaperAlias['kind'], value?: string) => {
    if (value) aliases.push({ kind, alias: `${kind}:${value.toLowerCase()}`, paperId: paper.id });
  };
  add('doi', paper.doi || identifiers.doi);
  add('arxiv', paper.arxivId || identifiers.arxivId);
  add('openreview', paper.openReviewId || identifiers.openReviewId);
  if (paper.authors) add('title-author', `${normalizeTitle(paper.title)}|${normalizeTitle(paper.authors.split(/,| and /i)[0])}`);
  add('url', normalizeUrl(paper.url));
  add('content-hash', paper.contentHash);
  return aliases;
}

export async function contentHash(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function paperFromUrl(rawUrl: string, rawTitle?: string): PaperInfo {
  const resolvedUrl = unwrapViewerUrl(rawUrl);
  const scholarReader = rawUrl.startsWith(`${SCHOLAR_READER_ORIGIN}/`);
  const title = cleanTitle(rawTitle || decodeURIComponent(resolvedUrl.split('/').pop() || 'Untitled paper'));
  const identifiers = extractIdentifiers(resolvedUrl, title);
  const arxivPrefix = identifiers.arxivId?.slice(0, 2);
  const currentPage = Number((rawUrl.match(/(?:page=|#page=)(\d+)/i) || [])[1]) || undefined;
  const shortTitle = title.includes(':') ? title.split(':')[0].slice(0, 48) : title.split(/\s+/).slice(0, 5).join(' ');
  return {
    id: stableId(resolvedUrl, title),
    shortTitle: shortTitle.toUpperCase(),
    title,
    year: arxivPrefix ? `20${arxivPrefix}` : undefined,
    source: scholarReader ? 'Google Scholar PDF Reader' : sourceFor(resolvedUrl),
    url: resolvedUrl,
    currentPage,
    ...identifiers,
  };
}

export async function detectActivePaper(): Promise<PaperInfo | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return { id: 'preview:paperflow', shortTitle: 'PAPERFLOW PREVIEW', title: 'Open a PDF in Chrome to detect the current paper', source: 'Preview', url: location.href };
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const ownOrigin = chrome.runtime?.id ? `chrome-extension://${chrome.runtime.id}/` : '';
  if (!tab?.url || tab.url.startsWith('chrome://') || (ownOrigin && tab.url.startsWith(ownOrigin))) return null;
  const resolvedUrl = unwrapViewerUrl(tab.url);
  const title = cleanTitle(tab.title || decodeURIComponent(resolvedUrl.split('/').pop() || 'Untitled paper'));
  const looksLikePaper = /\.pdf(?:$|[?#])/i.test(resolvedUrl) || /arxiv\.org|openreview\.net/i.test(resolvedUrl) || /pdf/i.test(tab.title || '');
  if (!looksLikePaper) return null;
  return paperFromUrl(tab.url, title);
}
