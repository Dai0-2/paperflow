import { StrictMode, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { openPaperFlowDatabase } from './db/PaperFlowDatabase';

function recoveryUrl(error: unknown): string {
  const base = typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('recovery.html')
    : new URL('/recovery.html', window.location.origin).toString();
  const url = new URL(base);
  url.searchParams.set('from', window.location.pathname);
  url.searchParams.set(
    'reason',
    error instanceof Error ? error.message : 'The PaperFlow database could not be opened.',
  );
  return url.toString();
}

export async function mountApplication(application: ReactNode): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Application root is missing.');
  try {
    await openPaperFlowDatabase();
    ReactDOM.createRoot(rootElement).render(<StrictMode>{application}</StrictMode>);
  } catch (error) {
    window.location.replace(recoveryUrl(error));
  }
}
