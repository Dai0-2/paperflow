import { FileQuestion } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceSurface } from '../../App';
import { usePdfDocument } from '../../hooks/usePdfDocument';
import { useReaderNavigation } from '../../hooks/useReaderNavigation';
import { useWorkspaceBootstrap } from '../../hooks/useWorkspaceBootstrap';
import { savePaperToLibrary } from '../../repositories/libraryRepository';
import { saveAnnotation, saveSelection } from '../../services/database';
import {
  recoverStaleOcrJobs,
  startOcr,
  type OcrJob,
  type OcrLanguage,
  type OcrProgress,
} from '../../services/ocr/ocrService';
import { queueStoredDocumentsForSync } from '../../services/storage/documentStore';
import { useAppStore } from '../../store/useAppStore';
import type { PaperSelection, ReaderSidebar } from '../../types';
import { PdfPage } from './PdfPage';
import { ReaderOpenState, ReaderSidebarPanel, SelectionToolbar } from './ReaderPanels';
import type { FlatOutlineItem } from './ReaderPanels';
import { ReaderToolbar } from './ReaderToolbar';

export function ReaderApp() {
  useWorkspaceBootstrap();
  const fileInput = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 1100);
  const [sidebarView, setSidebarView] = useState<ReaderSidebar>('thumbnails');
  const [assistantOpen, setAssistantOpen] = useState(() => window.innerWidth > 760);
  const [assistantWidth, setAssistantWidth] = useState(390);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionToolbar, setSelectionToolbar] = useState<{ x: number; y: number; text: string; page: number }>();
  const [renderAll, setRenderAll] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [ocrProgress, setOcrProgress] = useState<OcrProgress>();
  const ocrJob = useRef<OcrJob | undefined>(undefined);
  const {
    paper,
    theme,
    uiLanguage,
    setPaper,
    setSelection,
    setDraft,
    setTheme,
  } = useAppStore();
  const {
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
    prepareUrl,
    selectFile,
    grantAccess,
    saveOffline,
    applyOcrPage,
  } = usePdfDocument();
  const {
    scrollRoot,
    page,
    scale,
    setScale,
    goToPage,
    fitWidth,
  } = useReaderNavigation({
    pdfDocument,
    pageCount,
    pageWidth,
    assistantWidth,
    setAssistantWidth,
  });

  const onSelection = () => {
    window.setTimeout(() => {
      const browserSelection = window.getSelection();
      const selectedText = browserSelection?.toString().replace(/\s+/g, ' ').trim();
      if (!browserSelection || browserSelection.isCollapsed || !selectedText) {
        setSelectionToolbar(undefined);
        return;
      }
      const range = browserSelection.getRangeAt(0);
      const element = (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement) as HTMLElement | null;
      const pageElement = element?.closest<HTMLElement>('.pdf-page');
      if (!pageElement) return;
      const rectangle = range.getBoundingClientRect();
      setSelectionToolbar({
        x: Math.max(180, Math.min(window.innerWidth - 180, rectangle.left + rectangle.width / 2)),
        y: Math.max(58, rectangle.top - 10),
        text: selectedText.slice(0, 8_000),
        page: Number(pageElement.dataset.page),
      });
    });
  };

  const useSelectedText = async (action: 'ask' | 'explain' | 'translate' | 'summarize' | 'save') => {
    if (!selectionToolbar || !paper) return;
    const selection: PaperSelection = {
      id: crypto.randomUUID(),
      paperId: paper.id,
      page: selectionToolbar.page,
      text: selectionToolbar.text,
      createdAt: Date.now(),
    };
    setSelection(selection);
    await saveSelection(selection);
    if (action === 'save') {
      await saveAnnotation({ ...selection, color: 'yellow' });
    } else {
      const prompts = {
        ask: uiLanguage === 'zh' ? '基于选中内容回答：' : 'Answer using the selected passage:',
        explain: uiLanguage === 'zh' ? '解释这段内容，说明关键概念和推理步骤。' : 'Explain this passage, including its key concepts and reasoning.',
        translate: uiLanguage === 'zh' ? '将这段内容准确翻译成中文。' : 'Translate this passage into clear English.',
        summarize: uiLanguage === 'zh' ? '简洁总结这段内容。' : 'Summarize this passage concisely.',
      };
      setDraft(prompts[action]);
      setAssistantOpen(true);
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('paperflow:focus-composer')));
    }
    setSelectionToolbar(undefined);
  };

  const resolveOutline = async (item: FlatOutlineItem) => {
    if (!pdfDocument || !item.dest) return;
    const destination = typeof item.dest === 'string' ? await pdfDocument.getDestination(item.dest) : item.dest;
    const reference = destination?.[0];
    if (!reference) return;
    const pageIndex = typeof reference === 'number' ? reference : await pdfDocument.getPageIndex(reference as { num: number; gen: number });
    goToPage(pageIndex + 1);
  };

  const searchPages = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return [];
    return pageTexts.flatMap((value, index) => value.toLocaleLowerCase().includes(query) ? [index + 1] : []);
  }, [pageTexts, searchQuery]);

  const download = () => {
    if (!source) return;
    const url = source.data ? URL.createObjectURL(new Blob([Uint8Array.from(source.data).buffer], { type: 'application/pdf' })) : source.url;
    if (!url) return;
    const link = documentRef.createElement('a');
    link.href = url;
    link.download = source.name || 'paper.pdf';
    link.click();
    if (source.data) window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const documentRef = window.document;

  const print = () => {
    setRenderAll(true);
    window.setTimeout(() => window.print(), 900);
  };

  const persistOffline = async () => {
    if (!paper || !documentData || savingOffline) return activeDocument;
    setSavingOffline(true);
    setOperationError('');
    try {
      const savedPaper = paper.libraryState === 'saved'
        ? paper
        : await savePaperToLibrary(paper.id);
      if (savedPaper !== paper) setPaper(savedPaper);
      const document = await saveOffline(savedPaper);
      await queueStoredDocumentsForSync(savedPaper.id);
      return document;
    } catch (reason) {
      setOperationError(reason instanceof Error ? reason.message : 'The PDF could not be saved offline.');
      return undefined;
    } finally {
      setSavingOffline(false);
    }
  };

  const runOcr = async (fromPage: number, toPage: number, language: OcrLanguage) => {
    if (!pdfDocument || !paper) return;
    if (toPage - fromPage + 1 > 50) {
      setOperationError('Run OCR on at most 50 pages at a time.');
      return;
    }
    setOperationError('');
    let document = activeDocument;
    if (!document) {
      setSavingOffline(true);
      try {
        document = await saveOffline(paper);
      } catch (reason) {
        setOperationError(reason instanceof Error ? reason.message : 'The PDF could not be prepared for OCR.');
        return;
      } finally {
        setSavingOffline(false);
      }
    }
    const job = startOcr({
      document: pdfDocument,
      documentId: document.id,
      paperId: paper.id,
      pages: Array.from({ length: toPage - fromPage + 1 }, (_, index) => fromPage + index),
      language,
      onProgress: setOcrProgress,
      onPage: (record) => { void applyOcrPage(record); },
    });
    ocrJob.current = job;
    try {
      await job.promise;
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        setOperationError(reason instanceof Error ? reason.message : 'OCR failed.');
      }
    } finally {
      if (ocrJob.current === job) {
        ocrJob.current = undefined;
        setOcrProgress(undefined);
      }
    }
  };

  useEffect(() => () => ocrJob.current?.cancel(), []);
  useEffect(() => {
    void recoverStaleOcrJobs();
  }, []);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = assistantWidth;
    const move = (moveEvent: PointerEvent) => {
      setAssistantWidth(Math.max(320, Math.min(window.innerWidth - 520, startWidth + startX - moveEvent.clientX)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return <main className="reader-app" style={{ '--assistant-width': `${assistantWidth}px` } as React.CSSProperties}>
    <input ref={fileInput} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
    <ReaderToolbar
      title={paper?.title || source?.name || 'PaperFlow Reader'}
      page={page}
      pageCount={pageCount}
      scale={scale}
      theme={theme}
      sidebarOpen={sidebarOpen}
      assistantOpen={assistantOpen}
      searchQuery={searchQuery}
      searchPages={searchPages}
      offlineState={activeDocument ? 'available' : savingOffline ? 'saving' : 'unavailable'}
      ocrProgress={ocrProgress}
      onPageChange={goToPage}
      onScaleChange={setScale}
      onFitWidth={() => void fitWidth()}
      onThemeChange={setTheme}
      onSidebarToggle={() => setSidebarOpen((open) => !open)}
      onAssistantToggle={() => setAssistantOpen((open) => !open)}
      onSearchChange={setSearchQuery}
      onOpenFile={() => fileInput.current?.click()}
      onDownload={download}
      onPrint={print}
      onSaveOffline={() => void persistOffline()}
      onStartOcr={(fromPage, toPage, language) => void runOcr(fromPage, toPage, language)}
      onCancelOcr={() => ocrJob.current?.cancel()}
    />
    <div className="reader-workspace">
      {sidebarOpen && pdfDocument && <ReaderSidebarPanel document={pdfDocument} pageCount={pageCount} page={page} view={sidebarView} outline={outline} onViewChange={setSidebarView} onPageChange={goToPage} onOutlineClick={(item) => void resolveOutline(item)} />}
      <section className="reader-document">
        {!pdfDocument && <ReaderOpenState url={urlDraft} loading={loading} progress={loadProgress} error={error} accessRequired={Boolean(pendingUrl)} onUrlChange={setUrlDraft} onSubmit={() => void prepareUrl(urlDraft)} onOpenFile={() => fileInput.current?.click()} onGrantAccess={() => void grantAccess()} />}
        {pdfDocument && <>
          {(operationError || error) && <div className="reader-warning"><FileQuestion />{operationError || error}</div>}
          <div ref={scrollRoot} className="reader-scroll" onPointerUp={onSelection}>
            <div className="reader-pages">
              {Array.from({ length: pageCount }, (_, index) => <PdfPage key={index + 1} document={pdfDocument} pageNumber={index + 1} scale={scale} searchQuery={searchQuery} forceRender={renderAll} />)}
            </div>
          </div>
        </>}
      </section>
      {assistantOpen && <><div className="reader-divider" role="separator" aria-orientation="vertical" onPointerDown={startResize} /><aside className="reader-assistant"><WorkspaceSurface /></aside></>}
    </div>
    {selectionToolbar && <SelectionToolbar x={selectionToolbar.x} y={selectionToolbar.y} language={uiLanguage} onAction={(action) => void useSelectedText(action)} />}
  </main>;
}
