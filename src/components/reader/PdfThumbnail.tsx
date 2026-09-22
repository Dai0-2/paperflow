import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

export function PdfThumbnail({
  document,
  pageNumber,
  active,
  onClick,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onClick: () => void;
}) {
  const root = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 4);

  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { root: root.current.closest('.reader-sidebar-content'), rootMargin: '500px' });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvas.current) return;
    let task: RenderTask | undefined;
    let cancelled = false;
    void document.getPage(pageNumber).then((page) => {
      if (cancelled || !canvas.current) return;
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 116 / original.width });
      canvas.current.width = Math.round(viewport.width);
      canvas.current.height = Math.round(viewport.height);
      task = page.render({ canvas: canvas.current, viewport });
      return task.promise;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, pageNumber, visible]);

  return <button
    ref={root}
    className="pdf-thumbnail"
    data-active={active}
    aria-label={`Go to page ${pageNumber}`}
    onClick={onClick}
  >
    <span>{visible ? <canvas ref={canvas} /> : null}</span>
    <b>{pageNumber}</b>
  </button>;
}
