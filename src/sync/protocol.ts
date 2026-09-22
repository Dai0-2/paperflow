import { z } from 'zod';

export const VAULT_PROTOCOL_VERSION = 1 as const;
export const VAULT_FORMAT = 'paperflow-vault' as const;
export const ENCRYPTED_OBJECT_FORMAT = 'paperflow-object' as const;

const wrappedKeySchema = z.object({
  algorithm: z.literal('AES-256-GCM'),
  nonce: z.string().min(1),
  ciphertext: z.string().min(1),
});

export const vaultHeaderSchema = z.object({
  format: z.literal(VAULT_FORMAT),
  version: z.literal(VAULT_PROTOCOL_VERSION),
  vaultId: z.string().uuid(),
  passwordKdf: z.object({
    algorithm: z.literal('PBKDF2-HMAC-SHA-256'),
    salt: z.string().min(1),
    iterations: z.number().int().min(600_000),
  }),
  passwordWrappedVmk: wrappedKeySchema,
  recoveryKdf: z.object({
    algorithm: z.literal('HKDF-SHA-256'),
    info: z.literal('paperflow/v1/recovery-wrap'),
  }),
  recoveryWrappedVmk: wrappedKeySchema,
});

export const encryptedObjectSchema = z.object({
  format: z.literal(ENCRYPTED_OBJECT_FORMAT),
  version: z.literal(VAULT_PROTOCOL_VERSION),
  vaultId: z.string().uuid(),
  objectId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  wrappedObjectKey: wrappedKeySchema,
  chunkSize: z.number().int().positive(),
  byteLength: z.number().int().nonnegative(),
  chunks: z.array(z.object({
    index: z.number().int().nonnegative(),
    nonce: z.string().min(1),
    ciphertext: z.string().min(1),
  })),
});

export type WrappedKey = z.infer<typeof wrappedKeySchema>;
export type VaultHeader = z.infer<typeof vaultHeaderSchema>;
export type EncryptedObject = z.infer<typeof encryptedObjectSchema>;

export function parseVaultHeader(input: unknown): VaultHeader {
  return vaultHeaderSchema.parse(input);
}

export function parseEncryptedObject(input: unknown): EncryptedObject {
  return encryptedObjectSchema.parse(input);
}
