import {
  decryptObject,
  deserializeEncryptedObject,
  encryptObject,
  opaqueDriveFileName,
  serializeEncryptedObject,
} from '../../crypto/objectCipher';
import { parseVaultHeader, type VaultHeader } from '../../sync/protocol';
import { DriveClient, type DriveFile, type DriveGateway } from './driveClient';
import { googleAuth } from './googleAuth';

export const PAPERFLOW_DRIVE_FOLDER = 'PaperFlow';
export const VAULT_HEADER_FILE = 'vault.json';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

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
}

export function createGoogleDriveObjectStore(): GoogleDriveObjectStore {
  return new GoogleDriveObjectStore(new DriveClient(googleAuth.getToken));
}
