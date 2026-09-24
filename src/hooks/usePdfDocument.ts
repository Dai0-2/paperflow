import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from '../pdf-worker.ts?worker&url';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatOutlineItem } from '../components/reader/ReaderPanels';
import { openPaperFlowDatabase } from '../db/PaperFlowDatabase';
import { text } from '../i18n';
import { contentHash, paperFromUrl } from '../services/paper';
import { chunksFromPages } from '../services/paperContext';
import { indexPaper } from '../services/search/searchIndexer';
import {
  downloadCloudDocumentForPaper,
  loadStoredDocumentForPaper,
  storePdfDocument,
} from '../services/storage/documentStore';
import { useAppStore } from '../store/useAppStore';
import type { Language, OcrPage, PaperDocument, PaperInfo } from '../types';

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

function errorMessage(reason: unknown, language: Language) {
  if (!(reason instanceof Error)) return text(language, 'The PDF could not be opened.', '无法打开此 PDF。');
  if (/password/i.test(reason.name) || /password/i.test(reason.message)) {
    return text(language, 'This PDF is encrypted. Password-protected documents are not supported.', '此 PDF 已加密，暂不支持受密码保护的文档。');
  }
  if (/missing|404/i.test(reason.message)) {
    return text(language, 'The PDF could not be found. Check the URL or download it and open the local file.', '找不到此 PDF。请检查链接，或下载后从本地打开。');
  }
  if (/cors|fetch|network|response/i.test(reason.message)) {
    return text(language, 'The PDF host blocked access or requires a signed-in browser session. Download the file and open it locally.', 'PDF 来源阻止了访问或需要登录。请下载文件后从本地打开。');
  }
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
  const pdfDocumentRef = useRef<PDFDocumentProxy | undefined>(undefined);
  const sourceRef = useRef<ReaderSource | undefined>(undefined);
  const documentDataRef = useRef<Uint8Array | undefined>(undefined);
  const documentDataPromiseRef = useRef<Promise<Uint8Array> | undefined>(undefined);
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
    uiLanguage,
    setPaper,
    setPaperText,
    setPaperChunks,
    setReadingPaper,
  } = useAppStore();

  const ensureDocumentData = useCallback(async () => {
    if (documentDataRef.current) return documentDataRef.current;
    if (documentDataPromiseRef.current) return documentDataPromiseRef.current;
    const currentDocument = pdfDocumentRef.current;
    const currentSource = sourceRef.current;
    const generation = loadGeneration.current;
    if (!currentDocument || !currentSource) {
      throw new Error(text(uiLanguage, 'The PDF is not ready yet.', 'PDF 尚未准备好。'));
    }
    const promise = (async () => {
      const bytes = Uint8Array.from(currentSource.data || await currentDocument.getData());
      if (generation !== loadGeneration.current) {
        throw new Error(text(uiLanguage, 'The open PDF changed while its data was loading.', '读取 PDF 数据时，当前文档已发生变化。'));
      }
      documentDataRef.current = bytes;
      setDocumentData(bytes);
      return bytes;
    })();
    documentDataPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      if (documentDataPromiseRef.current === promise) {
        documentDataPromiseRef.current = undefined;
      }
    }
  }, [uiLanguage]);

  const loadSource = useCallback(async (nextSource: ReaderSource) => {
    const generation = ++loadGeneration.current;
    let documentReady = false;
    setLoading(true);
    setError('');
    setLoadProgress(0);
    setPageTexts([]);
    setOutline([]);
    setDocumentData(undefined);
    documentDataRef.current = undefined;
    documentDataPromiseRef.current = undefined;
    pdfDocumentRef.current = undefined;
    sourceRef.current = undefined;
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
      const bytes = nextSource.data ? Uint8Array.from(nextSource.data) : undefined;
      const hash = bytes ? await contentHash(bytes.slice().buffer) : undefined;
      const db = await openPaperFlowDatabase();
      const storedPaper = nextSource.paperId ? await db.papers.get(nextSource.paperId) : undefined;
      const detectedPaper = paperFromUrl(nextSource.url || storedPaper?.url || `local:${nextSource.name}`, title);
      const basePaper = storedPaper ? { ...detectedPaper, ...storedPaper } : detectedPaper;
      const hashAlias = hash ? await db.paperAliases.get(`content-hash:${hash}`) : undefined;
      const nextPaper: PaperInfo = {
        ...basePaper,
        id: nextSource.paperId || hashAlias?.paperId || (hash ? `content:${hash}` : basePaper.id),
        authors: metadataAuthor || basePaper.authors,
        contentHash: hash || basePaper.contentHash,
        source: nextSource.documentId || nextSource.data ? 'Local PDF' : basePaper.source,
        pageCount: nextDocument.numPages,
        currentPage: 1,
      };
      pdfDocumentRef.current = nextDocument;
      sourceRef.current = nextSource;
      if (bytes) documentDataRef.current = bytes;
      setPdfDocument(nextDocument);
      setSource(nextSource);
      setDocumentData(bytes);
      setPageCount(nextDocument.numPages);
      setPaper(nextPaper);
      if (nextSource.documentId) {
        const stored = await db.documents.get(nextSource.documentId);
        if (stored) setActiveDocument(stored);
      }
      documentReady = true;
      setLoading(false);

      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const rawOutline = await nextDocument.getOutline().catch(() => null);
      if (generation !== loadGeneration.current) return;
      setOutline(flattenOutline((rawOutline || []) as OutlineItem[]));
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
        setError(text(uiLanguage, 'The PDF has no readable text layer. You can read the pages, but selection and AI page context are unavailable.', '此 PDF 没有可读文字层。你仍可阅读页面，但无法使用划词和 AI 页面上下文。'));
      }
    } catch (reason) {
      if (generation !== loadGeneration.current) return;
      if (!documentReady) {
        pdfDocumentRef.current = undefined;
        sourceRef.current = undefined;
        setPdfDocument(undefined);
        setPageCount(0);
      }
      setError(errorMessage(reason, uiLanguage));
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
        setReadingPaper(false);
      }
    }
  }, [setPaper, setPaperChunks, setPaperText, setReadingPaper, uiLanguage]);

  const saveOffline = useCallback(async (paper: PaperInfo) => {
    const bytes = await ensureDocumentData();
    const document = await storePdfDocument({
      paper,
      data: bytes,
      name: source?.name || 'paper.pdf',
      pageCount,
    });
    setActiveDocument(document);
    return document;
  }, [ensureDocumentData, pageCount, source?.name]);

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
      if (!/^https?:$/.test(url.protocol)) {
        throw new Error(text(uiLanguage, 'Only HTTP and HTTPS PDF URLs are supported. Use the file picker for local PDFs.', '仅支持 HTTP 和 HTTPS PDF 链接。本地 PDF 请使用文件选择器。'));
      }
      setUrlDraft(value);
      if (!await hasOriginPermission(value)) {
        setPendingUrl(value);
        setError(text(uiLanguage, 'PaperFlow needs access to this PDF host before it can load the document.', 'PaperFlow 需要获得此 PDF 来源的访问权限才能加载文档。'));
        return;
      }
      setPendingUrl('');
      await loadSource({
        url: value,
        name: title || decodeURIComponent(url.pathname.split('/').pop() || 'paper.pdf'),
      });
    } catch (reason) {
      setError(errorMessage(reason, uiLanguage));
    }
  }, [loadSource, uiLanguage]);

  const selectFile = useCallback(async (file?: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLocaleLowerCase().endsWith('.pdf')) {
      setError(text(uiLanguage, 'Choose a PDF file.', '请选择 PDF 文件。'));
      return;
    }
    await loadSource({ data: new Uint8Array(await file.arrayBuffer()), name: file.name });
  }, [loadSource, uiLanguage]);

  const grantAccess = useCallback(async () => {
    if (!pendingUrl) return;
    if (await requestOriginPermission(pendingUrl)) {
      const url = pendingUrl;
      setPendingUrl('');
      await prepareUrl(url);
    } else {
      setError(text(uiLanguage, 'Access was not granted. Download the PDF and open it as a local file instead.', '未授予访问权限。请下载 PDF 后从本地打开。'));
    }
  }, [pendingUrl, prepareUrl, uiLanguage]);

  useEffect(() => {
    const parameters = new URLSearchParams(location.search);
    const url = parameters.get('url');
    const paperId = parameters.get('paperId');
    const title = parameters.get('title') || undefined;
    const warning = parameters.get('warning');
    const autoLoad = parameters.get('autoLoad') !== 'false';
    let active = true;
    void (async () => {
      let cloudRestoreError = '';
      if (url) setUrlDraft(url);
      if (warning === 'pdf-handler-conflict') {
        setError(text(
          uiLanguage,
          'PaperFlow stopped a possible PDF-handler redirect loop. Disable one default PDF handler, then use the Side Panel or open this URL manually.',
          'PaperFlow 已停止可能的 PDF 接管循环。请关闭其中一个默认 PDF 接管器，然后使用 Side Panel，或手动打开此链接。',
        ));
        return;
      }
      if (paperId) {
        let stored = await loadStoredDocumentForPaper(paperId);
        if (!stored) {
          try {
            stored = await downloadCloudDocumentForPaper(paperId);
          } catch (reason) {
            cloudRestoreError = errorMessage(reason, uiLanguage);
          }
        }
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
      if (url && autoLoad) await prepareUrl(url, title);
      else if (paperId) {
        setError(cloudRestoreError || text(uiLanguage, 'The offline PDF is unavailable and this paper has no source URL to restore it.', '离线 PDF 不可用，且此论文没有可恢复的来源链接。'));
      }
    })().catch((reason: unknown) => {
      if (active) setError(errorMessage(reason, uiLanguage));
    });
    return () => {
      active = false;
    };
  }, [loadSource, prepareUrl, uiLanguage]);

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
    ensureDocumentData,
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
