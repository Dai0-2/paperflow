import { decodeBase32, encodeBase32, groupRecoveryKey, randomBytes } from './encoding';

const RECOVERY_KEY_BYTES = 32;

export function createRecoveryKey(): { display: string; bytes: Uint8Array } {
  const bytes = randomBytes(RECOVERY_KEY_BYTES);
  return {
    display: groupRecoveryKey(encodeBase32(bytes)),
    bytes,
  };
}

export function parseRecoveryKey(value: string): Uint8Array {
  const bytes = decodeBase32(value);
  if (bytes.byteLength !== RECOVERY_KEY_BYTES) {
    throw new Error('Recovery key must encode exactly 256 bits.');
  }
  return bytes;
}
