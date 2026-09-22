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
  const [scale, setScale] = useState(1);
  const { paper, updatePaper } = useAppStore();

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
      setScale(Math.max(.45, Math.min(1, (window.innerWidth - 32) / pageWidth)));
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
      setScale(Math.max(.45, responsiveZoom));
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
        setScale((value) => Math.min(2.5, value + .1));
      } else if ((event.metaKey || event.ctrlKey) && event.key === '-') {
        event.preventDefault();
        setScale((value) => Math.max(.45, value - .1));
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [goToPage, page]);

  const fitWidth = useCallback(async () => {
    if (!pdfDocument || !scrollRoot.current) return;
    const first = await pdfDocument.getPage(1);
    const viewport = first.getViewport({ scale: 1 });
    const available = Math.max(320, scrollRoot.current.clientWidth - 56);
    setScale(Math.min(2.5, Math.max(.45, available / viewport.width)));
  }, [pdfDocument]);

  return {
    scrollRoot,
    page,
    scale,
    setScale,
    goToPage,
    fitWidth,
  };
}
