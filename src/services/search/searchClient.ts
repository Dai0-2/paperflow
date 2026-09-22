import type { SearchIndexDocument } from './searchIndex';

export interface SearchIndexStatus {
  state: 'idle' | 'building' | 'ready' | 'error';
  completed: number;
  total: number;
  error?: string;
}

type WorkerResponse =
  | { id: number; type: 'progress'; completed: number; total: number }
  | { id: number; type: 'result'; result?: string[] }
  | { id: number; type: 'error'; error: string };

interface PendingRequest {
  resolve: (result: string[] | undefined) => void;
  reject: (reason: Error) => void;
  progress?: (completed: number, total: number) => void;
}

class SearchClient {
  private worker?: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly listeners = new Set<(status: SearchIndexStatus) => void>();
  private status: SearchIndexStatus = { state: 'idle', completed: 0, total: 0 };
  private rebuildVersion = 0;

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('../../workers/search.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      if (response.type === 'progress') {
        pending.progress?.(response.completed, response.total);
        return;
      }
      this.pending.delete(response.id);
      if (response.type === 'error') pending.reject(new Error(response.error));
      else pending.resolve(response.result);
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'The search worker stopped unexpectedly.');
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
      this.setStatus({ ...this.status, state: 'error', error: error.message });
    };
    return this.worker;
  }

  private setStatus(status: SearchIndexStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  private request(
    payload: Record<string, unknown>,
    progress?: PendingRequest['progress'],
  ): Promise<string[] | undefined> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress });
      this.getWorker().postMessage({ ...payload, id });
    });
  }

  subscribe(listener: (status: SearchIndexStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  async rebuild(documents: SearchIndexDocument[], signal?: AbortSignal): Promise<void> {
    const version = ++this.rebuildVersion;
    this.setStatus({ state: 'building', completed: 0, total: documents.length });
    const abort = () => {
      void this.request({ type: 'cancel-rebuild' });
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await this.request({ type: 'rebuild', documents }, (completed, total) => {
        if (version === this.rebuildVersion) {
          this.setStatus({ state: 'building', completed, total });
        }
      });
      if (signal?.aborted) throw new DOMException('Search index rebuild cancelled.', 'AbortError');
      if (version === this.rebuildVersion) {
        this.setStatus({
          state: 'ready',
          completed: documents.length,
          total: documents.length,
        });
      }
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error('Search index rebuild failed.');
      if (version === this.rebuildVersion) {
        if (signal?.aborted || error.name === 'AbortError') {
          this.setStatus({ state: 'idle', completed: 0, total: documents.length });
        } else {
          this.setStatus({ state: 'error', completed: 0, total: documents.length, error: error.message });
        }
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  async upsert(document: SearchIndexDocument): Promise<void> {
    await this.request({ type: 'upsert', document });
  }

  async remove(documentId: string): Promise<void> {
    await this.request({ type: 'remove', documentId });
  }

  async search(query: string, limit = 10_000): Promise<string[]> {
    return (await this.request({ type: 'search', query, limit })) || [];
  }
}

export const searchClient = new SearchClient();
