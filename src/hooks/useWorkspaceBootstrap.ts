import { useEffect, useRef } from 'react';
import { getApiStatus, getBridgeStatus } from '../services/bridge';
import {
  loadMessages,
  loadPaperChunks,
  openPaperWorkspace,
  saveMessages,
} from '../services/database';
import { detectActivePaper } from '../services/paper';
import { useAppStore } from '../store/useAppStore';

export function useWorkspaceBootstrap({
  detectPaper = false,
}: {
  detectPaper?: boolean;
} = {}) {
  const loadedPaperId = useRef<string | undefined>(undefined);
  const workspaceReady = useRef(false);
  const {
    theme,
    fontFamily,
    fontScale,
    initialized,
    paper,
    messages,
    activeThreadId,
    setPaper,
    setDetecting,
    setBridge,
    setApiState,
    setInitialized,
    setMessages,
    setPaperText,
    setPaperChunks,
    setActiveThreadId,
  } = useAppStore();

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : theme === 'zotero' ? 'zotero' : 'light';
      document.documentElement.dataset.fontFamily = fontFamily;
      document.documentElement.style.setProperty('--ui-font-scale', String(fontScale / 100));
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [fontFamily, fontScale, theme]);

  useEffect(() => {
    setInitialized(localStorage.getItem('paperflow:initialized') === 'true');
    void getBridgeStatus().then((result) =>
      setBridge(result.ok && result.authenticated ? 'connected' : result.ok ? 'signed-out' : 'unavailable', result.detail || result.error || ''),
    );
    void getApiStatus().then((result) =>
      setApiState(result.ok && result.authenticated ? 'connected' : result.ok ? 'signed-out' : 'unavailable', result.detail || result.error || ''),
    );
    if (detectPaper) {
      void detectActivePaper().then(setPaper).finally(() => setDetecting(false));
    } else {
      setDetecting(false);
    }
  }, [detectPaper, setApiState, setBridge, setDetecting, setInitialized, setPaper]);

  useEffect(() => {
    if (!detectPaper || typeof chrome === 'undefined' || !chrome.tabs) return;
    const refresh = () => { void detectActivePaper().then(setPaper); };
    const updated = (_tabId: number, _change: { status?: string; url?: string }, tab: chrome.tabs.Tab) => {
      if (tab.active) refresh();
    };
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(updated);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(updated);
    };
  }, [detectPaper, setPaper]);

  useEffect(() => {
    if (initialized) localStorage.setItem('paperflow:initialized', 'true');
  }, [initialized]);

  useEffect(() => {
    if (!paper || loadedPaperId.current === paper.id) return;
    loadedPaperId.current = paper.id;
    workspaceReady.current = false;
    setPaperText('');
    setPaperChunks([]);
    void openPaperWorkspace(paper).then(({ paper: resolvedPaper, threadId }) => {
      loadedPaperId.current = resolvedPaper.id;
      setPaper(resolvedPaper);
      setActiveThreadId(threadId);
      return Promise.all([
        loadMessages(threadId),
        loadPaperChunks(resolvedPaper.id),
      ]);
    }).then(([savedMessages, savedChunks]) => {
      setMessages(savedMessages);
      setPaperChunks(savedChunks);
      workspaceReady.current = true;
    }).catch(() => {
      setActiveThreadId(null);
      setMessages([]);
      workspaceReady.current = true;
    });
  }, [
    paper,
    setActiveThreadId,
    setMessages,
    setPaper,
    setPaperChunks,
    setPaperText,
  ]);

  useEffect(() => {
    if (!paper || !activeThreadId || loadedPaperId.current !== paper.id || !workspaceReady.current) return;
    const timeout = window.setTimeout(() => {
      void saveMessages(paper.id, activeThreadId, messages);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [activeThreadId, messages, paper]);
}
