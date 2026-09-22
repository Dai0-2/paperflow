import {
  decryptObject,
  deserializeEncryptedObject,
  encryptObject,
  opaqueDriveFileName,
  serializeEncryptedObject,
} from '../../crypto/objectCipher';
import { parseVaultHeader, type VaultHeader } from '../../sync/protocol';
import {
  DriveClient,
  type DriveFile,
  type DriveGateway,
  type DriveSyncGateway,
} from './driveClient';
import { googleAuth } from './googleAuth';

export const PAPERFLOW_DRIVE_FOLDER = 'PaperFlow';
export const VAULT_HEADER_FILE = 'vault.json';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const SYNC_OBJECT_MIME = 'application/json';

export interface SyncObjectRef {
  fileId: string;
  logicalId: string;
  objectType: 'batch' | 'snapshot';
  modifiedTime?: string;
}

export interface SyncObjectStore {
  putImmutableSyncObject(
    vaultMasterKey: Uint8Array,
    vaultId: string,
    objectType: SyncObjectRef['objectType'],
    logicalId: string,
    plaintext: Uint8Array,
  ): Promise<DriveFile>;
  getSyncObject(
    vaultMasterKey: Uint8Array,
    object: SyncObjectRef,
  ): Promise<Uint8Array>;
  listSyncObjects(vaultId: string): Promise<SyncObjectRef[]>;
  getStartPageToken(): Promise<string>;
  listChangedSyncObjects(
    vaultId: string,
    pageToken: string,
  ): Promise<{
    objects: SyncObjectRef[];
    removedFileIds: string[];
    nextPageToken?: string;
    newStartPageToken?: string;
  }>;
  createResumableObjectUpload(input: {
    vaultId: string;
    name: string;
    logicalId: string;
    size: number;
  }): Promise<string>;
  findOpaqueObject(name: string): Promise<DriveFile | null>;
  uploadResumableChunk(
    sessionUrl: string,
    data: Uint8Array,
    offset: number,
    totalBytes: number,
  ): Promise<{ complete: boolean; nextOffset: number; file?: DriveFile }>;
  downloadBytes(fileId: string): Promise<Uint8Array>;
}

function asSyncDrive(drive: DriveGateway): DriveSyncGateway {
  if (
    !('listChildren' in drive)
    || !('listChanges' in drive)
    || !('getStartPageToken' in drive)
    || !('createResumableUpload' in drive)
  ) {
    throw new Error('This Google Drive adapter does not support synchronization.');
  }
  return drive as DriveSyncGateway;
}

function syncObjectRef(file: DriveFile): SyncObjectRef | null {
  const objectType = file.appProperties?.paperflowType;
  const logicalId = file.appProperties?.paperflowLogicalId;
  if ((objectType !== 'batch' && objectType !== 'snapshot') || !logicalId) return null;
  return { fileId: file.id, objectType, logicalId, modifiedTime: file.modifiedTime };
}

export class GoogleDriveObjectStore {
  private folder: DriveFile | null = null;

  constructor(private readonly drive: DriveGateway) {}

  async ensureFolder(): Promise<DriveFile> {
    if (this.folder) return this.folder;
    const matches = await this.drive.listByName(
      undefined,
      PAPERFLOW_DRIVE_FOLDER,
      DRIVE_FOLDER_MIME,
    );
    this.folder = matches[0] || await this.drive.createFolder(PAPERFLOW_DRIVE_FOLDER);
    return this.folder;
  }

  async readVaultHeader(): Promise<VaultHeader | null> {
    const folder = await this.ensureFolder();
    const matches = await this.drive.listByName(folder.id, VAULT_HEADER_FILE, 'application/json');
    if (!matches[0]) return null;
    const content = await this.drive.downloadText(matches[0].id);
    return parseVaultHeader(JSON.parse(content) as unknown);
  }

  async writeVaultHeader(header: VaultHeader): Promise<DriveFile> {
    const folder = await this.ensureFolder();
    const parsed = parseVaultHeader(header);
    const content = JSON.stringify(parsed);
    const matches = await this.drive.listByName(folder.id, VAULT_HEADER_FILE, 'application/json');
    return matches[0]
      ? this.drive.updateTextFile(matches[0].id, VAULT_HEADER_FILE, content)
      : this.drive.createTextFile(folder.id, VAULT_HEADER_FILE, content);
  }

  async putObject(
    vaultMasterKey: Uint8Array,
    vaultId: string,
    objectType: string,
    logicalId: string,
    plaintext: Uint8Array,
  ): Promise<DriveFile> {
    const folder = await this.ensureFolder();
    const name = await opaqueDriveFileName(vaultMasterKey, vaultId, objectType, logicalId);
    const encrypted = await encryptObject(
      vaultMasterKey,
      vaultId,
      objectType,
      logicalId,
      plaintext,
    );
    const content = serializeEncryptedObject(encrypted);
    const matches = await this.drive.listByName(folder.id, name, 'application/json');
    return matches[0]
      ? this.drive.updateTextFile(matches[0].id, name, content)
      : this.drive.createTextFile(folder.id, name, content);
  }

  async getObject(
    vaultMasterKey: Uint8Array,
    vaultId: string,
    objectType: string,
    logicalId: string,
  ): Promise<Uint8Array | null> {
    const folder = await this.ensureFolder();
    const name = await opaqueDriveFileName(vaultMasterKey, vaultId, objectType, logicalId);
    const matches = await this.drive.listByName(folder.id, name, 'application/json');
    if (!matches[0]) return null;
    const encrypted = deserializeEncryptedObject(await this.drive.downloadText(matches[0].id));
    if (encrypted.vaultId !== vaultId) throw new Error('Drive object belongs to a different vault.');
    return decryptObject(vaultMasterKey, objectType, logicalId, encrypted);
  }

  async putImmutableSyncObject(
    vaultMasterKey: Uint8Array,
    vaultId: string,
    objectType: SyncObjectRef['objectType'],
    logicalId: string,
    plaintext: Uint8Array,
  ): Promise<DriveFile> {
    const folder = await this.ensureFolder();
    const name = await opaqueDriveFileName(vaultMasterKey, vaultId, objectType, logicalId);
    const existing = await this.drive.listByName(folder.id, name, SYNC_OBJECT_MIME);
    if (existing[0]) return existing[0];
    const encrypted = await encryptObject(
      vaultMasterKey,
      vaultId,
      objectType,
      logicalId,
      plaintext,
    );
    return this.drive.createTextFile(
      folder.id,
      name,
      serializeEncryptedObject(encrypted),
      {
        paperflowVault: vaultId,
        paperflowType: objectType,
        paperflowLogicalId: logicalId,
      },
    );
  }

  async getSyncObject(
    vaultMasterKey: Uint8Array,
    object: SyncObjectRef,
  ): Promise<Uint8Array> {
    const encrypted = deserializeEncryptedObject(await this.drive.downloadText(object.fileId));
    return decryptObject(vaultMasterKey, object.objectType, object.logicalId, encrypted);
  }

  async listSyncObjects(vaultId: string): Promise<SyncObjectRef[]> {
    const folder = await this.ensureFolder();
    const files = await asSyncDrive(this.drive).listChildren(folder.id);
    return files
      .filter((file) => file.appProperties?.paperflowVault === vaultId)
      .map(syncObjectRef)
      .filter((value): value is SyncObjectRef => value !== null);
  }

  async getStartPageToken(): Promise<string> {
    return asSyncDrive(this.drive).getStartPageToken();
  }

  async listChangedSyncObjects(
    vaultId: string,
    pageToken: string,
  ): Promise<{
    objects: SyncObjectRef[];
    removedFileIds: string[];
    nextPageToken?: string;
    newStartPageToken?: string;
  }> {
    const page = await asSyncDrive(this.drive).listChanges(pageToken);
    const objects = page.changes
      .map((change) => change.file)
      .filter((file): file is DriveFile => Boolean(
        file
        && file.appProperties?.paperflowVault === vaultId,
      ))
      .map(syncObjectRef)
      .filter((value): value is SyncObjectRef => value !== null);
    return {
      objects,
      removedFileIds: page.changes
        .filter((change) => change.removed)
        .map((change) => change.fileId),
      nextPageToken: page.nextPageToken,
      newStartPageToken: page.newStartPageToken,
    };
  }

  async createResumableObjectUpload(input: {
    vaultId: string;
    name: string;
    logicalId: string;
    size: number;
  }): Promise<string> {
    const folder = await this.ensureFolder();
    return asSyncDrive(this.drive).createResumableUpload({
      parentId: folder.id,
      name: input.name,
      mimeType: SYNC_OBJECT_MIME,
      size: input.size,
      appProperties: {
        paperflowVault: input.vaultId,
        paperflowType: 'blob',
      },
    });
  }

  async findOpaqueObject(name: string): Promise<DriveFile | null> {
    const folder = await this.ensureFolder();
    return (await this.drive.listByName(folder.id, name))[0] || null;
  }

  uploadResumableChunk(
    sessionUrl: string,
    data: Uint8Array,
    offset: number,
    totalBytes: number,
  ) {
    return asSyncDrive(this.drive).uploadResumableChunk(
      sessionUrl,
      data,
      offset,
      totalBytes,
    );
  }

  downloadBytes(fileId: string): Promise<Uint8Array> {
    return asSyncDrive(this.drive).downloadBytes(fileId);
  }
}

export function createGoogleDriveObjectStore(): GoogleDriveObjectStore {
  return new GoogleDriveObjectStore(new DriveClient(googleAuth.getToken));
}
