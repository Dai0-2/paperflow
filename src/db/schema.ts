import type {
  Annotation,
  Collection,
  CollectionItem,
  Message,
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

export interface PersistedMessage extends Message {
  paperId: string;
  threadId: string;
  sequence: number;
}

export interface SchemaTables {
  papers: PaperInfo;
  paperAliases: PaperAlias;
  threads: Thread;
  messages: PersistedMessage;
  paperMemory: PaperMemory;
  selections: PaperSelection;
  annotations: Annotation;
  settings: SettingRecord;
  collections: Collection;
  collectionItems: CollectionItem;
  tags: Tag;
  paperTags: PaperTag;
  documents: PaperDocument;
  notes: PaperNote;
  paperChunks: PaperChunk;
  ocrPages: OcrPage;
  syncOps: SyncOperation;
  syncState: SyncState;
}

export const V1_STORES = {
  papers: '&id,updatedAt',
  paperAliases: '&alias,paperId',
  threads: '&id,paperId,updatedAt',
  messages: '&id,paperId,threadId',
  paperMemory: '&id,&paperId',
  selections: '&id,paperId',
  annotations: '&id,paperId',
  settings: '&key',
} as const;

export const V2_STORES = {
  ...V1_STORES,
  papers:
    '&id,doi,arxivId,openReviewId,contentHash,libraryState,favorite,readStatus,updatedAt,deletedAt',
  collections: '&id,parentId,sortOrder,updatedAt,deletedAt',
  collectionItems: '&id,[collectionId+paperId],collectionId,paperId,updatedAt,deletedAt',
  tags: '&id,&normalizedName,updatedAt,deletedAt',
  paperTags: '&id,[paperId+tagId],paperId,tagId,updatedAt,deletedAt',
  documents: '&id,paperId,contentHash,localState,remoteState,updatedAt,deletedAt',
  notes: '&id,paperId,updatedAt,deletedAt,conflictOf',
  paperChunks: '&id,[paperId+page],paperId,page,source,updatedAt',
  ocrPages: '&id,[documentId+page],paperId,documentId,page,status,updatedAt',
  syncOps: '&id,[deviceId+seq],state,entityType,entityId,createdAt,batchId',
  syncState: '&key,deviceId',
} as const;
