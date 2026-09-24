import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';
import { updateReadingState } from '../services/database';
import { useAppStore } from '../store/useAppStore';

export function useReaderNavigation({
  pdfDocument,
  pageCount,
  pageWidth,
  assistantWidth,
  setAssistantWidth,
}: {
  pdfDocument?: PDFDocumentProxy;
  pageCount: number;
  pageWidth: number;
  assistantWidth: number;
  setAssistantWidth: (width: number) => void;
}) {
  const scrollRoot = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [scale, setScaleState] = useState(1);
  const { paper, updatePaper } = useAppStore();

  const setScale = useCallback((nextScale: number) => {
    const bounded = Math.min(2.5, Math.max(.45, nextScale));
    const root = scrollRoot.current;
    if (!root || Math.abs(bounded - scale) < .001) {
      setScaleState(bounded);
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const selection = window.getSelection();
    const selectionRect = selection && !selection.isCollapsed && selection.rangeCount
      ? selection.getRangeAt(0).getBoundingClientRect()
      : undefined;
    const selectionInsideRoot = selectionRect
      && selectionRect.width > 0
      && selectionRect.height > 0
      && selectionRect.bottom >= rootRect.top
      && selectionRect.top <= rootRect.bottom;
    const focusX = selectionInsideRoot
      ? Math.max(rootRect.left, Math.min(rootRect.right, selectionRect.left + selectionRect.width / 2))
      : rootRect.left + rootRect.width / 2;
    const focusY = selectionInsideRoot
      ? Math.max(rootRect.top, Math.min(rootRect.bottom, selectionRect.top + selectionRect.height / 2))
      : rootRect.top + rootRect.height / 2;
    const focusPage = document.elementsFromPoint(focusX, focusY)
      .map((element) => element.closest<HTMLElement>('.pdf-page'))
      .find(Boolean)
      || document.getElementById(`page-${page}`);
    const pageRect = focusPage?.getBoundingClientRect();
    const anchor = pageRect ? {
      pageId: focusPage!.id,
      xRatio: Math.max(0, Math.min(1, (focusX - pageRect.left) / pageRect.width)),
      yRatio: Math.max(0, Math.min(1, (focusY - pageRect.top) / pageRect.height)),
      clientX: focusX,
      clientY: focusY,
    } : undefined;

    setScaleState(bounded);
    if (!anchor) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const nextPage = document.getElementById(anchor.pageId);
      if (!nextPage || !scrollRoot.current) return;
      const nextRect = nextPage.getBoundingClientRect();
      const targetX = nextRect.left + nextRect.width * anchor.xRatio;
      const targetY = nextRect.top + nextRect.height * anchor.yRatio;
      const previousBehavior = scrollRoot.current.style.scrollBehavior;
      scrollRoot.current.style.scrollBehavior = 'auto';
      scrollRoot.current.scrollLeft += targetX - anchor.clientX;
      scrollRoot.current.scrollTop += targetY - anchor.clientY;
      scrollRoot.current.style.scrollBehavior = previousBehavior;
    }));
  }, [page, scale]);

  const goToPage = useCallback((nextPage: number) => {
    const bounded = Math.max(1, Math.min(pageCount, nextPage));
    setPage(bounded);
    updatePaper({ currentPage: bounded });
    window.document.getElementById(`page-${bounded}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [pageCount, updatePaper]);

  useEffect(() => {
    if (!pdfDocument || !pageCount) return;
    setPage(1);
    if (window.innerWidth <= 760) {
      setScaleState(Math.max(.45, Math.min(1, (window.innerWidth - 32) / pageWidth)));
    }
  }, [pageCount, pageWidth, pdfDocument]);

  useEffect(() => {
    if (!paper) return;
    if (paper.lastPage && paper.lastPage !== page) {
      setPage(Math.min(paper.pageCount || pageCount, paper.lastPage));
      requestAnimationFrame(() => window.document.getElementById(`page-${paper.lastPage}`)?.scrollIntoView());
    }
    if (paper.zoom && Math.abs(paper.zoom - scale) > .01) {
      const responsiveZoom = window.innerWidth <= 760
        ? Math.min(paper.zoom, (window.innerWidth - 32) / pageWidth)
        : paper.zoom;
      setScaleState(Math.max(.45, responsiveZoom));
    }
    if (paper.panelWidth) setAssistantWidth(paper.panelWidth);
  }, [
    pageCount,
    pageWidth,
    paper?.id,
    paper?.lastPage,
    paper?.panelWidth,
    paper?.zoom,
    setAssistantWidth,
  ]);

  useEffect(() => {
    const navigate = (event: Event) => {
      const custom = event as CustomEvent<{ page?: number }>;
      if (custom.detail.page) goToPage(custom.detail.page);
    };
    window.addEventListener('paperflow:navigate-page', navigate);
    return () => window.removeEventListener('paperflow:navigate-page', navigate);
  }, [goToPage]);

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root || !pdfDocument) return;
    const visible = new Map<number, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageNumber = Number((entry.target as HTMLElement).dataset.page);
        if (entry.isIntersecting) visible.set(pageNumber, entry.intersectionRatio);
        else visible.delete(pageNumber);
      }
      const current = [...visible].sort((left, right) => right[1] - left[1])[0]?.[0];
      if (current) {
        setPage(current);
        updatePaper({ currentPage: current });
      }
    }, { root, threshold: [.1, .35, .6, .85] });
    const timer = window.setTimeout(() => {
      root.querySelectorAll('.pdf-page').forEach((element) => observer.observe(element));
    });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [pdfDocument, pageCount, scale, updatePaper]);

  useEffect(() => {
    if (!paper?.updatedAt) return;
    const timer = window.setTimeout(() => {
      void updateReadingState(paper.id, {
        lastPage: page,
        zoom: scale,
        panelWidth: assistantWidth,
        activeThreadId: paper.activeThreadId,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [assistantWidth, page, paper, scale]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        goToPage(page + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goToPage(page - 1);
      } else if ((event.metaKey || event.ctrlKey) && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        setScale(scale + .1);
      } else if ((event.metaKey || event.ctrlKey) && event.key === '-') {
        event.preventDefault();
        setScale(scale - .1);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [goToPage, page, scale, setScale]);

  const fitWidth = useCallback(async () => {
    if (!pdfDocument || !scrollRoot.current) return;
    const first = await pdfDocument.getPage(1);
    const viewport = first.getViewport({ scale: 1 });
    const available = Math.max(320, scrollRoot.current.clientWidth - 56);
    setScale(Math.min(2.5, Math.max(.45, available / viewport.width)));
  }, [pdfDocument, setScale]);

  return {
    scrollRoot,
    page,
    scale,
    setScale,
    goToPage,
    fitWidth,
  };
}
