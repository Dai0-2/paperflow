const ROOT_DIRECTORY = 'papers';
const MINIMUM_HEADROOM = 5 * 1024 * 1024;

export class OpfsUnavailableError extends Error {
  constructor() {
    super('Offline PDF storage is unavailable in this browser context.');
    this.name = 'OpfsUnavailableError';
  }
}

export class StorageQuotaError extends Error {
  constructor(required: number, available: number) {
    super(`Not enough browser storage. PaperFlow needs ${formatBytes(required)}, but only ${formatBytes(Math.max(0, available))} is available.`);
    this.name = 'StorageQuotaError';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function assertHash(contentHash: string): void {
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) throw new Error('Invalid PDF content hash.');
}

async function rootDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) throw new OpfsUnavailableError();
  return navigator.storage.getDirectory();
}

async function papersDirectory(create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await rootDirectory();
  return root.getDirectoryHandle(ROOT_DIRECTORY, { create });
}

export async function storageEstimate(): Promise<{
  quota?: number;
  usage?: number;
  available?: number;
}> {
  const estimate = await navigator.storage?.estimate?.();
  const quota = estimate?.quota;
  const usage = estimate?.usage;
  return {
    quota,
    usage,
    available: quota === undefined || usage === undefined ? undefined : Math.max(0, quota - usage),
  };
}

export async function assertStorageCapacity(bytes: number): Promise<void> {
  const { available } = await storageEstimate();
  if (available === undefined) return;
  const required = bytes + Math.max(MINIMUM_HEADROOM, Math.ceil(bytes * 0.1));
  if (available < required) throw new StorageQuotaError(required, available);
}

export async function hasStoredPdf(contentHash: string): Promise<boolean> {
  assertHash(contentHash);
  try {
    const directory = await papersDirectory(false);
    await directory.getFileHandle(`${contentHash}.pdf`);
    return true;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'NotFoundError') return false;
    if (reason instanceof OpfsUnavailableError) return false;
    throw reason;
  }
}

export async function writeStoredPdf(contentHash: string, data: Uint8Array): Promise<void> {
  assertHash(contentHash);
  if (await hasStoredPdf(contentHash)) return;
  // The temporary file and final file coexist briefly to avoid exposing partial writes.
  await assertStorageCapacity(data.byteLength * 2);
  const directory = await papersDirectory(true);
  const temporaryName = `${contentHash}.${crypto.randomUUID()}.tmp`;
  const temporary = await directory.getFileHandle(temporaryName, { create: true });
  try {
    const writable = await temporary.createWritable();
    await writable.write(data.slice());
    await writable.close();
    const temporaryFile = await temporary.getFile();
    if (temporaryFile.size !== data.byteLength) throw new Error('The offline PDF write was incomplete.');

    const target = await directory.getFileHandle(`${contentHash}.pdf`, { create: true });
    const targetWritable = await target.createWritable();
    await targetWritable.write(await temporaryFile.arrayBuffer());
    await targetWritable.close();
  } finally {
    await directory.removeEntry(temporaryName).catch(() => undefined);
  }
}

export async function readStoredPdf(contentHash: string): Promise<Uint8Array> {
  assertHash(contentHash);
  try {
    const directory = await papersDirectory(false);
    const handle = await directory.getFileHandle(`${contentHash}.pdf`);
    const file = await handle.getFile();
    if (!file.size) throw new Error('The offline PDF is empty.');
    return new Uint8Array(await file.arrayBuffer());
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'NotFoundError') {
      throw new Error('The offline PDF file is missing. Reopen the source URL to restore it.');
    }
    throw reason;
  }
}

export async function deleteStoredPdf(contentHash: string): Promise<void> {
  assertHash(contentHash);
  try {
    const directory = await papersDirectory(false);
    await directory.removeEntry(`${contentHash}.pdf`);
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'NotFoundError') return;
    throw reason;
  }
}
