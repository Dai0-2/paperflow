import { describe, expect, it } from 'vitest';
import {
  createAccountManagedVault,
  createVault,
  unlockAccountManagedVault,
  unlockVaultWithPassword,
} from '../../src/crypto/vault';
import type { DriveFile, DriveGateway } from '../../src/services/google/driveClient';
import {
  GoogleDriveObjectStore,
  PAPERFLOW_DRIVE_FOLDER,
  VAULT_HEADER_FILE,
} from '../../src/services/google/driveObjects';

interface StoredDriveFile extends DriveFile {
  content?: string;
}

class MemoryDrive implements DriveGateway {
  readonly files = new Map<string, StoredDriveFile>();
  private nextId = 1;

  async listByName(parentId: string | undefined, name: string, mimeType?: string): Promise<DriveFile[]> {
    return [...this.files.values()].filter((file) =>
      file.name === name
      && (!mimeType || file.mimeType === mimeType)
      && (!parentId || file.parents?.includes(parentId)),
    );
  }

  async createFolder(name: string): Promise<DriveFile> {
    return this.put({ name, mimeType: 'application/vnd.google-apps.folder' });
  }

  async createTextFile(parentId: string, name: string, content: string): Promise<DriveFile> {
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

describe('Google Drive encrypted object store', () => {
  it('restores account-managed sync on another device without another credential', async () => {
    const drive = new MemoryDrive();
    const firstDevice = new GoogleDriveObjectStore(drive);
    const created = createAccountManagedVault();
    await firstDevice.writeVaultHeader(created.header);
    await firstDevice.putObject(
      created.vaultMasterKey,
      created.header.vaultId,
      'note',
      'note:cross-device',
      new TextEncoder().encode('restored with the Google account'),
    );

    const secondDevice = new GoogleDriveObjectStore(drive);
    const restoredHeader = await secondDevice.readVaultHeader();
    const restoredKey = unlockAccountManagedVault(restoredHeader);
    const restored = await secondDevice.getObject(
      restoredKey,
      created.header.vaultId,
      'note',
      'note:cross-device',
    );

    expect(restoredHeader?.version).toBe(2);
    expect(new TextDecoder().decode(restored)).toBe('restored with the Google account');
  });

  it('creates a visible PaperFlow folder but uploads only opaque business objects', async () => {
    const drive = new MemoryDrive();
    const store = new GoogleDriveObjectStore(drive);
    const created = await createVault('correct horse battery paperflow');
    await store.writeVaultHeader(created.header);
    await store.putObject(
      created.vaultMasterKey,
      created.header.vaultId,
      'paper',
      'doi:10.1000/secret-paper',
      new TextEncoder().encode(JSON.stringify({
        title: 'A Secret Research Title',
        authors: ['Private Author'],
        note: 'unpublished observation',
      })),
    );

    const files = [...drive.files.values()];
    expect(files.some((file) => file.name === PAPERFLOW_DRIVE_FOLDER)).toBe(true);
    expect(files.some((file) => file.name === VAULT_HEADER_FILE)).toBe(true);
    const objectFile = files.find((file) => file.name.endsWith('.pfo'));
    expect(objectFile?.name).toMatch(/^[A-Za-z0-9_-]{43}\.pfo$/);
    const driveDump = JSON.stringify(files);
    expect(driveDump).not.toContain('Secret Research Title');
    expect(driveDump).not.toContain('Private Author');
    expect(driveDump).not.toContain('secret-paper');

    const restoredStore = new GoogleDriveObjectStore(drive);
    const restoredHeader = await restoredStore.readVaultHeader();
    expect(Object.keys(restoredHeader || {}).sort()).toEqual([
      'format',
      'passwordKdf',
      'passwordWrappedVmk',
      'recoveryKdf',
      'recoveryWrappedVmk',
      'vaultId',
      'version',
    ]);
    const restoredKey = await unlockVaultWithPassword(
      restoredHeader,
      'correct horse battery paperflow',
    );
    const restored = await restoredStore.getObject(
      restoredKey,
      created.header.vaultId,
      'paper',
      'doi:10.1000/secret-paper',
    );
    expect(JSON.parse(new TextDecoder().decode(restored)) as unknown).toMatchObject({
      title: 'A Secret Research Title',
      note: 'unpublished observation',
    });
  });
});
