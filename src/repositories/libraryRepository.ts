import { database, openPaperFlowDatabase } from '../db/PaperFlowDatabase';
import type {
  Collection,
  CollectionItem,
  PaperInfo,
  PaperNote,
  PaperSyncField,
  PaperTag,
  ReadStatus,
  Tag,
} from '../types';
import { normalizeTagName } from '../services/library/paperIdentity';
import {
  queuePaperWorkspaceForSync,
  savePaperMemory,
} from '../services/database';
import { queueStoredDocumentsForSync } from '../services/storage/documentStore';
import { queueAnnotationsForSync } from './annotationRepository';
import { versionAndRecord } from './versioning';

function relationId(left: string, right: string): string {
  return `${left}:${right}`;
}

function versionPaperFields(
  paper: PaperInfo,
  version: { counter: number; deviceId: string },
  fields: PaperSyncField[],
): PaperInfo['fieldVersions'] {
  const fieldVersions = { ...paper.fieldVersions };
  for (const field of fields) fieldVersions[field] = version;
  return fieldVersions;
}

export async function listLibraryPapers(includeTrash = false): Promise<PaperInfo[]> {
  const db = await openPaperFlowDatabase();
  const papers = await db.papers.toArray();
  return papers
    .filter((paper) => includeTrash ? paper.libraryState === 'trashed' : paper.libraryState === 'saved')
    .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
}

export async function savePaperToLibrary(paperId: string): Promise<PaperInfo> {
  const db = await openPaperFlowDatabase();
  const paper = await db.transaction('rw', db.papers, db.syncState, db.syncOps, async () => {
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
      deletedAt: undefined,
      createdAt: current.createdAt || now,
      accessedAt: now,
      updatedAt: now,
      version,
      fieldVersions: versionPaperFields(current, version, ['libraryState', 'favorite']),
    };
    await db.papers.put(paper);
    await db.syncOps.update(operation.id, { payload: paper });
    return paper;
  });
  await queueAnnotationsForSync(paperId);
  await queuePaperWorkspaceForSync(paperId);
  await queueStoredDocumentsForSync(paperId);
  return paper;
}

export async function savePaperMemoryToLibrary(
  paperId: string,
  content: string,
): Promise<PaperInfo> {
  const db = await openPaperFlowDatabase();
  const current = await db.papers.get(paperId);
  if (!current) throw new Error('Paper workspace was not found.');
  const paper = current.libraryState === 'saved'
    ? current
    : await savePaperToLibrary(paperId);
  await savePaperMemory(paper.id, content);
  return paper;
}

export async function updatePaperMetadata(
  paperId: string,
  patch: Partial<Pick<PaperInfo, 'title' | 'shortTitle' | 'authors' | 'year' | 'abstract' | 'journal' | 'doi' | 'arxivId' | 'openReviewId' | 'favorite' | 'readStatus'>>,
  source: NonNullable<PaperInfo['metadataSource']> = 'manual',
): Promise<PaperInfo> {
  const db = await openPaperFlowDatabase();
  return db.transaction('rw', db.papers, db.syncState, db.syncOps, async () => {
    const current = await db.papers.get(paperId);
    if (!current) throw new Error('Paper was not found.');
    const now = Date.now();
    const next = { ...current, ...patch, metadataSource: source, updatedAt: now };
    const { version, operation } = await versionAndRecord(db, 'paper', paperId, 'put', next);
    const fields = (['favorite', 'readStatus'] as const)
      .filter((field) => field in patch);
    const paper = {
      ...next,
      version,
      fieldVersions: versionPaperFields(current, version, [...fields]),
    };
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
    const paper = {
      ...next,
      version,
      fieldVersions: versionPaperFields(current, version, ['libraryState']),
    };
    await db.papers.put(paper);
    await db.syncOps.update(operation.id, { payload: paper });
  });
}

export async function restorePaper(paperId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.papers, db.syncState, db.syncOps, async () => {
    const current = await db.papers.get(paperId);
    if (!current) return;
    const now = Date.now();
    const next = {
      ...current,
      libraryState: 'saved' as const,
      deletedAt: undefined,
      updatedAt: now,
    };
    const { version, operation } = await versionAndRecord(db, 'paper', paperId, 'put', next);
    const paper = {
      ...next,
      version,
      fieldVersions: versionPaperFields(current, version, ['libraryState']),
    };
    await db.papers.put(paper);
    await db.syncOps.update(operation.id, { payload: paper });
  });
}

export async function importPaperToLibrary(
  paper: Omit<PaperInfo, 'createdAt' | 'updatedAt' | 'version' | 'libraryState'>,
): Promise<PaperInfo> {
  const db = await openPaperFlowDatabase();
  return db.transaction('rw', db.papers, db.syncState, db.syncOps, async () => {
    const current = await db.papers.get(paper.id);
    const now = Date.now();
    const next = {
      ...current,
      ...paper,
      favorite: current?.favorite || paper.favorite || false,
      readStatus: current?.readStatus || paper.readStatus || 'unread' as const,
      libraryState: 'saved' as const,
      deletedAt: undefined,
      createdAt: current?.createdAt || now,
      accessedAt: now,
      updatedAt: now,
      metadataSource: current?.metadataSource || 'automatic' as const,
    };
    const { version, operation } = await versionAndRecord(db, 'paper', paper.id, 'put', next);
    const saved = {
      ...next,
      version,
      fieldVersions: versionPaperFields(current || next, version, ['libraryState']),
    };
    await db.papers.put(saved);
    await db.syncOps.update(operation.id, { payload: saved });
    return saved;
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

export async function updateCollection(
  collectionId: string,
  patch: Pick<Partial<Collection>, 'name' | 'parentId' | 'sortOrder'>,
): Promise<Collection> {
  const db = await openPaperFlowDatabase();
  return db.transaction('rw', db.collections, db.syncState, db.syncOps, async () => {
    const current = await db.collections.get(collectionId);
    if (!current) throw new Error('Collection was not found.');
    const name = patch.name === undefined ? current.name : patch.name.trim();
    if (!name) throw new Error('Collection name is required.');
    if (patch.parentId === collectionId) throw new Error('A collection cannot contain itself.');
    if (patch.parentId) {
      const collections = await db.collections.toArray();
      let parentId: string | undefined = patch.parentId;
      while (parentId) {
        if (parentId === collectionId) throw new Error('A collection cannot move inside its own descendant.');
        parentId = collections.find((item) => item.id === parentId)?.parentId;
      }
    }
    const now = Date.now();
    const next = { ...current, ...patch, name, updatedAt: now };
    const { version, operation } = await versionAndRecord(db, 'collection', collectionId, 'put', next);
    const collection = { ...next, version };
    await db.collections.put(collection);
    await db.syncOps.update(operation.id, { payload: collection });
    return collection;
  });
}

export async function deleteCollection(collectionId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.collections, db.collectionItems, db.syncState, db.syncOps, async () => {
    const current = await db.collections.get(collectionId);
    if (!current) return;
    const now = Date.now();
    const next = { ...current, deletedAt: now, updatedAt: now };
    const { version, operation } = await versionAndRecord(db, 'collection', collectionId, 'delete', next);
    const collection = { ...next, version };
    await db.collections.put(collection);
    await db.syncOps.update(operation.id, { payload: collection });
    const children = await db.collections.where('parentId').equals(collectionId).toArray();
    for (const child of children.filter((item) => !item.deletedAt)) {
      const childNext = { ...child, parentId: current.parentId, updatedAt: now };
      const childMutation = await versionAndRecord(db, 'collection', child.id, 'put', childNext);
      const reparented = { ...childNext, version: childMutation.version };
      await db.collections.put(reparented);
      await db.syncOps.update(childMutation.operation.id, { payload: reparented });
    }
    const items = await db.collectionItems.where('collectionId').equals(collectionId).toArray();
    for (const item of items.filter((value) => !value.deletedAt)) {
      const itemNext = { ...item, deletedAt: now, updatedAt: now };
      const itemMutation = await versionAndRecord(db, 'collectionItem', item.id, 'delete', itemNext);
      const deletedItem = { ...itemNext, version: itemMutation.version };
      await db.collectionItems.put(deletedItem);
      await db.syncOps.update(itemMutation.operation.id, { payload: deletedItem });
    }
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
    const current = await db.collectionItems.get(id);
    const item: CollectionItem = {
      id,
      collectionId,
      paperId,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      version,
    };
    await db.collectionItems.put(item);
    await db.syncOps.update(operation.id, { payload: item });
  });
}

export async function removePaperFromCollection(paperId: string, collectionId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.collectionItems, db.syncState, db.syncOps, async () => {
    const id = relationId(collectionId, paperId);
    const current = await db.collectionItems.get(id);
    if (!current || current.deletedAt) return;
    const now = Date.now();
    const next = { ...current, deletedAt: now, updatedAt: now };
    const { version, operation } = await versionAndRecord(db, 'collectionItem', id, 'delete', next);
    const item = { ...next, version };
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
    const current = await db.paperTags.get(id);
    const paperTag: PaperTag = {
      id,
      paperId,
      tagId,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      version,
    };
    await db.paperTags.put(paperTag);
    await db.syncOps.update(operation.id, { payload: paperTag });
    return paperTag;
  });
}

export async function removeTagFromPaper(paperId: string, tagId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.paperTags, db.syncState, db.syncOps, async () => {
    const id = relationId(paperId, tagId);
    const current = await db.paperTags.get(id);
    if (!current || current.deletedAt) return;
    const now = Date.now();
    const next = { ...current, deletedAt: now, updatedAt: now };
    const { version, operation } = await versionAndRecord(db, 'paperTag', id, 'delete', next);
    const paperTag = { ...next, version };
    await db.paperTags.put(paperTag);
    await db.syncOps.update(operation.id, { payload: paperTag });
  });
}

export async function listTags(): Promise<Tag[]> {
  const db = await openPaperFlowDatabase();
  return (await db.tags.toArray())
    .filter((tag) => !tag.deletedAt)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function updateTag(
  tagId: string,
  patch: Pick<Partial<Tag>, 'name' | 'color'>,
): Promise<Tag> {
  const db = await openPaperFlowDatabase();
  return db.transaction('rw', db.tags, db.syncState, db.syncOps, async () => {
    const current = await db.tags.get(tagId);
    if (!current) throw new Error('Tag was not found.');
    const name = patch.name === undefined ? current.name : patch.name.trim();
    if (!name) throw new Error('Tag name is required.');
    const normalizedName = normalizeTagName(name);
    const collision = await db.tags.where('normalizedName').equals(normalizedName).first();
    if (collision && collision.id !== tagId && !collision.deletedAt) {
      throw new Error('A tag with this name already exists. Merge the tags instead.');
    }
    const now = Date.now();
    const next = { ...current, ...patch, name, normalizedName, updatedAt: now };
    const { version, operation } = await versionAndRecord(db, 'tag', tagId, 'put', next);
    const tag = { ...next, version };
    await db.tags.put(tag);
    await db.syncOps.update(operation.id, { payload: tag });
    return tag;
  });
}

export async function mergeTags(sourceTagId: string, targetTagId: string): Promise<void> {
  if (sourceTagId === targetTagId) throw new Error('Choose two different tags to merge.');
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.tags, db.paperTags, db.syncState, db.syncOps, async () => {
    const [source, target] = await Promise.all([db.tags.get(sourceTagId), db.tags.get(targetTagId)]);
    if (!source || !target) throw new Error('Both tags must exist before merging.');
    const now = Date.now();
    const relations = await db.paperTags.where('tagId').equals(sourceTagId).toArray();
    for (const relation of relations.filter((item) => !item.deletedAt)) {
      const targetId = relationId(relation.paperId, targetTagId);
      const existing = await db.paperTags.get(targetId);
      if (!existing || existing.deletedAt) {
        const next = {
          ...relation,
          id: targetId,
          tagId: targetTagId,
          deletedAt: undefined,
          updatedAt: now,
        };
        const mutation = await versionAndRecord(db, 'paperTag', targetId, 'put', next);
        const moved = { ...next, version: mutation.version };
        await db.paperTags.put(moved);
        await db.syncOps.update(mutation.operation.id, { payload: moved });
      }
      const removed = { ...relation, deletedAt: now, updatedAt: now };
      const mutation = await versionAndRecord(db, 'paperTag', relation.id, 'delete', removed);
      const deletedRelation = { ...removed, version: mutation.version };
      await db.paperTags.put(deletedRelation);
      await db.syncOps.update(mutation.operation.id, { payload: deletedRelation });
    }
    const deleted = { ...source, deletedAt: now, updatedAt: now };
    const mutation = await versionAndRecord(db, 'tag', sourceTagId, 'delete', deleted);
    const deletedTag = { ...deleted, version: mutation.version };
    await db.tags.put(deletedTag);
    await db.syncOps.update(mutation.operation.id, { payload: deletedTag });
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
    const { version, operation } = await versionAndRecord(
      db,
      'note',
      id,
      'put',
      undefined,
      current?.version,
    );
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

export async function saveAiAnswerAsNote(
  paperId: string,
  messageId: string,
  title: string,
  content: string,
): Promise<{ paper: PaperInfo; note: PaperNote }> {
  const db = await openPaperFlowDatabase();
  const current = await db.papers.get(paperId);
  if (!current) throw new Error('Paper workspace was not found.');
  const paper = current.libraryState === 'saved'
    ? current
    : await savePaperToLibrary(paperId);
  const note = await saveNote(paperId, {
    id: `ai-note:${messageId}`,
    title,
    content,
  });
  return { paper, note };
}

export async function deleteNote(noteId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.notes, db.syncState, db.syncOps, async () => {
    const current = await db.notes.get(noteId);
    if (!current || current.deletedAt) return;
    const now = Date.now();
    const next = { ...current, deletedAt: now, updatedAt: now };
    const { version, operation } = await versionAndRecord(
      db,
      'note',
      noteId,
      'delete',
      next,
      current.version,
    );
    const note = { ...next, version };
    await db.notes.put(note);
    await db.syncOps.update(operation.id, { payload: note });
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
