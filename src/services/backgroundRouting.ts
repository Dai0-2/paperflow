export type ReaderLaunchSource = 'context-menu' | 'default-handler' | 'library';

export interface RedirectGuard {
  sourceUrl: string;
  redirectedAt: number;
}

export type BackgroundRequest =
  | { type: 'paperflow:sync-now' }
  | { type: 'paperflow:refresh-menus' }
  | { type: 'paperflow:save-paper'; url: string; title?: string }
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
  return Boolean(url && /\.pdf$/i.test(url.pathname));
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
