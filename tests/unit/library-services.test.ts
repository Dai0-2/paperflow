import { describe, expect, it } from 'vitest';
import { buildAiOrganizeRequest, parseAiOrganizeProposal } from '../../src/services/library/aiOrganize';
import { refreshPaperMetadata } from '../../src/services/library/metadata';
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

  it('infers an arXiv identifier from the source URL when refreshing metadata', async () => {
    const requests: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Response(`<?xml version="1.0"?>
        <feed>
          <entry>
            <title>Retrieved Paper Title</title>
            <author><name>Ada Lovelace</name></author>
            <published>2025-07-21T00:00:00Z</published>
            <summary>Retrieved abstract.</summary>
          </entry>
        </feed>`, {
        status: 200,
        headers: { 'content-type': 'application/xml' },
      });
    }) as typeof fetch;

    const metadata = await refreshPaperMetadata({
      ...paper,
      arxivId: undefined,
      url: 'https://arxiv.org/pdf/2507.16806',
    }, fetcher);

    expect(requests[0]).toContain('id_list=2507.16806');
    expect(metadata).toMatchObject({
      title: 'Retrieved Paper Title',
      authors: 'Ada Lovelace',
      year: '2025',
      arxivId: '2507.16806',
    });
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

  it('uses the last opened time for the seven-day recently read view', () => {
    const now = Date.UTC(2026, 8, 23);
    const papers: PaperInfo[] = [
      {
        ...paper,
        id: 'paper:recent',
        libraryState: 'saved',
        accessedAt: now - 6 * 24 * 60 * 60 * 1000,
        updatedAt: now - 30 * 24 * 60 * 60 * 1000,
      },
      {
        ...paper,
        id: 'paper:old',
        libraryState: 'saved',
        accessedAt: now - 8 * 24 * 60 * 60 * 1000,
        updatedAt: now,
      },
      {
        ...paper,
        id: 'paper:never-opened',
        libraryState: 'saved',
        updatedAt: now,
      },
    ];
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
      searchText: new Map(),
    };

    expect(filterAndSortLibraryPapers(snapshot, {
      scope: 'recent',
      searchQuery: '',
      sortKey: 'accessedAt',
      sortDirection: 'desc',
      now,
    }).map(({ id }) => id)).toEqual(['paper:recent']);
  });
});
