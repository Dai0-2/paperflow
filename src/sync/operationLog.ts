import type { PaperFlowDatabase } from '../db/PaperFlowDatabase';
import type { SyncOperation } from '../types';
import {
  parseSyncBatch,
  SYNC_BATCH_FORMAT,
  VAULT_PROTOCOL_VERSION,
  type SyncBatch,
} from './protocol';

export const SYNC_DEBOUNCE_MS = 5_000;
export const SYNC_SOON_ALARM = 'paperflow-sync-soon';
const MAX_OPERATIONS_PER_BATCH = 250;

function isReadyForBatch(operation: SyncOperation): boolean {
  if (operation.entityType !== 'document') return true;
  if (!operation.payload || typeof operation.payload !== 'object') return false;
  return (operation.payload as { remoteState?: unknown }).remoteState === 'available';
}

export async function createPendingBatch(
  database: PaperFlowDatabase,
  vaultId: string,
  options: { force?: boolean; now?: number } = {},
): Promise<SyncBatch | null> {
  const now = options.now ?? Date.now();
  const pending = (await database.syncOps.where('state').equals('pending').sortBy('createdAt'))
    .slice(0, MAX_OPERATIONS_PER_BATCH);
  if (!pending.length) return null;

  const existingBatchId = pending.find((operation) => operation.batchId)?.batchId;
  let operations: SyncOperation[];
  let batchId: string;
  if (existingBatchId) {
    batchId = existingBatchId;
    operations = pending.filter((operation) => operation.batchId === batchId);
    if (!operations.every(isReadyForBatch)) return null;
  } else {
    const ready = pending.filter((operation) =>
      isReadyForBatch(operation)
      && (options.force || operation.createdAt <= now - SYNC_DEBOUNCE_MS));
    if (!ready.length) return null;
    operations = ready;
    batchId = crypto.randomUUID();
    await database.transaction('rw', database.syncOps, async () => {
      for (const operation of operations) {
        await database.syncOps.update(operation.id, { batchId });
      }
    });
  }

  const stableOperations = operations.map((operation) => ({
    ...operation,
    batchId,
    state: 'uploaded' as const,
  }));
  return parseSyncBatch({
    format: SYNC_BATCH_FORMAT,
    version: VAULT_PROTOCOL_VERSION,
    vaultId,
    batchId,
    deviceId: stableOperations[0].deviceId,
    fromSeq: Math.min(...stableOperations.map((operation) => operation.seq)),
    toSeq: Math.max(...stableOperations.map((operation) => operation.seq)),
    createdAt: Math.min(...stableOperations.map((operation) => operation.createdAt)),
    operations: stableOperations,
  });
}

export async function markBatchUploaded(
  database: PaperFlowDatabase,
  batchId: string,
): Promise<void> {
  const operations = await database.syncOps.where('batchId').equals(batchId).toArray();
  await database.syncOps.bulkPut(operations.map((operation) => ({
    ...operation,
    state: 'uploaded' as const,
  })));
}

export function requestSyncSoon(delayMs = SYNC_DEBOUNCE_MS): void {
  if (typeof chrome === 'undefined' || !chrome.alarms?.create) return;
  chrome.alarms.create(SYNC_SOON_ALARM, { when: Date.now() + Math.max(0, delayMs) });
}
