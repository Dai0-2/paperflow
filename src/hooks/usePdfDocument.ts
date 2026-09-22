import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from '../pdf-worker.ts?worker&url';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatOutlineItem } from '../components/reader/ReaderPanels';
import { openPaperFlowDatabase } from '../db/PaperFlowDatabase';
import { contentHash, paperFromUrl } from '../services/paper';
import { chunksFromPages } from '../services/paperContext';
import { indexPaper } from '../services/search/searchIndexer';
import {
  loadStoredDocumentForPaper,
  storePdfDocument,
} from '../services/storage/documentStore';
import { useAppStore } from '../store/useAppStore';
import type { OcrPage, PaperDocument, PaperInfo } from '../types';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ReaderSource {
  url?: string;
  data?: Uint8Array;
  name: string;
  paperId?: string;
  documentId?: string;
}

interface OutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineItem[];
}

function flattenOutline(items: OutlineItem[], depth = 0): FlatOutlineItem[] {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flattenOutline(item.items || [], depth + 1),
  ]);
}

function errorMessage(reason: unknown) {
  if (!(reason instanceof Error)) return 'The PDF could not be opened.';
  if (/password/i.test(reason.name) || /password/i.test(reason.message)) return 'This PDF is encrypted. Password-protected documents are not supported in this MVP.';
  if (/missing|404/i.test(reason.message)) return 'The PDF could not be found. Check the URL or download it and open the local file.';
  if (/cors|fetch|network|response/i.test(reason.message)) return 'The PDF host blocked access or requires a signed-in browser session. Download the file and open it locally.';
  return reason.message;
}

async function hasOriginPermission(rawUrl: string) {
  if (typeof chrome === 'undefined' || !chrome.permissions) return true;
  const url = new URL(rawUrl);
  if (!/^https?:$/.test(url.protocol)) return false;
  return chrome.permissions.contains({ origins: [`${url.origin}/*`] });
}

async function requestOriginPermission(rawUrl: string) {
  if (typeof chrome === 'undefined' || !chrome.permissions) return true;
  const url = new URL(rawUrl);
  return chrome.permissions.request({ origins: [`${url.origin}/*`] });
}

export function usePdfDocument() {
  const loadGeneration = useRef(0);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy>();
  const [source, setSource] = useState<ReaderSource>();
  const [documentData, setDocumentData] = useState<Uint8Array>();
  const [activeDocument, setActiveDocument] = useState<PaperDocument>();
  const [pendingUrl, setPendingUrl] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [pageWidth, setPageWidth] = useState(612);
  const [outline, setOutline] = useState<FlatOutlineItem[]>([]);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const {
    setPaper,
    setPaperText,
    setPaperChunks,
    setReadingPaper,
  } = useAppStore();

  const loadSource = useCallback(async (nextSource: ReaderSource) => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError('');
    setLoadProgress(0);
    setPageTexts([]);
    setDocumentData(undefined);
    setActiveDocument(undefined);
    setPaperChunks([]);
    setReadingPaper(true);
    try {
      const task = getDocument(nextSource.data
        ? { data: nextSource.data.slice() }
        : { url: nextSource.url, withCredentials: true });
      task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
        if (generation === loadGeneration.current) setLoadProgress(total ? loaded / total : 0);
      };
      const nextDocument = await task.promise;
      if (generation !== loadGeneration.current) {
        await nextDocument.cleanup();
        return;
      }
      const firstPage = await nextDocument.getPage(1);
      setPageWidth(firstPage.getViewport({ scale: 1 }).width);
      const metadata = await nextDocument.getMetadata().catch(() => undefined);
      const info = metadata?.info as Record<string, unknown> | undefined;
      const metadataTitle = typeof info?.Title === 'string' ? info.Title.trim() : '';
      const metadataAuthor = typeof info?.Author === 'string' ? info.Author.trim() : '';
      const title = metadataTitle || nextSource.name.replace(/\.pdf$/i, '') || 'Untitled paper';
      const bytes = Uint8Array.from(nextSource.data || await nextDocument.getData());
      const hash = await contentHash(bytes.slice().buffer);
      const db = await openPaperFlowDatabase();
      const storedPaper = nextSource.paperId ? await db.papers.get(nextSource.paperId) : undefined;
      const detectedPaper = paperFromUrl(nextSource.url || storedPaper?.url || `local:${nextSource.name}`, title);
      const basePaper = storedPaper ? { ...detectedPaper, ...storedPaper } : detectedPaper;
      const hashAlias = await db.paperAliases.get(`content-hash:${hash}`);
      const nextPaper: PaperInfo = {
        ...basePaper,
        id: nextSource.paperId || hashAlias?.paperId || (nextSource.data ? `content:${hash}` : basePaper.id),
        authors: metadataAuthor || basePaper.authors,
        contentHash: hash,
        source: nextSource.documentId || nextSource.data ? 'Local PDF' : basePaper.source,
        pageCount: nextDocument.numPages,
        currentPage: 1,
      };
      setPdfDocument(nextDocument);
      setSource(nextSource);
      setDocumentData(bytes);
      setPageCount(nextDocument.numPages);
      setPaper(nextPaper);
      if (nextSource.documentId) {
        const stored = await db.documents.get(nextSource.documentId);
        if (stored) setActiveDocument(stored);
      }
      const rawOutline = await nextDocument.getOutline().catch(() => null);
      setOutline(flattenOutline((rawOutline || []) as OutlineItem[]));
      setLoading(false);

      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= nextDocument.numPages; pageNumber += 1) {
        if (generation !== loadGeneration.current) return;
        const pdfPage = await nextDocument.getPage(pageNumber);
        const textContent = await pdfPage.getTextContent();
        pages.push(textContent.items.map((item) => ('str' in item ? item.str : '')).join(' '));
        if (pageNumber % 5 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      const textChunks = chunksFromPages(nextPaper.id, pages).map((chunk) => ({
        ...chunk,
        source: 'text-layer' as const,
        updatedAt: Date.now(),
      }));
      const ocrPages = (await db.ocrPages.where('paperId').equals(nextPaper.id).toArray())
        .filter((record) => record.status === 'complete');
      const mergedPages = [...pages];
      for (const record of ocrPages) {
        if (!mergedPages[record.page - 1]?.trim()) mergedPages[record.page - 1] = record.text;
      }
      await db.transaction('rw', db.paperChunks, async () => {
        const oldTextChunks = await db.paperChunks.where('paperId').equals(nextPaper.id)
          .filter((chunk) => chunk.source !== 'ocr')
          .toArray();
        await db.paperChunks.bulkDelete(oldTextChunks.map((chunk) => chunk.id));
        await db.paperChunks.bulkPut(textChunks);
      });
      const persistedChunks = await db.paperChunks.where('paperId').equals(nextPaper.id).toArray();
      setPageTexts(mergedPages);
      setPaperText(mergedPages.map((value, index) => `[Page ${index + 1}]\n${value}`).join('\n\n'));
      setPaperChunks(persistedChunks);
      await indexPaper(nextPaper.id).catch(() => undefined);
      if (mergedPages.every((value) => !value.trim())) {
        setError('The PDF has no readable text layer. You can read the pages, but selection and AI page context are unavailable.');
      }
    } catch (reason) {
      if (generation !== loadGeneration.current) return;
      setPdfDocument(undefined);
      setPageCount(0);
      setError(errorMessage(reason));
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
        setReadingPaper(false);
      }
    }
  }, [setPaper, setPaperChunks, setPaperText, setReadingPaper]);

  const saveOffline = useCallback(async (paper: PaperInfo) => {
    if (!documentData) throw new Error('The PDF bytes are not available yet.');
    const document = await storePdfDocument({
      paper,
      data: documentData,
      name: source?.name || 'paper.pdf',
      pageCount,
    });
    setActiveDocument(document);
    return document;
  }, [documentData, pageCount, source?.name]);

  const applyOcrPage = useCallback(async (record: OcrPage) => {
    const db = await openPaperFlowDatabase();
    const chunks = await db.paperChunks.where('paperId').equals(record.paperId).toArray();
    setPageTexts((current) => {
      const next = [...current];
      next[record.page - 1] = record.text;
      setPaperText(next.map((value, index) => `[Page ${index + 1}]\n${value}`).join('\n\n'));
      return next;
    });
    setPaperChunks(chunks);
  }, [setPaperChunks, setPaperText]);

  const prepareUrl = useCallback(async (rawUrl: string, title?: string) => {
    const value = rawUrl.trim();
    if (!value) return;
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) throw new Error('Only HTTP and HTTPS PDF URLs are supported. Use the file picker for local PDFs.');
      setUrlDraft(value);
      if (!await hasOriginPermission(value)) {
        setPendingUrl(value);
        setError('PaperFlow needs access to this PDF host before it can load the document.');
        return;
      }
      setPendingUrl('');
      await loadSource({
        url: value,
        name: title || decodeURIComponent(url.pathname.split('/').pop() || 'paper.pdf'),
      });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [loadSource]);

  const selectFile = useCallback(async (file?: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLocaleLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file.');
      return;
    }
    await loadSource({ data: new Uint8Array(await file.arrayBuffer()), name: file.name });
  }, [loadSource]);

  const grantAccess = useCallback(async () => {
    if (!pendingUrl) return;
    if (await requestOriginPermission(pendingUrl)) {
      const url = pendingUrl;
      setPendingUrl('');
      await prepareUrl(url);
    } else {
      setError('Access was not granted. Download the PDF and open it as a local file instead.');
    }
  }, [pendingUrl, prepareUrl]);

  useEffect(() => {
    const parameters = new URLSearchParams(location.search);
    const url = parameters.get('url');
    const paperId = parameters.get('paperId');
    const title = parameters.get('title') || undefined;
    let active = true;
    void (async () => {
      if (paperId) {
        const stored = await loadStoredDocumentForPaper(paperId);
        if (!active) return;
        if (stored) {
          await loadSource({
            data: stored.data,
            name: stored.document.name,
            paperId,
            documentId: stored.document.id,
          });
          return;
        }
      }
      if (url) await prepareUrl(url, title);
      else if (paperId) setError('The offline PDF is unavailable and this paper has no source URL to restore it.');
    })().catch((reason: unknown) => {
      if (active) setError(errorMessage(reason));
    });
    return () => {
      active = false;
    };
  }, [loadSource, prepareUrl]);

  useEffect(() => () => {
    loadGeneration.current += 1;
  }, []);

  useEffect(() => () => {
    void pdfDocument?.cleanup();
  }, [pdfDocument]);

  return {
    pdfDocument,
    source,
    documentData,
    activeDocument,
    pendingUrl,
    urlDraft,
    loading,
    loadProgress,
    error,
    pageCount,
    pageWidth,
    outline,
    pageTexts,
    setUrlDraft,
    setError,
    prepareUrl,
    selectFile,
    grantAccess,
    saveOffline,
    applyOcrPage,
  };
}
