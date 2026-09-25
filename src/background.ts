import { importPaperToLibrary } from './repositories/libraryRepository';
import {
  arxivReaderHostUrl,
  hasRecentRedirectLoop,
  isArxivPdfUrl,
  isDirectPdfUrl,
  parseBackgroundRequest,
  readerPath,
  redirectGuardFor,
  type BackgroundRequest,
  type ReaderLaunchSource,
} from './services/backgroundRouting';
import { paperFromUrl } from './services/paper';
import { registerBrowserApiHandlers } from './services/browserApi';
import { syncEngine } from './sync/SyncEngine';
import { SYNC_SOON_ALARM } from './sync/operationLog';

const PERIODIC_SYNC_ALARM = 'paperflow-sync-periodic';
const PERIODIC_SYNC_MINUTES = 15;
const OPEN_READER_MENU = 'paperflow-open-reader';
const SAVE_PAPER_MENU = 'paperflow-save-paper';
const OPEN_LIBRARY_MENU = 'paperflow-open-library';
const REDIRECT_GUARD_PREFIX = 'paperflow:reader-redirect:';
const EMBEDDED_READER_PREFIX = 'paperflow:embedded-reader:';
const EMBEDDED_READER_SETTLE_MS = 1_000;

registerBrowserApiHandlers();

function readerUrl(
  rawUrl: string,
  title = '',
  source: ReaderLaunchSource = 'context-menu',
  warning?: 'pdf-handler-conflict',
): string {
  return chrome.runtime.getURL(readerPath(rawUrl, title, source, warning));
}

function runBackgroundSync(force = false): void {
  void syncEngine.run({ force }).catch(() => undefined);
}

function configureExtension(): void {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.storage.local.get('uiLanguage').then(({ uiLanguage }) => {
    const chinese = uiLanguage === 'zh';
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: OPEN_READER_MENU,
        title: chinese ? '使用 PaperFlow 打开' : 'Open with PaperFlow',
        contexts: ['link', 'page'],
      });
      chrome.contextMenus.create({
        id: SAVE_PAPER_MENU,
        title: chinese ? '保存到 PaperFlow' : 'Save to PaperFlow',
        contexts: ['link', 'page'],
      });
      chrome.contextMenus.create({
        id: OPEN_LIBRARY_MENU,
        title: chinese ? '打开 PaperFlow 资料库' : 'Open PaperFlow Library',
        contexts: ['action', 'page'],
      });
    });
  });
  chrome.alarms.create(PERIODIC_SYNC_ALARM, {
    delayInMinutes: PERIODIC_SYNC_MINUTES,
    periodInMinutes: PERIODIC_SYNC_MINUTES,
  });
}

function showActionFeedback(tabId: number | undefined, text: string, color: string): void {
  if (tabId === undefined) return;
  void chrome.action.setBadgeBackgroundColor({ tabId, color });
  void chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => {
    void chrome.action.setBadgeText({ tabId, text: '' });
  }, 2_000);
}

async function savePaper(rawUrl: string, title: string, tabId?: number): Promise<void> {
  try {
    const paper = paperFromUrl(rawUrl, title);
    if (!/^https?:/i.test(paper.url)) throw new Error('Only public web papers can be saved.');
    const saved = await importPaperToLibrary(paper);
    showActionFeedback(tabId, 'OK', '#397454');
    await chrome.storage.session.set({ 'paperflow:last-saved-paper': saved.id });
  } catch {
    showActionFeedback(tabId, '!', '#9e3737');
  }
}

async function handleBackgroundRequest(
  request: BackgroundRequest,
  sender?: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (
    request.type === 'paperflow:reader-mounted'
    || request.type === 'paperflow:reader-unmounting'
  ) {
    if (sender?.tab?.id === undefined) throw new Error('The embedded Reader tab is unavailable.');
    const key = `${EMBEDDED_READER_PREFIX}${sender.tab.id}`;
    if (request.type === 'paperflow:reader-mounted') {
      await chrome.storage.session.set({
        [key]: redirectGuardFor(request.sourceUrl, Date.now()),
      });
    } else {
      await chrome.storage.session.remove(key);
    }
    return { ok: true };
  }
  if (request.type === 'paperflow:sync-now') {
    const report = await syncEngine.run({ force: true });
    return { ok: true, report };
  }
  if (request.type === 'paperflow:refresh-menus') {
    configureExtension();
    return { ok: true };
  }
  if (request.type === 'paperflow:open-library') {
    const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
    return { ok: true, tabId: tab.id };
  }
  const paper = await importPaperToLibrary(paperFromUrl(request.url, request.title));
  return { ok: true, paperId: paper.id };
}

async function hasEmbeddedReader(
  tabId: number,
  rawUrl: string,
  changeInfo: { status?: string; url?: string },
): Promise<boolean> {
  const key = `${EMBEDDED_READER_PREFIX}${tabId}`;
  const stored = await chrome.storage.session.get(key);
  const mountedAt = typeof stored[key] === 'object'
    && stored[key] !== null
    && 'redirectedAt' in stored[key]
    && typeof stored[key].redirectedAt === 'number'
    ? stored[key].redirectedAt
    : 0;
  if (
    changeInfo.status === 'loading'
    && !changeInfo.url
    && Date.now() - mountedAt > EMBEDDED_READER_SETTLE_MS
  ) {
    await chrome.storage.session.remove(key);
    return false;
  }
  return hasRecentRedirectLoop(rawUrl, stored[key], Date.now());
}

async function openArxivReader(tabId: number, rawUrl: string, title: string): Promise<void> {
  const hostUrl = arxivReaderHostUrl(rawUrl, title);
  if (!hostUrl) return;
  await chrome.tabs.update(tabId, { url: hostUrl });
}

async function redirectDirectPdf(tabId: number, rawUrl: string, title: string): Promise<void> {
  const key = `${REDIRECT_GUARD_PREFIX}${tabId}`;
  const stored = await chrome.storage.session.get(key);
  const now = Date.now();
  if (hasRecentRedirectLoop(rawUrl, stored[key], now)) {
    await chrome.tabs.update(tabId, {
      url: readerUrl(rawUrl, title, 'default-handler', 'pdf-handler-conflict'),
    });
    return;
  }
  await chrome.storage.session.set({ [key]: redirectGuardFor(rawUrl, now) });
  await chrome.tabs.update(tabId, {
    url: readerUrl(rawUrl, title, 'default-handler'),
  });
}

chrome.runtime.onInstalled.addListener(() => {
  configureExtension();
  runBackgroundSync();
});

chrome.runtime.onStartup.addListener(() => {
  configureExtension();
  runBackgroundSync();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === OPEN_LIBRARY_MENU) {
    void chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
    return;
  }
  const rawUrl = info.linkUrl || info.pageUrl;
  if (!rawUrl) return;
  if (info.menuItemId === SAVE_PAPER_MENU) {
    void savePaper(rawUrl, tab?.title || '', tab?.id);
    return;
  }
  if (info.menuItemId !== OPEN_READER_MENU) return;
  const paper = paperFromUrl(rawUrl, tab?.title);
  if (!/^https?:/i.test(paper.url)) {
    showActionFeedback(tab?.id, '!', '#9e3737');
    return;
  }
  void chrome.tabs.create({
    url: arxivReaderHostUrl(paper.url, paper.title)
      || readerUrl(paper.url, paper.title, 'context-menu'),
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'loading') return;
  const rawUrl = changeInfo.url || tab.url;
  if (!rawUrl || !isDirectPdfUrl(rawUrl)) return;
  void chrome.storage.local.get('defaultOpenReader').then(({ defaultOpenReader }) => {
    if (defaultOpenReader === false) return;
    void (async () => {
      if (await hasEmbeddedReader(tabId, rawUrl, changeInfo)) return;
      if (isArxivPdfUrl(rawUrl)) {
        await openArxivReader(tabId, rawUrl, tab.title || '');
        return;
      }
      await redirectDirectPdf(tabId, rawUrl, tab.title || '');
    })();
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`${EMBEDDED_READER_PREFIX}${tabId}`);
  void chrome.storage.session.remove(`${REDIRECT_GUARD_PREFIX}${tabId}`);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PERIODIC_SYNC_ALARM || alarm.name === SYNC_SOON_ALARM) {
    runBackgroundSync(alarm.name === SYNC_SOON_ALARM);
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const request = parseBackgroundRequest(message);
  if (!request) return undefined;
  void handleBackgroundRequest(request, sender)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Background operation failed.',
    }));
  return true;
});

self.addEventListener('online', () => runBackgroundSync(true));
