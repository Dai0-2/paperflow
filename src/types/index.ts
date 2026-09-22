export type Theme = 'light' | 'dark' | 'system';
export type View = 'chat' | 'history' | 'settings' | 'memory';
export type ChatState = 'conversation' | 'empty' | 'returning';
export type BridgeState = 'checking' | 'connected' | 'signed-out' | 'unavailable';
export type ProviderMode = 'chatgpt' | 'api';
export type Language = 'en' | 'zh';
export type PromptLanguage = Language | 'auto';
export type ApiProtocol = 'responses' | 'chat-completions';
export type ReaderSidebar = 'thumbnails' | 'outline';
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
}

export interface SettingRecord {
  key: string;
  value: unknown;
  scope?: SettingScope;
  updatedAt?: number;
  version?: EntityVersion;
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
  error?: string;
}
