(() => {
  const sendMessage = (message) => {
    try {
      const pending = chrome.runtime.sendMessage(message);
      return pending && typeof pending.then === 'function'
        ? pending
        : Promise.resolve(pending);
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const parameters = new URLSearchParams(location.search);
  if (parameters.get('paperflowReader') !== '1') return;

  const identifier = location.pathname.match(/^\/abs\/([^/]+)\/?$/i)?.[1];
  if (!identifier) return;

  const source = new URL(`/pdf/${identifier}`, location.origin);
  const sourceHash = parameters.get('paperflowHash');
  if (sourceHash) source.hash = sourceHash;

  const title = document.querySelector('h1.title')?.textContent
    ?.replace(/\s+/g, ' ')
    .replace(/^Title:\s*/i, '')
    .trim()
    || parameters.get('paperflowTitle')
    || document.title;
  document.title = title;
  const reader = new URL(chrome.runtime.getURL('reader.html'));
  reader.searchParams.set('url', source.toString());
  reader.searchParams.set('title', title);
  reader.searchParams.set('paperflowSource', 'default-handler');
  reader.searchParams.set('paperflowDepth', '1');
  reader.searchParams.set('embedded', 'true');

  const frame = document.createElement('iframe');
  frame.id = 'paperflow-reader-frame';
  frame.title = 'PaperFlow Reader';
  frame.src = reader.toString();
  frame.allow = 'clipboard-read; clipboard-write';
  frame.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'width:100vw',
    'height:100vh',
    'border:0',
    'background:#fff',
  ].join(';');

  const restoreOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  document.body.append(frame);

  frame.addEventListener('error', () => {
    frame.remove();
    document.documentElement.style.overflow = restoreOverflow;
  }, { once: true });

  sendMessage({
    type: 'paperflow:reader-mounted',
    sourceUrl: source.toString(),
  }).then(() => {
    history.replaceState(history.state, '', source.toString());
  }).catch(() => {
    frame.remove();
    document.documentElement.style.overflow = restoreOverflow;
  });

  addEventListener('pagehide', () => {
    void sendMessage({
      type: 'paperflow:reader-unmounting',
      sourceUrl: source.toString(),
    }).catch(() => undefined);
  }, { once: true });
})();
