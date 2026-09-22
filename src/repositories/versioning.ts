import type { PaperFlowDatabase } from '../db/PaperFlowDatabase';
import type { EntityVersion, SyncEntityType, SyncOperation, SyncState } from '../types';

const LOCAL_STATE_KEY = 'local-device';

function createDeviceState(): SyncState {
  return {
    key: LOCAL_STATE_KEY,
    deviceId: crypto.randomUUID(),
    counter: 0,
    nextSeq: 1,
  };
}

export async function nextEntityVersion(database: PaperFlowDatabase): Promise<EntityVersion> {
  const state = (await database.syncState.get(LOCAL_STATE_KEY)) || createDeviceState();
  state.counter += 1;
  await database.syncState.put(state);
  return { counter: state.counter, deviceId: state.deviceId };
}

export async function recordMutation(
  database: PaperFlowDatabase,
  entityType: SyncEntityType,
  entityId: string,
  action: SyncOperation['action'],
  payload: unknown,
  version: EntityVersion,
): Promise<SyncOperation> {
  const state = (await database.syncState.get(LOCAL_STATE_KEY)) || createDeviceState();
  state.counter = Math.max(state.counter, version.counter);
  const seq = state.nextSeq;
  state.nextSeq += 1;
  await database.syncState.put(state);
  const operation: SyncOperation = {
    id: `${state.deviceId}:${seq}`,
    deviceId: state.deviceId,
    seq,
    entityType,
    entityId,
    action,
    version,
    payload,
    createdAt: Date.now(),
    state: 'pending',
  };
  await database.syncOps.put(operation);
  return operation;
}

export async function versionAndRecord(
  database: PaperFlowDatabase,
  entityType: SyncEntityType,
  entityId: string,
  action: SyncOperation['action'],
  payload: unknown,
): Promise<{ version: EntityVersion; operation: SyncOperation }> {
  const version = await nextEntityVersion(database);
  const operation = await recordMutation(database, entityType, entityId, action, payload, version);
  return { version, operation };
}
