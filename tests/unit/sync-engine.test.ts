import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PaperFlowDatabase } from '../../src/db/PaperFlowDatabase';
import { DriveRequestError, type DriveFile } from '../../src/services/google/driveClient';
import type {
  SyncObjectRef,
  SyncObjectStore,
} from '../../src/services/google/driveObjects';
import { SyncEngine } from '../../src/sync/SyncEngine';
import { versionAndRecord } from '../../src/repositories/versioning';
import type { PaperNote } from '../../src/types';

const databaseName = 'paperflow-sync-engine-test';
let database: PaperFlowDatabase;

class ThrowingRemote implements SyncObjectStore {
  constructor(private readonly error: Error) {}

  async getStartPageToken(): Promise<string> {
    throw this.error;
  }

  async listSyncObjects(): Promise<SyncObjectRef[]> {
    return [];
  }

  async listChangedSyncObjects() {
    return { objects: [], removedFileIds: [], newStartPageToken: 'next' };
  }

  async putImmutableSyncObject(): Promise<DriveFile> {
    throw new Error('Unexpected upload.');
  }

  async getSyncObject(): Promise<Uint8Array> {
    throw new Error('Unexpected download.');
  }

  async createResumableObjectUpload(): Promise<string> {
    throw new Error('Unexpected upload.');
  }

  async findOpaqueObject(): Promise<DriveFile | null> {
    return null;
  }

  async uploadResumableChunk() {
    throw new Error('Unexpected upload.');
  }

  async downloadBytes(): Promise<Uint8Array> {
    throw new Error('Unexpected download.');
  }
}

class MemorySyncRemote implements SyncObjectStore {
  private readonly objects: Array<{ ref: SyncObjectRef; data: Uint8Array }> = [];

  async getStartPageToken(): Promise<string> {
    return String(this.objects.length);
  }

  async listSyncObjects(): Promise<SyncObjectRef[]> {
    return this.objects.map(({ ref }) => ref);
  }

  async listChangedSyncObjects(_vaultId: string, pageToken: string) {
    const offset = Number(pageToken);
    return {
      objects: this.objects.slice(offset).map(({ ref }) => ref),
      removedFileIds: [],
      newStartPageToken: String(this.objects.length),
    };
  }

  async putImmutableSyncObject(
    _key: Uint8Array,
    _vaultId: string,
    objectType: 'batch' | 'snapshot',
    logicalId: string,
    plaintext: Uint8Array,
  ): Promise<DriveFile> {
    const existing = this.objects.find(({ ref }) =>
      ref.objectType === objectType && ref.logicalId === logicalId);
    if (existing) {
      return { id: existing.ref.fileId, name: `${logicalId}.pfo`, mimeType: 'application/json' };
    }
    const fileId = `file-${this.objects.length + 1}`;
    this.objects.push({
      ref: {
        fileId,
        objectType,
        logicalId,
        modifiedTime: new Date(this.objects.length + 1).toISOString(),
      },
      data: plaintext.slice(),
    });
    return { id: fileId, name: `${logicalId}.pfo`, mimeType: 'application/json' };
  }

  async getSyncObject(_key: Uint8Array, object: SyncObjectRef): Promise<Uint8Array> {
    const stored = this.objects.find(({ ref }) => ref.fileId === object.fileId);
    if (!stored) throw new Error('Missing remote object.');
    return stored.data.slice();
  }

  async createResumableObjectUpload(): Promise<string> {
    throw new Error('Unexpected blob upload.');
  }

  async findOpaqueObject(): Promise<DriveFile | null> {
    return null;
  }

  async uploadResumableChunk() {
    throw new Error('Unexpected blob upload.');
  }

  async downloadBytes(): Promise<Uint8Array> {
    throw new Error('Unexpected blob download.');
  }
}

beforeEach(async () => {
  await Dexie.delete(databaseName);
  database = new PaperFlowDatabase(databaseName);
  await database.open();
  await database.syncState.put({
    key: 'local-device',
    deviceId: 'device-a',
    counter: 0,
    nextSeq: 1,
  });
});

afterEach(async () => {
  database.close();
  await Dexie.delete(databaseName);
});

describe('sync engine recovery states', () => {
  it.each([
    [401, 'auth-required', 'auth-required'],
    [403, 'paused', 'quota'],
    [429, 'error', 'rate-limited'],
  ] as const)('maps Drive HTTP %i to a recoverable state', async (status, expectedStatus, code) => {
    const engine = new SyncEngine(
      database,
      new ThrowingRemote(new DriveRequestError(status, status === 429 ? '2' : null, 'Drive error')),
    );

    await expect(engine.runUnlocked({
      vaultId: crypto.randomUUID(),
      key: new Uint8Array(32).fill(7),
    }, { force: true })).rejects.toThrow('Drive error');

    const state = await database.syncState.get('local-device');
    expect(state?.status).toBe(expectedStatus);
    expect(state?.lastErrorCode).toBe(code);
    expect(state?.retryAt !== undefined).toBe(status === 429);
    expect((await database.syncCheckpoints.get('sync-run'))?.attempt).toBe(1);
  });

  it('merges edits from two offline devices and converges after reconnecting', async () => {
    database.close();
    await Dexie.delete(databaseName);
    const deviceA = new PaperFlowDatabase(`${databaseName}-a`);
    const deviceB = new PaperFlowDatabase(`${databaseName}-b`);
    await Promise.all([deviceA.open(), deviceB.open()]);
    const remote = new MemorySyncRemote();
    const vaultId = crypto.randomUUID();

    const seedDevice = async (
      target: PaperFlowDatabase,
      deviceId: string,
      content: string,
    ) => {
      await target.syncState.put({
        key: 'local-device',
        deviceId,
        counter: 1,
        nextSeq: 1,
      });
      const base: PaperNote = {
        id: 'note-shared',
        paperId: 'paper-1',
        title: 'Shared note',
        content: 'Base',
        createdAt: 1,
        updatedAt: 1,
        version: { counter: 1, deviceId: 'seed' },
      };
      await target.notes.put(base);
      await target.transaction('rw', target.notes, target.syncState, target.syncOps, async () => {
        const mutation = await versionAndRecord(
          target,
          'note',
          base.id,
          'put',
          undefined,
          base.version,
        );
        const edited = {
          ...base,
          content,
          updatedAt: 2,
          version: mutation.version,
        };
        await target.notes.put(edited);
        await target.syncOps.update(mutation.operation.id, { payload: edited });
      });
    };

    try {
      await seedDevice(deviceA, 'device-a', 'Edit from A');
      await seedDevice(deviceB, 'device-b', 'Edit from B');
      await new SyncEngine(deviceA, remote).runUnlocked({
        vaultId,
        key: new Uint8Array(32).fill(1),
      }, { force: true });
      await new SyncEngine(deviceB, remote).runUnlocked({
        vaultId,
        key: new Uint8Array(32).fill(2),
      }, { force: true });
      await new SyncEngine(deviceA, remote).runUnlocked({
        vaultId,
        key: new Uint8Array(32).fill(3),
      }, { force: true });

      expect((await deviceA.notes.get('note-shared'))?.content).toBe('Edit from B');
      expect((await deviceB.notes.get('note-shared'))?.content).toBe('Edit from B');
      expect(await deviceA.syncConflicts.count()).toBe(1);
      expect(await deviceB.syncConflicts.count()).toBe(1);
    } finally {
      deviceA.close();
      deviceB.close();
      await Dexie.delete(`${databaseName}-a`);
      await Dexie.delete(`${databaseName}-b`);
      database = new PaperFlowDatabase(databaseName);
      await database.open();
    }
  });
});
