import {
  openPaperFlowDatabase,
  type PaperFlowDatabase,
} from '../../db/PaperFlowDatabase';
import { vaultSession } from '../../crypto/vault';
import { versionAndRecord } from '../../repositories/versioning';
import {
  createGoogleDriveObjectStore,
  type SyncObjectStore,
} from '../google/driveObjects';
import { BlobTransfer } from '../../sync/blobTransfer';
import type { EntityVersion, PaperDocument, PaperInfo } from '../../types';
import { contentHash } from '../paper';
import {
  deleteStoredPdf,
  hasStoredPdf,
  readStoredPdf,
  writeStoredPdf,
} from './opfs';

const LOCAL_VERSION: EntityVersion = { counter: 0, deviceId: 'local-only' };
export const PDF_CLOUD_SYNC_SETTING = 'syncPdfDocuments';

export interface StoredDocument {
  document: PaperDocument;
  data: Uint8Array;
}

function documentId(paperId: string, hash: string): string {
  return `document:${paperId}:${hash}`;
}

export async function isPdfCloudSyncEnabled(
  database?: PaperFlowDatabase,
): Promise<boolean> {
  const db = database || await openPaperFlowDatabase();
  return (await db.settings.get(PDF_CLOUD_SYNC_SETTING))?.value === true;
}

export async function setPdfCloudSyncEnabled(
  enabled: boolean,
  database?: PaperFlowDatabase,
): Promise<void> {
  const db = database || await openPaperFlowDatabase();
  await db.transaction(
    'rw',
    [
      db.papers,
      db.documents,
      db.settings,
      db.syncState,
      db.syncOps,
      db.syncCheckpoints,
    ],
    async () => {
      await db.settings.put({
        key: PDF_CLOUD_SYNC_SETTING,
        value: enabled,
        scope: 'local',
        updatedAt: Date.now(),
      });

      const documents = await db.documents.toArray();
      if (enabled) {
        for (const document of documents.filter((item) =>
          !item.deletedAt
          && item.localState === 'available'
          && item.remoteState === 'none')) {
          const paper = await db.papers.get(document.paperId);
          if (paper?.libraryState !== 'saved') continue;
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
        return;
      }

      const cancelled = documents.filter((item) =>
        ['queued', 'uploading', 'error'].includes(item.remoteState));
      const cancelledIds = new Set(cancelled.map((item) => item.id));
      for (const document of cancelled) {
        await db.documents.put({
          ...document,
          remoteState: 'none',
          remoteObjectId: undefined,
          updatedAt: Date.now(),
        });
        await db.syncCheckpoints.delete(`blob-upload:${document.id}`);
      }
      const pendingDocumentOps = await db.syncOps
        .where('state')
        .equals('pending')
        .filter((operation) =>
          operation.entityType === 'document' && cancelledIds.has(operation.entityId))
        .primaryKeys();
      await db.syncOps.bulkDelete(pendingDocumentOps);
    },
  );
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
  const cloudSyncEnabled = await isPdfCloudSyncEnabled(db);
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
      const shouldSync = paper.libraryState === 'saved' && cloudSyncEnabled;
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
          : existing?.remoteState === 'available' ? 'available' : 'none',
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
  if (!await isPdfCloudSyncEnabled(db)) return;
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

export async function downloadCloudDocumentForPaper(
  paperId: string,
  remote: SyncObjectStore = createGoogleDriveObjectStore(),
  database?: PaperFlowDatabase,
): Promise<StoredDocument | undefined> {
  const db = database || await openPaperFlowDatabase();
  const document = (await db.documents.where('paperId').equals(paperId).toArray())
    .filter((item) =>
      !item.deletedAt
      && item.localState !== 'available'
      && item.remoteState === 'available'
      && Boolean(item.remoteObjectId))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (!document) return undefined;
  const vaultId = vaultSession.getVaultId();
  if (!vaultId) {
    throw new Error('Unlock the encrypted Google Drive vault to restore this PDF.');
  }
  const key = vaultSession.getKey();
  try {
    await new BlobTransfer(db, remote).downloadDocument(
      key,
      vaultId,
      document,
    );
  } finally {
    key.fill(0);
  }
  if (database) {
    const restoredDocument = await db.documents.get(document.id);
    if (!restoredDocument) return undefined;
    return {
      document: restoredDocument,
      data: await readStoredPdf(restoredDocument.contentHash),
    };
  }
  return loadStoredDocumentForPaper(paperId);
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
