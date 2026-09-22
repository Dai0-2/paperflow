import { describe, expect, it } from 'vitest';
import {
  hasRecentRedirectLoop,
  isDirectPdfUrl,
  parseBackgroundRequest,
  readerPath,
  redirectGuardFor,
} from '../../src/services/backgroundRouting';

describe('background routing', () => {
  it('recognizes only direct HTTP(S) PDF paths', () => {
    expect(isDirectPdfUrl('https://example.org/paper.pdf?download=1')).toBe(true);
    expect(isDirectPdfUrl('http://example.org/PAPER.PDF#page=2')).toBe(true);
    expect(isDirectPdfUrl('https://example.org/viewer?file=paper.pdf')).toBe(false);
    expect(isDirectPdfUrl('chrome-extension://example/reader.pdf')).toBe(false);
  });

  it('marks Reader launches with a bounded redirect depth', () => {
    const path = readerPath(
      'https://example.org/paper.pdf',
      'Paper title',
      'default-handler',
    );
    const parameters = new URL(path, 'chrome-extension://paperflow/').searchParams;

    expect(parameters.get('paperflowSource')).toBe('default-handler');
    expect(parameters.get('paperflowDepth')).toBe('1');
    expect(parameters.get('autoLoad')).toBeNull();
  });

  it('stops a repeated redirect for the same tab and source URL', () => {
    const now = 10_000;
    const guard = redirectGuardFor('https://example.org/paper.pdf#page=4', now);

    expect(hasRecentRedirectLoop('https://example.org/paper.pdf#page=9', guard, now + 1_000))
      .toBe(true);
    expect(hasRecentRedirectLoop('https://example.org/other.pdf', guard, now + 1_000))
      .toBe(false);
    expect(hasRecentRedirectLoop('https://example.org/paper.pdf', guard, now + 16_000))
      .toBe(false);
  });

  it('creates a conflict screen that does not auto-load the PDF', () => {
    const path = readerPath(
      'https://example.org/paper.pdf',
      '',
      'default-handler',
      'pdf-handler-conflict',
    );
    const parameters = new URL(path, 'chrome-extension://paperflow/').searchParams;

    expect(parameters.get('warning')).toBe('pdf-handler-conflict');
    expect(parameters.get('autoLoad')).toBe('false');
  });

  it('validates background messages and web URL schemes', () => {
    expect(parseBackgroundRequest({ type: 'paperflow:sync-now' }))
      .toEqual({ type: 'paperflow:sync-now' });
    expect(parseBackgroundRequest({ type: 'paperflow:refresh-menus' }))
      .toEqual({ type: 'paperflow:refresh-menus' });
    expect(parseBackgroundRequest({
      type: 'paperflow:save-paper',
      url: 'https://example.org/paper.pdf',
      title: ' Paper ',
    })).toEqual({
      type: 'paperflow:save-paper',
      url: 'https://example.org/paper.pdf',
      title: 'Paper',
    });
    expect(parseBackgroundRequest({
      type: 'paperflow:save-paper',
      url: 'file:///private/paper.pdf',
    })).toBeUndefined();
    expect(parseBackgroundRequest({ type: 'paperflow:unknown' })).toBeUndefined();
  });
});
