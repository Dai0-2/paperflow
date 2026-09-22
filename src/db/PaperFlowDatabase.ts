import Dexie, { type Table } from 'dexie';
import type {
  Annotation,
  Collection,
  CollectionItem,
  MigrationBackup,
  OcrPage,
  PaperAlias,
  PaperChunk,
  PaperDocument,
  PaperInfo,
  PaperMemory,
  PaperNote,
  PaperSelection,
  PaperTag,
  SettingRecord,
  SyncOperation,
  SyncCheckpoint,
  SyncConflict,
  SyncState,
  Tag,
  Thread,
} from '../types';
import { migrateV1ToV2 } from './migrations/v1ToV2';
import {
  type PersistedMessage,
  V1_STORES,
  V2_STORES,
  V3_STORES,
  V4_STORES,
} from './schema';

export const DATABASE_NAME = 'paperflow-ai';

export class PaperFlowDatabase extends Dexie {
  papers!: Table<PaperInfo, string>;
  paperAliases!: Table<PaperAlias, string>;
  threads!: Table<Thread, string>;
  messages!: Table<PersistedMessage, string>;
  paperMemory!: Table<PaperMemory, string>;
  selections!: Table<PaperSelection, string>;
  annotations!: Table<Annotation, string>;
  settings!: Table<SettingRecord, string>;
  collections!: Table<Collection, string>;
  collectionItems!: Table<CollectionItem, string>;
  tags!: Table<Tag, string>;
  paperTags!: Table<PaperTag, string>;
  documents!: Table<PaperDocument, string>;
  notes!: Table<PaperNote, string>;
  paperChunks!: Table<PaperChunk, string>;
  ocrPages!: Table<OcrPage, string>;
  syncOps!: Table<SyncOperation, string>;
  syncConflicts!: Table<SyncConflict, string>;
  syncCheckpoints!: Table<SyncCheckpoint, string>;
  syncState!: Table<SyncState, string>;
  migrationBackups!: Table<MigrationBackup, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores(V1_STORES);
    this.version(2).stores(V2_STORES).upgrade(migrateV1ToV2);
    this.version(3).stores(V3_STORES);
    this.version(4).stores(V4_STORES);
    this.on('versionchange', () => this.close());
  }
}

export const database = new PaperFlowDatabase();
let migrationMarkedComplete = false;

export async function openPaperFlowDatabase(): Promise<PaperFlowDatabase> {
  if (!database.isOpen()) await database.open();
  if (!migrationMarkedComplete) {
    const backup = await database.migrationBackups.get('v1-pre-upgrade');
    if (backup && !backup.completedAt) {
      await database.migrationBackups.update(backup.id, { completedAt: Date.now() });
    }
    migrationMarkedComplete = true;
  }
  return database;
}
