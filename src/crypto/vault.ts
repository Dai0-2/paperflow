import {
  base64ToBytes,
  bytesToBase64,
  randomBytes,
  utf8,
} from './encoding';
import {
  assertStrongVaultPassword,
  derivePasswordWrappingKey,
  deriveRecoveryWrappingKey,
  PASSWORD_KDF_ITERATIONS,
  toArrayBuffer,
} from './kdf';
import { createRecoveryKey, parseRecoveryKey } from './recoveryKey';
import {
  ACCOUNT_SYNC_HEADER_VERSION,
  parseAccountVaultHeader,
  parseLegacyVaultHeader,
  VAULT_FORMAT,
  VAULT_PROTOCOL_VERSION,
  type AccountVaultHeader,
  type LegacyVaultHeader,
  type VaultHeader,
  type WrappedKey,
} from '../sync/protocol';

const VMK_BYTES = 32;
const GCM_NONCE_BYTES = 12;

function wrappingAad(vaultId: string, method: 'password' | 'recovery'): Uint8Array {
  return utf8(JSON.stringify([VAULT_FORMAT, VAULT_PROTOCOL_VERSION, vaultId, method, 'vmk']));
}

async function wrapVmk(
  vaultMasterKey: Uint8Array,
  wrappingKey: CryptoKey,
  aad: Uint8Array,
): Promise<WrappedKey> {
  const nonce = randomBytes(GCM_NONCE_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(aad), tagLength: 128 },
    wrappingKey,
    toArrayBuffer(vaultMasterKey),
  );
  return {
    algorithm: 'AES-256-GCM',
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function unwrapVmk(
  wrapped: WrappedKey,
  wrappingKey: CryptoKey,
  aad: Uint8Array,
): Promise<Uint8Array> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(base64ToBytes(wrapped.nonce)),
        additionalData: toArrayBuffer(aad),
        tagLength: 128,
      },
      wrappingKey,
      toArrayBuffer(base64ToBytes(wrapped.ciphertext)),
    );
    const key = new Uint8Array(plaintext);
    if (key.byteLength !== VMK_BYTES) throw new Error('Invalid vault master key length.');
    return key;
  } catch {
    throw new Error('The vault could not be unlocked. The credential is wrong or the header was modified.');
  }
}

export interface CreatedVault {
  header: LegacyVaultHeader;
  vaultMasterKey: Uint8Array;
  recoveryKey: string;
}

export interface CreatedAccountManagedVault {
  header: AccountVaultHeader;
  vaultMasterKey: Uint8Array;
}

export function accountManagedHeader(
  vaultId: string,
  vaultMasterKey: Uint8Array,
): AccountVaultHeader {
  if (vaultMasterKey.byteLength !== VMK_BYTES) throw new Error('Invalid vault master key length.');
  return parseAccountVaultHeader({
    format: VAULT_FORMAT,
    version: ACCOUNT_SYNC_HEADER_VERSION,
    vaultId,
    keyManagement: {
      mode: 'google-account',
      keyMaterial: bytesToBase64(vaultMasterKey),
    },
  });
}

export function createAccountManagedVault(): CreatedAccountManagedVault {
  const vaultMasterKey = randomBytes(VMK_BYTES);
  return {
    header: accountManagedHeader(crypto.randomUUID(), vaultMasterKey),
    vaultMasterKey,
  };
}

export function unlockAccountManagedVault(input: VaultHeader | unknown): Uint8Array {
  const header = parseAccountVaultHeader(input);
  const key = base64ToBytes(header.keyManagement.keyMaterial);
  if (key.byteLength !== VMK_BYTES) throw new Error('Invalid Google Drive sync key length.');
  return key;
}

export async function createVault(password: string): Promise<CreatedVault> {
  assertStrongVaultPassword(password);
  const vaultId = crypto.randomUUID();
  const vaultMasterKey = randomBytes(VMK_BYTES);
  const passwordSalt = randomBytes(16);
  const recovery = createRecoveryKey();
  const passwordWrappingKey = await derivePasswordWrappingKey(
    password,
    passwordSalt,
    PASSWORD_KDF_ITERATIONS,
  );
  const recoveryWrappingKey = await deriveRecoveryWrappingKey(recovery.bytes, vaultId);
  const [passwordWrappedVmk, recoveryWrappedVmk] = await Promise.all([
    wrapVmk(vaultMasterKey, passwordWrappingKey, wrappingAad(vaultId, 'password')),
    wrapVmk(vaultMasterKey, recoveryWrappingKey, wrappingAad(vaultId, 'recovery')),
  ]);
  recovery.bytes.fill(0);
  const header = parseLegacyVaultHeader({
    format: VAULT_FORMAT,
    version: VAULT_PROTOCOL_VERSION,
    vaultId,
    passwordKdf: {
      algorithm: 'PBKDF2-HMAC-SHA-256',
      salt: bytesToBase64(passwordSalt),
      iterations: PASSWORD_KDF_ITERATIONS,
    },
    passwordWrappedVmk,
    recoveryKdf: {
      algorithm: 'HKDF-SHA-256',
      info: 'paperflow/v1/recovery-wrap',
    },
    recoveryWrappedVmk,
  });
  return { header, vaultMasterKey, recoveryKey: recovery.display };
}

export async function unlockVaultWithPassword(
  input: LegacyVaultHeader | unknown,
  password: string,
): Promise<Uint8Array> {
  const header = parseLegacyVaultHeader(input);
  const wrappingKey = await derivePasswordWrappingKey(
    password,
    base64ToBytes(header.passwordKdf.salt),
    header.passwordKdf.iterations,
  );
  return unwrapVmk(
    header.passwordWrappedVmk,
    wrappingKey,
    wrappingAad(header.vaultId, 'password'),
  );
}

export async function unlockVaultWithRecoveryKey(
  input: LegacyVaultHeader | unknown,
  recoveryKey: string,
): Promise<Uint8Array> {
  const header = parseLegacyVaultHeader(input);
  const recoveryBytes = parseRecoveryKey(recoveryKey);
  try {
    const wrappingKey = await deriveRecoveryWrappingKey(recoveryBytes, header.vaultId);
    return await unwrapVmk(
      header.recoveryWrappedVmk,
      wrappingKey,
      wrappingAad(header.vaultId, 'recovery'),
    );
  } finally {
    recoveryBytes.fill(0);
  }
}

export async function rewrapVaultPassword(
  input: LegacyVaultHeader | unknown,
  vaultMasterKey: Uint8Array,
  newPassword: string,
): Promise<LegacyVaultHeader> {
  const header = parseLegacyVaultHeader(input);
  if (vaultMasterKey.byteLength !== VMK_BYTES) throw new Error('Invalid vault master key length.');
  assertStrongVaultPassword(newPassword);
  const passwordSalt = randomBytes(16);
  const passwordWrappingKey = await derivePasswordWrappingKey(
    newPassword,
    passwordSalt,
    PASSWORD_KDF_ITERATIONS,
  );
  return parseLegacyVaultHeader({
    ...header,
    passwordKdf: {
      algorithm: 'PBKDF2-HMAC-SHA-256',
      salt: bytesToBase64(passwordSalt),
      iterations: PASSWORD_KDF_ITERATIONS,
    },
    passwordWrappedVmk: await wrapVmk(
      vaultMasterKey,
      passwordWrappingKey,
      wrappingAad(header.vaultId, 'password'),
    ),
  });
}

type VaultSessionListener = () => void;

class VaultSession {
  private vaultId: string | null = null;
  private key: Uint8Array | null = null;
  private listeners = new Set<VaultSessionListener>();

  unlock(vaultId: string, vaultMasterKey: Uint8Array): void {
    this.lock();
    this.vaultId = vaultId;
    this.key = vaultMasterKey.slice();
    this.emit();
  }

  lock(): void {
    this.key?.fill(0);
    this.key = null;
    this.vaultId = null;
    this.emit();
  }

  isUnlocked(vaultId?: string): boolean {
    return Boolean(this.key && (!vaultId || this.vaultId === vaultId));
  }

  getVaultId(): string | null {
    return this.vaultId;
  }

  getKey(): Uint8Array {
    if (!this.key) throw new Error('The vault is locked.');
    return this.key.slice();
  }

  subscribe(listener: VaultSessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const vaultSession = new VaultSession();
