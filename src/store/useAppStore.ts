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
  View,
} from '../types';

interface AppState {
  view: View; theme: Theme; chatState: ChatState; model: string;
  initialized: boolean; detecting: boolean; paper: PaperInfo | null; paperText: string; paperChunks: PaperChunk[]; readingPaper: boolean;
  activeThreadId: string | null; selection: PaperSelection | null; defaultOpenReader: boolean;
  bridgeState: BridgeState; bridgeDetail: string;
  providerMode: ProviderMode; apiState: BridgeState; apiDetail: string;
  uiLanguage: Language; promptLanguage: PromptLanguage; apiBaseUrl: string; apiProtocol: ApiProtocol;
  messages: Message[]; attachments: Attachment[]; sending: boolean; draft: string;
  setView: (view: View) => void;
  setTheme: (theme: Theme) => void;
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
  view: 'chat', theme: (localStorage.getItem('paperflow:theme') as Theme) || 'system', chatState: 'empty', model: localStorage.getItem('paperflow:provider') === 'api' ? (localStorage.getItem('paperflow:api-model') || 'gpt-4.1-mini') : 'ChatGPT via Codex',
  initialized: false, detecting: true, paper: null, paperText: '', paperChunks: [], readingPaper: false,
  activeThreadId: null, selection: null, defaultOpenReader: localStorage.getItem('paperflow:default-reader') === 'true',
  bridgeState: 'checking', bridgeDetail: '', providerMode: (localStorage.getItem('paperflow:provider') as ProviderMode) || 'chatgpt', apiState: 'checking', apiDetail: '',
  uiLanguage: (localStorage.getItem('paperflow:ui-language') as Language) || 'en', promptLanguage: (localStorage.getItem('paperflow:prompt-language') as PromptLanguage) || 'auto',
  apiBaseUrl: localStorage.getItem('paperflow:api-base-url') || 'https://api.openai.com/v1', apiProtocol: (localStorage.getItem('paperflow:api-protocol') as ApiProtocol) || 'responses',
  messages: [], attachments: [], sending: false, draft: '',
  setView: (view) => set({ view }), setTheme: (theme) => { localStorage.setItem('paperflow:theme', theme); set({ theme }); },
  setChatState: (chatState) => set({ chatState }), setModel: (model) => set((state) => { if (state.providerMode === 'api') localStorage.setItem('paperflow:api-model', model); return { model }; }),
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
  setProviderMode: (providerMode) => { localStorage.setItem('paperflow:provider', providerMode); const model = providerMode === 'api' ? (localStorage.getItem('paperflow:api-model') || 'gpt-4.1-mini') : 'ChatGPT via Codex'; set({ providerMode, model }); },
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
  setApiBaseUrl: (apiBaseUrl) => { localStorage.setItem('paperflow:api-base-url', apiBaseUrl); set({ apiBaseUrl }); },
  setApiProtocol: (apiProtocol) => { localStorage.setItem('paperflow:api-protocol', apiProtocol); set({ apiProtocol }); },
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message], chatState: 'conversation' })),
  setMessages: (messages) => set({ messages, chatState: messages.length ? 'conversation' : 'empty' }),
  updateMessage: (id, patch) => set((state) => ({ messages: state.messages.map((message) => message.id === id ? { ...message, ...patch } : message) })),
  clearMessages: () => set({ messages: [], chatState: 'empty' }),
  addAttachment: (attachment) => set((state) => ({ attachments: [...state.attachments, attachment] })),
  removeAttachment: (id) => set((state) => ({ attachments: state.attachments.filter((attachment) => attachment.id !== id) })),
  setSending: (sending) => set({ sending }),
  setDraft: (draft) => set({ draft }),
}));
