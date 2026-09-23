import { database, openPaperFlowDatabase, type PaperFlowDatabase } from '../db/PaperFlowDatabase';
import type { PersistedMessage } from '../db/schema';
import type {
  Annotation,
  Message,
  PaperChunk,
  PaperInfo,
  PaperMemory,
  PaperSelection,
  PaperSyncField,
  Thread,
} from '../types';
import { versionAndRecord } from '../repositories/versioning';
import { aliasesForPaper } from './paper';

const LEGACY_MIGRATION_KEY = 'paperflow:indexeddb-migrated:';
const SYNC_SETTING_ALLOWLIST = new Set([
  'uiLanguage',
  'promptLanguage',
  'theme',
  'paperMemoryEnabled',
]);

function paperFieldVersions(
  paper: PaperInfo,
  version: { counter: number; deviceId: string },
  fields: PaperSyncField[],
): PaperInfo['fieldVersions'] {
  const fieldVersions = { ...paper.fieldVersions };
  for (const field of fields) fieldVersions[field] = version;
  return fieldVersions;
}

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
    .filter((message) => !message.deletedAt)
    .sort((left, right) => left.sequence - right.sequence)
    .map(({ sequence: _sequence, ...message }) => message);
}

export async function loadPaperChunks(paperId: string): Promise<PaperChunk[]> {
  const db = await openPaperFlowDatabase();
  return db.paperChunks
    .where('paperId')
    .equals(paperId)
    .sortBy('page');
}

export async function cachePaperChunks(
  paperId: string,
  chunks: PaperChunk[],
): Promise<PaperChunk[]> {
  const db = await openPaperFlowDatabase();
  const now = Date.now();
  const records = chunks.map((chunk) => ({
    ...chunk,
    paperId,
    source: 'text-layer' as const,
    updatedAt: now,
  }));
  await db.transaction('rw', db.paperChunks, async () => {
    const oldTextChunks = await db.paperChunks
      .where('paperId')
      .equals(paperId)
      .filter((chunk) => chunk.source !== 'ocr')
      .toArray();
    await db.paperChunks.bulkDelete(oldTextChunks.map((chunk) => chunk.id));
    await db.paperChunks.bulkPut(records);
  });
  return records;
}

export async function saveMessages(paperId: string, threadId: string, messages: Message[]) {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.papers, db.messages, db.threads, db.syncState, db.syncOps, async () => {
    const paper = await db.papers.get(paperId);
    const shouldSync = paper?.libraryState === 'saved';
    const existing = await db.messages.where('threadId').equals(threadId).toArray();
    const nextIds = new Set(messages.map((message) => message.id));
    for (const removed of existing.filter((message) => !message.deletedAt && !nextIds.has(message.id))) {
      if (!shouldSync) {
        await db.messages.delete(removed.id);
        continue;
      }
      const now = Date.now();
      const mutation = await versionAndRecord(
        db,
        'message',
        removed.id,
        'delete',
        removed,
        removed.version,
      );
      const tombstone = { ...removed, deletedAt: now, updatedAt: now, version: mutation.version };
      await db.messages.put(tombstone);
      await db.syncOps.update(mutation.operation.id, { payload: tombstone });
    }
    const persisted = messages.filter((message) => !message.pending);
    for (const [sequence, message] of persisted.entries()) {
      const current = existing.find((item) => item.id === message.id);
      const unchanged = current
        && !current.deletedAt
        && current.content === message.content
        && current.sequence === sequence
        && current.feedback === message.feedback
        && current.saved === message.saved
        && JSON.stringify(current.tags || []) === JSON.stringify(message.tags || []);
      if (unchanged) continue;
      const now = Date.now();
      let version = current?.version;
      let operationId: string | undefined;
      if (shouldSync) {
        const mutation = await versionAndRecord(
          db,
          'message',
          message.id,
          'put',
          message,
          current?.version,
        );
        version = mutation.version;
        operationId = mutation.operation.id;
      }
      const record: PersistedMessage = {
        ...message,
        paperId,
        threadId,
        sequence,
        createdAt: message.createdAt || now + sequence,
        updatedAt: now,
        version,
        deletedAt: undefined,
      };
      await db.messages.put(record);
      if (operationId) await db.syncOps.update(operationId, { payload: record });
    }
    const thread = await db.threads.get(threadId);
    if (thread) {
      const firstQuestion = messages.find((message) => message.role === 'user')?.content.trim();
      const next = {
        ...thread,
        title: firstQuestion?.slice(0, 96) || thread.title,
        updatedAt: Date.now(),
      };
      if (shouldSync && (next.title !== thread.title || !thread.version)) {
        const mutation = await versionAndRecord(
          db,
          'thread',
          thread.id,
          'put',
          next,
          thread.version,
        );
        const versioned = { ...next, version: mutation.version };
        await db.threads.put(versioned);
        await db.syncOps.update(mutation.operation.id, { payload: versioned });
      } else {
        await db.threads.put(next);
      }
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
  const thread = await db.transaction('rw', db.papers, db.threads, db.syncState, db.syncOps, async () => {
    const paper = await db.papers.get(paperId);
    const id = crypto.randomUUID();
    const mutation = paper?.libraryState === 'saved'
      ? await versionAndRecord(db, 'thread', id, 'put', undefined)
      : undefined;
    const created: Thread = {
      id,
      paperId,
      title: 'Paper conversation',
      date: new Date(now).toISOString(),
      createdAt: now,
      updatedAt: now,
      active: true,
      version: mutation?.version,
    };
    await db.threads.put(created);
    if (mutation) await db.syncOps.update(mutation.operation.id, { payload: created });
    return created;
  });
  await updateReadingState(paperId, { activeThreadId: thread.id });
  return thread;
}

export async function loadPaperMemory(paperId: string) {
  const db = await openPaperFlowDatabase();
  return db.paperMemory.where('paperId').equals(paperId).first();
}

export async function savePaperMemory(paperId: string, content: string) {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.papers, db.paperMemory, db.syncState, db.syncOps, async () => {
    const [paper, current] = await Promise.all([
      db.papers.get(paperId),
      db.paperMemory.where('paperId').equals(paperId).first(),
    ]);
    const now = Date.now();
    const id = `memory:${paperId}`;
    const mutation = paper?.libraryState === 'saved'
      ? await versionAndRecord(db, 'paperMemory', id, 'put', undefined, current?.version)
      : undefined;
    const memory: PaperMemory = {
      id,
      paperId,
      content,
      updatedAt: now,
      version: mutation?.version || current?.version,
    };
    await db.paperMemory.put(memory);
    if (mutation) await db.syncOps.update(mutation.operation.id, { payload: memory });
  });
}

export async function saveSelection(selection: PaperSelection) {
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.papers, db.selections, db.syncState, db.syncOps, async () => {
    const [paper, current] = await Promise.all([
      db.papers.get(selection.paperId),
      db.selections.get(selection.id),
    ]);
    const mutation = paper?.libraryState === 'saved'
      ? await versionAndRecord(db, 'selection', selection.id, 'put', selection, current?.version)
      : undefined;
    const next = {
      ...selection,
      updatedAt: selection.updatedAt || selection.createdAt,
      version: mutation?.version || current?.version,
    };
    await db.selections.put(next);
    if (mutation) await db.syncOps.update(mutation.operation.id, { payload: next });
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
  await db.transaction('rw', db.papers, db.syncState, db.syncOps, async () => {
    const current = await db.papers.get(paperId);
    if (!current) return;
    const now = Date.now();
    const next = { ...current, ...patch, accessedAt: now, updatedAt: now };
    if (current.libraryState !== 'saved') {
      await db.papers.put(next);
      return;
    }
    const mutation = await versionAndRecord(
      db,
      'paper',
      paperId,
      'put',
      next,
      current.version,
    );
    const fields = (['lastPage', 'zoom', 'panelWidth', 'activeThreadId'] as const)
      .filter((field) => patch[field] !== undefined);
    const versioned = {
      ...next,
      version: mutation.version,
      fieldVersions: paperFieldVersions(current, mutation.version, [...fields]),
    };
    await db.papers.put(versioned);
    await db.syncOps.update(mutation.operation.id, { payload: versioned });
  });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await openPaperFlowDatabase();
  const record = await db.settings.get(key);
  return (record?.value as T | undefined) ?? fallback;
}

export async function setSetting<T>(key: string, value: T, scope: 'local' | 'sync' = 'local') {
  if (scope === 'sync' && !SYNC_SETTING_ALLOWLIST.has(key)) {
    throw new Error(`Setting "${key}" is device-local and cannot be synchronized.`);
  }
  const db = await openPaperFlowDatabase();
  await db.transaction('rw', db.settings, db.syncState, db.syncOps, async () => {
    const current = await db.settings.get(key);
    const now = Date.now();
    const mutation = scope === 'sync'
      ? await versionAndRecord(db, 'setting', key, 'put', undefined, current?.version)
      : undefined;
    const setting = {
      key,
      value,
      scope,
      updatedAt: now,
      version: mutation?.version || current?.version,
    };
    await db.settings.put(setting);
    if (mutation) await db.syncOps.update(mutation.operation.id, { payload: setting });
  });
}

export async function queuePaperWorkspaceForSync(paperId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  await db.transaction(
    'rw',
    [
      db.papers,
      db.paperAliases,
      db.threads,
      db.messages,
      db.paperMemory,
      db.selections,
      db.syncState,
      db.syncOps,
    ],
    async () => {
      const paper = await db.papers.get(paperId);
      if (paper?.libraryState !== 'saved') return;
      const [aliases, threads, messages, memories, selections] = await Promise.all([
        db.paperAliases.where('paperId').equals(paperId).toArray(),
        db.threads.where('paperId').equals(paperId).toArray(),
        db.messages.where('paperId').equals(paperId).toArray(),
        db.paperMemory.where('paperId').equals(paperId).toArray(),
        db.selections.where('paperId').equals(paperId).toArray(),
      ]);
      const queue = async (
        entityType: 'thread' | 'message' | 'paperMemory' | 'selection',
        item: { id: string; version?: { counter: number; deviceId: string }; deletedAt?: number },
      ) => {
        if (item.version && item.version.deviceId !== 'legacy-v1') return;
        const mutation = await versionAndRecord(
          db,
          entityType,
          item.id,
          item.deletedAt ? 'delete' : 'put',
          item,
          item.version,
        );
        const versioned = { ...item, version: mutation.version };
        if (entityType === 'thread') await db.threads.put(versioned as Thread);
        if (entityType === 'message') await db.messages.put(versioned as PersistedMessage);
        if (entityType === 'paperMemory') await db.paperMemory.put(versioned as PaperMemory);
        if (entityType === 'selection') await db.selections.put(versioned as PaperSelection);
        await db.syncOps.update(mutation.operation.id, { payload: versioned });
      };
      for (const alias of aliases) {
        if (alias.version && alias.version.deviceId !== 'legacy-v1') continue;
        const mutation = await versionAndRecord(
          db,
          'paperAlias',
          alias.alias,
          alias.deletedAt ? 'delete' : 'put',
          alias,
          alias.version,
        );
        const versioned = {
          ...alias,
          createdAt: alias.createdAt || Date.now(),
          updatedAt: Date.now(),
          version: mutation.version,
        };
        await db.paperAliases.put(versioned);
        await db.syncOps.update(mutation.operation.id, { payload: versioned });
      }
      for (const thread of threads) await queue('thread', thread);
      for (const message of messages) await queue('message', message);
      for (const memory of memories) await queue('paperMemory', memory);
      for (const selection of selections) await queue('selection', selection);
    },
  );
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
