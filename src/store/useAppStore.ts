import { create } from 'zustand';
import type {
  ApiProtocol,
  Attachment,
  BridgeState,
  ChatState,
  Language,
  Message,
  PaperChunk,
  PaperInfo,
  PaperSelection,
  PromptLanguage,
  ProviderMode,
  Theme,
  UiFontFamily,
  View,
} from '../types';

const THEMES: readonly Theme[] = ['zotero', 'light', 'dark', 'system'];
const FONT_FAMILIES: readonly UiFontFamily[] = ['system', 'sans', 'serif'];

function storedTheme(): Theme {
  const value = localStorage.getItem('paperflow:theme');
  return THEMES.includes(value as Theme) ? value as Theme : 'zotero';
}

function storedFontFamily(): UiFontFamily {
  const value = localStorage.getItem('paperflow:font-family');
  return FONT_FAMILIES.includes(value as UiFontFamily) ? value as UiFontFamily : 'system';
}

function normalizedFontScale(value: string | null): number {
  const parsed = Number(value || '100');
  return Number.isFinite(parsed) ? Math.max(75, Math.min(160, Math.round(parsed))) : 100;
}

function storedFontScale(): number {
  const value = localStorage.getItem('paperflow:font-scale');
  return normalizedFontScale(value);
}

function storedApiModels(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem('paperflow:api-models') || '[]') as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 500)
      : [];
  } catch {
    return [];
  }
}

interface AppState {
  view: View; theme: Theme; fontFamily: UiFontFamily; fontScale: number; chatState: ChatState; model: string;
  initialized: boolean; detecting: boolean; paper: PaperInfo | null; paperText: string; paperChunks: PaperChunk[]; readingPaper: boolean;
  activeThreadId: string | null; selection: PaperSelection | null; defaultOpenReader: boolean;
  bridgeState: BridgeState; bridgeDetail: string;
  providerMode: ProviderMode; apiState: BridgeState; apiDetail: string;
  uiLanguage: Language; promptLanguage: PromptLanguage; apiBaseUrl: string; apiProtocol: ApiProtocol; apiModels: string[]; codexModels: string[];
  messages: Message[]; attachments: Attachment[]; sending: boolean; draft: string;
  setView: (view: View) => void;
  setTheme: (theme: Theme) => void;
  setFontFamily: (fontFamily: UiFontFamily) => void;
  setFontScale: (fontScale: number) => void;
  setChatState: (state: ChatState) => void;
  setModel: (model: string) => void;
  setInitialized: (initialized: boolean) => void;
  setDetecting: (detecting: boolean) => void;
  setPaper: (paper: PaperInfo | null) => void;
  updatePaper: (patch: Partial<PaperInfo>) => void;
  setPaperText: (paperText: string) => void;
  setPaperChunks: (paperChunks: PaperChunk[]) => void;
  setReadingPaper: (readingPaper: boolean) => void;
  setActiveThreadId: (threadId: string | null) => void;
  setSelection: (selection: PaperSelection | null) => void;
  setDefaultOpenReader: (enabled: boolean) => void;
  setBridge: (state: BridgeState, detail?: string) => void;
  setProviderMode: (providerMode: ProviderMode) => void;
  setApiState: (state: BridgeState, detail?: string) => void;
  setUiLanguage: (language: Language) => void;
  setPromptLanguage: (language: PromptLanguage) => void;
  setApiBaseUrl: (url: string) => void;
  setApiProtocol: (protocol: ApiProtocol) => void;
  setApiModels: (models: string[]) => void;
  setCodexModels: (models: string[]) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  clearMessages: () => void;
  addAttachment: (attachment: Attachment) => void;
  removeAttachment: (id: string) => void;
  setSending: (sending: boolean) => void;
  setDraft: (draft: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: 'chat', theme: storedTheme(), fontFamily: storedFontFamily(), fontScale: storedFontScale(), chatState: 'empty', model: localStorage.getItem('paperflow:provider') === 'api' ? (localStorage.getItem('paperflow:api-model') || 'gpt-4.1-mini') : (localStorage.getItem('paperflow:codex-model') || 'ChatGPT via Codex'),
  initialized: false, detecting: true, paper: null, paperText: '', paperChunks: [], readingPaper: false,
  activeThreadId: null, selection: null, defaultOpenReader: localStorage.getItem('paperflow:default-reader') !== 'false',
  bridgeState: 'checking', bridgeDetail: '', providerMode: (localStorage.getItem('paperflow:provider') as ProviderMode) || 'chatgpt', apiState: 'checking', apiDetail: '',
  uiLanguage: (localStorage.getItem('paperflow:ui-language') as Language) || 'en', promptLanguage: (localStorage.getItem('paperflow:prompt-language') as PromptLanguage) || 'auto',
  apiBaseUrl: localStorage.getItem('paperflow:api-base-url') || 'https://api.openai.com/v1', apiProtocol: (localStorage.getItem('paperflow:api-protocol') as ApiProtocol) || 'responses', apiModels: storedApiModels(), codexModels: [],
  messages: [], attachments: [], sending: false, draft: '',
  setView: (view) => set({ view }), setTheme: (theme) => { localStorage.setItem('paperflow:theme', theme); set({ theme }); },
  setFontFamily: (fontFamily) => {
    localStorage.setItem('paperflow:font-family', fontFamily);
    set({ fontFamily });
  },
  setFontScale: (value) => {
    const fontScale = Math.max(75, Math.min(160, Math.round(value)));
    localStorage.setItem('paperflow:font-scale', String(fontScale));
    set({ fontScale });
  },
  setChatState: (chatState) => set({ chatState }), setModel: (model) => set((state) => {
    localStorage.setItem(
      state.providerMode === 'api' ? 'paperflow:api-model' : 'paperflow:codex-model',
      model,
    );
    return { model };
  }),
  setInitialized: (initialized) => set({ initialized }), setDetecting: (detecting) => set({ detecting }),
  setPaper: (paper) => set({ paper }),
  updatePaper: (patch) => set((state) => ({ paper: state.paper ? { ...state.paper, ...patch } : null })),
  setPaperText: (paperText) => set({ paperText }), setPaperChunks: (paperChunks) => set({ paperChunks }), setReadingPaper: (readingPaper) => set({ readingPaper }),
  setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
  setSelection: (selection) => set({ selection }),
  setDefaultOpenReader: (defaultOpenReader) => {
    localStorage.setItem('paperflow:default-reader', String(defaultOpenReader));
    if (typeof chrome !== 'undefined' && chrome.storage?.local) void chrome.storage.local.set({ defaultOpenReader });
    set({ defaultOpenReader });
  },
  setBridge: (bridgeState, bridgeDetail = '') => set({ bridgeState, bridgeDetail }),
  setProviderMode: (providerMode) => {
    localStorage.setItem('paperflow:provider', providerMode);
    const model = providerMode === 'api'
      ? (localStorage.getItem('paperflow:api-model') || 'gpt-4.1-mini')
      : (localStorage.getItem('paperflow:codex-model') || 'ChatGPT via Codex');
    set({ providerMode, model });
  },
  setApiState: (apiState, apiDetail = '') => set({ apiState, apiDetail }),
  setUiLanguage: (uiLanguage) => {
    localStorage.setItem('paperflow:ui-language', uiLanguage);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local.set({ uiLanguage });
      void chrome.runtime?.sendMessage?.({ type: 'paperflow:refresh-menus' }).catch(() => undefined);
    }
    set({ uiLanguage });
  },
  setPromptLanguage: (promptLanguage) => { localStorage.setItem('paperflow:prompt-language', promptLanguage); set({ promptLanguage }); },
  setApiBaseUrl: (apiBaseUrl) => set((state) => {
    localStorage.setItem('paperflow:api-base-url', apiBaseUrl);
    if (state.apiBaseUrl !== apiBaseUrl) localStorage.removeItem('paperflow:api-models');
    return state.apiBaseUrl === apiBaseUrl ? { apiBaseUrl } : { apiBaseUrl, apiModels: [] };
  }),
  setApiProtocol: (apiProtocol) => { localStorage.setItem('paperflow:api-protocol', apiProtocol); set({ apiProtocol }); },
  setApiModels: (apiModels) => {
    const unique = [...new Set(apiModels.map((item) => item.trim()).filter(Boolean))].slice(0, 500);
    localStorage.setItem('paperflow:api-models', JSON.stringify(unique));
    set({ apiModels: unique });
  },
  setCodexModels: (codexModels) => {
    const unique = [...new Set(codexModels.map((item) => item.trim()).filter(Boolean))].slice(0, 500);
    set({ codexModels: unique });
  },
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message], chatState: 'conversation' })),
  setMessages: (messages) => set({ messages, chatState: messages.length ? 'conversation' : 'empty' }),
  updateMessage: (id, patch) => set((state) => ({ messages: state.messages.map((message) => message.id === id ? { ...message, ...patch } : message) })),
  clearMessages: () => set({ messages: [], chatState: 'empty' }),
  addAttachment: (attachment) => set((state) => ({ attachments: [...state.attachments, attachment] })),
  removeAttachment: (id) => set((state) => ({ attachments: state.attachments.filter((attachment) => attachment.id !== id) })),
  setSending: (sending) => set({ sending }),
  setDraft: (draft) => set({ draft }),
}));

export function syncStoredAppearance(key: string | null, value: string | null): void {
  if (key === null) {
    useAppStore.setState({
      theme: storedTheme(),
      fontFamily: storedFontFamily(),
      fontScale: storedFontScale(),
    });
    return;
  }
  if (key === 'paperflow:theme' && THEMES.includes(value as Theme)) {
    useAppStore.setState({ theme: value as Theme });
  }
  if (key === 'paperflow:font-family' && FONT_FAMILIES.includes(value as UiFontFamily)) {
    useAppStore.setState({ fontFamily: value as UiFontFamily });
  }
  if (key === 'paperflow:font-scale') {
    useAppStore.setState({ fontScale: normalizedFontScale(value) });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    syncStoredAppearance(event.key, event.newValue);
  });
}
