import { useEffect, useMemo, useState } from 'react';
import { openPaperFlowDatabase } from '../db/PaperFlowDatabase';
import type {
  Annotation,
  Collection,
  PaperDocument,
  PaperInfo,
  PaperMemory,
  PaperNote,
  Tag,
} from '../types';
import { identityCandidates, normalizeText } from '../services/library/paperIdentity';
import { useLibraryStore, type LibrarySortKey } from '../store/useLibraryStore';

export interface LibrarySnapshot {
  papers: PaperInfo[];
  collections: Collection[];
  tags: Tag[];
  paperCollections: Map<string, string[]>;
  paperTags: Map<string, string[]>;
  notes: PaperNote[];
  annotations: Annotation[];
  documents: PaperDocument[];
  memories: PaperMemory[];
  searchText: Map<string, string>;
}

const EMPTY_SNAPSHOT: LibrarySnapshot = {
  papers: [],
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

function append(map: Map<string, string[]>, key: string, value: string): void {
  const current = map.get(key) || [];
  current.push(value);
  map.set(key, current);
}

async function loadSnapshot(): Promise<LibrarySnapshot> {
  const db = await openPaperFlowDatabase();
  const [
    papers,
    collections,
    collectionItems,
    tags,
    paperTags,
    notes,
    annotations,
    documents,
    memories,
    chunks,
    ocrPages,
  ] = await Promise.all([
    db.papers.toArray(),
    db.collections.toArray(),
    db.collectionItems.toArray(),
    db.tags.toArray(),
    db.paperTags.toArray(),
    db.notes.toArray(),
    db.annotations.toArray(),
    db.documents.toArray(),
    db.paperMemory.toArray(),
    db.paperChunks.toArray(),
    db.ocrPages.toArray(),
  ]);
  const paperCollections = new Map<string, string[]>();
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  for (const item of collectionItems) {
    if (!item.deletedAt && !collectionById.get(item.collectionId)?.deletedAt) {
      append(paperCollections, item.paperId, item.collectionId);
    }
  }
  const activeTags = tags.filter((tag) => !tag.deletedAt);
  const tagById = new Map(activeTags.map((tag) => [tag.id, tag]));
  const tagsByPaper = new Map<string, string[]>();
  for (const item of paperTags) {
    if (!item.deletedAt && tagById.has(item.tagId)) append(tagsByPaper, item.paperId, item.tagId);
  }
  const textParts = new Map<string, string[]>();
  for (const note of notes) if (!note.deletedAt) append(textParts, note.paperId, `${note.title} ${note.content}`);
  for (const annotation of annotations) {
    if (!annotation.deletedAt) append(textParts, annotation.paperId, `${annotation.text} ${annotation.comment || ''}`);
  }
  for (const memory of memories) if (!memory.deletedAt) append(textParts, memory.paperId, memory.content);
  for (const chunk of chunks) append(textParts, chunk.paperId, chunk.text);
  for (const page of ocrPages) if (page.status === 'complete') append(textParts, page.paperId, page.text);
  const searchText = new Map<string, string>();
  for (const paper of papers) {
    const collectionNames = (paperCollections.get(paper.id) || [])
      .map((id) => collectionById.get(id)?.name || '');
    const tagNames = (tagsByPaper.get(paper.id) || []).map((id) => tagById.get(id)?.name || '');
    searchText.set(paper.id, normalizeText([
      paper.title,
      paper.authors,
      paper.abstract,
      paper.journal,
      paper.source,
      ...collectionNames,
      ...tagNames,
      ...(textParts.get(paper.id) || []),
    ].filter(Boolean).join(' ')));
  }
  return {
    papers,
    collections: collections.filter((collection) => !collection.deletedAt),
    tags: activeTags,
    paperCollections,
    paperTags: tagsByPaper,
    notes: notes.filter((note) => !note.deletedAt),
    annotations: annotations.filter((annotation) => !annotation.deletedAt),
    documents: documents.filter((document) => !document.deletedAt),
    memories: memories.filter((memory) => !memory.deletedAt),
    searchText,
  };
}

interface SearchClause {
  field?: 'author' | 'tag' | 'collection' | 'year' | 'status';
  value: string;
}

export function parseLibrarySearch(query: string): SearchClause[] {
  return (query.match(/(?:[^\s"]+:"[^"]*"|[^\s"]+|"(?:[^"]*)")/g) || [])
    .map((token) => {
      const match = token.match(/^(author|tag|collection|year|status):(.+)$/i);
      return {
        field: match?.[1]?.toLowerCase() as SearchClause['field'],
        value: normalizeText((match?.[2] || token).replace(/^"|"$/g, '')),
      };
    })
    .filter(({ value }) => Boolean(value));
}

function duplicateIds(papers: PaperInfo[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const paper of papers) {
    const keys = identityCandidates(paper)
      .filter(({ kind }) => kind === 'doi' || kind === 'arxiv' || kind === 'openreview'
        || kind === 'content-hash' || kind === 'title-author')
      .map(({ kind, value }) => `${kind}:${value}`);
    for (const key of keys) append(groups, key, paper.id);
  }
  return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
}

function sortValue(paper: PaperInfo, key: LibrarySortKey): string | number {
  if (key === 'updatedAt') return paper.updatedAt || 0;
  return normalizeText(paper[key] || '');
}

interface LibraryFilterOptions {
  scope: string;
  searchQuery: string;
  sortKey: LibrarySortKey;
  sortDirection: 'asc' | 'desc';
  now?: number;
}

export function filterAndSortLibraryPapers(
  snapshot: LibrarySnapshot,
  options: LibraryFilterOptions,
): PaperInfo[] {
  const { scope, searchQuery, sortKey, sortDirection, now = Date.now() } = options;
  const duplicates = scope === 'duplicates' ? duplicateIds(snapshot.papers) : new Set<string>();
  const clauses = parseLibrarySearch(searchQuery);
  const collectionById = new Map(snapshot.collections.map((item) => [item.id, normalizeText(item.name)]));
  const tagById = new Map(snapshot.tags.map((item) => [item.id, normalizeText(item.name)]));
  const result = snapshot.papers.filter((paper) => {
    if (scope === 'trash') {
      if (paper.libraryState !== 'trashed') return false;
    } else if (paper.libraryState !== 'saved') return false;
    if (scope === 'recent' && now - (paper.updatedAt || 0) > 30 * 24 * 60 * 60 * 1000) return false;
    if (scope === 'favorite' && !paper.favorite) return false;
    if (scope.startsWith('status:') && paper.readStatus !== scope.slice(7)) return false;
    if (scope.startsWith('collection:') && !(snapshot.paperCollections.get(paper.id) || []).includes(scope.slice(11))) return false;
    if (scope.startsWith('tag:') && !(snapshot.paperTags.get(paper.id) || []).includes(scope.slice(4))) return false;
    if (scope === 'duplicates' && !duplicates.has(paper.id)) return false;
    return clauses.every((clause) => {
      if (!clause.field) return snapshot.searchText.get(paper.id)?.includes(clause.value);
      if (clause.field === 'author') return normalizeText(paper.authors).includes(clause.value);
      if (clause.field === 'year') return normalizeText(paper.year) === clause.value;
      if (clause.field === 'status') return normalizeText(paper.readStatus) === clause.value;
      if (clause.field === 'tag') {
        return (snapshot.paperTags.get(paper.id) || []).some((id) => tagById.get(id)?.includes(clause.value));
      }
      return (snapshot.paperCollections.get(paper.id) || [])
        .some((id) => collectionById.get(id)?.includes(clause.value));
    });
  });
  const direction = sortDirection === 'asc' ? 1 : -1;
  return result.sort((left, right) => {
    const a = sortValue(left, sortKey);
    const b = sortValue(right, sortKey);
    return (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))) * direction;
  });
}

export function useLibraryQuery() {
  const { scope, searchQuery, sortKey, sortDirection, refreshVersion } = useLibraryStore();
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadSnapshot()
      .then((value) => {
        if (active) {
          setSnapshot(value);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load the library.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshVersion]);

  const papers = useMemo(() => filterAndSortLibraryPapers(snapshot, {
    scope,
    searchQuery,
    sortKey,
    sortDirection,
  }), [scope, searchQuery, snapshot, sortDirection, sortKey]);

  return { snapshot, papers, loading, error };
}
