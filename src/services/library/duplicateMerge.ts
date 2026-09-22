import { database, openPaperFlowDatabase } from '../../db/PaperFlowDatabase';
import type { PaperChunk, PaperInfo, PaperMemory } from '../../types';
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
        await db.collectionItems.put({ ...item, id, paperId: canonicalId, updatedAt: now });
        await db.collectionItems.delete(item.id);
      }

      const paperTags = await db.paperTags.where('paperId').equals(duplicateId).toArray();
      for (const item of paperTags) {
        const id = `${canonicalId}:${item.tagId}`;
        await db.paperTags.put({ ...item, id, paperId: canonicalId, updatedAt: now });
        await db.paperTags.delete(item.id);
      }

      for (const table of [db.documents, db.notes, db.annotations, db.threads, db.selections]) {
        const records = await table.where('paperId').equals(duplicateId).toArray();
        await Promise.all(records.map((record) => table.update(record.id, { paperId: canonicalId, updatedAt: now })));
      }

      const threads = await db.threads.where('paperId').equals(canonicalId).toArray();
      const threadIds = new Set(threads.map((thread) => thread.id));
      const duplicateMessages = await db.messages.where('paperId').equals(duplicateId).toArray();
      await Promise.all(duplicateMessages.map((message) => db.messages.update(message.id, {
        paperId: canonicalId,
        threadId: threadIds.has(message.threadId) ? message.threadId : message.threadId,
      })));

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
        const memory: PaperMemory = {
          ...duplicateMemory,
          id: `memory:${canonicalId}`,
          paperId: canonicalId,
          content,
          updatedAt: now,
        };
        if (canonicalMemory) await db.paperMemory.delete(canonicalMemory.id);
        await db.paperMemory.delete(duplicateMemory.id);
        await db.paperMemory.put(memory);
      }

      const aliases = [
        ...(await db.paperAliases.where('paperId').equals(duplicateId).toArray()),
        ...aliasesForPaper(duplicate),
      ];
      await Promise.all(aliases.map((alias) => db.paperAliases.put({ ...alias, paperId: canonicalId })));

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
