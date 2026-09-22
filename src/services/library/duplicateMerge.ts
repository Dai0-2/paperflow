import { database, openPaperFlowDatabase } from '../../db/PaperFlowDatabase';
import type {
  Annotation,
  PaperChunk,
  PaperDocument,
  PaperInfo,
  PaperMemory,
  PaperNote,
  PaperSelection,
  Thread,
} from '../../types';
import type { PersistedMessage } from '../../db/schema';
import { aliasesForPaper } from '../paper';
import { versionAndRecord } from '../../repositories/versioning';

function richerPaper(canonical: PaperInfo, duplicate: PaperInfo): PaperInfo {
  const prefer = (left?: string, right?: string) =>
    (left?.trim().length || 0) >= (right?.trim().length || 0) ? left : right;
  return {
    ...duplicate,
    ...canonical,
    title: prefer(canonical.title, duplicate.title) || canonical.title,
    shortTitle: prefer(canonical.shortTitle, duplicate.shortTitle) || canonical.shortTitle,
    authors: prefer(canonical.authors, duplicate.authors),
    abstract: prefer(canonical.abstract, duplicate.abstract),
    journal: prefer(canonical.journal, duplicate.journal),
    doi: canonical.doi || duplicate.doi,
    arxivId: canonical.arxivId || duplicate.arxivId,
    openReviewId: canonical.openReviewId || duplicate.openReviewId,
    contentHash: canonical.contentHash || duplicate.contentHash,
    favorite: Boolean(canonical.favorite || duplicate.favorite),
    libraryState: canonical.libraryState === 'saved' || duplicate.libraryState === 'saved' ? 'saved' : 'temporary',
    id: canonical.id,
  };
}

export async function mergeDuplicatePapers(canonicalId: string, duplicateId: string): Promise<PaperInfo> {
  if (canonicalId === duplicateId) throw new Error('A paper cannot be merged into itself.');
  const db = await openPaperFlowDatabase();
  return db.transaction(
    'rw',
    [
      db.papers,
      db.paperAliases,
      db.collectionItems,
      db.paperTags,
      db.documents,
      db.notes,
      db.annotations,
      db.threads,
      db.messages,
      db.paperMemory,
      db.selections,
      db.paperChunks,
      db.ocrPages,
      db.syncState,
      db.syncOps,
    ],
    async () => {
      const [canonical, duplicate] = await Promise.all([
        db.papers.get(canonicalId),
        db.papers.get(duplicateId),
      ]);
      if (!canonical || !duplicate) throw new Error('Both papers must exist before merging.');

      const now = Date.now();
      const merged = { ...richerPaper(canonical, duplicate), updatedAt: now };
      const { version, operation } = await versionAndRecord(db, 'paper', canonicalId, 'put', undefined);
      merged.version = version;
      await db.papers.put(merged);
      await db.syncOps.update(operation.id, { payload: merged });

      const collectionItems = await db.collectionItems.where('paperId').equals(duplicateId).toArray();
      for (const item of collectionItems) {
        const id = `${item.collectionId}:${canonicalId}`;
        const target = { ...item, id, paperId: canonicalId, deletedAt: undefined, updatedAt: now };
        const put = await versionAndRecord(db, 'collectionItem', id, 'put', target);
        const versionedTarget = { ...target, version: put.version };
        await db.collectionItems.put(versionedTarget);
        await db.syncOps.update(put.operation.id, { payload: versionedTarget });
        const removed = { ...item, deletedAt: now, updatedAt: now };
        const deletion = await versionAndRecord(
          db,
          'collectionItem',
          item.id,
          'delete',
          removed,
          item.version,
        );
        const tombstone = { ...removed, version: deletion.version };
        await db.collectionItems.put(tombstone);
        await db.syncOps.update(deletion.operation.id, { payload: tombstone });
      }

      const paperTags = await db.paperTags.where('paperId').equals(duplicateId).toArray();
      for (const item of paperTags) {
        const id = `${canonicalId}:${item.tagId}`;
        const target = { ...item, id, paperId: canonicalId, deletedAt: undefined, updatedAt: now };
        const put = await versionAndRecord(db, 'paperTag', id, 'put', target);
        const versionedTarget = { ...target, version: put.version };
        await db.paperTags.put(versionedTarget);
        await db.syncOps.update(put.operation.id, { payload: versionedTarget });
        const removed = { ...item, deletedAt: now, updatedAt: now };
        const deletion = await versionAndRecord(
          db,
          'paperTag',
          item.id,
          'delete',
          removed,
          item.version,
        );
        const tombstone = { ...removed, version: deletion.version };
        await db.paperTags.put(tombstone);
        await db.syncOps.update(deletion.operation.id, { payload: tombstone });
      }

      const moveRecord = async <T extends {
        id: string;
        paperId: string;
        updatedAt?: number;
        version?: { counter: number; deviceId: string };
        deletedAt?: number;
      }>(
        entityType: 'document' | 'note' | 'annotation' | 'thread' | 'selection',
        record: T,
        putRecord: (next: T & { version: { counter: number; deviceId: string } }) => Promise<unknown>,
      ) => {
        const next = { ...record, paperId: canonicalId, updatedAt: now };
        const mutation = await versionAndRecord(
          db,
          entityType,
          record.id,
          record.deletedAt ? 'delete' : 'put',
          next,
          record.version,
        );
        const versioned = { ...next, version: mutation.version };
        await putRecord(versioned);
        await db.syncOps.update(mutation.operation.id, { payload: versioned });
      };
      for (const record of await db.documents.where('paperId').equals(duplicateId).toArray()) {
        await moveRecord('document', record, (next) => db.documents.put(next as PaperDocument));
      }
      for (const record of await db.notes.where('paperId').equals(duplicateId).toArray()) {
        await moveRecord('note', record, (next) => db.notes.put(next as PaperNote));
      }
      for (const record of await db.annotations.where('paperId').equals(duplicateId).toArray()) {
        await moveRecord('annotation', record, (next) => db.annotations.put(next as Annotation));
      }
      for (const record of await db.threads.where('paperId').equals(duplicateId).toArray()) {
        await moveRecord('thread', record, (next) => db.threads.put(next as Thread));
      }
      for (const record of await db.selections.where('paperId').equals(duplicateId).toArray()) {
        await moveRecord('selection', record, (next) => db.selections.put(next as PaperSelection));
      }

      const threads = await db.threads.where('paperId').equals(canonicalId).toArray();
      const threadIds = new Set(threads.map((thread) => thread.id));
      const duplicateMessages = await db.messages.where('paperId').equals(duplicateId).toArray();
      for (const message of duplicateMessages) {
        const next = {
          ...message,
          paperId: canonicalId,
          threadId: threadIds.has(message.threadId) ? message.threadId : message.threadId,
          updatedAt: now,
        };
        const mutation = await versionAndRecord(
          db,
          'message',
          message.id,
          message.deletedAt ? 'delete' : 'put',
          next,
          message.version,
        );
        const versioned = { ...next, version: mutation.version };
        await db.messages.put(versioned as PersistedMessage);
        await db.syncOps.update(mutation.operation.id, { payload: versioned });
      }

      const duplicateChunks = await db.paperChunks.where('paperId').equals(duplicateId).toArray();
      for (const chunk of duplicateChunks) {
        const id = `${canonicalId}:${chunk.page}:${chunk.source || 'text-layer'}`;
        const current = await db.paperChunks.get(id);
        const next: PaperChunk = {
          ...chunk,
          id,
          paperId: canonicalId,
          text: (current?.text.length || 0) >= chunk.text.length ? current!.text : chunk.text,
          updatedAt: now,
        };
        await db.paperChunks.put(next);
        await db.paperChunks.delete(chunk.id);
      }

      const ocrPages = await db.ocrPages.where('paperId').equals(duplicateId).toArray();
      await Promise.all(ocrPages.map((page) => db.ocrPages.update(page.id, { paperId: canonicalId, updatedAt: now })));

      const [canonicalMemory, duplicateMemory] = await Promise.all([
        db.paperMemory.where('paperId').equals(canonicalId).first(),
        db.paperMemory.where('paperId').equals(duplicateId).first(),
      ]);
      if (duplicateMemory) {
        const content = [canonicalMemory?.content, duplicateMemory.content].filter(Boolean).join('\n\n---\n\n');
        const memoryDraft: PaperMemory = {
          ...duplicateMemory,
          id: `memory:${canonicalId}`,
          paperId: canonicalId,
          content,
          updatedAt: now,
        };
        const mutation = await versionAndRecord(
          db,
          'paperMemory',
          memoryDraft.id,
          'put',
          memoryDraft,
          canonicalMemory?.version,
        );
        const memory = { ...memoryDraft, version: mutation.version };
        await db.paperMemory.put(memory);
        await db.syncOps.update(mutation.operation.id, { payload: memory });
        if (duplicateMemory.id !== memory.id) {
          const removed = { ...duplicateMemory, deletedAt: now, updatedAt: now };
          const deletion = await versionAndRecord(
            db,
            'paperMemory',
            duplicateMemory.id,
            'delete',
            removed,
            duplicateMemory.version,
          );
          const tombstone = { ...removed, version: deletion.version };
          await db.paperMemory.put(tombstone);
          await db.syncOps.update(deletion.operation.id, { payload: tombstone });
        }
      }

      const aliases = [
        ...(await db.paperAliases.where('paperId').equals(duplicateId).toArray()),
        ...aliasesForPaper(duplicate),
      ];
      for (const alias of aliases) {
        const next = {
          ...alias,
          paperId: canonicalId,
          createdAt: alias.createdAt || now,
          updatedAt: now,
        };
        const mutation = await versionAndRecord(
          db,
          'paperAlias',
          alias.alias,
          'put',
          next,
          alias.version,
        );
        const versioned = { ...next, version: mutation.version };
        await db.paperAliases.put(versioned);
        await db.syncOps.update(mutation.operation.id, { payload: versioned });
      }

      const tombstone = {
        ...duplicate,
        libraryState: 'trashed' as const,
        favorite: false,
        mergedInto: canonicalId,
        deletedAt: now,
        updatedAt: now,
      };
      const deleted = await versionAndRecord(db, 'paper', duplicateId, 'delete', tombstone);
      tombstone.version = deleted.version;
      await db.papers.put(tombstone);
      await db.syncOps.update(deleted.operation.id, { payload: tombstone });

      return merged;
    },
  );
}

export { database as duplicateMergeDatabase };
