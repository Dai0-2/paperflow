import { utf8 } from './encoding';

export const PASSWORD_KDF_ITERATIONS = 600_000;
export const PASSWORD_MIN_LENGTH = 12;

export function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

export function assertStrongVaultPassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Vault password must contain at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
}

export async function derivePasswordWrappingKey(
  password: string,
  salt: Uint8Array,
  iterations = PASSWORD_KDF_ITERATIONS,
): Promise<CryptoKey> {
  if (iterations < PASSWORD_KDF_ITERATIONS) throw new Error('Unsupported weak password KDF parameters.');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(utf8(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function deriveRecoveryWrappingKey(
  recoveryKey: Uint8Array,
  vaultId: string,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(recoveryKey),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(utf8(vaultId)),
      info: toArrayBuffer(utf8('paperflow/v1/recovery-wrap')),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function deriveVaultSubkey(
  vaultMasterKey: Uint8Array,
  vaultId: string,
  purpose: string,
  algorithm: HmacImportParams | AesKeyAlgorithm,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(vaultMasterKey),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(utf8(vaultId)),
      info: toArrayBuffer(utf8(`paperflow/v1/${purpose}`)),
    },
    keyMaterial,
    algorithm,
    false,
    usages,
  );
}
