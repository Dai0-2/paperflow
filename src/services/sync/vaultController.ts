import {
  accountManagedHeader,
  createAccountManagedVault,
  unlockAccountManagedVault,
  unlockVaultWithPassword,
  unlockVaultWithRecoveryKey,
  vaultSession,
} from '../../crypto/vault';
import {
  createGoogleDriveObjectStore,
  type GoogleDriveObjectStore,
} from '../google/driveObjects';
import { googleAuth } from '../google/googleAuth';
import type { LegacyVaultHeader, VaultHeader } from '../../sync/protocol';

const SYNC_ENABLED_KEY = 'paperflowGoogleDriveSyncEnabled';

interface GoogleAuthGateway {
  isConfigured(): boolean;
  connect(): Promise<string>;
  disconnect(): Promise<void>;
}

export interface SyncPreferenceGateway {
  read(): Promise<boolean>;
  write(enabled: boolean): Promise<void>;
}

export interface VaultConnection {
  header: VaultHeader | null;
  unlocked: boolean;
  legacyMigrationRequired: boolean;
}

async function readSyncEnabled(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return false;
  const stored = await chrome.storage.local.get(SYNC_ENABLED_KEY);
  return stored[SYNC_ENABLED_KEY] === true;
}

async function writeSyncEnabled(enabled: boolean): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [SYNC_ENABLED_KEY]: enabled });
}

const browserSyncPreference: SyncPreferenceGateway = {
  read: readSyncEnabled,
  write: writeSyncEnabled,
};

export class VaultController {
  private header: VaultHeader | null = null;

  constructor(
    private readonly objectStore: GoogleDriveObjectStore = createGoogleDriveObjectStore(),
    private readonly auth: GoogleAuthGateway = googleAuth,
    private readonly syncPreference: SyncPreferenceGateway = browserSyncPreference,
  ) {}

  isConfigured(): boolean {
    return this.auth.isConfigured();
  }

  async isSyncEnabled(): Promise<boolean> {
    return this.isConfigured() && await this.syncPreference.read();
  }

  async connect(): Promise<VaultConnection> {
    await this.auth.connect();
    await this.syncPreference.write(true);
    return this.loadOrCreate();
  }

  async inspect(): Promise<VaultConnection> {
    if (!await this.isSyncEnabled()) return this.disconnected();
    return this.loadExisting();
  }

  async migrateLegacyWithPassword(password: string): Promise<VaultConnection> {
    const header = this.requireLegacyHeader();
    const key = await unlockVaultWithPassword(header, password);
    return this.completeLegacyMigration(header, key);
  }

  async migrateLegacyWithRecoveryKey(recoveryKey: string): Promise<VaultConnection> {
    const header = this.requireLegacyHeader();
    const key = await unlockVaultWithRecoveryKey(header, recoveryKey);
    return this.completeLegacyMigration(header, key);
  }

  async disconnect(): Promise<void> {
    vaultSession.lock();
    this.header = null;
    await this.syncPreference.write(false);
    await this.auth.disconnect();
  }

  getHeader(): VaultHeader | null {
    return this.header;
  }

  private async loadOrCreate(): Promise<VaultConnection> {
    const existing = await this.objectStore.readVaultHeader();
    if (existing) return this.activate(existing);

    const created = createAccountManagedVault();
    try {
      await this.objectStore.writeVaultHeader(created.header);
      this.header = created.header;
      vaultSession.unlock(created.header.vaultId, created.vaultMasterKey);
      return {
        header: created.header,
        unlocked: true,
        legacyMigrationRequired: false,
      };
    } finally {
      created.vaultMasterKey.fill(0);
    }
  }

  private async loadExisting(): Promise<VaultConnection> {
    const existing = await this.objectStore.readVaultHeader();
    if (!existing) return this.disconnected();
    return this.activate(existing);
  }

  private activate(header: VaultHeader): VaultConnection {
    this.header = header;
    if (header.version === 1) {
      return {
        header,
        unlocked: false,
        legacyMigrationRequired: true,
      };
    }
    const key = unlockAccountManagedVault(header);
    try {
      vaultSession.unlock(header.vaultId, key);
    } finally {
      key.fill(0);
    }
    return {
      header,
      unlocked: true,
      legacyMigrationRequired: false,
    };
  }

  private requireLegacyHeader(): LegacyVaultHeader {
    if (!this.header || this.header.version !== 1) {
      throw new Error('No legacy PaperFlow encrypted sync data was found.');
    }
    return this.header;
  }

  private async completeLegacyMigration(
    legacyHeader: LegacyVaultHeader,
    key: Uint8Array,
  ): Promise<VaultConnection> {
    try {
      const header = accountManagedHeader(legacyHeader.vaultId, key);
      await this.objectStore.writeVaultHeader(header);
      this.header = header;
      vaultSession.unlock(header.vaultId, key);
      return {
        header,
        unlocked: true,
        legacyMigrationRequired: false,
      };
    } finally {
      key.fill(0);
    }
  }

  private disconnected(): VaultConnection {
    vaultSession.lock();
    this.header = null;
    return {
      header: null,
      unlocked: false,
      legacyMigrationRequired: false,
    };
  }
}

export const vaultController = new VaultController();
