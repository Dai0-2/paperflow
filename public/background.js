chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'paperflow-open-reader',
      title: 'Open with PaperFlow',
      contexts: ['link', 'page'],
    });
  });
});

function isDirectPdf(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return /^https?:$/.test(url.protocol) && /\.pdf$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function readerUrl(rawUrl, title = '') {
  const parameters = new URLSearchParams({ url: rawUrl });
  if (title) parameters.set('title', title);
  return chrome.runtime.getURL(`reader.html?${parameters}`);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'paperflow-open-reader') return;
  const rawUrl = info.linkUrl || info.pageUrl;
  if (!rawUrl || !/^https?:/i.test(rawUrl)) return;
  chrome.tabs.create({ url: readerUrl(rawUrl, tab?.title || '') });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const rawUrl = changeInfo.url || tab.url;
  if (!rawUrl || !isDirectPdf(rawUrl)) return;
  chrome.storage.local.get('defaultOpenReader').then(({ defaultOpenReader }) => {
    if (defaultOpenReader) chrome.tabs.update(tabId, { url: readerUrl(rawUrl, tab.title || '') });
  });
});
