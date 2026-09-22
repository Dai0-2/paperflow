import { describe, expect, it } from 'vitest';
import {
  SCHOLAR_READER_EXTENSION_ID,
  paperFromUrl,
  unwrapViewerUrl,
} from '../../src/services/paper';

const scholarViewer = (parameter: string, value: string) =>
  `chrome-extension://${SCHOLAR_READER_EXTENSION_ID}/viewer.html?${parameter}=${value}`;

describe('paper URL routing', () => {
  it('unwraps public HTTP URLs from the known Scholar reader only', () => {
    const pdf = 'https://example.org/papers/test.pdf?download=1';
    const wrapped = scholarViewer('file', encodeURIComponent(pdf));

    expect(unwrapViewerUrl(wrapped)).toBe(pdf);
    expect(paperFromUrl(wrapped, 'Test paper').source).toBe('Google Scholar PDF Reader');
    expect(paperFromUrl(wrapped, 'Test paper').url).toBe(pdf);
  });

  it('supports at most two URL-encoding layers including query parsing', () => {
    const pdf = 'https://example.org/paper.pdf';
    const twiceEncoded = scholarViewer('url', encodeURIComponent(encodeURIComponent(pdf)));
    const threeTimesEncoded = scholarViewer(
      'url',
      encodeURIComponent(encodeURIComponent(encodeURIComponent(pdf))),
    );

    expect(unwrapViewerUrl(twiceEncoded)).toBe(pdf);
    expect(unwrapViewerUrl(threeTimesEncoded)).toBe(threeTimesEncoded);
  });

  it('does not trust viewer-shaped parameters on arbitrary pages', () => {
    const raw = 'https://attacker.example/viewer?url=https%3A%2F%2Fexample.org%2Fpaper.pdf';
    expect(unwrapViewerUrl(raw)).toBe(raw);
  });

  it.each([
    'file:///Users/example/private.pdf',
    'blob:https://example.org/1234',
    'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/viewer.html',
    `chrome-extension://${SCHOLAR_READER_EXTENSION_ID}/viewer.html?url=https%3A%2F%2Fexample.org%2Fnested.pdf`,
  ])('rejects non-web and nested extension targets: %s', (target) => {
    const wrapped = scholarViewer('file', encodeURIComponent(target));
    expect(unwrapViewerUrl(wrapped)).toBe(wrapped);
  });
});
