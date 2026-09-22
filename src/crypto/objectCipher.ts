import {
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  randomBytes,
  utf8,
} from './encoding';
import { deriveVaultSubkey, toArrayBuffer } from './kdf';
import {
  ENCRYPTED_OBJECT_FORMAT,
  parseEncryptedObject,
  VAULT_PROTOCOL_VERSION,
  type EncryptedObject,
  type WrappedKey,
} from '../sync/protocol';

export const DEFAULT_ENCRYPTED_CHUNK_SIZE = 1024 * 1024;
const NONCE_BYTES = 12;

function objectAad(
  vaultId: string,
  objectType: string,
  logicalId: string,
  part: 'key' | 'chunk',
  chunkIndex?: number,
): Uint8Array {
  return utf8(JSON.stringify([
    ENCRYPTED_OBJECT_FORMAT,
    VAULT_PROTOCOL_VERSION,
    vaultId,
    objectType,
    logicalId,
    part,
    chunkIndex ?? null,
  ]));
}

async function importObjectKey(value: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(value),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function vaultWrappingKey(vaultMasterKey: Uint8Array, vaultId: string): Promise<CryptoKey> {
  return deriveVaultSubkey(
    vaultMasterKey,
    vaultId,
    'object-key-wrap',
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
  );
}

async function wrapObjectKey(
  objectKey: Uint8Array,
  wrappingKey: CryptoKey,
  aad: Uint8Array,
): Promise<WrappedKey> {
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(aad), tagLength: 128 },
    wrappingKey,
    toArrayBuffer(objectKey),
  );
  return {
    algorithm: 'AES-256-GCM',
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function unwrapObjectKey(
  wrapped: WrappedKey,
  wrappingKey: CryptoKey,
  aad: Uint8Array,
): Promise<Uint8Array> {
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
  const objectKey = new Uint8Array(plaintext);
  if (objectKey.byteLength !== 32) throw new Error('Invalid encrypted object key.');
  return objectKey;
}

export async function opaqueObjectId(
  vaultMasterKey: Uint8Array,
  vaultId: string,
  objectType: string,
  logicalId: string,
): Promise<string> {
  const indexKey = await deriveVaultSubkey(
    vaultMasterKey,
    vaultId,
    'drive-index',
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    indexKey,
    toArrayBuffer(utf8(`${objectType}\u0000${logicalId}`)),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function opaqueDriveFileName(
  vaultMasterKey: Uint8Array,
  vaultId: string,
  objectType: string,
  logicalId: string,
): Promise<string> {
  return `${await opaqueObjectId(vaultMasterKey, vaultId, objectType, logicalId)}.pfo`;
}

export async function encryptObject(
  vaultMasterKey: Uint8Array,
  vaultId: string,
  objectType: string,
  logicalId: string,
  plaintext: Uint8Array,
  chunkSize = DEFAULT_ENCRYPTED_CHUNK_SIZE,
): Promise<EncryptedObject> {
  if (vaultMasterKey.byteLength !== 32) throw new Error('Invalid vault master key length.');
  if (!objectType || !logicalId) throw new Error('Encrypted objects require a type and logical ID.');
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new Error('Invalid encrypted chunk size.');

  const objectKeyBytes = randomBytes(32);
  const objectKey = await importObjectKey(objectKeyBytes);
  const wrappingKey = await vaultWrappingKey(vaultMasterKey, vaultId);
  const wrappedObjectKey = await wrapObjectKey(
    objectKeyBytes,
    wrappingKey,
    objectAad(vaultId, objectType, logicalId, 'key'),
  );
  objectKeyBytes.fill(0);

  const chunkCount = Math.max(1, Math.ceil(plaintext.byteLength / chunkSize));
  const usedNonces = new Set<string>();
  const chunks: EncryptedObject['chunks'] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    let nonce = randomBytes(NONCE_BYTES);
    let encodedNonce = bytesToBase64(nonce);
    while (usedNonces.has(encodedNonce)) {
      nonce = randomBytes(NONCE_BYTES);
      encodedNonce = bytesToBase64(nonce);
    }
    usedNonces.add(encodedNonce);
    const chunk = plaintext.subarray(index * chunkSize, Math.min((index + 1) * chunkSize, plaintext.byteLength));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(objectAad(vaultId, objectType, logicalId, 'chunk', index)),
        tagLength: 128,
      },
      objectKey,
      toArrayBuffer(chunk),
    );
    chunks.push({ index, nonce: encodedNonce, ciphertext: bytesToBase64(new Uint8Array(ciphertext)) });
  }

  return parseEncryptedObject({
    format: ENCRYPTED_OBJECT_FORMAT,
    version: VAULT_PROTOCOL_VERSION,
    vaultId,
    objectId: await opaqueObjectId(vaultMasterKey, vaultId, objectType, logicalId),
    wrappedObjectKey,
    chunkSize,
    byteLength: plaintext.byteLength,
    chunks,
  });
}

export async function decryptObject(
  vaultMasterKey: Uint8Array,
  objectType: string,
  logicalId: string,
  input: EncryptedObject | unknown,
): Promise<Uint8Array> {
  const object = parseEncryptedObject(input);
  const expectedId = await opaqueObjectId(vaultMasterKey, object.vaultId, objectType, logicalId);
  if (object.objectId !== expectedId) throw new Error('Encrypted object identity does not match.');
  const expectedChunks = Math.max(1, Math.ceil(object.byteLength / object.chunkSize));
  if (object.chunks.length !== expectedChunks) throw new Error('Encrypted object chunk count does not match.');
  const nonces = new Set<string>();
  for (const [position, chunk] of object.chunks.entries()) {
    if (chunk.index !== position) throw new Error('Encrypted object chunks are missing or out of order.');
    if (nonces.has(chunk.nonce)) throw new Error('Encrypted object reuses a nonce.');
    nonces.add(chunk.nonce);
  }

  try {
    const wrappingKey = await vaultWrappingKey(vaultMasterKey, object.vaultId);
    const objectKeyBytes = await unwrapObjectKey(
      object.wrappedObjectKey,
      wrappingKey,
      objectAad(object.vaultId, objectType, logicalId, 'key'),
    );
    const objectKey = await importObjectKey(objectKeyBytes);
    objectKeyBytes.fill(0);
    const plaintext = new Uint8Array(object.byteLength);
    let offset = 0;
    for (const chunk of object.chunks) {
      const decrypted = new Uint8Array(await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(base64ToBytes(chunk.nonce)),
          additionalData: toArrayBuffer(objectAad(
            object.vaultId,
            objectType,
            logicalId,
            'chunk',
            chunk.index,
          )),
          tagLength: 128,
        },
        objectKey,
        toArrayBuffer(base64ToBytes(chunk.ciphertext)),
      ));
      plaintext.set(decrypted, offset);
      offset += decrypted.byteLength;
    }
    if (offset !== object.byteLength) throw new Error('Encrypted object length does not match.');
    return plaintext;
  } catch (error) {
    if (error instanceof Error && /identity|chunks|nonce|length/.test(error.message)) throw error;
    throw new Error('Encrypted object authentication failed.');
  }
}

export function serializeEncryptedObject(value: EncryptedObject): string {
  return JSON.stringify(value);
}

export function deserializeEncryptedObject(value: string): EncryptedObject {
  return parseEncryptedObject(JSON.parse(value) as unknown);
}
