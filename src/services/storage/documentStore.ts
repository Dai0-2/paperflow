import { openPaperFlowDatabase } from '../../db/PaperFlowDatabase';
import { versionAndRecord } from '../../repositories/versioning';
import type { EntityVersion, PaperDocument, PaperInfo } from '../../types';
import { contentHash } from '../paper';
import {
  deleteStoredPdf,
  hasStoredPdf,
  readStoredPdf,
  writeStoredPdf,
} from './opfs';

const LOCAL_VERSION: EntityVersion = { counter: 0, deviceId: 'local-only' };

export interface StoredDocument {
  document: PaperDocument;
  data: Uint8Array;
}

function documentId(paperId: string, hash: string): string {
  return `document:${paperId}:${hash}`;
}

export async function storePdfDocument(input: {
  paper: PaperInfo;
  data: Uint8Array;
  name: string;
  pageCount?: number;
}): Promise<PaperDocument> {
  const hash = await contentHash(input.data.slice().buffer);
  await writeStoredPdf(hash, input.data);

  const db = await openPaperFlowDatabase();
  const id = documentId(input.paper.id, hash);
  return db.transaction(
    'rw',
    db.papers,
    db.paperAliases,
    db.documents,
    db.syncState,
    db.syncOps,
    async () => {
      const now = Date.now();
      const paper = await db.papers.get(input.paper.id);
      if (!paper) throw new Error('Save the paper workspace before storing its PDF.');
      const existing = await db.documents.get(id);
      const shouldSync = paper.libraryState === 'saved';
      let version = existing?.version || paper.version || LOCAL_VERSION;
      let operationId: string | undefined;

      if (shouldSync && (existing?.remoteState !== 'queued' && existing?.remoteState !== 'available')) {
        const mutation = await versionAndRecord(db, 'document', id, 'put', undefined);
        version = mutation.version;
        operationId = mutation.operation.id;
      }
      const document: PaperDocument = {
        id,
        paperId: paper.id,
        contentHash: hash,
        name: input.name || existing?.name || 'paper.pdf',
        mimeType: 'application/pdf',
        size: input.data.byteLength,
        pageCount: input.pageCount,
        localState: 'available',
        remoteState: shouldSync
          ? existing?.remoteState === 'available' ? 'available' : 'queued'
          : existing?.remoteState || 'none',
        remoteObjectId: existing?.remoteObjectId,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        version,
        deletedAt: undefined,
      };
      await db.documents.put(document);
      await db.papers.update(paper.id, {
        contentHash: hash,
        pageCount: input.pageCount || paper.pageCount,
        updatedAt: now,
      });
      await db.paperAliases.put({
        alias: `content-hash:${hash}`,
        paperId: paper.id,
        kind: 'content-hash',
      });
      if (operationId) await db.syncOps.update(operationId, { payload: document });
      return document;
    },
  );
}

export async function queueStoredDocumentsForSync(paperId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.documents, db.syncState, db.syncOps, async () => {
    const documents = await db.documents.where('paperId').equals(paperId).toArray();
    for (const document of documents.filter((item) =>
      !item.deletedAt && item.localState === 'available' && item.remoteState === 'none')) {
      const mutation = await versionAndRecord(db, 'document', document.id, 'put', document);
      const next: PaperDocument = {
        ...document,
        remoteState: 'queued',
        updatedAt: Date.now(),
        version: mutation.version,
      };
      await db.documents.put(next);
      await db.syncOps.update(mutation.operation.id, { payload: next });
    }
  });
}

export async function loadStoredDocumentForPaper(paperId: string): Promise<StoredDocument | undefined> {
  const db = await openPaperFlowDatabase();
  const documents = (await db.documents.where('paperId').equals(paperId).toArray())
    .filter((document) => !document.deletedAt)
    .sort((left, right) => right.updatedAt - left.updatedAt);

  for (const document of documents) {
    if (document.localState !== 'available') continue;
    try {
      const data = await readStoredPdf(document.contentHash);
      const hash = data.byteLength === document.size
        ? await contentHash(data.slice().buffer)
        : '';
      if (hash !== document.contentHash) {
        await db.documents.update(document.id, { localState: 'corrupt', updatedAt: Date.now() });
        continue;
      }
      return { document, data };
    } catch {
      await db.documents.update(document.id, { localState: 'missing', updatedAt: Date.now() });
    }
  }
  return undefined;
}

export async function verifyStoredDocument(documentIdValue: string): Promise<PaperDocument> {
  const db = await openPaperFlowDatabase();
  const document = await db.documents.get(documentIdValue);
  if (!document || document.deletedAt) throw new Error('The PDF attachment was not found.');
  const exists = await hasStoredPdf(document.contentHash);
  const localState = exists ? 'available' : 'missing';
  if (document.localState !== localState) {
    await db.documents.update(document.id, { localState, updatedAt: Date.now() });
  }
  return { ...document, localState };
}

export async function removeUnreferencedPdf(contentHashValue: string): Promise<boolean> {
  const db = await openPaperFlowDatabase();
  const references = await db.documents.where('contentHash').equals(contentHashValue).toArray();
  const retained = references.some((document) => !document.deletedAt);
  if (retained) return false;
  await deleteStoredPdf(contentHashValue);
  return true;
}
