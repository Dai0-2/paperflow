export type ReaderLaunchSource = 'context-menu' | 'default-handler' | 'library';

export interface RedirectGuard {
  sourceUrl: string;
  redirectedAt: number;
}

export type BackgroundRequest =
  | { type: 'paperflow:sync-now' }
  | { type: 'paperflow:refresh-menus' }
  | { type: 'paperflow:save-paper'; url: string; title?: string }
  | { type: 'paperflow:reader-mounted'; sourceUrl: string }
  | { type: 'paperflow:reader-unmounting'; sourceUrl: string }
  | { type: 'paperflow:open-library' };

const REDIRECT_GUARD_WINDOW_MS = 15_000;

function webUrl(rawUrl: string): URL | undefined {
  try {
    const url = new URL(rawUrl);
    return /^https?:$/.test(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

export function isDirectPdfUrl(rawUrl: string): boolean {
  const url = webUrl(rawUrl);
  if (!url) return false;
  if (/\.pdf$/i.test(url.pathname)) return true;
  return isArxivPdfUrl(rawUrl);
}

export function isArxivPdfUrl(rawUrl: string): boolean {
  const url = webUrl(rawUrl);
  if (!url) return false;
  const arxivHost = url.hostname === 'arxiv.org' || url.hostname === 'www.arxiv.org';
  return arxivHost && /^\/pdf\/\d{4}\.\d{4,5}(?:v\d+)?\/?$/i.test(url.pathname);
}

export function arxivReaderHostUrl(rawUrl: string, title = ''): string | undefined {
  const source = webUrl(rawUrl);
  if (!source || !isArxivPdfUrl(source.toString())) return undefined;
  const identifier = source.pathname.match(/^\/pdf\/([^/]+)\/?$/i)?.[1];
  if (!identifier) return undefined;
  const host = new URL(`/abs/${identifier}`, source.origin);
  host.searchParams.set('paperflowReader', '1');
  if (source.hash) host.searchParams.set('paperflowHash', source.hash.slice(1));
  if (title) host.searchParams.set('paperflowTitle', title.slice(0, 1_000));
  return host.toString();
}

export function readerPath(
  rawUrl: string,
  title: string,
  source: ReaderLaunchSource,
  warning?: 'pdf-handler-conflict',
): string {
  const parameters = new URLSearchParams({
    url: rawUrl,
    paperflowSource: source,
    paperflowDepth: '1',
  });
  if (title) parameters.set('title', title);
  if (warning) {
    parameters.set('warning', warning);
    parameters.set('autoLoad', 'false');
  }
  return `reader.html?${parameters}`;
}

export function redirectGuardFor(rawUrl: string, redirectedAt: number): RedirectGuard {
  const url = webUrl(rawUrl);
  if (!url) throw new Error('Only HTTP and HTTPS URLs can be redirected.');
  url.hash = '';
  return { sourceUrl: url.toString(), redirectedAt };
}

export function hasRecentRedirectLoop(
  rawUrl: string,
  guard: unknown,
  now: number,
): boolean {
  if (!guard || typeof guard !== 'object') return false;
  const candidate = guard as Partial<RedirectGuard>;
  if (typeof candidate.sourceUrl !== 'string' || typeof candidate.redirectedAt !== 'number') {
    return false;
  }
  if (now - candidate.redirectedAt > REDIRECT_GUARD_WINDOW_MS) return false;
  try {
    return redirectGuardFor(rawUrl, now).sourceUrl === candidate.sourceUrl;
  } catch {
    return false;
  }
}

export function parseBackgroundRequest(value: unknown): BackgroundRequest | undefined {
  if (!value || typeof value !== 'object' || !('type' in value)) return undefined;
  const input = value as Record<string, unknown>;
  if (
    input.type === 'paperflow:sync-now'
    || input.type === 'paperflow:refresh-menus'
    || input.type === 'paperflow:open-library'
  ) {
    return { type: input.type };
  }
  if (
    (input.type === 'paperflow:reader-mounted' || input.type === 'paperflow:reader-unmounting')
    && typeof input.sourceUrl === 'string'
  ) {
    const sourceUrl = webUrl(input.sourceUrl)?.toString();
    return sourceUrl && isArxivPdfUrl(sourceUrl)
      ? { type: input.type, sourceUrl }
      : undefined;
  }
  if (input.type !== 'paperflow:save-paper' || typeof input.url !== 'string') return undefined;
  const url = webUrl(input.url);
  if (!url) return undefined;
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 1_000) : undefined;
  return {
    type: 'paperflow:save-paper',
    url: url.toString(),
    title: title || undefined,
  };
}
