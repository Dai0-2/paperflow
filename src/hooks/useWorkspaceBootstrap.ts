import { useEffect, useRef } from 'react';
import { getApiStatus, getBridgeStatus } from '../services/bridge';
import { loadMessages, openPaperWorkspace, saveMessages } from '../services/database';
import { readPaperText } from '../services/files';
import { detectActivePaper } from '../services/paper';
import { chunksFromPages, pagesFromLegacyText } from '../services/paperContext';
import { useAppStore } from '../store/useAppStore';

export function useWorkspaceBootstrap({
  detectPaper = false,
  readDetectedPaper = false,
}: {
  detectPaper?: boolean;
  readDetectedPaper?: boolean;
} = {}) {
  const loadedPaperId = useRef<string | undefined>(undefined);
  const workspaceReady = useRef(false);
  const {
    theme,
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
    setReadingPaper,
    setActiveThreadId,
  } = useAppStore();

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

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
    if (!readDetectedPaper) return;
    setPaperText('');
    setPaperChunks([]);
    if (!paper) return;
    setReadingPaper(true);
    void readPaperText(paper.url)
      .then((paperText) => {
        setPaperText(paperText);
        setPaperChunks(chunksFromPages(paper.id, pagesFromLegacyText(paperText)));
      })
      .catch(() => {
        setPaperText('');
        setPaperChunks([]);
      })
      .finally(() => setReadingPaper(false));
  }, [paper?.id, paper?.url, readDetectedPaper, setPaperChunks, setPaperText, setReadingPaper]);

  useEffect(() => {
    if (initialized) localStorage.setItem('paperflow:initialized', 'true');
  }, [initialized]);

  useEffect(() => {
    if (!paper || loadedPaperId.current === paper.id) return;
    loadedPaperId.current = paper.id;
    workspaceReady.current = false;
    void openPaperWorkspace(paper).then(({ paper: resolvedPaper, threadId }) => {
      loadedPaperId.current = resolvedPaper.id;
      setPaper(resolvedPaper);
      setActiveThreadId(threadId);
      return loadMessages(threadId);
    }).then((savedMessages) => {
      setMessages(savedMessages);
      workspaceReady.current = true;
    }).catch(() => {
      setActiveThreadId(null);
      setMessages([]);
      workspaceReady.current = true;
    });
  }, [paper, setActiveThreadId, setMessages, setPaper]);

  useEffect(() => {
    if (!paper || !activeThreadId || loadedPaperId.current !== paper.id || !workspaceReady.current) return;
    const timeout = window.setTimeout(() => {
      void saveMessages(paper.id, activeThreadId, messages);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [activeThreadId, messages, paper]);
}
