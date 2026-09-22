import type {
  Annotation,
  Message,
  PaperAlias,
  PaperInfo,
  PaperMemory,
  PaperSelection,
  Thread,
} from '../types';
import { aliasesForPaper } from './paper';

const DATABASE_NAME = 'paperflow-ai';
const DATABASE_VERSION = 1;
const LEGACY_MIGRATION_KEY = 'paperflow:indexeddb-migrated:';

type StoreName =
  | 'papers'
  | 'paperAliases'
  | 'threads'
  | 'messages'
  | 'paperMemory'
  | 'selections'
  | 'annotations'
  | 'settings';

interface SettingRecord {
  key: string;
  value: unknown;
}

interface PersistedMessage extends Message {
  paperId: string;
  threadId: string;
  sequence: number;
}

let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const papers = database.createObjectStore('papers', { keyPath: 'id' });
      papers.createIndex('updatedAt', 'updatedAt');

      const aliases = database.createObjectStore('paperAliases', { keyPath: 'alias' });
      aliases.createIndex('paperId', 'paperId');

      const threads = database.createObjectStore('threads', { keyPath: 'id' });
      threads.createIndex('paperId', 'paperId');
      threads.createIndex('updatedAt', 'updatedAt');

      const messages = database.createObjectStore('messages', { keyPath: 'id' });
      messages.createIndex('paperId', 'paperId');
      messages.createIndex('threadId', 'threadId');

      const memory = database.createObjectStore('paperMemory', { keyPath: 'id' });
      memory.createIndex('paperId', 'paperId', { unique: true });

      const selections = database.createObjectStore('selections', { keyPath: 'id' });
      selections.createIndex('paperId', 'paperId');

      const annotations = database.createObjectStore('annotations', { keyPath: 'id' });
      annotations.createIndex('paperId', 'paperId');

      database.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function resolvePaperId(database: IDBDatabase, aliases: PaperAlias[]) {
  const transaction = database.transaction('paperAliases', 'readonly');
  const store = transaction.objectStore('paperAliases');
  const existing = await Promise.all(
    aliases.map((alias) => requestResult<PaperAlias | undefined>(store.get(alias.alias))),
  );
  return existing.find(Boolean)?.paperId;
}

export async function openPaperWorkspace(input: PaperInfo) {
  const database = await openDatabase();
  const aliases = aliasesForPaper(input);
  const existingId = await resolvePaperId(database, aliases);
  const id = existingId || input.id;
  const readTransaction = database.transaction('papers', 'readonly');
  const current = await requestResult<PaperInfo | undefined>(readTransaction.objectStore('papers').get(id));
  const paper: PaperInfo = {
    ...current,
    ...input,
    id,
    currentPage: input.currentPage ?? current?.currentPage ?? current?.lastPage ?? 1,
    updatedAt: Date.now(),
  };
  const transaction = database.transaction(['papers', 'paperAliases', 'threads'], 'readwrite');
  const paperStore = transaction.objectStore('papers');
  paperStore.put(paper);
  const aliasStore = transaction.objectStore('paperAliases');
  for (const alias of aliases) aliasStore.put({ ...alias, paperId: id });

  let threadId = paper.activeThreadId;
  if (!threadId) {
    threadId = crypto.randomUUID();
    const now = Date.now();
    const thread: Thread = {
      id: threadId,
      paperId: id,
      title: 'Paper conversation',
      date: new Date(now).toISOString(),
      createdAt: now,
      updatedAt: now,
      active: true,
    };
    transaction.objectStore('threads').put(thread);
    paper.activeThreadId = threadId;
    paperStore.put(paper);
  }
  await transactionDone(transaction);
  await migrateLegacyPaperData(paper, threadId);
  return { paper, threadId };
}

export async function loadMessages(threadId: string): Promise<Message[]> {
  const database = await openDatabase();
  const transaction = database.transaction('messages', 'readonly');
  const index = transaction.objectStore('messages').index('threadId');
  const records = await requestResult<PersistedMessage[]>(index.getAll(threadId));
  return records
    .sort((left, right) => left.sequence - right.sequence)
    .map(({ sequence: _sequence, ...message }) => message);
}

export async function saveMessages(paperId: string, threadId: string, messages: Message[]) {
  const database = await openDatabase();
  const existingTransaction = database.transaction('messages', 'readonly');
  const existing = await requestResult<PersistedMessage[]>(
    existingTransaction.objectStore('messages').index('threadId').getAll(threadId),
  );
  const threadReadTransaction = database.transaction('threads', 'readonly');
  const thread = await requestResult<Thread | undefined>(
    threadReadTransaction.objectStore('threads').get(threadId),
  );
  const transaction = database.transaction(['messages', 'threads'], 'readwrite');
  const store = transaction.objectStore('messages');
  const nextIds = new Set(messages.map((message) => message.id));
  for (const message of existing) {
    if (!nextIds.has(message.id)) store.delete(message.id);
  }
  messages.filter((message) => !message.pending).forEach((message, sequence) => {
    store.put({
      ...message,
      paperId,
      threadId,
      sequence,
      createdAt: message.createdAt || Date.now() + sequence,
    } satisfies PersistedMessage);
  });
  if (thread) {
    const firstQuestion = messages.find((message) => message.role === 'user')?.content.trim();
    transaction.objectStore('threads').put({
      ...thread,
      title: firstQuestion?.slice(0, 96) || thread.title,
      updatedAt: Date.now(),
    });
  }
  await transactionDone(transaction);
}

export async function listThreads(paperId: string): Promise<Thread[]> {
  const database = await openDatabase();
  const transaction = database.transaction('threads', 'readonly');
  const result = await requestResult<Thread[]>(
    transaction.objectStore('threads').index('paperId').getAll(paperId),
  );
  return result.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function createThread(paperId: string) {
  const database = await openDatabase();
  const now = Date.now();
  const thread: Thread = {
    id: crypto.randomUUID(),
    paperId,
    title: 'Paper conversation',
    date: new Date(now).toISOString(),
    createdAt: now,
    updatedAt: now,
    active: true,
  };
  const transaction = database.transaction('threads', 'readwrite');
  transaction.objectStore('threads').put(thread);
  await transactionDone(transaction);
  await updateReadingState(paperId, { activeThreadId: thread.id });
  return thread;
}

export async function loadPaperMemory(paperId: string) {
  const database = await openDatabase();
  const transaction = database.transaction('paperMemory', 'readonly');
  return requestResult<PaperMemory | undefined>(
    transaction.objectStore('paperMemory').index('paperId').get(paperId),
  );
}

export async function savePaperMemory(paperId: string, content: string) {
  const database = await openDatabase();
  const transaction = database.transaction('paperMemory', 'readwrite');
  transaction.objectStore('paperMemory').put({
    id: `memory:${paperId}`,
    paperId,
    content,
    updatedAt: Date.now(),
  } satisfies PaperMemory);
  await transactionDone(transaction);
}

export async function saveSelection(selection: PaperSelection) {
  const database = await openDatabase();
  const transaction = database.transaction('selections', 'readwrite');
  transaction.objectStore('selections').put(selection);
  await transactionDone(transaction);
}

export async function saveAnnotation(annotation: Annotation) {
  const database = await openDatabase();
  const transaction = database.transaction('annotations', 'readwrite');
  transaction.objectStore('annotations').put(annotation);
  await transactionDone(transaction);
}

export async function updateReadingState(
  paperId: string,
  patch: Pick<PaperInfo, 'lastPage' | 'zoom' | 'panelWidth' | 'activeThreadId'>,
) {
  const database = await openDatabase();
  const readTransaction = database.transaction('papers', 'readonly');
  const current = await requestResult<PaperInfo | undefined>(readTransaction.objectStore('papers').get(paperId));
  const transaction = database.transaction('papers', 'readwrite');
  const store = transaction.objectStore('papers');
  if (current) store.put({ ...current, ...patch, updatedAt: Date.now() });
  await transactionDone(transaction);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction('settings', 'readonly');
  const record = await requestResult<SettingRecord | undefined>(
    transaction.objectStore('settings').get(key),
  );
  return (record?.value as T | undefined) ?? fallback;
}

export async function setSetting<T>(key: string, value: T) {
  const database = await openDatabase();
  const transaction = database.transaction('settings', 'readwrite');
  transaction.objectStore('settings').put({ key, value } satisfies SettingRecord);
  await transactionDone(transaction);
}

async function migrateLegacyPaperData(paper: PaperInfo, threadId: string) {
  const migrationKey = `${LEGACY_MIGRATION_KEY}${paper.id}`;
  if (localStorage.getItem(migrationKey) === 'done') return;
  const legacyMessages = localStorage.getItem(`paperflow:messages:${paper.id}`);
  const legacyMemory = localStorage.getItem(`paperflow:notes:${paper.id}`);
  try {
    if (legacyMessages) {
      const messages = JSON.parse(legacyMessages) as Message[];
      await saveMessages(paper.id, threadId, messages);
      localStorage.removeItem(`paperflow:messages:${paper.id}`);
    }
    if (legacyMemory) {
      await savePaperMemory(paper.id, legacyMemory);
      localStorage.removeItem(`paperflow:notes:${paper.id}`);
    }
    localStorage.setItem(migrationKey, 'done');
  } catch {
    // Keep legacy data untouched if migration cannot be completed.
  }
}
