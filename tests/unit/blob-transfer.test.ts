import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PaperFlowDatabase } from '../../src/db/PaperFlowDatabase';
import type { DriveFile } from '../../src/services/google/driveClient';
import type {
  SyncObjectRef,
  SyncObjectStore,
} from '../../src/services/google/driveObjects';
import {
  readEncryptedUpload,
  readStoredPdf,
  writeStoredPdf,
} from '../../src/services/storage/opfs';
import { BlobTransfer } from '../../src/sync/blobTransfer';
import { SyncBudget } from '../../src/sync/checkpoint';
import {
  encryptObject,
  opaqueDriveFileName,
  serializeEncryptedObject,
} from '../../src/crypto/objectCipher';
import { vaultSession } from '../../src/crypto/vault';
import { downloadCloudDocumentForPaper } from '../../src/services/storage/documentStore';

class MemoryFileHandle {
  private bytes = new Uint8Array();

  constructor(readonly name: string) {}

  async createWritable(): Promise<FileSystemWritableFileStream> {
    return {
      write: async (value: FileSystemWriteChunkType) => {
        if (value instanceof Uint8Array) this.bytes = value.slice();
        else if (value instanceof ArrayBuffer) this.bytes = new Uint8Array(value);
        else if (value instanceof Blob) this.bytes = new Uint8Array(await value.arrayBuffer());
        else if (ArrayBuffer.isView(value)) {
          this.bytes = new Uint8Array(value.buffer.slice(
            value.byteOffset,
            value.byteOffset + value.byteLength,
          ));
        } else {
          throw new Error('Unsupported test write type.');
        }
      },
      close: async () => undefined,
    } as unknown as FileSystemWritableFileStream;
  }

  async getFile(): Promise<File> {
    return new File([this.bytes], this.name);
  }
}

class MemoryDirectoryHandle {
  readonly files = new Map<string, MemoryFileHandle>();
  readonly directories = new Map<string, MemoryDirectoryHandle>();

  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle> {
    const existing = this.directories.get(name);
    if (existing) return existing as unknown as FileSystemDirectoryHandle;
    if (!options?.create) throw new DOMException('Missing directory.', 'NotFoundError');
    const created = new MemoryDirectoryHandle();
    this.directories.set(name, created);
    return created as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle> {
    const existing = this.files.get(name);
    if (existing) return existing as unknown as FileSystemFileHandle;
    if (!options?.create) throw new DOMException('Missing file.', 'NotFoundError');
    const created = new MemoryFileHandle(name);
    this.files.set(name, created);
    return created as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name)) throw new DOMException('Missing file.', 'NotFoundError');
  }
}

class InterruptingRemote implements SyncObjectStore {
  sessions = 0;
  chunks = 0;
  finds = 0;
  interrupted = false;

  async findOpaqueObject(): Promise<DriveFile | null> {
    this.finds += 1;
    return null;
  }

  async createResumableObjectUpload(): Promise<string> {
    this.sessions += 1;
    return 'https://upload.example/session';
  }

  async uploadResumableChunk(
    _sessionUrl: string,
    data: Uint8Array,
    offset: number,
    totalBytes: number,
  ) {
    this.chunks += 1;
    if (offset > 0 && !this.interrupted) {
      this.interrupted = true;
      throw new Error('Simulated worker termination.');
    }
    const nextOffset = offset + data.byteLength;
    return {
      complete: nextOffset >= totalBytes,
      nextOffset,
      file: nextOffset >= totalBytes
        ? { id: 'remote-pdf', name: 'opaque.pfo', mimeType: 'application/json' }
        : undefined,
    };
  }

  async putImmutableSyncObject(): Promise<DriveFile> {
    throw new Error('Unexpected metadata upload.');
  }

  async getSyncObject(): Promise<Uint8Array> {
    throw new Error('Unexpected metadata download.');
  }

  async listSyncObjects(): Promise<SyncObjectRef[]> {
    return [];
  }

  async getStartPageToken(): Promise<string> {
    return '0';
  }

  async listChangedSyncObjects() {
    return { objects: [], removedFileIds: [], newStartPageToken: '0' };
  }

  async downloadBytes(): Promise<Uint8Array> {
    throw new Error('Unexpected blob download.');
  }
}

class DownloadRemote implements SyncObjectStore {
  constructor(private readonly bytes: Uint8Array) {}

  async downloadBytes(): Promise<Uint8Array> {
    return this.bytes.slice();
  }

  async findOpaqueObject(): Promise<DriveFile | null> {
    return null;
  }

  async createResumableObjectUpload(): Promise<string> {
    throw new Error('Unexpected upload.');
  }

  async uploadResumableChunk() {
    throw new Error('Unexpected upload.');
  }

  async putImmutableSyncObject(): Promise<DriveFile> {
    throw new Error('Unexpected metadata upload.');
  }

  async getSyncObject(): Promise<Uint8Array> {
    throw new Error('Unexpected metadata download.');
  }

  async listSyncObjects(): Promise<SyncObjectRef[]> {
    return [];
  }

  async getStartPageToken(): Promise<string> {
    return '0';
  }

  async listChangedSyncObjects() {
    return { objects: [], removedFileIds: [], newStartPageToken: '0' };
  }
}

const databaseName = 'paperflow-blob-transfer-test';
const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');
let database: PaperFlowDatabase;

beforeEach(async () => {
  await Dexie.delete(databaseName);
  database = new PaperFlowDatabase(databaseName);
  await database.open();
  const root = new MemoryDirectoryHandle();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: async () => ({ quota: 100_000_000, usage: 0 }),
      getDirectory: async () => root as unknown as FileSystemDirectoryHandle,
    } satisfies Partial<StorageManager>,
  });
});

afterEach(async () => {
  vaultSession.lock();
  database.close();
  await Dexie.delete(databaseName);
  if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage);
  else Reflect.deleteProperty(navigator, 'storage');
});

describe('resumable encrypted PDF transfer', () => {
  it('continues from the persisted offset after an interrupted chunk', async () => {
    const hash = 'a'.repeat(64);
    await writeStoredPdf(hash, new Uint8Array([37, 80, 68, 70, 45, 49, 10, 11]));
    const document = {
      id: `document:paper-1:${hash}`,
      paperId: 'paper-1',
      contentHash: hash,
      name: 'paper.pdf',
      mimeType: 'application/pdf' as const,
      size: 8,
      localState: 'available' as const,
      remoteState: 'queued' as const,
      createdAt: 1,
      updatedAt: 1,
      version: { counter: 1, deviceId: 'device-a' },
    };
    await database.documents.put(document);
    await database.syncOps.put({
      id: 'device-a:1',
      deviceId: 'device-a',
      seq: 1,
      entityType: 'document',
      entityId: document.id,
      action: 'put',
      version: document.version,
      payload: document,
      createdAt: 1,
      state: 'pending',
    });
    const remote = new InterruptingRemote();
    const transfer = new BlobTransfer(database, remote, 64);
    const key = new Uint8Array(32).fill(9);
    const vaultId = crypto.randomUUID();

    await expect(transfer.uploadQueuedDocuments(
      key,
      vaultId,
      new SyncBudget(60_000),
    )).rejects.toThrow('Simulated worker termination');
    const checkpoint = await database.syncCheckpoints.get(`blob-upload:${document.id}`);
    expect(checkpoint?.sessionUrl).toBe('https://upload.example/session');
    expect(checkpoint?.offset).toBeGreaterThan(0);
    expect((await database.documents.toArray()).filter((item) =>
      ['queued', 'uploading', 'error'].includes(item.remoteState))).toHaveLength(1);
    const resumeBudget = new SyncBudget(Number.MAX_SAFE_INTEGER);
    expect(resumeBudget.hasTime(2_000)).toBe(true);
    const opaqueName = await opaqueDriveFileName(key, vaultId, 'blob', hash);
    expect((await readEncryptedUpload(opaqueName)).byteLength).toBeGreaterThan(checkpoint?.offset || 0);

    const resumed = await transfer.uploadQueuedDocuments(
      key,
      vaultId,
      resumeBudget,
    );
    expect(resumed).toBe(1);
    expect(remote.sessions).toBe(1);
    expect((await database.documents.get(document.id))?.remoteObjectId).toBe('remote-pdf');
    expect(await database.syncCheckpoints.get(`blob-upload:${document.id}`)).toBeUndefined();
    expect((await database.syncOps.get('device-a:1'))?.payload).toMatchObject({
      remoteState: 'available',
      remoteObjectId: 'remote-pdf',
    });
  });

  it('decrypts a remote PDF into OPFS when another device opens it', async () => {
    const hash = 'b'.repeat(64);
    const key = new Uint8Array(32).fill(4);
    const vaultId = crypto.randomUUID();
    const plaintext = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const encrypted = await encryptObject(key, vaultId, 'blob', hash, plaintext);
    const remote = new DownloadRemote(
      new TextEncoder().encode(serializeEncryptedObject(encrypted)),
    );
    const document = {
      id: `document:paper-2:${hash}`,
      paperId: 'paper-2',
      contentHash: hash,
      name: 'restored.pdf',
      mimeType: 'application/pdf' as const,
      size: plaintext.byteLength,
      localState: 'missing' as const,
      remoteState: 'available' as const,
      remoteObjectId: 'remote-pdf',
      createdAt: 1,
      updatedAt: 1,
      version: { counter: 2, deviceId: 'device-b' },
    };
    await database.documents.put(document);

    vaultSession.unlock(vaultId, key);
    const restored = await downloadCloudDocumentForPaper(
      document.paperId,
      remote,
      database,
    );

    expect([...restored?.data || []]).toEqual([...plaintext]);
    expect([...await readStoredPdf(hash)]).toEqual([...plaintext]);
    expect(await database.documents.get(document.id)).toMatchObject({
      localState: 'available',
      remoteState: 'available',
      remoteObjectId: 'remote-pdf',
    });
  });
});
