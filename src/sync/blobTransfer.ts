import {
  decryptObject,
  deserializeEncryptedObject,
  encryptObject,
  opaqueDriveFileName,
  serializeEncryptedObject,
} from '../crypto/objectCipher';
import { bytesToBase64Url } from '../crypto/encoding';
import type { PaperFlowDatabase } from '../db/PaperFlowDatabase';
import type { SyncObjectStore } from '../services/google/driveObjects';
import { DriveRequestError } from '../services/google/driveClient';
import {
  deleteEncryptedUpload,
  readEncryptedUpload,
  readStoredPdf,
  writeEncryptedUpload,
  writeStoredPdf,
} from '../services/storage/opfs';
import type { PaperDocument, SyncCheckpoint } from '../types';
import { clearCheckpoint, SyncBudget, writeCheckpoint } from './checkpoint';

const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;

async function chunkHash(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data.slice().buffer);
  return bytesToBase64Url(new Uint8Array(digest));
}

export class BlobTransfer {
  constructor(
    private readonly database: PaperFlowDatabase,
    private readonly remote: SyncObjectStore,
    private readonly uploadChunkBytes = UPLOAD_CHUNK_BYTES,
  ) {}

  async uploadQueuedDocuments(
    vaultMasterKey: Uint8Array,
    vaultId: string,
    budget: SyncBudget,
  ): Promise<number> {
    const documents = (await this.database.documents.toArray()).filter((document) =>
      !document.deletedAt
      && document.localState === 'available'
      && ['queued', 'uploading', 'error'].includes(document.remoteState));
    let uploaded = 0;
    for (const document of documents) {
      if (!budget.hasTime(2_000)) break;
      const complete = await this.uploadDocument(vaultMasterKey, vaultId, document, budget);
      if (complete) uploaded += 1;
    }
    return uploaded;
  }

  async downloadDocument(
    vaultMasterKey: Uint8Array,
    vaultId: string,
    document: PaperDocument,
  ): Promise<void> {
    if (!document.remoteObjectId) throw new Error('The remote PDF object is unavailable.');
    const encrypted = deserializeEncryptedObject(
      new TextDecoder().decode(await this.remote.downloadBytes(document.remoteObjectId)),
    );
    if (encrypted.vaultId !== vaultId) throw new Error('The remote PDF belongs to another vault.');
    const plaintext = await decryptObject(
      vaultMasterKey,
      'blob',
      document.contentHash,
      encrypted,
    );
    await writeStoredPdf(document.contentHash, plaintext);
    await this.database.documents.update(document.id, {
      localState: 'available',
      remoteState: 'available',
      updatedAt: Date.now(),
    });
  }

  private async uploadDocument(
    vaultMasterKey: Uint8Array,
    vaultId: string,
    document: PaperDocument,
    budget: SyncBudget,
  ): Promise<boolean> {
    const name = await opaqueDriveFileName(
      vaultMasterKey,
      vaultId,
      'blob',
      document.contentHash,
    );
    const checkpointId = `blob-upload:${document.id}`;
    let checkpoint = await this.database.syncCheckpoints.get(checkpointId);
    const existingRemote = await this.remote.findOpaqueObject(name);
    if (existingRemote) {
      await this.completeDocument(document, existingRemote.id);
      await clearCheckpoint(this.database, checkpointId);
      await deleteEncryptedUpload(name);
      return true;
    }
    let encryptedBytes: Uint8Array;

    try {
      encryptedBytes = await readEncryptedUpload(name);
    } catch {
      const plaintext = await readStoredPdf(document.contentHash);
      const encrypted = await encryptObject(
        vaultMasterKey,
        vaultId,
        'blob',
        document.contentHash,
        plaintext,
      );
      encryptedBytes = new TextEncoder().encode(serializeEncryptedObject(encrypted));
      await writeEncryptedUpload(name, encryptedBytes);
    }

    if (!checkpoint?.sessionUrl) {
      const sessionUrl = await this.remote.createResumableObjectUpload({
        vaultId,
        name,
        logicalId: document.contentHash,
        size: encryptedBytes.byteLength,
      });
      checkpoint = {
        id: checkpointId,
        kind: 'blob-upload',
        stage: 'uploading',
        documentId: document.id,
        sessionUrl,
        offset: 0,
        totalBytes: encryptedBytes.byteLength,
        attempt: checkpoint?.attempt || 0,
        updatedAt: Date.now(),
      };
      await writeCheckpoint(this.database, checkpoint);
      await this.database.documents.update(document.id, {
        remoteState: 'uploading',
        updatedAt: Date.now(),
      });
    }

    let offset = checkpoint.offset || 0;
    const sessionUrl = checkpoint.sessionUrl;
    if (!sessionUrl) throw new Error('The resumable upload checkpoint is incomplete.');
    while (offset < encryptedBytes.byteLength && budget.hasTime(1_500)) {
      const chunk = encryptedBytes.subarray(
        offset,
        Math.min(offset + this.uploadChunkBytes, encryptedBytes.byteLength),
      );
      const nextCheckpoint: SyncCheckpoint = {
        ...checkpoint,
        offset,
        chunkHash: await chunkHash(chunk),
        updatedAt: Date.now(),
      };
      await writeCheckpoint(this.database, nextCheckpoint);
      let result;
      try {
        result = await this.remote.uploadResumableChunk(
          sessionUrl,
          chunk,
          offset,
          encryptedBytes.byteLength,
        );
      } catch (error) {
        if (error instanceof DriveRequestError && (error.status === 404 || error.status === 410)) {
          await writeCheckpoint(this.database, {
            ...nextCheckpoint,
            sessionUrl: undefined,
            offset: 0,
            attempt: nextCheckpoint.attempt + 1,
            updatedAt: Date.now(),
          });
          return false;
        }
        throw error;
      }
      offset = result.nextOffset;
      checkpoint = { ...nextCheckpoint, offset, updatedAt: Date.now() };
      await writeCheckpoint(this.database, checkpoint);
      if (result.complete) {
        await this.completeDocument(document, result.file?.id);
        await clearCheckpoint(this.database, checkpointId);
        await deleteEncryptedUpload(name);
        return true;
      }
    }
    return false;
  }

  private async completeDocument(
    document: PaperDocument,
    remoteObjectId?: string,
  ): Promise<void> {
    const next = {
      ...document,
      remoteState: 'available' as const,
      remoteObjectId: remoteObjectId || document.remoteObjectId,
      updatedAt: Date.now(),
    };
    await this.database.transaction('rw', this.database.documents, this.database.syncOps, async () => {
      await this.database.documents.put(next);
      const pending = await this.database.syncOps
        .where('entityId')
        .equals(document.id)
        .filter((operation) => operation.state === 'pending')
        .toArray();
      for (const operation of pending) {
        await this.database.syncOps.update(operation.id, { payload: next });
      }
    });
  }
}
