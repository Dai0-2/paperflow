import { vaultSession } from '../crypto/vault';
import { openPaperFlowDatabase, type PaperFlowDatabase } from '../db/PaperFlowDatabase';
import {
  createGoogleDriveObjectStore,
  type SyncObjectStore,
  type SyncObjectRef,
} from '../services/google/driveObjects';
import { DriveRequestError } from '../services/google/driveClient';
import { googleAuth } from '../services/google/googleAuth';
import { vaultController } from '../services/sync/vaultController';
import {
  isPdfCloudSyncEnabled,
  setPdfCloudSyncEnabled,
} from '../services/storage/documentStore';
import type { EntityVersion, SyncEntityType, SyncOperation } from '../types';
import { versionAndRecord } from '../repositories/versioning';
import { BlobTransfer } from './blobTransfer';
import {
  LOCAL_SYNC_STATE_KEY,
  retryDelayMs,
  SyncBudget,
  updateSyncState,
  writeCheckpoint,
  clearCheckpoint,
} from './checkpoint';
import { applyRemoteOperation, applyRemoteOperations } from './merge';
import { createPendingBatch, markBatchUploaded, requestSyncSoon } from './operationLog';
import {
  parseSyncBatch,
  parseSyncSnapshot,
  SYNC_SNAPSHOT_FORMAT,
  VAULT_PROTOCOL_VERSION,
  type SyncSnapshot,
} from './protocol';

const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SyncReport {
  uploadedBatches: number;
  uploadedDocuments: number;
  appliedOperations: number;
  complete: boolean;
}

export interface SyncRunOptions {
  force?: boolean;
  budgetMs?: number;
}

interface UnlockedVault {
  vaultId: string;
  key: Uint8Array;
}

function operationFromSnapshot(
  snapshot: SyncSnapshot,
  record: SyncSnapshot['records'][number],
  sequence: number,
): SyncOperation {
  const deletedAt = typeof record.payload === 'object'
    && record.payload !== null
    && 'deletedAt' in record.payload
    ? (record.payload as { deletedAt?: unknown }).deletedAt
    : undefined;
  return {
    id: `snapshot:${snapshot.snapshotId}:${record.entityType}:${record.entityId}`,
    deviceId: record.version.deviceId,
    seq: sequence + 1,
    entityType: record.entityType,
    entityId: record.entityId,
    action: typeof deletedAt === 'number' ? 'delete' : 'put',
    version: record.version,
    payload: record.payload,
    createdAt: snapshot.createdAt,
    state: 'uploaded',
    batchId: `snapshot:${snapshot.snapshotId}`,
  };
}

export class SyncEngine {
  private running: Promise<SyncReport> | null = null;

  constructor(
    private readonly database?: PaperFlowDatabase,
    private readonly remote: SyncObjectStore = createGoogleDriveObjectStore(),
  ) {}

  run(options: SyncRunOptions = {}): Promise<SyncReport> {
    if (this.running) return this.running;
    this.running = this.runInternal(options).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async runUnlocked(
    vault: UnlockedVault,
    options: SyncRunOptions = {},
  ): Promise<SyncReport> {
    if (this.running) return this.running;
    this.running = this.synchronize(vault, options).finally(() => {
      vault.key.fill(0);
      this.running = null;
    });
    return this.running;
  }

  private async runInternal(options: SyncRunOptions): Promise<SyncReport> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const database = this.database || await openPaperFlowDatabase();
      await updateSyncState(database, {
        status: 'offline',
        lastError: 'PaperFlow is offline. Local changes remain queued.',
        lastErrorCode: 'offline',
      });
      return {
        uploadedBatches: 0,
        uploadedDocuments: 0,
        appliedOperations: 0,
        complete: false,
      };
    }
    let header = vaultController.getHeader();
    if (!header || !vaultSession.isUnlocked(header.vaultId)) {
      const connection = await vaultController.inspect();
      header = connection.header;
    }
    if (!header || !vaultSession.isUnlocked(header.vaultId)) {
      throw new Error('Unlock the encrypted vault before synchronizing.');
    }
    const key = vaultSession.getKey();
    try {
      return await this.synchronize({ vaultId: header.vaultId, key }, options);
    } finally {
      key.fill(0);
    }
  }

  private async synchronize(
    vault: UnlockedVault,
    options: SyncRunOptions,
  ): Promise<SyncReport> {
    const database = this.database || await openPaperFlowDatabase();
    const budget = new SyncBudget(options.budgetMs);
    const checkpointId = 'sync-run';
    const report: SyncReport = {
      uploadedBatches: 0,
      uploadedDocuments: 0,
      appliedOperations: 0,
      complete: false,
    };
    await updateSyncState(database, {
      status: 'syncing',
      lastError: undefined,
      lastErrorCode: undefined,
      retryAt: undefined,
    });
    await writeCheckpoint(database, {
      id: checkpointId,
      kind: 'sync-run',
      stage: 'pull',
      attempt: 0,
      updatedAt: Date.now(),
    });

    try {
      report.appliedOperations += await this.pull(database, vault, budget);
      await writeCheckpoint(database, {
        id: checkpointId,
        kind: 'sync-run',
        stage: 'upload-blobs',
        attempt: 0,
        updatedAt: Date.now(),
      });
      const syncPdfDocuments = await isPdfCloudSyncEnabled(database);
      if (!syncPdfDocuments) {
        await setPdfCloudSyncEnabled(false, database);
      } else if (budget.hasTime(2_000)) {
        report.uploadedDocuments = await new BlobTransfer(database, this.remote)
          .uploadQueuedDocuments(vault.key, vault.vaultId, budget);
      }
      await writeCheckpoint(database, {
        id: checkpointId,
        kind: 'sync-run',
        stage: 'push',
        attempt: 0,
        updatedAt: Date.now(),
      });
      while (budget.hasTime(1_500)) {
        const batch = await createPendingBatch(database, vault.vaultId, {
          force: options.force,
        });
        if (!batch) break;
        await this.remote.putImmutableSyncObject(
          vault.key,
          vault.vaultId,
          'batch',
          batch.batchId,
          encoder.encode(JSON.stringify(batch)),
        );
        await markBatchUploaded(database, batch.batchId);
        report.uploadedBatches += 1;
      }
      await this.maybeWriteSnapshot(database, vault, budget);
      const pending = await database.syncOps.where('state').equals('pending').count();
      const transfers = await database.syncCheckpoints.where('kind').equals('blob-upload').count();
      report.complete = pending === 0 && transfers === 0;
      await clearCheckpoint(database, checkpointId);
      await updateSyncState(database, {
        status: 'idle',
        lastSyncedAt: Date.now(),
        lastError: undefined,
        lastErrorCode: undefined,
        retryAt: undefined,
      });
      if (!report.complete) requestSyncSoon(1_000);
      return report;
    } catch (error) {
      await this.handleError(database, error);
      throw error;
    }
  }

  private async pull(
    database: PaperFlowDatabase,
    vault: UnlockedVault,
    budget: SyncBudget,
  ): Promise<number> {
    const state = await database.syncState.get(LOCAL_SYNC_STATE_KEY);
    let applied = 0;
    if (!state?.driveChangeToken) {
      const startPageToken = await this.remote.getStartPageToken();
      const objects = await this.remote.listSyncObjects(vault.vaultId);
      applied += await this.applyObjects(database, vault, objects, budget);
      await updateSyncState(database, { driveChangeToken: startPageToken });
      return applied;
    }

    let pageToken = state.driveChangeToken;
    while (budget.hasTime(2_000)) {
      let page;
      try {
        page = await this.remote.listChangedSyncObjects(vault.vaultId, pageToken);
      } catch (error) {
        if (error instanceof DriveRequestError && error.status === 410) {
          await updateSyncState(database, { driveChangeToken: undefined });
          return applied + await this.pull(database, vault, budget);
        }
        throw error;
      }
      applied += await this.applyObjects(database, vault, page.objects, budget);
      if (page.removedFileIds.length) {
        const documents = await database.documents
          .filter((document) => Boolean(
            document.remoteObjectId
            && page.removedFileIds.includes(document.remoteObjectId),
          ))
          .toArray();
        await database.transaction(
          'rw',
          database.documents,
          database.syncState,
          database.syncOps,
          async () => {
            for (const document of documents) {
              const next = {
                ...document,
                remoteState: 'error' as const,
                remoteObjectId: undefined,
                updatedAt: Date.now(),
              };
              const mutation = await versionAndRecord(
                database,
                'document',
                document.id,
                'put',
                next,
                document.version,
              );
              const versioned = { ...next, version: mutation.version };
              await database.documents.put(versioned);
              await database.syncOps.update(mutation.operation.id, { payload: versioned });
            }
          },
        );
        if (documents.length) {
          await updateSyncState(database, {
            lastError: 'A remote PDF was removed from Google Drive. It can be uploaded again.',
            lastErrorCode: 'remote-missing',
          });
        }
      }
      const nextToken = page.nextPageToken || page.newStartPageToken;
      if (!nextToken) break;
      pageToken = nextToken;
      await updateSyncState(database, { driveChangeToken: pageToken });
      if (!page.nextPageToken) break;
    }
    return applied;
  }

  private async applyObjects(
    database: PaperFlowDatabase,
    vault: UnlockedVault,
    objects: SyncObjectRef[],
    _budget: SyncBudget,
  ): Promise<number> {
    const snapshots = objects
      .filter((object) => object.objectType === 'snapshot')
      .sort((left, right) => (right.modifiedTime || '').localeCompare(left.modifiedTime || ''));
    let applied = 0;
    if (snapshots[0]) {
      const snapshot = parseSyncSnapshot(JSON.parse(decoder.decode(
        await this.remote.getSyncObject(vault.key, snapshots[0]),
      )) as unknown);
      if (snapshot.vaultId !== vault.vaultId) throw new Error('Sync snapshot belongs to another vault.');
      for (const [index, record] of snapshot.records.entries()) {
        if (await applyRemoteOperation(
          database,
          operationFromSnapshot(snapshot, record, index),
        )) applied += 1;
      }
      await writeCheckpoint(database, {
        id: 'sync-run',
        kind: 'sync-run',
        stage: `pulled:${snapshots[0].fileId}`,
        attempt: 0,
        updatedAt: Date.now(),
      });
    }
    const batches = objects
      .filter((object) => object.objectType === 'batch')
      .sort((left, right) => (left.modifiedTime || '').localeCompare(right.modifiedTime || ''));
    for (const object of batches) {
      const batch = parseSyncBatch(JSON.parse(decoder.decode(
        await this.remote.getSyncObject(vault.key, object),
      )) as unknown);
      if (batch.vaultId !== vault.vaultId || batch.batchId !== object.logicalId) {
        throw new Error('Sync batch identity does not match its encrypted object.');
      }
      applied += await applyRemoteOperations(database, batch.operations);
      await writeCheckpoint(database, {
        id: 'sync-run',
        kind: 'sync-run',
        stage: `pulled:${object.fileId}`,
        batchId: batch.batchId,
        attempt: 0,
        updatedAt: Date.now(),
      });
    }
    return applied;
  }

  private async maybeWriteSnapshot(
    database: PaperFlowDatabase,
    vault: UnlockedVault,
    budget: SyncBudget,
  ): Promise<void> {
    const state = await database.syncState.get(LOCAL_SYNC_STATE_KEY);
    if (!budget.hasTime(3_000) || (
      state?.lastSnapshotAt
      && Date.now() - state.lastSnapshotAt < SNAPSHOT_INTERVAL_MS
    )) return;

    const records: SyncSnapshot['records'] = [];
    const append = (
      entityType: SyncEntityType,
      values: Array<{ id?: string; key?: string; alias?: string; version?: EntityVersion }>,
    ) => {
      for (const value of values) {
        const entityId = value.id || value.key || value.alias;
        if (!entityId || !value.version) continue;
        records.push({ entityType, entityId, version: value.version, payload: value });
      }
    };
    append('paper', await database.papers.toArray());
    append('paperAlias', await database.paperAliases.toArray());
    append('collection', await database.collections.toArray());
    append('collectionItem', await database.collectionItems.toArray());
    append('tag', await database.tags.toArray());
    append('paperTag', await database.paperTags.toArray());
    append(
      'document',
      (await database.documents.toArray()).filter((document) =>
        document.remoteState === 'available' && Boolean(document.remoteObjectId)),
    );
    append('note', await database.notes.toArray());
    append('annotation', await database.annotations.toArray());
    append('thread', await database.threads.toArray());
    append('message', await database.messages.toArray());
    append('paperMemory', await database.paperMemory.toArray());
    append('selection', await database.selections.toArray());
    append(
      'setting',
      (await database.settings.toArray()).filter((setting) => setting.scope === 'sync'),
    );
    const snapshotId = crypto.randomUUID();
    const snapshot: SyncSnapshot = {
      format: SYNC_SNAPSHOT_FORMAT,
      version: VAULT_PROTOCOL_VERSION,
      vaultId: vault.vaultId,
      snapshotId,
      createdAt: Date.now(),
      records,
      appliedOperationIds: (await database.syncOps.where('state').equals('uploaded').primaryKeys())
        .map(String),
    };
    await this.remote.putImmutableSyncObject(
      vault.key,
      vault.vaultId,
      'snapshot',
      snapshotId,
      encoder.encode(JSON.stringify(snapshot)),
    );
    await updateSyncState(database, { lastSnapshotAt: snapshot.createdAt });
  }

  private async handleError(database: PaperFlowDatabase, error: unknown): Promise<void> {
    const checkpoint = await database.syncCheckpoints.get('sync-run');
    const attempt = (checkpoint?.attempt || 0) + 1;
    let status: 'auth-required' | 'paused' | 'error' = 'error';
    let code: 'auth-required' | 'quota' | 'rate-limited' | 'unknown' = 'unknown';
    let retryAt: number | undefined;
    if (error instanceof DriveRequestError) {
      if (error.status === 401) {
        status = 'auth-required';
        code = 'auth-required';
        await googleAuth.disconnect();
      } else if (error.status === 403) {
        status = 'paused';
        code = 'quota';
      } else if (error.status === 429) {
        code = 'rate-limited';
        retryAt = Date.now() + retryDelayMs(attempt, error.retryAfter);
        requestSyncSoon(Math.max(0, retryAt - Date.now()));
      }
    }
    await writeCheckpoint(database, {
      id: 'sync-run',
      kind: 'sync-run',
      stage: checkpoint?.stage || 'unknown',
      attempt,
      updatedAt: Date.now(),
    });
    await updateSyncState(database, {
      status,
      lastError: error instanceof Error ? error.message : 'Synchronization failed.',
      lastErrorCode: code,
      retryAt,
    });
  }
}

export const syncEngine = new SyncEngine();
