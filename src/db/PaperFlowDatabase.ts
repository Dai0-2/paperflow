import Dexie, { type Table } from 'dexie';
import type {
  Annotation,
  Collection,
  CollectionItem,
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
  SyncState,
  Tag,
  Thread,
} from '../types';
import { migrateV1ToV2 } from './migrations/v1ToV2';
import { type PersistedMessage, V1_STORES, V2_STORES } from './schema';

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
  syncState!: Table<SyncState, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores(V1_STORES);
    this.version(2).stores(V2_STORES).upgrade(migrateV1ToV2);
    this.on('versionchange', () => this.close());
  }
}

export const database = new PaperFlowDatabase();

export async function openPaperFlowDatabase(): Promise<PaperFlowDatabase> {
  if (!database.isOpen()) await database.open();
  return database;
}
