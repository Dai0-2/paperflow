import type { PersistedMessage } from '../db/schema';
import type { PaperFlowDatabase } from '../db/PaperFlowDatabase';
import type {
  Annotation,
  Collection,
  CollectionItem,
  EntityVersion,
  PaperAlias,
  PaperDocument,
  PaperInfo,
  PaperMemory,
  PaperNote,
  PaperSelection,
  PaperSyncField,
  PaperTag,
  SettingRecord,
  SyncConflict,
  SyncOperation,
  Tag,
  Thread,
} from '../types';
import { LOCAL_SYNC_STATE_KEY } from './checkpoint';

type VersionedPayload = { version?: EntityVersion; deletedAt?: number };

export function compareVersions(left?: EntityVersion, right?: EntityVersion): number {
  if (!left) return right ? -1 : 0;
  if (!right) return 1;
  if (left.counter !== right.counter) return left.counter - right.counter;
  return left.deviceId.localeCompare(right.deviceId);
}

function payloadRecord(operation: SyncOperation): Record<string, unknown> {
  if (!operation.payload || typeof operation.payload !== 'object' || Array.isArray(operation.payload)) {
    throw new Error(`Sync operation ${operation.id} has no object payload.`);
  }
  return operation.payload as Record<string, unknown>;
}

function payloadWithId<T extends VersionedPayload & { id: string }>(
  operation: SyncOperation,
): T {
  const payload = payloadRecord(operation);
  if (payload.id !== operation.entityId) {
    throw new Error(`Sync operation ${operation.id} has a mismatched entity ID.`);
  }
  return { ...payload, version: operation.version } as T;
}

function mergePaper(current: PaperInfo | undefined, incoming: PaperInfo): PaperInfo {
  if (!current) return incoming;
  const incomingWins = compareVersions(incoming.version, current.version) > 0;
  const winner = incomingWins ? incoming : current;
  const loser = incomingWins ? current : incoming;
  const preferredMetadata = current.metadataSource === 'manual' && incoming.metadataSource !== 'manual'
    ? current
    : incoming.metadataSource === 'manual' && current.metadataSource !== 'manual'
      ? incoming
      : winner;
  const scalar = <K extends PaperSyncField>(field: K): PaperInfo[K] => {
    const currentVersion = current.fieldVersions?.[field] || current.version;
    const incomingVersion = incoming.fieldVersions?.[field] || incoming.version;
    return compareVersions(incomingVersion, currentVersion) > 0
      ? incoming[field]
      : current[field];
  };
  const fieldVersions = { ...current.fieldVersions, ...incoming.fieldVersions };
  for (const field of [
    'favorite',
    'readStatus',
    'libraryState',
    'lastPage',
    'zoom',
    'panelWidth',
    'activeThreadId',
  ] satisfies PaperSyncField[]) {
    const currentVersion = current.fieldVersions?.[field] || current.version;
    const incomingVersion = incoming.fieldVersions?.[field] || incoming.version;
    fieldVersions[field] = compareVersions(incomingVersion, currentVersion) > 0
      ? incomingVersion
      : currentVersion;
  }
  return {
    ...loser,
    ...winner,
    title: preferredMetadata.title || loser.title,
    shortTitle: preferredMetadata.shortTitle || loser.shortTitle,
    authors: preferredMetadata.authors || loser.authors,
    year: preferredMetadata.year || loser.year,
    abstract: preferredMetadata.abstract || loser.abstract,
    journal: preferredMetadata.journal || loser.journal,
    doi: current.doi || incoming.doi,
    arxivId: current.arxivId || incoming.arxivId,
    openReviewId: current.openReviewId || incoming.openReviewId,
    contentHash: winner.contentHash || loser.contentHash,
    metadataSource: preferredMetadata.metadataSource,
    favorite: scalar('favorite'),
    readStatus: scalar('readStatus'),
    libraryState: scalar('libraryState'),
    lastPage: scalar('lastPage'),
    zoom: scalar('zoom'),
    panelWidth: scalar('panelWidth'),
    activeThreadId: scalar('activeThreadId'),
    fieldVersions,
    version: winner.version,
    deletedAt: winner.deletedAt,
  };
}

function conflictId(noteId: string, version: EntityVersion): string {
  return `note-conflict:${noteId}:${version.deviceId}:${version.counter}`;
}

async function mergeNote(
  database: PaperFlowDatabase,
  operation: SyncOperation,
  incoming: PaperNote,
): Promise<void> {
  if (incoming.conflictOf) {
    const current = await database.notes.get(incoming.id);
    if (!current || compareVersions(incoming.version, current.version) > 0) {
      await database.notes.put(incoming);
    }
    const original = await database.notes.get(incoming.conflictOf);
    if (!(await database.syncConflicts.get(incoming.id))) {
      await database.syncConflicts.put({
        id: incoming.id,
        entityType: 'note',
        entityId: incoming.conflictOf,
        paperId: incoming.paperId,
        conflictCopyId: incoming.id,
        localVersion: original?.version || incoming.version,
        remoteVersion: incoming.version,
        createdAt: Date.now(),
      });
    }
    return;
  }
  const current = await database.notes.get(incoming.id);
  if (!current) {
    await database.notes.put(incoming);
    return;
  }
  const sameBase = operation.baseVersion
    && compareVersions(operation.baseVersion, current.version) === 0;
  const concurrent = current.version.deviceId !== incoming.version.deviceId
    && !sameBase
    && (current.content !== incoming.content || current.title !== incoming.title)
    && !current.conflictOf
    && !incoming.conflictOf;
  const incomingWins = compareVersions(incoming.version, current.version) > 0;

  if (concurrent) {
    const loser = incomingWins ? current : incoming;
    const winner = incomingWins ? incoming : current;
    const copyId = conflictId(incoming.id, loser.version);
    const existingCopy = await database.notes.get(copyId);
    if (!existingCopy) {
      const copy: PaperNote = {
        ...loser,
        id: copyId,
        title: `${loser.title} · Conflict copy · ${loser.version.deviceId.slice(0, 8)} · ${new Date(loser.updatedAt).toISOString()}`,
        conflictOf: incoming.id,
        deletedAt: undefined,
      };
      const conflict: SyncConflict = {
        id: copyId,
        entityType: 'note',
        entityId: incoming.id,
        paperId: loser.paperId,
        conflictCopyId: copyId,
        localVersion: current.version,
        remoteVersion: incoming.version,
        createdAt: Date.now(),
      };
      await database.notes.put(copy);
      await database.syncConflicts.put(conflict);
    }
    await database.notes.put(winner);
    return;
  }

  if (incomingWins) await database.notes.put(incoming);
}

async function applyEntity(database: PaperFlowDatabase, operation: SyncOperation): Promise<void> {
  switch (operation.entityType) {
    case 'paper': {
      const incoming = payloadWithId<PaperInfo & { version: EntityVersion }>(operation);
      const current = await database.papers.get(incoming.id);
      await database.papers.put(mergePaper(current, incoming));
      return;
    }
    case 'paperAlias': {
      const payload = payloadRecord(operation);
      if (payload.alias !== operation.entityId) throw new Error('Paper alias ID does not match.');
      const incoming = { ...payload, version: operation.version } as unknown as PaperAlias;
      const current = await database.paperAliases.get(incoming.alias);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.paperAliases.put(incoming);
      }
      return;
    }
    case 'collection': {
      const incoming = payloadWithId<Collection>(operation);
      const current = await database.collections.get(incoming.id);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.collections.put(incoming);
      }
      return;
    }
    case 'collectionItem': {
      const incoming = payloadWithId<CollectionItem>(operation);
      const current = await database.collectionItems.get(incoming.id);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.collectionItems.put(incoming);
      }
      return;
    }
    case 'tag': {
      const incoming = payloadWithId<Tag>(operation);
      const current = await database.tags.get(incoming.id);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.tags.put(incoming);
      }
      return;
    }
    case 'paperTag': {
      const incoming = payloadWithId<PaperTag>(operation);
      const current = await database.paperTags.get(incoming.id);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.paperTags.put(incoming);
      }
      return;
    }
    case 'document': {
      const incoming = payloadWithId<PaperDocument>(operation);
      const current = await database.documents.get(incoming.id);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.documents.put({
          ...incoming,
          localState: current?.localState === 'available' ? 'available' : 'missing',
          remoteState: 'available',
        });
      }
      return;
    }
    case 'note':
      await mergeNote(database, operation, payloadWithId<PaperNote>(operation));
      return;
    case 'annotation': {
      const incoming = payloadWithId<Annotation & { version: EntityVersion }>(operation);
      const current = await database.annotations.get(incoming.id);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.annotations.put(incoming);
      }
      return;
    }
    case 'thread': {
      const incoming = payloadWithId<Thread & { version: EntityVersion }>(operation);
      const current = await database.threads.get(incoming.id);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.threads.put(incoming);
      }
      return;
    }
    case 'message': {
      const incoming = payloadWithId<PersistedMessage & { version: EntityVersion }>(operation);
      const current = await database.messages.get(incoming.id);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.messages.put(incoming);
      }
      return;
    }
    case 'paperMemory': {
      const incoming = payloadWithId<PaperMemory & { version: EntityVersion }>(operation);
      const current = await database.paperMemory.get(incoming.id);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.paperMemory.put(incoming);
      }
      return;
    }
    case 'selection': {
      const incoming = payloadWithId<PaperSelection & { version: EntityVersion }>(operation);
      const current = await database.selections.get(incoming.id);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.selections.put(incoming);
      }
      return;
    }
    case 'setting': {
      const payload = payloadRecord(operation);
      if (payload.key !== operation.entityId) throw new Error('Setting ID does not match.');
      const incoming = { ...payload, version: operation.version } as unknown as SettingRecord;
      const current = await database.settings.get(incoming.key);
      if (!current || compareVersions(incoming.version, current.version) > 0) {
        await database.settings.put(incoming);
      }
      return;
    }
  }
}

export async function applyRemoteOperation(
  database: PaperFlowDatabase,
  operation: SyncOperation,
): Promise<boolean> {
  if (await database.syncOps.get(operation.id)) return false;
  return database.transaction('rw', database.tables, async () => {
    if (await database.syncOps.get(operation.id)) return false;
    await applyEntity(database, operation);
    await database.syncOps.put({ ...operation, state: 'uploaded' });
    const state = await database.syncState.get(LOCAL_SYNC_STATE_KEY);
    if (state && operation.version.counter >= state.counter) {
      await database.syncState.put({
        ...state,
        counter: operation.version.counter + 1,
      });
    }
    return true;
  });
}

export async function applyRemoteOperations(
  database: PaperFlowDatabase,
  operations: SyncOperation[],
): Promise<number> {
  let applied = 0;
  for (const operation of operations) {
    if (await applyRemoteOperation(database, operation)) applied += 1;
  }
  return applied;
}
