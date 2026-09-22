import { useEffect, useRef, useState } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

interface PdfPageProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  searchQuery: string;
  forceRender?: boolean;
}

export function PdfPage({ document, pageNumber, scale, searchQuery, forceRender = false }: PdfPageProps) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);
  const [size, setSize] = useState({ width: 612 * scale, height: 792 * scale });
  const [error, setError] = useState('');

  useEffect(() => {
    if (forceRender) {
      setNearViewport(true);
      return;
    }
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { root: element.closest('.reader-scroll'), rootMargin: '1200px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [forceRender]);

  useEffect(() => {
    if (!nearViewport) setSize({ width: 612 * scale, height: 792 * scale });
  }, [nearViewport, scale]);

  useEffect(() => {
    if (!nearViewport || !canvas.current || !textLayer.current) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let layer: TextLayer | undefined;
    const render = async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        setSize({ width: viewport.width, height: viewport.height });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const target = canvas.current;
        const layerElement = textLayer.current;
        if (!target || !layerElement) return;
        target.width = Math.floor(viewport.width * outputScale);
        target.height = Math.floor(viewport.height * outputScale);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        layerElement.replaceChildren();
        renderTask = page.render({
          canvas: target,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        const textContent = await page.getTextContent();
        if (cancelled) return;
        layer = new TextLayer({ textContentSource: textContent, container: layerElement, viewport });
        await Promise.all([renderTask.promise, layer.render()]);
        if (!cancelled) setError('');
      } catch (reason) {
        if (!cancelled && !(reason instanceof Error && reason.name === 'RenderingCancelledException')) {
          setError(reason instanceof Error ? reason.message : 'Page rendering failed.');
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      layer?.cancel();
    };
  }, [document, nearViewport, pageNumber, scale]);

  return <section
    ref={root}
    id={`page-${pageNumber}`}
    className="pdf-page"
    data-page={pageNumber}
    aria-label={`Page ${pageNumber}`}
    style={{ width: size.width, height: size.height }}
  >
    {nearViewport ? <>
      <canvas ref={canvas} />
      <div ref={textLayer} className="textLayer" />
      {searchQuery && <div className="page-search-marker" title={`Search active: ${searchQuery}`} />}
      {error && <div className="page-render-error">{error}</div>}
    </> : <div className="page-placeholder">Page {pageNumber}</div>}
  </section>;
}
