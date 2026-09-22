import { describe, expect, it } from 'vitest';
import type { PaperInfo } from '../../src/types';
import {
  canonicalUrl,
  identityCandidates,
  isPossibleDuplicate,
  normalizeIdentifier,
} from '../../src/services/library/paperIdentity';

function paper(patch: Partial<PaperInfo>): PaperInfo {
  return {
    id: crypto.randomUUID(),
    shortTitle: 'PAPER',
    title: 'Attention Is All You Need',
    authors: 'Ashish Vaswani, Noam Shazeer',
    source: 'PDF',
    url: 'https://example.com/paper.pdf',
    ...patch,
  };
}

describe('paper identity', () => {
  it('normalizes DOI URLs and strips tracking parameters', () => {
    expect(normalizeIdentifier('https://doi.org/10.1000/Test.1')).toBe('10.1000/test.1');
    expect(canonicalUrl('https://EXAMPLE.com/paper.pdf?utm_source=x&version=2#page=3'))
      .toBe('https://example.com/paper.pdf?version=2');
  });

  it('orders candidates by strongest identifiers first', () => {
    expect(identityCandidates(paper({ doi: '10.1000/test', arxivId: '1706.03762' })).map(({ kind }) => kind))
      .toEqual(['doi', 'arxiv', 'title-author', 'url']);
  });

  it('detects exact identifiers and title-author candidates', () => {
    expect(isPossibleDuplicate(
      paper({ doi: '10.1000/test' }),
      paper({ doi: 'https://doi.org/10.1000/TEST', title: 'Different title' }),
    )).toBe(true);
    expect(isPossibleDuplicate(
      paper({}),
      paper({ title: 'Attention is all you need: revised', url: 'https://elsewhere.example/file.pdf' }),
    )).toBe(true);
  });
});
