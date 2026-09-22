import { database, openPaperFlowDatabase, type PaperFlowDatabase } from '../db/PaperFlowDatabase';
import type { PersistedMessage } from '../db/schema';
import type {
  Annotation,
  Message,
  PaperInfo,
  PaperMemory,
  PaperSelection,
  Thread,
} from '../types';
import { aliasesForPaper } from './paper';

const LEGACY_MIGRATION_KEY = 'paperflow:indexeddb-migrated:';

export function openDatabase(): Promise<PaperFlowDatabase> {
  return openPaperFlowDatabase();
}

export async function openPaperWorkspace(input: PaperInfo) {
  const db = await openPaperFlowDatabase();
  const aliases = aliasesForPaper(input);
  const existingAliases = await db.paperAliases.bulkGet(aliases.map((alias) => alias.alias));
  const existingId = existingAliases.find(Boolean)?.paperId;
  const id = existingId || input.id;
  const current = await db.papers.get(id);
  const now = Date.now();
  const paper: PaperInfo = {
    ...current,
    ...input,
    id,
    currentPage: input.currentPage ?? current?.currentPage ?? current?.lastPage ?? 1,
    libraryState: current?.libraryState || input.libraryState || 'temporary',
    favorite: current?.favorite ?? input.favorite ?? false,
    readStatus: current?.readStatus || input.readStatus || 'unread',
    createdAt: current?.createdAt || now,
    accessedAt: now,
    updatedAt: now,
    version: current?.version,
  };

  let threadId = paper.activeThreadId;
  await db.transaction('rw', db.papers, db.paperAliases, db.threads, async () => {
    await db.papers.put(paper);
    await db.paperAliases.bulkPut(aliases.map((alias) => ({ ...alias, paperId: id })));
    if (!threadId) {
      threadId = crypto.randomUUID();
      const thread: Thread = {
        id: threadId,
        paperId: id,
        title: 'Paper conversation',
        date: new Date(now).toISOString(),
        createdAt: now,
        updatedAt: now,
        active: true,
      };
      await db.threads.put(thread);
      paper.activeThreadId = threadId;
      await db.papers.put(paper);
    }
  });

  if (!threadId) throw new Error('Failed to create a paper thread.');
  await migrateLegacyPaperData(paper, threadId);
  return { paper, threadId };
}

export async function loadMessages(threadId: string): Promise<Message[]> {
  const db = await openPaperFlowDatabase();
  const records = await db.messages.where('threadId').equals(threadId).toArray();
  return records
    .sort((left, right) => left.sequence - right.sequence)
    .map(({ sequence: _sequence, ...message }) => message);
}

export async function saveMessages(paperId: string, threadId: string, messages: Message[]) {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.messages, db.threads, async () => {
    const existing = await db.messages.where('threadId').equals(threadId).toArray();
    const nextIds = new Set(messages.map((message) => message.id));
    await db.messages.bulkDelete(existing.filter((message) => !nextIds.has(message.id)).map((message) => message.id));
    const persisted = messages
      .filter((message) => !message.pending)
      .map((message, sequence): PersistedMessage => ({
        ...message,
        paperId,
        threadId,
        sequence,
        createdAt: message.createdAt || Date.now() + sequence,
      }));
    await db.messages.bulkPut(persisted);
    const thread = await db.threads.get(threadId);
    if (thread) {
      const firstQuestion = messages.find((message) => message.role === 'user')?.content.trim();
      await db.threads.put({
        ...thread,
        title: firstQuestion?.slice(0, 96) || thread.title,
        updatedAt: Date.now(),
      });
    }
  });
}

export async function listThreads(paperId: string): Promise<Thread[]> {
  const db = await openPaperFlowDatabase();
  const result = await db.threads.where('paperId').equals(paperId).toArray();
  return result
    .filter((thread) => !thread.deletedAt)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function createThread(paperId: string) {
  const db = await openPaperFlowDatabase();
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
  await db.threads.put(thread);
  await updateReadingState(paperId, { activeThreadId: thread.id });
  return thread;
}

export async function loadPaperMemory(paperId: string) {
  const db = await openPaperFlowDatabase();
  return db.paperMemory.where('paperId').equals(paperId).first();
}

export async function savePaperMemory(paperId: string, content: string) {
  const db = await openPaperFlowDatabase();
  const current = await db.paperMemory.where('paperId').equals(paperId).first();
  const now = Date.now();
  await db.paperMemory.put({
    id: `memory:${paperId}`,
    paperId,
    content,
    updatedAt: now,
    version: current?.version,
  } satisfies PaperMemory);
}

export async function saveSelection(selection: PaperSelection) {
  const db = await openPaperFlowDatabase();
  await db.selections.put({
    ...selection,
    updatedAt: selection.updatedAt || selection.createdAt,
  });
}

export async function saveAnnotation(annotation: Annotation) {
  const db = await openPaperFlowDatabase();
  await db.annotations.put({
    ...annotation,
    type: annotation.type || 'highlight',
    updatedAt: annotation.updatedAt || annotation.createdAt,
  });
}

export async function loadAnnotations(paperId: string): Promise<Annotation[]> {
  const db = await openPaperFlowDatabase();
  return (await db.annotations.where('paperId').equals(paperId).toArray())
    .filter((annotation) => !annotation.deletedAt)
    .sort((left, right) => left.page - right.page || left.createdAt - right.createdAt);
}

export async function updateReadingState(
  paperId: string,
  patch: Pick<PaperInfo, 'lastPage' | 'zoom' | 'panelWidth' | 'activeThreadId'>,
) {
  const db = await openPaperFlowDatabase();
  const current = await db.papers.get(paperId);
  if (current) {
    await db.papers.put({ ...current, ...patch, accessedAt: Date.now(), updatedAt: Date.now() });
  }
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await openPaperFlowDatabase();
  const record = await db.settings.get(key);
  return (record?.value as T | undefined) ?? fallback;
}

export async function setSetting<T>(key: string, value: T) {
  const db = await openPaperFlowDatabase();
  await db.settings.put({ key, value, scope: 'local', updatedAt: Date.now() });
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

export { database };
