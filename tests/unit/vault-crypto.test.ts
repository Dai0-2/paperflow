import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '../../src/crypto/encoding';
import {
  decryptObject,
  encryptObject,
  opaqueDriveFileName,
} from '../../src/crypto/objectCipher';
import {
  createVault,
  rewrapVaultPassword,
  unlockVaultWithPassword,
  unlockVaultWithRecoveryKey,
} from '../../src/crypto/vault';
import type { EncryptedObject } from '../../src/sync/protocol';

const password = 'correct horse battery paperflow';

function cloneObject(value: EncryptedObject): EncryptedObject {
  return structuredClone(value);
}

describe('vault key wrapping', () => {
  it('unlocks with password or recovery key and fails closed for a wrong password', async () => {
    const created = await createVault(password);
    const fromPassword = await unlockVaultWithPassword(created.header, password);
    const fromRecovery = await unlockVaultWithRecoveryKey(created.header, created.recoveryKey);

    expect(fromPassword).toEqual(created.vaultMasterKey);
    expect(fromRecovery).toEqual(created.vaultMasterKey);
    await expect(unlockVaultWithPassword(created.header, 'this password is definitely wrong'))
      .rejects.toThrow(/could not be unlocked/i);
    const wrongRecovery = created.recoveryKey.replace(/^[A-Z2-7]/, (character) =>
      character === 'A' ? 'B' : 'A');
    await expect(unlockVaultWithRecoveryKey(created.header, wrongRecovery))
      .rejects.toThrow(/could not be unlocked/i);
    const tamperedHeader = structuredClone(created.header);
    const wrappedBytes = base64ToBytes(tamperedHeader.passwordWrappedVmk.ciphertext);
    wrappedBytes[0] ^= 1;
    tamperedHeader.passwordWrappedVmk.ciphertext = bytesToBase64(wrappedBytes);
    await expect(unlockVaultWithPassword(tamperedHeader, password))
      .rejects.toThrow(/header was modified/i);
  });

  it('changes only the password wrapping without changing historical object keys', async () => {
    const created = await createVault(password);
    const plaintext = new TextEncoder().encode('historical encrypted paper');
    const encrypted = await encryptObject(
      created.vaultMasterKey,
      created.header.vaultId,
      'paper',
      'paper:history',
      plaintext,
      8,
    );
    const updated = await rewrapVaultPassword(
      created.header,
      created.vaultMasterKey,
      'new paperflow vault password',
    );

    await expect(unlockVaultWithPassword(updated, password)).rejects.toThrow();
    const unlocked = await unlockVaultWithPassword(updated, 'new paperflow vault password');
    expect(Array.from(await decryptObject(unlocked, 'paper', 'paper:history', encrypted)))
      .toEqual(Array.from(plaintext));
    expect(updated.recoveryWrappedVmk).toEqual(created.header.recoveryWrappedVmk);
  });
});

describe('encrypted Drive objects', () => {
  it('uses opaque names and unique nonces while preserving chunk order', async () => {
    const created = await createVault(password);
    const plaintext = new TextEncoder().encode('Secret Paper Title by Private Author');
    const encrypted = await encryptObject(
      created.vaultMasterKey,
      created.header.vaultId,
      'paper',
      'doi:10.1000/private',
      plaintext,
      5,
    );
    const name = await opaqueDriveFileName(
      created.vaultMasterKey,
      created.header.vaultId,
      'paper',
      'doi:10.1000/private',
    );

    expect(name).toMatch(/^[A-Za-z0-9_-]{43}\.pfo$/);
    expect(name).not.toContain('private');
    expect(JSON.stringify(encrypted)).not.toContain('Secret Paper Title');
    expect(new Set(encrypted.chunks.map((chunk) => chunk.nonce)).size).toBe(encrypted.chunks.length);
    expect(Array.from(await decryptObject(
      created.vaultMasterKey,
      'paper',
      'doi:10.1000/private',
      encrypted,
    ))).toEqual(Array.from(plaintext));
  });

  it('rejects tampering, chunk exchange, nonce reuse, and AAD substitution', async () => {
    const created = await createVault(password);
    const encrypted = await encryptObject(
      created.vaultMasterKey,
      created.header.vaultId,
      'note',
      'note:private',
      new TextEncoder().encode('private note contents across chunks'),
      6,
    );

    const tampered = cloneObject(encrypted);
    const bytes = base64ToBytes(tampered.chunks[0].ciphertext);
    bytes[0] ^= 1;
    tampered.chunks[0].ciphertext = bytesToBase64(bytes);
    await expect(decryptObject(created.vaultMasterKey, 'note', 'note:private', tampered))
      .rejects.toThrow(/authentication failed/i);

    const exchanged = cloneObject(encrypted);
    [exchanged.chunks[0], exchanged.chunks[1]] = [exchanged.chunks[1], exchanged.chunks[0]];
    await expect(decryptObject(created.vaultMasterKey, 'note', 'note:private', exchanged))
      .rejects.toThrow(/out of order/i);

    const repeatedNonce = cloneObject(encrypted);
    repeatedNonce.chunks[1].nonce = repeatedNonce.chunks[0].nonce;
    await expect(decryptObject(created.vaultMasterKey, 'note', 'note:private', repeatedNonce))
      .rejects.toThrow(/reuses a nonce/i);

    await expect(decryptObject(created.vaultMasterKey, 'paper', 'note:private', encrypted))
      .rejects.toThrow(/identity does not match/i);
    await expect(decryptObject(created.vaultMasterKey, 'note', 'note:another', encrypted))
      .rejects.toThrow(/identity does not match/i);
  });
});
