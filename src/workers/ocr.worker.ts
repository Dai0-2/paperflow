import { createWorker, OEM, type LoggerMessage } from 'tesseract.js';

interface OcrPageInput {
  page: number;
  image: Blob;
}

interface OcrRequest {
  id: string;
  language: 'eng' | 'chi_sim' | 'eng+chi_sim';
  pages: OcrPageInput[];
}

type OcrResponse =
  | { id: string; type: 'ready' }
  | { id: string; type: 'progress'; page: number; status: string; progress: number }
  | { id: string; type: 'page'; page: number; text: string; confidence: number; version: string }
  | { id: string; type: 'complete' }
  | { id: string; type: 'error'; error: string };

const workerScope = self as unknown as {
  location: Location;
  postMessage: (response: OcrResponse) => void;
  onmessage: ((event: MessageEvent<OcrRequest>) => void) | null;
};

function resourceUrl(path: string): string {
  return `${workerScope.location.origin}/${path}`;
}

workerScope.onmessage = (event) => {
  const request = event.data;
  void (async () => {
    let activePage = request.pages[0]?.page || 1;
    const worker = await createWorker(request.language, OEM.LSTM_ONLY, {
      workerPath: resourceUrl('ocr/worker.min.js'),
      corePath: resourceUrl('ocr/core'),
      langPath: resourceUrl('ocr/lang'),
      workerBlobURL: false,
      logger: (message: LoggerMessage) => {
        workerScope.postMessage({
          id: request.id,
          type: 'progress',
          page: activePage,
          status: message.status,
          progress: message.progress,
        });
      },
    });
    try {
      workerScope.postMessage({ id: request.id, type: 'ready' });
      for (const page of request.pages) {
        activePage = page.page;
        const result = await worker.recognize(page.image);
        workerScope.postMessage({
          id: request.id,
          type: 'page',
          page: page.page,
          text: result.data.text.trim(),
          confidence: result.data.confidence,
          version: result.data.version,
        });
      }
      workerScope.postMessage({ id: request.id, type: 'complete' });
    } finally {
      await worker.terminate();
    }
  })().catch((reason: unknown) => {
    workerScope.postMessage({
      id: request.id,
      type: 'error',
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });
};
