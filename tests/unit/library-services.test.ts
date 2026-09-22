import { describe, expect, it } from 'vitest';
import { buildAiOrganizeRequest, parseAiOrganizeProposal } from '../../src/services/library/aiOrganize';
import {
  filterAndSortLibraryPapers,
  parseLibrarySearch,
  type LibrarySnapshot,
} from '../../src/hooks/useLibraryQuery';
import type { PaperInfo } from '../../src/types';

const paper: PaperInfo = {
  id: 'paper:test',
  shortTitle: 'Test',
  title: 'A Test Paper',
  authors: 'Ada Lovelace',
  abstract: 'A public abstract.',
  year: '1843',
  source: 'Journal',
  url: 'https://example.com/test.pdf',
};

describe('library services', () => {
  it('parses scoped search syntax and quoted values', () => {
    expect(parseLibrarySearch('transformer author:"Ada Lovelace" year:1843 status:read')).toEqual([
      { field: undefined, value: 'transformer' },
      { field: 'author', value: 'ada lovelace' },
      { field: 'year', value: '1843' },
      { field: 'status', value: 'read' },
    ]);
  });

  it('limits AI organization context to bibliographic metadata', () => {
    const request = buildAiOrganizeRequest({
      paper,
      existingTags: ['history'],
      collections: [{ id: 'collection:1', name: 'Computing' }],
    });
    expect(request.context).toContain('A public abstract.');
    expect(request.context).not.toContain('notes');
    expect(request.context).not.toContain('annotations');
  });

  it('validates AI proposals and drops unknown collection IDs', () => {
    const result = parseAiOrganizeProposal(
      '```json\n{"existingCollectionIds":["collection:1","unknown"],"suggestedTags":["AI","AI"],"reason":"Relevant topic"}\n```',
      new Set(['collection:1']),
    );
    expect(result.existingCollectionIds).toEqual(['collection:1']);
    expect(result.suggestedTags).toEqual(['AI']);
  });

  it('filters a 10,000-paper fixture with combined field clauses', () => {
    const papers = Array.from({ length: 10_000 }, (_, index): PaperInfo => ({
      ...paper,
      id: `paper:${index}`,
      title: `Research Paper ${index}`,
      authors: index % 2 ? 'Ada Lovelace' : 'Grace Hopper',
      year: index % 5 === 0 ? '2024' : '2023',
      readStatus: index % 3 === 0 ? 'read' : 'unread',
      libraryState: 'saved',
      updatedAt: index,
    }));
    const snapshot: LibrarySnapshot = {
      papers,
      collections: [],
      tags: [],
      paperCollections: new Map(),
      paperTags: new Map(),
      notes: [],
      annotations: [],
      documents: [],
      memories: [],
      searchText: new Map(papers.map((item) => [item.id, item.title.toLowerCase()])),
    };
    const result = filterAndSortLibraryPapers(snapshot, {
      scope: 'all',
      searchQuery: 'author:"Ada Lovelace" year:2024 status:read',
      sortKey: 'updatedAt',
      sortDirection: 'desc',
    });
    expect(result).toHaveLength(333);
    expect(result[0].updatedAt).toBeGreaterThan(result.at(-1)?.updatedAt || 0);
  });
});
