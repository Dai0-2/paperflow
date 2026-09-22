import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { openPaperFlowDatabase } from '../../db/PaperFlowDatabase';
import type { OcrPage, PaperChunk } from '../../types';
import { indexPaper } from '../search/searchIndexer';

export type OcrLanguage = 'eng' | 'chi_sim' | 'eng+chi_sim';

export interface OcrProgress {
  page: number;
  completedPages: number;
  totalPages: number;
  progress: number;
  status: string;
}

interface OcrWorkerPage {
  page: number;
  image: Blob;
}

type OcrWorkerResponse =
  | { id: string; type: 'ready' }
  | { id: string; type: 'progress'; page: number; status: string; progress: number }
  | { id: string; type: 'page'; page: number; text: string; confidence: number; version: string }
  | { id: string; type: 'complete' }
  | { id: string; type: 'error'; error: string };

export interface OcrJob {
  promise: Promise<OcrPage[]>;
  cancel: () => void;
}

export async function recoverStaleOcrJobs(maxAgeMs = 30 * 60 * 1000): Promise<number> {
  const db = await openPaperFlowDatabase();
  const cutoff = Date.now() - maxAgeMs;
  const interrupted = (await db.ocrPages.toArray()).filter((page) =>
    (page.status === 'pending' || page.status === 'running') && page.updatedAt < cutoff);
  if (!interrupted.length) return 0;
  const now = Date.now();
  await db.ocrPages.bulkPut(interrupted.map((page) => ({
    ...page,
    status: 'cancelled' as const,
    updatedAt: now,
  })));
  return interrupted.length;
}

function pageRecordId(documentId: string, page: number): string {
  return `${documentId}:ocr:${page}`;
}

function chunksForOcr(paperId: string, page: number, text: string, updatedAt: number): PaperChunk[] {
  const chunks: PaperChunk[] = [];
  for (let offset = 0, index = 0; offset < text.length; offset += 3_200, index += 1) {
    chunks.push({
      id: `${paperId}:ocr:p${page}:${index}`,
      paperId,
      page,
      text: text.slice(offset, offset + 3_200),
      source: 'ocr',
      updatedAt,
    });
  }
  return chunks;
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The PDF page could not be prepared for OCR.'));
    }, 'image/png');
  });
}

async function rasterizePage(
  document: PDFDocumentProxy,
  pageNumber: number,
  signal: AbortSignal,
): Promise<Blob> {
  if (signal.aborted) throw new DOMException('OCR cancelled.', 'AbortError');
  const page = await document.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.4, 2400 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale: Math.max(1.5, scale) });
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas rendering is unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let task: RenderTask | undefined;
  const cancel = () => task?.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    task = page.render({ canvas, canvasContext: context, viewport });
    await task.promise;
    if (signal.aborted) throw new DOMException('OCR cancelled.', 'AbortError');
    return await canvasBlob(canvas);
  } finally {
    signal.removeEventListener('abort', cancel);
    canvas.width = 1;
    canvas.height = 1;
  }
}

async function updatePendingStatus(
  paperId: string,
  documentId: string,
  pages: number[],
  language: OcrLanguage,
  status: OcrPage['status'],
): Promise<void> {
  const db = await openPaperFlowDatabase();
  const now = Date.now();
  const ids = pages.map((page) => pageRecordId(documentId, page));
  const existing = await db.ocrPages.bulkGet(ids);
  await db.ocrPages.bulkPut(pages.map((page, index): OcrPage => {
    const current = existing[index];
    if ((status === 'cancelled' || status === 'failed') && current?.status === 'complete') return current;
    return {
      id: ids[index],
      paperId,
      documentId,
      page,
      text: current?.text || '',
      language,
      confidence: current?.confidence || 0,
      engineVersion: current?.engineVersion || 'tesseract.js-7',
      status,
      updatedAt: now,
    };
  }));
}

export function startOcr(input: {
  document: PDFDocumentProxy;
  documentId: string;
  paperId: string;
  pages: number[];
  language: OcrLanguage;
  onProgress?: (progress: OcrProgress) => void;
  onPage?: (page: OcrPage) => void;
}): OcrJob {
  const controller = new AbortController();
  let worker: Worker | undefined;
  const uniquePages = [...new Set(input.pages)]
    .filter((page) => Number.isInteger(page) && page >= 1 && page <= input.document.numPages)
    .sort((left, right) => left - right);

  const promise = (async () => {
    if (!uniquePages.length) throw new Error('Choose at least one valid PDF page for OCR.');
    await updatePendingStatus(input.paperId, input.documentId, uniquePages, input.language, 'pending');
    const images: OcrWorkerPage[] = [];
    try {
      for (let index = 0; index < uniquePages.length; index += 1) {
        const page = uniquePages[index];
        input.onProgress?.({
          page,
          completedPages: 0,
          totalPages: uniquePages.length,
          progress: index / uniquePages.length,
          status: 'Preparing page',
        });
        images.push({ page, image: await rasterizePage(input.document, page, controller.signal) });
      }
      if (controller.signal.aborted) throw new DOMException('OCR cancelled.', 'AbortError');
      await updatePendingStatus(input.paperId, input.documentId, uniquePages, input.language, 'running');
      worker = new Worker(new URL('../../workers/ocr.worker.ts', import.meta.url), { type: 'module' });
      const id = crypto.randomUUID();
      const records = new Map<number, OcrPage>();
      const writes: Promise<void>[] = [];
      await new Promise<void>((resolve, reject) => {
        if (!worker) return reject(new Error('OCR worker could not be started.'));
        const abort = () => reject(new DOMException('OCR cancelled.', 'AbortError'));
        controller.signal.addEventListener('abort', abort, { once: true });
        const resolveAndCleanup = () => {
          controller.signal.removeEventListener('abort', abort);
          resolve();
        };
        const rejectAndCleanup = (reason: Error) => {
          controller.signal.removeEventListener('abort', abort);
          reject(reason);
        };
        worker.onmessage = (event: MessageEvent<OcrWorkerResponse>) => {
          const response = event.data;
          if (response.id !== id) return;
          if (response.type === 'error') {
            rejectAndCleanup(new Error(response.error));
            return;
          }
          if (response.type === 'progress') {
            input.onProgress?.({
              page: response.page,
              completedPages: records.size,
              totalPages: uniquePages.length,
              progress: response.progress,
              status: response.status,
            });
            return;
          }
          if (response.type === 'page') {
            const now = Date.now();
            const record: OcrPage = {
              id: pageRecordId(input.documentId, response.page),
              paperId: input.paperId,
              documentId: input.documentId,
              page: response.page,
              text: response.text,
              language: input.language,
              confidence: response.confidence,
              engineVersion: response.version,
              status: 'complete',
              updatedAt: now,
            };
            records.set(response.page, record);
            const write = openPaperFlowDatabase().then(async (db) => {
              await db.transaction('rw', db.ocrPages, db.paperChunks, async () => {
                await db.ocrPages.put(record);
                const oldChunks = await db.paperChunks
                  .where('[paperId+page]')
                  .equals([input.paperId, response.page])
                  .filter((chunk) => chunk.source === 'ocr')
                  .toArray();
                await db.paperChunks.bulkDelete(oldChunks.map((chunk) => chunk.id));
                await db.paperChunks.bulkPut(chunksForOcr(input.paperId, response.page, response.text, now));
              });
              input.onPage?.(record);
            });
            writes.push(write);
            void write.catch((reason: unknown) => rejectAndCleanup(
              reason instanceof Error ? reason : new Error('OCR result could not be saved.'),
            ));
            return;
          }
          if (response.type === 'complete') resolveAndCleanup();
        };
        worker.onerror = (event) => rejectAndCleanup(new Error(event.message || 'OCR worker failed.'));
        worker.postMessage({ id, language: input.language, pages: images });
      });
      await Promise.all(writes);
      await indexPaper(input.paperId).catch(() => undefined);
      const db = await openPaperFlowDatabase();
      return (await db.ocrPages.bulkGet(uniquePages.map((page) => pageRecordId(input.documentId, page))))
        .filter((record): record is OcrPage => Boolean(record?.status === 'complete'));
    } catch (reason) {
      const cancelled = controller.signal.aborted
        || (reason instanceof DOMException && reason.name === 'AbortError');
      await updatePendingStatus(
        input.paperId,
        input.documentId,
        uniquePages,
        input.language,
        cancelled ? 'cancelled' : 'failed',
      );
      throw cancelled ? new DOMException('OCR cancelled.', 'AbortError') : reason;
    } finally {
      worker?.terminate();
    }
  })();

  return {
    promise,
    cancel: () => {
      controller.abort();
      worker?.terminate();
    },
  };
}
