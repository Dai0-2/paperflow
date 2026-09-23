import { z } from 'zod';

export const VAULT_PROTOCOL_VERSION = 1 as const;
export const ACCOUNT_SYNC_HEADER_VERSION = 2 as const;
export const VAULT_FORMAT = 'paperflow-vault' as const;
export const ENCRYPTED_OBJECT_FORMAT = 'paperflow-object' as const;
export const SYNC_BATCH_FORMAT = 'paperflow-sync-batch' as const;
export const SYNC_SNAPSHOT_FORMAT = 'paperflow-sync-snapshot' as const;

const wrappedKeySchema = z.object({
  algorithm: z.literal('AES-256-GCM'),
  nonce: z.string().min(1),
  ciphertext: z.string().min(1),
});

export const legacyVaultHeaderSchema = z.object({
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

export const accountVaultHeaderSchema = z.object({
  format: z.literal(VAULT_FORMAT),
  version: z.literal(ACCOUNT_SYNC_HEADER_VERSION),
  vaultId: z.string().uuid(),
  keyManagement: z.object({
    mode: z.literal('google-account'),
    keyMaterial: z.string().length(44),
  }),
});

export const vaultHeaderSchema = z.discriminatedUnion('version', [
  legacyVaultHeaderSchema,
  accountVaultHeaderSchema,
]);

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

export const entityVersionSchema = z.object({
  counter: z.number().int().nonnegative(),
  deviceId: z.string().min(1),
});

export const syncEntityTypeSchema = z.enum([
  'paper',
  'paperAlias',
  'collection',
  'collectionItem',
  'tag',
  'paperTag',
  'document',
  'note',
  'annotation',
  'thread',
  'message',
  'paperMemory',
  'selection',
  'setting',
]);

export const syncOperationSchema = z.object({
  id: z.string().min(1),
  deviceId: z.string().min(1),
  seq: z.number().int().positive(),
  entityType: syncEntityTypeSchema,
  entityId: z.string().min(1),
  action: z.enum(['put', 'delete']),
  version: entityVersionSchema,
  baseVersion: entityVersionSchema.optional(),
  payload: z.unknown().optional(),
  createdAt: z.number().int().nonnegative(),
  state: z.enum(['pending', 'uploaded']),
  batchId: z.string().optional(),
});

export const syncBatchSchema = z.object({
  format: z.literal(SYNC_BATCH_FORMAT),
  version: z.literal(VAULT_PROTOCOL_VERSION),
  vaultId: z.string().uuid(),
  batchId: z.string().uuid(),
  deviceId: z.string().min(1),
  fromSeq: z.number().int().positive(),
  toSeq: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  operations: z.array(syncOperationSchema).min(1),
});

export const syncSnapshotRecordSchema = z.object({
  entityType: syncEntityTypeSchema,
  entityId: z.string().min(1),
  version: entityVersionSchema,
  payload: z.unknown(),
});

export const syncSnapshotSchema = z.object({
  format: z.literal(SYNC_SNAPSHOT_FORMAT),
  version: z.literal(VAULT_PROTOCOL_VERSION),
  vaultId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  createdAt: z.number().int().nonnegative(),
  records: z.array(syncSnapshotRecordSchema),
  appliedOperationIds: z.array(z.string()),
});

export type WrappedKey = z.infer<typeof wrappedKeySchema>;
export type LegacyVaultHeader = z.infer<typeof legacyVaultHeaderSchema>;
export type AccountVaultHeader = z.infer<typeof accountVaultHeaderSchema>;
export type VaultHeader = z.infer<typeof vaultHeaderSchema>;
export type EncryptedObject = z.infer<typeof encryptedObjectSchema>;
export type SyncBatch = z.infer<typeof syncBatchSchema>;
export type SyncSnapshot = z.infer<typeof syncSnapshotSchema>;

export function parseVaultHeader(input: unknown): VaultHeader {
  return vaultHeaderSchema.parse(input);
}

export function parseLegacyVaultHeader(input: unknown): LegacyVaultHeader {
  return legacyVaultHeaderSchema.parse(input);
}

export function parseAccountVaultHeader(input: unknown): AccountVaultHeader {
  return accountVaultHeaderSchema.parse(input);
}

export function parseEncryptedObject(input: unknown): EncryptedObject {
  return encryptedObjectSchema.parse(input);
}

export function parseSyncBatch(input: unknown): SyncBatch {
  return syncBatchSchema.parse(input);
}

export function parseSyncSnapshot(input: unknown): SyncSnapshot {
  return syncSnapshotSchema.parse(input);
}
