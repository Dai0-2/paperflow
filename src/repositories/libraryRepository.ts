import { database, openPaperFlowDatabase } from '../db/PaperFlowDatabase';
import type {
  Collection,
  PaperInfo,
  PaperNote,
  PaperTag,
  ReadStatus,
  Tag,
} from '../types';
import { normalizeTagName } from '../services/library/paperIdentity';
import { versionAndRecord } from './versioning';

function relationId(left: string, right: string): string {
  return `${left}:${right}`;
}

export async function listLibraryPapers(includeTrash = false): Promise<PaperInfo[]> {
  const db = await openPaperFlowDatabase();
  const papers = await db.papers.toArray();
  return papers
    .filter((paper) => includeTrash ? paper.libraryState !== 'temporary' : paper.libraryState === 'saved')
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
}

export async function savePaperToLibrary(paperId: string): Promise<PaperInfo> {
  const db = await openPaperFlowDatabase();
  return db.transaction('rw', db.papers, db.syncState, db.syncOps, async () => {
    const current = await db.papers.get(paperId);
    if (!current) throw new Error('Paper workspace was not found.');
    const now = Date.now();
    const { version, operation } = await versionAndRecord(db, 'paper', paperId, 'put', {
      ...current,
      libraryState: 'saved',
      favorite: true,
      updatedAt: now,
    });
    const paper: PaperInfo = {
      ...current,
      libraryState: 'saved',
      favorite: true,
      createdAt: current.createdAt || now,
      accessedAt: now,
      updatedAt: now,
      version,
    };
    await db.papers.put(paper);
    await db.syncOps.update(operation.id, { payload: paper });
    return paper;
  });
}

export async function updatePaperMetadata(
  paperId: string,
  patch: Partial<Pick<PaperInfo, 'title' | 'shortTitle' | 'authors' | 'year' | 'abstract' | 'journal' | 'doi' | 'arxivId' | 'openReviewId' | 'favorite' | 'readStatus'>>,
): Promise<PaperInfo> {
  const db = await openPaperFlowDatabase();
  return db.transaction('rw', db.papers, db.syncState, db.syncOps, async () => {
    const current = await db.papers.get(paperId);
    if (!current) throw new Error('Paper was not found.');
    const now = Date.now();
    const next = { ...current, ...patch, updatedAt: now };
    const { version, operation } = await versionAndRecord(db, 'paper', paperId, 'put', next);
    const paper = { ...next, version };
    await db.papers.put(paper);
    await db.syncOps.update(operation.id, { payload: paper });
    return paper;
  });
}

export async function setPaperReadStatus(paperId: string, readStatus: ReadStatus) {
  return updatePaperMetadata(paperId, { readStatus });
}

export async function movePaperToTrash(paperId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.papers, db.syncState, db.syncOps, async () => {
    const current = await db.papers.get(paperId);
    if (!current) return;
    const deletedAt = Date.now();
    const next = { ...current, libraryState: 'trashed' as const, deletedAt, updatedAt: deletedAt };
    const { version, operation } = await versionAndRecord(db, 'paper', paperId, 'delete', next);
    await db.papers.put({ ...next, version });
    await db.syncOps.update(operation.id, { payload: { ...next, version } });
  });
}

export async function createCollection(name: string, parentId?: string): Promise<Collection> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Collection name is required.');
  const db = await openPaperFlowDatabase();
  return db.transaction('rw', db.collections, db.syncState, db.syncOps, async () => {
    const now = Date.now();
    const id = crypto.randomUUID();
    const { version, operation } = await versionAndRecord(db, 'collection', id, 'put', undefined);
    const collection: Collection = {
      id,
      name: trimmedName,
      parentId,
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
      version,
    };
    await db.collections.put(collection);
    await db.syncOps.update(operation.id, { payload: collection });
    return collection;
  });
}

export async function listCollections(): Promise<Collection[]> {
  const db = await openPaperFlowDatabase();
  return (await db.collections.toArray())
    .filter((collection) => !collection.deletedAt)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

export async function addPaperToCollection(paperId: string, collectionId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.collectionItems, db.syncState, db.syncOps, async () => {
    const id = relationId(collectionId, paperId);
    const now = Date.now();
    const { version, operation } = await versionAndRecord(db, 'collectionItem', id, 'put', undefined);
    const item = { id, collectionId, paperId, createdAt: now, updatedAt: now, version };
    await db.collectionItems.put(item);
    await db.syncOps.update(operation.id, { payload: item });
  });
}

export async function createOrGetTag(name: string, color?: string): Promise<Tag> {
  const normalizedName = normalizeTagName(name);
  if (!normalizedName) throw new Error('Tag name is required.');
  const db = await openPaperFlowDatabase();
  const existing = await db.tags.where('normalizedName').equals(normalizedName).first();
  if (existing && !existing.deletedAt) return existing;
  return db.transaction('rw', db.tags, db.syncState, db.syncOps, async () => {
    const now = Date.now();
    const id = existing?.id || crypto.randomUUID();
    const { version, operation } = await versionAndRecord(db, 'tag', id, 'put', undefined);
    const tag: Tag = {
      id,
      name: name.trim(),
      normalizedName,
      color,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      version,
    };
    await db.tags.put(tag);
    await db.syncOps.update(operation.id, { payload: tag });
    return tag;
  });
}

export async function addTagToPaper(paperId: string, tagId: string): Promise<PaperTag> {
  const db = await openPaperFlowDatabase();
  return db.transaction('rw', db.paperTags, db.syncState, db.syncOps, async () => {
    const id = relationId(paperId, tagId);
    const now = Date.now();
    const { version, operation } = await versionAndRecord(db, 'paperTag', id, 'put', undefined);
    const paperTag: PaperTag = { id, paperId, tagId, createdAt: now, updatedAt: now, version };
    await db.paperTags.put(paperTag);
    await db.syncOps.update(operation.id, { payload: paperTag });
    return paperTag;
  });
}

export async function saveNote(
  paperId: string,
  input: { id?: string; title: string; content: string; conflictOf?: string },
): Promise<PaperNote> {
  const db = await openPaperFlowDatabase();
  return db.transaction('rw', db.notes, db.syncState, db.syncOps, async () => {
    const id = input.id || crypto.randomUUID();
    const current = await db.notes.get(id);
    const now = Date.now();
    const { version, operation } = await versionAndRecord(db, 'note', id, 'put', undefined);
    const note: PaperNote = {
      id,
      paperId,
      title: input.title.trim() || 'Untitled note',
      content: input.content,
      conflictOf: input.conflictOf,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      version,
    };
    await db.notes.put(note);
    await db.syncOps.update(operation.id, { payload: note });
    return note;
  });
}

export async function getPaperRelations(paperId: string) {
  const db = await openPaperFlowDatabase();
  const [collectionItems, paperTags, notes] = await Promise.all([
    db.collectionItems.where('paperId').equals(paperId).toArray(),
    db.paperTags.where('paperId').equals(paperId).toArray(),
    db.notes.where('paperId').equals(paperId).toArray(),
  ]);
  const [collections, tags] = await Promise.all([
    db.collections.bulkGet(collectionItems.filter((item) => !item.deletedAt).map((item) => item.collectionId)),
    db.tags.bulkGet(paperTags.filter((item) => !item.deletedAt).map((item) => item.tagId)),
  ]);
  return {
    collections: collections.filter((value): value is Collection => Boolean(value && !value.deletedAt)),
    tags: tags.filter((value): value is Tag => Boolean(value && !value.deletedAt)),
    notes: notes.filter((note) => !note.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

export { database as libraryDatabase };
