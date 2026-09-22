import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PaperFlowDatabase } from '../../src/db/PaperFlowDatabase';
import type { PaperNote, SyncOperation } from '../../src/types';
import { applyRemoteOperation } from '../../src/sync/merge';
import { createPendingBatch, markBatchUploaded } from '../../src/sync/operationLog';

const databaseName = 'paperflow-sync-merge-test';
let database: PaperFlowDatabase;

function operation(input: Partial<SyncOperation> & Pick<SyncOperation, 'id' | 'entityType' | 'entityId' | 'version' | 'payload'>): SyncOperation {
  return {
    deviceId: input.version.deviceId,
    seq: 1,
    action: 'put',
    createdAt: 10,
    state: 'uploaded',
    ...input,
  };
}

beforeEach(async () => {
  await Dexie.delete(databaseName);
  database = new PaperFlowDatabase(databaseName);
  await database.open();
  await database.syncState.put({
    key: 'local-device',
    deviceId: 'device-a',
    counter: 2,
    nextSeq: 2,
  });
});

afterEach(async () => {
  database.close();
  await Dexie.delete(databaseName);
});

describe('sync merge', () => {
  it('replays the same relationship operation 100 times without duplicates', async () => {
    const payload = {
      id: 'collection-1:paper-1',
      collectionId: 'collection-1',
      paperId: 'paper-1',
      createdAt: 1,
      updatedAt: 2,
      version: { counter: 4, deviceId: 'device-b' },
    };
    const remote = operation({
      id: 'device-b:4',
      entityType: 'collectionItem',
      entityId: payload.id,
      version: payload.version,
      payload,
    });

    for (let index = 0; index < 100; index += 1) {
      await applyRemoteOperation(database, remote);
    }

    expect(await database.collectionItems.count()).toBe(1);
    expect(await database.syncOps.where('id').equals(remote.id).count()).toBe(1);
    expect((await database.syncState.get('local-device'))?.counter).toBe(5);
  });

  it('keeps a deterministic conflict copy for concurrent offline note edits', async () => {
    const local: PaperNote = {
      id: 'note-1',
      paperId: 'paper-1',
      title: 'Findings',
      content: 'Local offline edit',
      createdAt: 1,
      updatedAt: 20,
      version: { counter: 2, deviceId: 'device-a' },
    };
    await database.notes.put(local);
    const incoming: PaperNote = {
      ...local,
      content: 'Remote offline edit',
      updatedAt: 21,
      version: { counter: 3, deviceId: 'device-b' },
    };
    const remote = operation({
      id: 'device-b:3',
      entityType: 'note',
      entityId: incoming.id,
      version: incoming.version,
      baseVersion: { counter: 1, deviceId: 'seed' },
      payload: incoming,
    });

    for (let index = 0; index < 100; index += 1) {
      await applyRemoteOperation(database, remote);
    }

    const notes = await database.notes.toArray();
    expect(notes).toHaveLength(2);
    expect((await database.notes.get('note-1'))?.content).toBe('Remote offline edit');
    expect(notes.find((note) => note.conflictOf === 'note-1')?.content).toBe('Local offline edit');
    expect(await database.syncConflicts.count()).toBe(1);
  });

  it('keeps a pending batch stable until it is acknowledged', async () => {
    const pending = operation({
      id: 'device-a:1',
      deviceId: 'device-a',
      seq: 1,
      state: 'pending',
      entityType: 'note',
      entityId: 'note-1',
      version: { counter: 1, deviceId: 'device-a' },
      payload: {
        id: 'note-1',
        paperId: 'paper-1',
        title: 'Note',
        content: 'Body',
        createdAt: 1,
        updatedAt: 1,
        version: { counter: 1, deviceId: 'device-a' },
      },
    });
    await database.syncOps.put(pending);

    const first = await createPendingBatch(database, crypto.randomUUID(), { force: true });
    const second = await createPendingBatch(database, first?.vaultId || crypto.randomUUID(), { force: true });

    expect(first?.batchId).toBe(second?.batchId);
    expect(first?.operations).toEqual(second?.operations);
    await markBatchUploaded(database, first?.batchId || '');
    expect(await createPendingBatch(database, first?.vaultId || crypto.randomUUID(), { force: true })).toBeNull();
  });

  it('does not upload document metadata before its resumable blob completes', async () => {
    const documentOperation = operation({
      id: 'device-a:2',
      deviceId: 'device-a',
      seq: 2,
      state: 'pending',
      entityType: 'document',
      entityId: 'document-1',
      version: { counter: 2, deviceId: 'device-a' },
      payload: {
        id: 'document-1',
        remoteState: 'uploading',
        version: { counter: 2, deviceId: 'device-a' },
      },
    });
    await database.syncOps.put(documentOperation);
    const vaultId = crypto.randomUUID();

    expect(await createPendingBatch(database, vaultId, { force: true })).toBeNull();
    await database.syncOps.update(documentOperation.id, {
      payload: {
        id: 'document-1',
        remoteState: 'available',
        remoteObjectId: 'drive-file-1',
        version: documentOperation.version,
      },
    });
    expect((await createPendingBatch(database, vaultId, { force: true }))?.operations)
      .toHaveLength(1);
  });

  it('merges independent paper scalar fields without losing concurrent changes', async () => {
    await database.papers.put({
      id: 'paper-1',
      shortTitle: 'Paper',
      title: 'Paper',
      source: 'PDF',
      url: 'https://example.com/paper.pdf',
      favorite: false,
      readStatus: 'read',
      fieldVersions: {
        favorite: { counter: 2, deviceId: 'device-a' },
        readStatus: { counter: 6, deviceId: 'device-a' },
      },
      version: { counter: 6, deviceId: 'device-a' },
    });
    const incoming = {
      id: 'paper-1',
      shortTitle: 'Paper',
      title: 'Paper',
      source: 'PDF',
      url: 'https://example.com/paper.pdf',
      favorite: true,
      readStatus: 'unread' as const,
      fieldVersions: {
        favorite: { counter: 5, deviceId: 'device-b' },
        readStatus: { counter: 1, deviceId: 'device-b' },
      },
      version: { counter: 5, deviceId: 'device-b' },
    };
    await applyRemoteOperation(database, operation({
      id: 'device-b:5',
      entityType: 'paper',
      entityId: incoming.id,
      version: incoming.version,
      payload: incoming,
    }));

    expect(await database.papers.get('paper-1')).toMatchObject({
      favorite: true,
      readStatus: 'read',
    });
  });
});
