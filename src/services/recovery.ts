import { DATABASE_NAME } from '../db/PaperFlowDatabase';

export interface RawDatabaseExport {
  format: 'paperflow-raw-recovery';
  exportedAt: string;
  database: string;
  version: number;
  stores: Record<string, unknown[]>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB export aborted.'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB export failed.'));
  });
}

export async function exportRawDatabase(
  databaseName = DATABASE_NAME,
): Promise<RawDatabaseExport> {
  if ('databases' in indexedDB) {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === databaseName)) {
      throw new Error('No PaperFlow database was found in this browser profile.');
    }
  }

  const database = await requestResult(indexedDB.open(databaseName));
  try {
    const storeNames = Array.from(database.objectStoreNames);
    const transaction = database.transaction(storeNames, 'readonly');
    const completed = transactionComplete(transaction);
    const stores: Record<string, unknown[]> = {};
    await Promise.all(storeNames.map(async (storeName) => {
      stores[storeName] = await requestResult(transaction.objectStore(storeName).getAll());
    }));
    await completed;
    return {
      format: 'paperflow-raw-recovery',
      exportedAt: new Date().toISOString(),
      database: databaseName,
      version: database.version,
      stores,
    };
  } finally {
    database.close();
  }
}

export function downloadRawDatabaseExport(data: RawDatabaseExport): void {
  const replacer = (_key: string, value: unknown): unknown => {
    if (value instanceof Blob) {
      return { type: value.type, size: value.size, omittedBinaryBlob: true };
    }
    if (value instanceof ArrayBuffer) {
      return { byteLength: value.byteLength, omittedBinaryBuffer: true };
    }
    return value;
  };
  const blob = new Blob([JSON.stringify(data, replacer, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `paperflow-recovery-${Date.now()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
