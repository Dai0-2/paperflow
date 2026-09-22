import { PaperSearchIndex, type SearchIndexDocument } from '../services/search/searchIndex';

type SearchWorkerRequest =
  | { id: number; type: 'rebuild'; documents: SearchIndexDocument[] }
  | { id: number; type: 'upsert'; document: SearchIndexDocument }
  | { id: number; type: 'remove'; documentId: string }
  | { id: number; type: 'search'; query: string; limit?: number }
  | { id: number; type: 'cancel-rebuild' };

type SearchWorkerResponse =
  | { id: number; type: 'progress'; completed: number; total: number }
  | { id: number; type: 'result'; result?: string[] }
  | { id: number; type: 'error'; error: string };

const searchIndex = new PaperSearchIndex();
let rebuildGeneration = 0;
const workerScope = self as unknown as {
  postMessage: (response: SearchWorkerResponse) => void;
  onmessage: ((event: MessageEvent<SearchWorkerRequest>) => void) | null;
};

function post(response: SearchWorkerResponse): void {
  workerScope.postMessage(response);
}

async function rebuild(id: number, documents: SearchIndexDocument[]): Promise<void> {
  const generation = ++rebuildGeneration;
  searchIndex.clear();
  const batchSize = 250;
  for (let index = 0; index < documents.length; index += batchSize) {
    if (generation !== rebuildGeneration) throw new DOMException('Search index rebuild cancelled.', 'AbortError');
    searchIndex.add(documents.slice(index, index + batchSize));
    post({
      id,
      type: 'progress',
      completed: Math.min(documents.length, index + batchSize),
      total: documents.length,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

workerScope.onmessage = (event) => {
  const request = event.data;
  void (async () => {
    if (request.type === 'cancel-rebuild') {
      rebuildGeneration += 1;
      post({ id: request.id, type: 'result' });
      return;
    }
    if (request.type === 'rebuild') {
      await rebuild(request.id, request.documents);
      post({ id: request.id, type: 'result' });
      return;
    }
    if (request.type === 'upsert') {
      searchIndex.upsert(request.document);
      post({ id: request.id, type: 'result' });
      return;
    }
    if (request.type === 'remove') {
      searchIndex.remove(request.documentId);
      post({ id: request.id, type: 'result' });
      return;
    }
    post({
      id: request.id,
      type: 'result',
      result: searchIndex.search(request.query, request.limit),
    });
  })().catch((reason: unknown) => {
    post({
      id: request.id,
      type: 'error',
      error: reason instanceof Error ? reason.message : 'Search index operation failed.',
    });
  });
};
