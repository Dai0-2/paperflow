import { afterEach, describe, expect, it } from 'vitest';
import { createVault, vaultSession } from '../../src/crypto/vault';
import type { DriveFile, DriveGateway } from '../../src/services/google/driveClient';
import { GoogleDriveObjectStore } from '../../src/services/google/driveObjects';
import {
  VaultController,
  type SyncPreferenceGateway,
} from '../../src/services/sync/vaultController';

interface StoredDriveFile extends DriveFile {
  content?: string;
}

class MemoryDrive implements DriveGateway {
  readonly files = new Map<string, StoredDriveFile>();
  private nextId = 1;

  async listByName(
    parentId: string | undefined,
    name: string,
    mimeType?: string,
  ): Promise<DriveFile[]> {
    return [...this.files.values()].filter((file) =>
      file.name === name
      && (!mimeType || file.mimeType === mimeType)
      && (!parentId || file.parents?.includes(parentId)),
    );
  }

  async createFolder(name: string): Promise<DriveFile> {
    return this.put({ name, mimeType: 'application/vnd.google-apps.folder' });
  }

  async createTextFile(
    parentId: string,
    name: string,
    content: string,
  ): Promise<DriveFile> {
    return this.put({ name, mimeType: 'application/json', parents: [parentId], content });
  }

  async updateTextFile(fileId: string, name: string, content: string): Promise<DriveFile> {
    const current = this.files.get(fileId);
    if (!current) throw new Error('Missing test Drive file.');
    const updated = { ...current, name, content };
    this.files.set(fileId, updated);
    return updated;
  }

  async downloadText(fileId: string): Promise<string> {
    const content = this.files.get(fileId)?.content;
    if (content === undefined) throw new Error('Missing test Drive content.');
    return content;
  }

  private put(file: Omit<StoredDriveFile, 'id'>): DriveFile {
    const stored = { ...file, id: `drive-${this.nextId++}` };
    this.files.set(stored.id, stored);
    return stored;
  }
}

class TestAuth {
  connections = 0;
  disconnections = 0;

  isConfigured(): boolean {
    return true;
  }

  async connect(): Promise<string> {
    this.connections += 1;
    return 'test-token';
  }

  async disconnect(): Promise<void> {
    this.disconnections += 1;
  }
}

class TestSyncPreference implements SyncPreferenceGateway {
  constructor(private enabled = false) {}

  async read(): Promise<boolean> {
    return this.enabled;
  }

  async write(enabled: boolean): Promise<void> {
    this.enabled = enabled;
  }
}

afterEach(() => vaultSession.lock());

describe('Google account sync controller', () => {
  it('keeps sync disabled until the user explicitly connects', async () => {
    const controller = new VaultController(
      new GoogleDriveObjectStore(new MemoryDrive()),
      new TestAuth(),
      new TestSyncPreference(),
    );

    expect(await controller.isSyncEnabled()).toBe(false);
    expect((await controller.inspect()).unlocked).toBe(false);
  });

  it('creates sync data on first login and restores it automatically on another device', async () => {
    const drive = new MemoryDrive();
    const auth = new TestAuth();
    const preference = new TestSyncPreference();
    const firstDevice = new VaultController(
      new GoogleDriveObjectStore(drive),
      auth,
      preference,
    );
    const connected = await firstDevice.connect();

    expect(auth.connections).toBe(1);
    expect(connected.header?.version).toBe(2);
    expect(connected.unlocked).toBe(true);
    expect(connected.legacyMigrationRequired).toBe(false);

    vaultSession.lock();
    const secondDevice = new VaultController(
      new GoogleDriveObjectStore(drive),
      auth,
      preference,
    );
    const restored = await secondDevice.inspect();

    expect(restored.header).toEqual(connected.header);
    expect(restored.unlocked).toBe(true);
    expect(vaultSession.getVaultId()).toBe(connected.header?.vaultId);

    await secondDevice.disconnect();
    expect(auth.disconnections).toBe(1);
    expect(await secondDevice.isSyncEnabled()).toBe(false);
  });

  it('upgrades a legacy password header without changing its vault identity', async () => {
    const drive = new MemoryDrive();
    const store = new GoogleDriveObjectStore(drive);
    const legacy = await createVault('correct horse battery paperflow');
    await store.writeVaultHeader(legacy.header);
    const controller = new VaultController(
      store,
      new TestAuth(),
      new TestSyncPreference(),
    );

    const detected = await controller.connect();
    expect(detected.legacyMigrationRequired).toBe(true);
    expect(detected.unlocked).toBe(false);

    const migrated = await controller.migrateLegacyWithPassword(
      'correct horse battery paperflow',
    );
    expect(migrated.header?.version).toBe(2);
    expect(migrated.header?.vaultId).toBe(legacy.header.vaultId);
    expect(migrated.unlocked).toBe(true);
  });
});
