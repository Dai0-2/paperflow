import { FileQuestion } from 'lucide-react';
import type { PageViewport } from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceSurface } from '../../App';
import { AnnotationInspector } from '../annotations/AnnotationInspector';
import { AnnotationToolbar } from '../annotations/AnnotationToolbar';
import { isMarkupAnnotation } from '../annotations/MarkupQuickActions';
import { useAnnotationTool } from '../../hooks/useAnnotationTool';
import { usePdfDocument } from '../../hooks/usePdfDocument';
import { useReaderNavigation } from '../../hooks/useReaderNavigation';
import { useWorkspaceBootstrap } from '../../hooks/useWorkspaceBootstrap';
import { text } from '../../i18n';
import type { AnnotationDraft } from '../../repositories/annotationRepository';
import {
  addPaperToCollection,
  getPaperRelations,
  movePaperToTrash,
  removePaperFromCollection,
  savePaperToLibrary,
} from '../../repositories/libraryRepository';
import {
  createTextAnchor,
  rangeRectsToPdfQuads,
} from '../../services/annotations/coordinates';
import {
  selectionRectBounds,
  textSelectionRects,
} from '../../services/annotations/selectionGeometry';
import { sendToCodex, sendToOpenAI } from '../../services/bridge';
import { saveSelection } from '../../services/database';
import {
  recoverStaleOcrJobs,
  startOcr,
  type OcrJob,
  type OcrLanguage,
  type OcrProgress,
} from '../../services/ocr/ocrService';
import { queueStoredDocumentsForSync } from '../../services/storage/documentStore';
import { useAppStore } from '../../store/useAppStore';
import type { Annotation, PdfQuad, PaperSelection, ReaderSidebar, TextAnchor } from '../../types';
import { PdfPage } from './PdfPage';
import { ReaderOpenState, ReaderSidebarPanel, SelectionToolbar } from './ReaderPanels';
import type { FlatOutlineItem } from './ReaderPanels';
import { SaveToLibraryDialog } from './SaveToLibraryDialog';
import { ReaderToolbar } from './ReaderToolbar';

export function ReaderApp() {
  useWorkspaceBootstrap();
  const fileInput = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 1100);
  const [sidebarView, setSidebarView] = useState<ReaderSidebar>('thumbnails');
  const [assistantOpen, setAssistantOpen] = useState(() => window.innerWidth > 760);
  const [assistantWidth, setAssistantWidth] = useState(390);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectionToolbar, setSelectionToolbar] = useState<{
    x: number;
    y: number;
    text: string;
    page: number;
    quadPoints: PdfQuad[];
    anchor: TextAnchor;
  }>();
  const [renderAll, setRenderAll] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [translationStatus, setTranslationStatus] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [ocrProgress, setOcrProgress] = useState<OcrProgress>();
  const ocrJob = useRef<OcrJob | undefined>(undefined);
  const viewports = useRef(new Map<number, PageViewport>());
  const {
    paper,
    theme,
    uiLanguage,
    setPaper,
    setSelection,
    setDraft,
    setTheme,
  } = useAppStore();
  const annotationState = useAnnotationTool(paper?.id);
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

  const onViewportReady = useCallback((pageNumber: number, viewport: PageViewport) => {
    viewports.current.set(pageNumber, viewport);
  }, []);

  const annotationsByPage = useMemo(() => {
    const result = new Map<number, typeof annotationState.annotations>();
    for (const annotation of annotationState.annotations) {
      const pageAnnotations = result.get(annotation.page) || [];
      pageAnnotations.push(annotation);
      result.set(annotation.page, pageAnnotations);
    }
    return result;
  }, [annotationState.annotations]);

  const onSelection = () => {
    window.setTimeout(() => {
      const browserSelection = window.getSelection();
      const selectedText = browserSelection?.toString().replace(/\s+/g, ' ').trim();
      if (!browserSelection || browserSelection.isCollapsed || !selectedText) {
        setSelectionToolbar(undefined);
        return;
      }
      setTranslationStatus(new Map());
      const range = browserSelection.getRangeAt(0);
      const startContainer = range.startContainer;
      const element = (startContainer.nodeType === Node.ELEMENT_NODE
        ? startContainer
        : startContainer.parentElement) as HTMLElement | null;
      const pageElement = element?.closest<HTMLElement>('.pdf-page');
      if (!pageElement) return;
      const selectedPage = Number(pageElement.dataset.page);
      const viewport = viewports.current.get(selectedPage);
      if (!viewport) return;
      const clientRects = textSelectionRects(range, pageElement);
      const rectangle = selectionRectBounds(clientRects);
      if (!rectangle) {
        setSelectionToolbar(undefined);
        return;
      }
      const quadPoints = rangeRectsToPdfQuads(
        clientRects,
        pageElement.getBoundingClientRect(),
        viewport,
      );
      if (!quadPoints.length) return;
      const horizontalMargin = Math.max(8, Math.min(180, window.innerWidth / 2 - 8));
      const captured = {
        x: Math.max(
          horizontalMargin,
          Math.min(window.innerWidth - horizontalMargin, rectangle.left + rectangle.width / 2),
        ),
        y: Math.max(58, rectangle.top - 10),
        text: selectedText.slice(0, 8_000),
        page: selectedPage,
        quadPoints,
        anchor: createTextAnchor(browserSelection, selectedText.slice(0, 8_000)),
      };
      if (
        annotationState.tool === 'highlight'
        || annotationState.tool === 'underline'
        || annotationState.tool === 'strikeout'
      ) {
        void addPersistentAnnotation({
          page: captured.page,
          text: captured.text,
          type: annotationState.tool,
          color: annotationState.color,
          quadPoints: captured.quadPoints,
          anchor: captured.anchor,
        });
        browserSelection.removeAllRanges();
        setSelectionToolbar(undefined);
      } else {
        setSelectionToolbar(captured);
      }
    });
  };

  const translateAnnotation = async (annotation: Annotation) => {
    const current = useAppStore.getState();
    const ready = current.providerMode === 'api'
      ? current.apiState === 'connected'
      : current.bridgeState === 'connected';
    if (!ready) {
      setTranslationStatus(new Map([[
        annotation.id,
        `!${text(uiLanguage, 'Connect an AI provider to translate.', '请先连接 AI 服务后再翻译。')}`,
      ]]));
      return;
    }

    setTranslationStatus(new Map([[
      annotation.id,
      text(uiLanguage, 'Translating…', '正在翻译…'),
    ]]));
    let streamed = '';
    const targetLanguage = uiLanguage === 'zh' ? 'Simplified Chinese' : 'English';
    const question = `Translate the selected passage into ${targetLanguage}. Return only the translation, without commentary or quotation marks.`;
    const context = `SELECTED PASSAGE\n${annotation.text}`;
    try {
      const result = current.providerMode === 'api'
        ? await sendToOpenAI(
          question,
          context,
          [],
          current.model,
          current.apiBaseUrl,
          current.apiProtocol,
          uiLanguage,
          (event) => {
            if (event.event === 'delta' && event.delta) streamed += event.delta;
          },
        )
        : await sendToCodex(
            question,
            context,
            [],
            current.model === 'ChatGPT via Codex' ? undefined : current.model,
            uiLanguage,
            (event) => {
              if (event.event === 'delta' && event.delta) streamed += event.delta;
            },
          );
      const translation = (result.answer || streamed).trim();
      if (!result.ok || !translation) {
        throw new Error(result.error || text(uiLanguage, 'Translation failed.', '翻译失败。'));
      }
      await annotationState.update(annotation.id, { translation });
      setTranslationStatus(new Map([[annotation.id, translation]]));
    } catch (reason) {
      setTranslationStatus((status) => new Map(status).set(
        annotation.id,
        `!${reason instanceof Error ? reason.message : text(uiLanguage, 'Translation failed.', '翻译失败。')}`,
      ));
    }
  };

  const useSelectedText = async (action: 'ask' | 'explain' | 'translate' | 'summarize' | 'highlight') => {
    if (!selectionToolbar || !paper) return;
    const captured = selectionToolbar;
    setSelectionToolbar(undefined);
    window.getSelection()?.removeAllRanges();
    const selection: PaperSelection = {
      id: crypto.randomUUID(),
      paperId: paper.id,
      page: captured.page,
      text: captured.text,
      createdAt: Date.now(),
    };
    setSelection(selection);
    await saveSelection(selection);
    if (action === 'highlight' || action === 'translate') {
      const annotation = await addPersistentAnnotation({
        page: captured.page,
        text: captured.text,
        type: 'highlight',
        color: annotationState.color,
        quadPoints: captured.quadPoints,
        anchor: captured.anchor,
      });
      annotationState.select(undefined);
      if (action === 'translate') void translateAnnotation(annotation);
    } else {
      const prompts = {
        ask: uiLanguage === 'zh' ? '基于选中内容回答：' : 'Answer using the selected passage:',
        explain: uiLanguage === 'zh' ? '解释这段内容，说明关键概念和推理步骤。' : 'Explain this passage, including its key concepts and reasoning.',
        summarize: uiLanguage === 'zh' ? '简洁总结这段内容。' : 'Summarize this passage concisely.',
      };
      setDraft(prompts[action]);
      setAssistantOpen(true);
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('paperflow:focus-composer')));
    }
  };

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const link = documentRef.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const exportAnnotations = async () => {
    if (!documentData || !annotationState.annotations.length) return;
    setOperationError('');
    const exporter = await import('../../services/annotations/exportPdf');
    try {
      const output = await exporter.exportAnnotatedPdf(documentData, annotationState.annotations);
      downloadBlob(
        new Blob([output.slice().buffer], { type: 'application/pdf' }),
        exporter.annotatedPdfName(source?.name || 'paper.pdf'),
      );
    } catch (reason) {
      const baseName = (source?.name || 'paper.pdf').replace(/\.pdf$/i, '') || 'paper';
      downloadBlob(
        new Blob([exporter.annotationsAsJson(annotationState.annotations)], { type: 'application/json' }),
        `${baseName}-paperflow-annotations.json`,
      );
      downloadBlob(
        new Blob([exporter.annotationsAsMarkdown(annotationState.annotations)], { type: 'text/markdown' }),
        `${baseName}-paperflow-annotations.md`,
      );
      setOperationError(text(
        uiLanguage,
        `${reason instanceof Error ? reason.message : 'PDF export failed.'} JSON and Markdown backups were downloaded instead.`,
        `${reason instanceof Error ? reason.message : 'PDF 导出失败。'} 已改为下载 JSON 和 Markdown 备份。`,
      ));
    }
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

  async function persistToLibrary(
    collectionIds?: string[],
    cacheOffline = false,
  ) {
    if (!paper || savingLibrary) return paper;
    setSavingLibrary(true);
    setOperationError('');
    try {
      const savedPaper = paper.libraryState === 'saved'
        ? paper
        : await savePaperToLibrary(paper.id);
      if (collectionIds) {
        const currentIds = new Set(
          (await getPaperRelations(savedPaper.id)).collections.map((collection) => collection.id),
        );
        for (const collectionId of collectionIds) {
          if (!currentIds.has(collectionId)) {
            await addPaperToCollection(savedPaper.id, collectionId);
          }
        }
        for (const collectionId of currentIds) {
          if (!collectionIds.includes(collectionId)) {
            await removePaperFromCollection(savedPaper.id, collectionId);
          }
        }
      }
      if (cacheOffline && !activeDocument) {
        setSavingOffline(true);
        const document = await saveOffline(savedPaper);
        await queueStoredDocumentsForSync(savedPaper.id);
        if (!document) throw new Error('The offline PDF could not be saved.');
      }
      if (savedPaper !== paper) setPaper(savedPaper);
      return savedPaper;
    } catch (reason) {
      setOperationError(reason instanceof Error
        ? reason.message
        : text(uiLanguage, 'The paper could not be saved to PaperFlow.', '无法将论文保存到 PaperFlow。'));
      throw reason;
    } finally {
      setSavingOffline(false);
      setSavingLibrary(false);
    }
  }

  async function addPersistentAnnotation(draft: AnnotationDraft): Promise<Annotation> {
    if (paper?.libraryState !== 'saved') {
      await persistToLibrary().catch(() => undefined);
    }
    return annotationState.add(draft);
  }

  const persistOffline = async () => {
    if (!paper || !documentData || savingOffline) return activeDocument;
    setSavingOffline(true);
    setOperationError('');
    try {
      setSavingLibrary(paper.libraryState !== 'saved');
      const savedPaper = paper.libraryState === 'saved' ? paper : await savePaperToLibrary(paper.id);
      if (savedPaper !== paper) setPaper(savedPaper);
      const document = await saveOffline(savedPaper);
      await queueStoredDocumentsForSync(savedPaper.id);
      return document;
    } catch (reason) {
      setOperationError(reason instanceof Error
        ? reason.message
        : text(uiLanguage, 'The PDF could not be saved offline.', '无法保存离线 PDF。'));
      return undefined;
    } finally {
      setSavingLibrary(false);
      setSavingOffline(false);
    }
  };

  const runOcr = async (fromPage: number, toPage: number, language: OcrLanguage) => {
    if (!pdfDocument || !paper) return;
    if (toPage - fromPage + 1 > 50) {
      setOperationError(text(uiLanguage, 'Run OCR on at most 50 pages at a time.', '每次最多对 50 页运行 OCR。'));
      return;
    }
    setOperationError('');
    let document = activeDocument;
    if (!document) {
      setSavingOffline(true);
      try {
        document = await saveOffline(paper);
      } catch (reason) {
        setOperationError(reason instanceof Error
          ? reason.message
          : text(uiLanguage, 'The PDF could not be prepared for OCR.', '无法为 OCR 准备 PDF。'));
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
        setOperationError(reason instanceof Error ? reason.message : text(uiLanguage, 'OCR failed.', 'OCR 失败。'));
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
  useEffect(() => {
    const annotationId = annotationState.selected?.id;
    if (!annotationId) return;
    const removeOnKey = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && target.closest('input, textarea, select, [contenteditable="true"]')
      ) return;
      event.preventDefault();
      setTranslationStatus((status) => {
        const next = new Map(status);
        next.delete(annotationId);
        return next;
      });
      void annotationState.remove(annotationId);
    };
    window.addEventListener('keydown', removeOnKey);
    return () => window.removeEventListener('keydown', removeOnKey);
  }, [annotationState.remove, annotationState.selected?.id]);

  const dismissReaderOverlays = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (
      target.closest(
        '[data-annotation-action], .annotation-hit, .annotation-inspector, .annotation-toolbar',
      )
      || target.closest('.textLayer span')
    ) return;
    setSelectionToolbar(undefined);
    setTranslationStatus(new Map());
    annotationState.select(undefined);
    window.getSelection()?.removeAllRanges();
  };

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
      language={uiLanguage}
      sidebarOpen={sidebarOpen}
      assistantOpen={assistantOpen}
      searchQuery={searchQuery}
      searchPages={searchPages}
      libraryState={savingLibrary ? 'saving' : paper?.libraryState === 'saved' ? 'saved' : 'temporary'}
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
      onSaveToLibrary={() => setLibraryDialogOpen(true)}
      onSaveOffline={() => void persistOffline()}
      onStartOcr={(fromPage, toPage, language) => void runOcr(fromPage, toPage, language)}
      onCancelOcr={() => ocrJob.current?.cancel()}
    />
    <div className="reader-workspace">
      {sidebarOpen && pdfDocument && <ReaderSidebarPanel
        document={pdfDocument}
        language={uiLanguage}
        pageCount={pageCount}
        page={page}
        view={sidebarView}
        outline={outline}
        annotations={annotationState.annotations}
        selectedAnnotationId={annotationState.selected?.id}
        onViewChange={setSidebarView}
        onPageChange={goToPage}
        onOutlineClick={(item) => void resolveOutline(item)}
        onAnnotationClick={(annotation) => {
          setTranslationStatus(new Map());
          goToPage(annotation.page);
          annotationState.select(annotation.id);
        }}
      />}
      <section className="reader-document">
        {!pdfDocument && <ReaderOpenState url={urlDraft} language={uiLanguage} loading={loading} progress={loadProgress} error={error} accessRequired={Boolean(pendingUrl)} onUrlChange={setUrlDraft} onSubmit={() => void prepareUrl(urlDraft)} onOpenFile={() => fileInput.current?.click()} onGrantAccess={() => void grantAccess()} />}
        {pdfDocument && <>
          <AnnotationToolbar
            tool={annotationState.tool}
            language={uiLanguage}
            color={annotationState.color}
            annotationCount={annotationState.annotations.length}
            onToolChange={(tool) => {
              setTranslationStatus(new Map());
              annotationState.setTool(tool);
              annotationState.select(undefined);
            }}
            onColorChange={annotationState.setColor}
            onExport={() => void exportAnnotations()}
          />
          {(operationError || error) && <div className="reader-warning"><FileQuestion />{operationError || error}</div>}
          <div
            ref={scrollRoot}
            className="reader-scroll"
            onPointerDown={dismissReaderOverlays}
            onPointerUp={onSelection}
          >
            <div className="reader-pages">
              {Array.from({ length: pageCount }, (_, index) => {
                const pageNumber = index + 1;
                return <PdfPage
                  key={pageNumber}
                  document={pdfDocument}
                  pageNumber={pageNumber}
                  scale={scale}
                  searchQuery={searchQuery}
                  annotations={annotationsByPage.get(pageNumber) || []}
                  annotationTool={annotationState.tool}
                  annotationColor={annotationState.color}
                  selectedAnnotationId={annotationState.selected?.id}
                  language={uiLanguage}
                  translationStatus={translationStatus}
                  onViewportReady={onViewportReady}
                  onCreateAnnotation={addPersistentAnnotation}
                  onSelectAnnotation={(annotationId) => {
                    setTranslationStatus((status) => (
                      status.has(annotationId) ? status : new Map()
                    ));
                    annotationState.select(annotationId);
                  }}
                  onUpdateAnnotation={(annotationId, patch) => annotationState.update(annotationId, patch)}
                  onDeleteAnnotation={(annotationId) => {
                    setTranslationStatus((status) => {
                      const next = new Map(status);
                      next.delete(annotationId);
                      return next;
                    });
                    return annotationState.remove(annotationId);
                  }}
                  forceRender={renderAll}
                />;
              })}
            </div>
          </div>
          {!isMarkupAnnotation(annotationState.selected) && <AnnotationInspector
            annotation={annotationState.selected}
            language={uiLanguage}
            onClose={() => {
              const annotationId = annotationState.selected?.id;
              if (annotationId) {
                setTranslationStatus((status) => {
                  const next = new Map(status);
                  next.delete(annotationId);
                  return next;
                });
              }
              annotationState.select(undefined);
            }}
            onUpdate={(patch) => annotationState.update(annotationState.selected!.id, patch)}
            onDelete={() => {
              const annotationId = annotationState.selected!.id;
              setTranslationStatus((status) => {
                const next = new Map(status);
                next.delete(annotationId);
                return next;
              });
              return annotationState.remove(annotationId);
            }}
          />}
        </>}
      </section>
      {assistantOpen && <><div className="reader-divider" role="separator" aria-orientation="vertical" onPointerDown={startResize} /><aside className="reader-assistant"><WorkspaceSurface /></aside></>}
    </div>
    {selectionToolbar && <SelectionToolbar x={selectionToolbar.x} y={selectionToolbar.y} language={uiLanguage} onAction={(action) => void useSelectedText(action)} />}
    {libraryDialogOpen && paper && <SaveToLibraryDialog
      paperId={paper.id}
      paperTitle={paper.title}
      language={uiLanguage}
      saved={paper.libraryState === 'saved'}
      offlineAvailable={Boolean(activeDocument)}
      onClose={() => setLibraryDialogOpen(false)}
      onConfirm={async (collectionIds, cacheOffline) => {
        await persistToLibrary(collectionIds, cacheOffline);
      }}
      onRemove={async () => {
        await movePaperToTrash(paper.id);
        setPaper({
          ...paper,
          libraryState: 'trashed',
          favorite: false,
          deletedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }}
    />}
  </main>;
}
