import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  StorageQuotaError,
  assertStorageCapacity,
  hasStoredPdf,
  readStoredPdf,
  writeStoredPdf,
} from '../../src/services/storage/opfs';

class MemoryFileHandle {
  private bytes = new Uint8Array();

  constructor(readonly name: string) {}

  async createWritable(): Promise<FileSystemWritableFileStream> {
    return {
      write: async (value: FileSystemWriteChunkType) => {
        if (value instanceof Uint8Array) this.bytes = value.slice();
        else if (value instanceof ArrayBuffer) this.bytes = new Uint8Array(value.slice(0));
        else if (value instanceof Blob) this.bytes = new Uint8Array(await value.arrayBuffer());
        else throw new Error('Unsupported test write type.');
      },
      close: async () => undefined,
    } as unknown as FileSystemWritableFileStream;
  }

  async getFile(): Promise<File> {
    return new File([this.bytes], this.name, { type: 'application/pdf' });
  }
}

class MemoryDirectoryHandle {
  readonly files = new Map<string, MemoryFileHandle>();
  readonly directories = new Map<string, MemoryDirectoryHandle>();

  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle> {
    const current = this.directories.get(name);
    if (current) return current as unknown as FileSystemDirectoryHandle;
    if (!options?.create) throw new DOMException('Missing directory.', 'NotFoundError');
    const directory = new MemoryDirectoryHandle();
    this.directories.set(name, directory);
    return directory as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle> {
    const current = this.files.get(name);
    if (current) return current as unknown as FileSystemFileHandle;
    if (!options?.create) throw new DOMException('Missing file.', 'NotFoundError');
    const file = new MemoryFileHandle(name);
    this.files.set(name, file);
    return file as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name) && !this.directories.delete(name)) {
      throw new DOMException('Missing entry.', 'NotFoundError');
    }
  }
}

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');
let root: MemoryDirectoryHandle;

function installStorage(quota = 100_000_000, usage = 0): void {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      estimate: async () => ({ quota, usage }),
      getDirectory: async () => root as unknown as FileSystemDirectoryHandle,
    } satisfies Partial<StorageManager>,
  });
}

beforeEach(() => {
  root = new MemoryDirectoryHandle();
  installStorage();
});

afterEach(() => {
  if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage);
  else Reflect.deleteProperty(navigator, 'storage');
});

describe('OPFS PDF storage', () => {
  it('stores one physical file for repeated content hashes', async () => {
    const hash = 'a'.repeat(64);
    const data = new Uint8Array([37, 80, 68, 70, 45, 49]);
    await writeStoredPdf(hash, data);
    await writeStoredPdf(hash, data);

    expect(await hasStoredPdf(hash)).toBe(true);
    expect(await readStoredPdf(hash)).toEqual(data);
    expect(root.directories.get('papers')?.files.size).toBe(1);
  });

  it('reports missing files and insufficient quota as recoverable errors', async () => {
    await expect(readStoredPdf('b'.repeat(64))).rejects.toThrow(/missing/i);
    installStorage(1024, 1000);
    await expect(assertStorageCapacity(10_000)).rejects.toBeInstanceOf(StorageQuotaError);
  });
});
