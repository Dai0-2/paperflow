export type Theme = 'zotero' | 'light' | 'dark' | 'system';
export type UiFontFamily = 'system' | 'sans' | 'serif';
export type View = 'chat' | 'history' | 'settings' | 'memory';
export type ChatState = 'conversation' | 'empty' | 'returning';
export type BridgeState = 'checking' | 'connected' | 'signed-out' | 'unavailable';
export type ProviderMode = 'chatgpt' | 'api';
export type Language = 'en' | 'zh';
export type PromptLanguage = Language | 'auto';
export type ApiProtocol = 'responses' | 'chat-completions';
export type ReaderSidebar = 'thumbnails' | 'annotations' | 'outline';
export type LibraryState = 'temporary' | 'saved' | 'trashed';
export type ReadStatus = 'unread' | 'reading' | 'read';
export type AnnotationType = 'highlight' | 'underline' | 'strikeout' | 'text' | 'area' | 'ink';
export type SettingScope = 'local' | 'sync';

export interface EntityVersion {
  counter: number;
  deviceId: string;
}

export interface SyncMetadata {
  createdAt: number;
  updatedAt: number;
  version: EntityVersion;
  deletedAt?: number;
}

export interface Citation { page: number; label: string; excerpt: string }
export interface Message {
  id: string;
  paperId?: string;
  threadId?: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  firstTokenMs?: number;
  durationMs?: number;
  citation?: Citation;
  citations?: Citation[];
  createdAt?: number;
  pending?: boolean;
  progress?: string;
  error?: boolean;
  tags?: string[];
  feedback?: 'up' | 'down';
  feedbackDetail?: string;
  copied?: boolean;
  saved?: boolean;
  updatedAt?: number;
  version?: EntityVersion;
  deletedAt?: number;
}

export interface Thread {
  id: string;
  paperId: string;
  title: string;
  date: string;
  createdAt: number;
  updatedAt: number;
  active?: boolean;
  version?: EntityVersion;
  deletedAt?: number;
}

export type PaperSyncField =
  | 'favorite'
  | 'readStatus'
  | 'libraryState'
  | 'lastPage'
  | 'zoom'
  | 'panelWidth'
  | 'activeThreadId';

export interface PaperInfo {
  id: string;
  shortTitle: string;
  title: string;
  authors?: string;
  year?: string;
  source: string;
  url: string;
  currentPage?: number;
  pageCount?: number;
  doi?: string;
  arxivId?: string;
  openReviewId?: string;
  contentHash?: string;
  lastPage?: number;
  zoom?: number;
  panelWidth?: number;
  activeThreadId?: string;
  abstract?: string;
  journal?: string;
  favorite?: boolean;
  readStatus?: ReadStatus;
  libraryState?: LibraryState;
  createdAt?: number;
  accessedAt?: number;
  updatedAt?: number;
  version?: EntityVersion;
  deletedAt?: number;
  mergedInto?: string;
  metadataSource?: 'automatic' | 'manual';
  fieldVersions?: Partial<Record<PaperSyncField, EntityVersion>>;
}

export interface PaperChunk {
  id: string;
  paperId: string;
  page: number;
  section?: string;
  text: string;
  source?: 'text-layer' | 'ocr';
  updatedAt?: number;
}

export interface PaperSelection {
  id: string;
  paperId: string;
  page: number;
  text: string;
  createdAt: number;
  note?: string;
  updatedAt?: number;
  version?: EntityVersion;
  deletedAt?: number;
}

export interface PaperAlias {
  alias: string;
  paperId: string;
  kind: 'doi' | 'arxiv' | 'openreview' | 'title-author' | 'url' | 'content-hash';
  createdAt?: number;
  updatedAt?: number;
  version?: EntityVersion;
  deletedAt?: number;
}

export interface PaperMemory {
  id: string;
  paperId: string;
  content: string;
  updatedAt: number;
  version?: EntityVersion;
  deletedAt?: number;
}

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfQuad {
  points: [PdfPoint, PdfPoint, PdfPoint, PdfPoint];
}

export interface TextAnchor {
  quote: string;
  prefix?: string;
  suffix?: string;
}

export interface Annotation {
  id: string;
  paperId: string;
  page: number;
  text: string;
  type?: AnnotationType;
  color?: string;
  createdAt: number;
  updatedAt?: number;
  version?: EntityVersion;
  deletedAt?: number;
  quadPoints?: PdfQuad[];
  /** @deprecated Kept only for records created before v1.0. */
  quads?: PdfQuad[];
  rect?: { x: number; y: number; width: number; height: number };
  strokes?: Array<{ points: PdfPoint[]; width: number }>;
  anchor?: TextAnchor;
  comment?: string;
  translation?: string;
}

export interface Collection extends SyncMetadata {
  id: string;
  name: string;
  parentId?: string;
  sortOrder: number;
}

export interface CollectionItem extends SyncMetadata {
  id: string;
  collectionId: string;
  paperId: string;
}

export interface Tag extends SyncMetadata {
  id: string;
  name: string;
  normalizedName: string;
  color?: string;
}

export interface PaperTag extends SyncMetadata {
  id: string;
  paperId: string;
  tagId: string;
}

export interface PaperDocument extends SyncMetadata {
  id: string;
  paperId: string;
  contentHash: string;
  name: string;
  mimeType: 'application/pdf';
  size: number;
  pageCount?: number;
  localState: 'missing' | 'available' | 'corrupt';
  remoteState: 'none' | 'queued' | 'uploading' | 'available' | 'error';
  remoteObjectId?: string;
}

export interface PaperNote extends SyncMetadata {
  id: string;
  paperId: string;
  title: string;
  content: string;
  conflictOf?: string;
}

export interface OcrPage {
  id: string;
  paperId: string;
  documentId: string;
  page: number;
  text: string;
  language: string;
  confidence: number;
  engineVersion: string;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';
  updatedAt: number;
}

export type SyncEntityType =
  | 'paper'
  | 'paperAlias'
  | 'collection'
  | 'collectionItem'
  | 'tag'
  | 'paperTag'
  | 'document'
  | 'note'
  | 'annotation'
  | 'thread'
  | 'message'
  | 'paperMemory'
  | 'selection'
  | 'setting';

export interface SyncOperation {
  id: string;
  deviceId: string;
  seq: number;
  entityType: SyncEntityType;
  entityId: string;
  action: 'put' | 'delete';
  version: EntityVersion;
  baseVersion?: EntityVersion;
  payload?: unknown;
  createdAt: number;
  state: 'pending' | 'uploaded';
  batchId?: string;
}

export interface SyncState {
  key: string;
  deviceId: string;
  counter: number;
  nextSeq: number;
  driveChangeToken?: string;
  lastSyncedAt?: number;
  retryAt?: number;
  lastError?: string;
  lastErrorCode?: 'offline' | 'auth-required' | 'quota' | 'rate-limited' | 'remote-missing' | 'unknown';
  status?: 'idle' | 'syncing' | 'offline' | 'auth-required' | 'paused' | 'error';
  activeCheckpointId?: string;
  lastSnapshotAt?: number;
}

export interface SyncConflict {
  id: string;
  entityType: 'note';
  entityId: string;
  paperId: string;
  conflictCopyId: string;
  localVersion: EntityVersion;
  remoteVersion: EntityVersion;
  createdAt: number;
  resolvedAt?: number;
}

export interface SyncCheckpoint {
  id: string;
  kind: 'sync-run' | 'blob-upload';
  stage: string;
  batchId?: string;
  documentId?: string;
  sessionUrl?: string;
  offset?: number;
  totalBytes?: number;
  chunkHash?: string;
  attempt: number;
  updatedAt: number;
}

export interface MigrationBackup {
  id: string;
  sourceVersion: number;
  targetVersion: number;
  createdAt: number;
  completedAt?: number;
  stores: Record<string, unknown[]>;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  scope?: SettingScope;
  updatedAt?: number;
  version?: EntityVersion;
  deletedAt?: number;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  kind: 'pdf' | 'text' | 'image';
  text: string;
  pageCount?: number;
  dataUrl?: string;
}

export interface BridgeResponse {
  ok: boolean;
  event?: 'progress' | 'delta' | 'complete';
  stage?: string;
  delta?: string;
  authenticated?: boolean;
  detail?: string;
  answer?: string;
  vaultKey?: string;
  protocolVersion?: number;
  hostVersion?: string;
  platform?: string;
  codexAvailable?: boolean;
  credentialStoreAvailable?: boolean;
  apiKeyConfigured?: boolean;
  models?: string[];
  error?: string;
}
