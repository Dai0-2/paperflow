import { syncEngine } from './sync/SyncEngine';
import { SYNC_SOON_ALARM } from './sync/operationLog';

const PERIODIC_SYNC_ALARM = 'paperflow-sync-periodic';
const PERIODIC_SYNC_MINUTES = 15;

function isDirectPdf(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return /^https?:$/.test(url.protocol) && /\.pdf$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function readerUrl(rawUrl: string, title = ''): string {
  const parameters = new URLSearchParams({ url: rawUrl });
  if (title) parameters.set('title', title);
  return chrome.runtime.getURL(`reader.html?${parameters}`);
}

function runBackgroundSync(force = false): void {
  void syncEngine.run({ force }).catch(() => undefined);
}

function configureExtension(): void {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'paperflow-open-reader',
      title: 'Open with PaperFlow',
      contexts: ['link', 'page'],
    });
  });
  chrome.alarms.create(PERIODIC_SYNC_ALARM, {
    delayInMinutes: PERIODIC_SYNC_MINUTES,
    periodInMinutes: PERIODIC_SYNC_MINUTES,
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
  if (info.menuItemId !== 'paperflow-open-reader') return;
  const rawUrl = info.linkUrl || info.pageUrl;
  if (!rawUrl || !/^https?:/i.test(rawUrl)) return;
  void chrome.tabs.create({ url: readerUrl(rawUrl, tab?.title || '') });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const rawUrl = changeInfo.url || tab.url;
  if (!rawUrl || !isDirectPdf(rawUrl)) return;
  void chrome.storage.local.get('defaultOpenReader').then(({ defaultOpenReader }) => {
    if (defaultOpenReader) {
      void chrome.tabs.update(tabId, { url: readerUrl(rawUrl, tab.title || '') });
    }
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PERIODIC_SYNC_ALARM || alarm.name === SYNC_SOON_ALARM) {
    runBackgroundSync(alarm.name === SYNC_SOON_ALARM);
  }
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (
    !message
    || typeof message !== 'object'
    || !('type' in message)
    || message.type !== 'paperflow:sync-now'
  ) return undefined;
  void syncEngine.run({ force: true })
    .then((report) => sendResponse({ ok: true, report }))
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Synchronization failed.',
    }));
  return true;
});

self.addEventListener('online', () => runBackgroundSync(true));
