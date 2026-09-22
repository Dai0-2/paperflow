import { base64ToBytes, bytesToBase64 } from '../../crypto/encoding';
import {
  createVault,
  rewrapVaultPassword,
  unlockVaultWithPassword,
  unlockVaultWithRecoveryKey,
  vaultSession,
} from '../../crypto/vault';
import {
  deleteDeviceVaultKey,
  loadDeviceVaultKey,
  storeDeviceVaultKey,
} from '../bridge';
import {
  createGoogleDriveObjectStore,
  type GoogleDriveObjectStore,
} from '../google/driveObjects';
import { googleAuth } from '../google/googleAuth';
import type { VaultHeader } from '../../sync/protocol';

export interface VaultConnection {
  header: VaultHeader | null;
  unlocked: boolean;
  remembered: boolean;
}

export class VaultController {
  private header: VaultHeader | null = null;
  private readonly objectStore: GoogleDriveObjectStore;
  private failedUnlocks = 0;
  private unlockAllowedAt = 0;

  constructor(objectStore = createGoogleDriveObjectStore()) {
    this.objectStore = objectStore;
  }

  isConfigured(): boolean {
    return googleAuth.isConfigured();
  }

  async connect(): Promise<VaultConnection> {
    await googleAuth.connect();
    return this.inspect();
  }

  async inspect(): Promise<VaultConnection> {
    this.header = await this.objectStore.readVaultHeader();
    if (!this.header) return { header: null, unlocked: false, remembered: false };
    const remembered = await this.tryRememberedKey(this.header);
    return {
      header: this.header,
      unlocked: vaultSession.isUnlocked(this.header.vaultId),
      remembered,
    };
  }

  async create(password: string, rememberDevice: boolean): Promise<{
    header: VaultHeader;
    recoveryKey: string;
    remembered: boolean;
  }> {
    const created = await createVault(password);
    await this.objectStore.writeVaultHeader(created.header);
    this.header = created.header;
    vaultSession.unlock(created.header.vaultId, created.vaultMasterKey);
    const remembered = rememberDevice
      ? await this.remember(created.header.vaultId, created.vaultMasterKey)
      : false;
    created.vaultMasterKey.fill(0);
    return { header: created.header, recoveryKey: created.recoveryKey, remembered };
  }

  async unlockWithPassword(password: string, rememberDevice: boolean): Promise<boolean> {
    const header = this.requireHeader();
    this.assertUnlockAllowed();
    try {
      const key = await unlockVaultWithPassword(header, password);
      vaultSession.unlock(header.vaultId, key);
      const remembered = rememberDevice ? await this.remember(header.vaultId, key) : false;
      key.fill(0);
      this.resetUnlockRateLimit();
      return remembered;
    } catch (error) {
      this.recordUnlockFailure();
      throw error;
    }
  }

  async unlockWithRecoveryKey(recoveryKey: string, rememberDevice: boolean): Promise<boolean> {
    const header = this.requireHeader();
    this.assertUnlockAllowed();
    try {
      const key = await unlockVaultWithRecoveryKey(header, recoveryKey);
      vaultSession.unlock(header.vaultId, key);
      const remembered = rememberDevice ? await this.remember(header.vaultId, key) : false;
      key.fill(0);
      this.resetUnlockRateLimit();
      return remembered;
    } catch (error) {
      this.recordUnlockFailure();
      throw error;
    }
  }

  async changePassword(newPassword: string): Promise<void> {
    const header = this.requireHeader();
    const key = vaultSession.getKey();
    try {
      this.header = await rewrapVaultPassword(header, key, newPassword);
      await this.objectStore.writeVaultHeader(this.header);
    } finally {
      key.fill(0);
    }
  }

  async forgetDevice(): Promise<void> {
    const header = this.requireHeader();
    const result = await deleteDeviceVaultKey(header.vaultId);
    if (!result.ok) throw new Error(result.error || 'Could not remove the saved device key.');
  }

  lock(): void {
    vaultSession.lock();
  }

  async disconnect(): Promise<void> {
    vaultSession.lock();
    this.header = null;
    await googleAuth.disconnect();
  }

  getHeader(): VaultHeader | null {
    return this.header;
  }

  private requireHeader(): VaultHeader {
    if (!this.header) throw new Error('No PaperFlow vault was found in Google Drive.');
    return this.header;
  }

  private async tryRememberedKey(header: VaultHeader): Promise<boolean> {
    const result = await loadDeviceVaultKey(header.vaultId);
    if (!result.ok || !result.authenticated || !result.vaultKey) return false;
    try {
      const key = base64ToBytes(result.vaultKey);
      if (key.byteLength !== 32) return false;
      vaultSession.unlock(header.vaultId, key);
      key.fill(0);
      return true;
    } catch {
      return false;
    }
  }

  private async remember(vaultId: string, key: Uint8Array): Promise<boolean> {
    const result = await storeDeviceVaultKey(vaultId, bytesToBase64(key));
    return result.ok;
  }

  private assertUnlockAllowed(): void {
    const remaining = this.unlockAllowedAt - Date.now();
    if (remaining > 0) {
      throw new Error(`Wait ${Math.ceil(remaining / 1000)} seconds before trying to unlock again.`);
    }
  }

  private recordUnlockFailure(): void {
    this.failedUnlocks += 1;
    const delay = Math.min(30_000, 1000 * (2 ** Math.min(this.failedUnlocks - 1, 5)));
    this.unlockAllowedAt = Date.now() + delay;
  }

  private resetUnlockRateLimit(): void {
    this.failedUnlocks = 0;
    this.unlockAllowedAt = 0;
  }
}

export const vaultController = new VaultController();
