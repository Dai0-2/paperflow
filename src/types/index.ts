export type Theme = 'light' | 'dark' | 'system';
export type View = 'chat' | 'history' | 'settings' | 'memory';
export type ChatState = 'conversation' | 'empty' | 'returning';
export type BridgeState = 'checking' | 'connected' | 'signed-out' | 'unavailable';
export type ProviderMode = 'chatgpt' | 'api';
export type Language = 'en' | 'zh';
export type PromptLanguage = Language | 'auto';
export type ApiProtocol = 'responses' | 'chat-completions';
export type ReaderSidebar = 'thumbnails' | 'outline';

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
  updatedAt?: number;
}

export interface PaperChunk {
  id: string;
  paperId: string;
  page: number;
  section?: string;
  text: string;
}

export interface PaperSelection {
  id: string;
  paperId: string;
  page: number;
  text: string;
  createdAt: number;
  note?: string;
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
}

export interface Annotation {
  id: string;
  paperId: string;
  page: number;
  text: string;
  color?: string;
  createdAt: number;
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
  error?: string;
}
