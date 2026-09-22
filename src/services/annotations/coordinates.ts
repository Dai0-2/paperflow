import type { PdfPoint, PdfQuad } from '../../types';

export interface PdfCoordinateViewport {
  width: number;
  height: number;
  convertToPdfPoint: (x: number, y: number) => number[];
  convertToViewportPoint: (x: number, y: number) => number[];
}

export interface ViewportRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function point(values: number[]): PdfPoint {
  return { x: values[0] || 0, y: values[1] || 0 };
}

export function viewportPointToPdf(
  viewport: PdfCoordinateViewport,
  input: PdfPoint,
): PdfPoint {
  return point(viewport.convertToPdfPoint(input.x, input.y));
}

export function pdfPointToViewport(
  viewport: PdfCoordinateViewport,
  input: PdfPoint,
): PdfPoint {
  return point(viewport.convertToViewportPoint(input.x, input.y));
}

export function viewportRectToPdfQuad(
  viewport: PdfCoordinateViewport,
  rect: Pick<ViewportRect, 'left' | 'top' | 'right' | 'bottom'>,
): PdfQuad {
  return {
    points: [
      viewportPointToPdf(viewport, { x: rect.left, y: rect.top }),
      viewportPointToPdf(viewport, { x: rect.right, y: rect.top }),
      viewportPointToPdf(viewport, { x: rect.right, y: rect.bottom }),
      viewportPointToPdf(viewport, { x: rect.left, y: rect.bottom }),
    ],
  };
}

export function pdfQuadToViewport(
  viewport: PdfCoordinateViewport,
  quad: PdfQuad,
): PdfPoint[] {
  return quad.points.map((value) => pdfPointToViewport(viewport, value));
}

export function viewportRectToPdfRect(
  viewport: PdfCoordinateViewport,
  rect: Pick<ViewportRect, 'left' | 'top' | 'right' | 'bottom'>,
): { x: number; y: number; width: number; height: number } {
  const points = viewportRectToPdfQuad(viewport, rect).points;
  const xs = points.map((value) => value.x);
  const ys = points.map((value) => value.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

export function pdfRectToViewport(
  viewport: PdfCoordinateViewport,
  rect: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const corners = [
    pdfPointToViewport(viewport, { x: rect.x, y: rect.y }),
    pdfPointToViewport(viewport, { x: rect.x + rect.width, y: rect.y }),
    pdfPointToViewport(viewport, { x: rect.x + rect.width, y: rect.y + rect.height }),
    pdfPointToViewport(viewport, { x: rect.x, y: rect.y + rect.height }),
  ];
  const xs = corners.map((value) => value.x);
  const ys = corners.map((value) => value.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

export function rangeRectsToPdfQuads(
  rects: Iterable<Pick<ViewportRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>>,
  pageRect: Pick<ViewportRect, 'left' | 'top' | 'right' | 'bottom'>,
  viewport: PdfCoordinateViewport,
): PdfQuad[] {
  const result: PdfQuad[] = [];
  for (const rect of rects) {
    const left = Math.max(rect.left, pageRect.left);
    const top = Math.max(rect.top, pageRect.top);
    const right = Math.min(rect.right, pageRect.right);
    const bottom = Math.min(rect.bottom, pageRect.bottom);
    if (right - left < 0.5 || bottom - top < 0.5 || rect.width < 0.5 || rect.height < 0.5) continue;
    result.push(viewportRectToPdfQuad(viewport, {
      left: left - pageRect.left,
      top: top - pageRect.top,
      right: right - pageRect.left,
      bottom: bottom - pageRect.top,
    }));
  }
  return result;
}

export function createTextAnchor(selection: Selection, quote: string): {
  quote: string;
  prefix?: string;
  suffix?: string;
} {
  const range = selection.rangeCount ? selection.getRangeAt(0) : undefined;
  const container = range?.commonAncestorContainer;
  const context = container?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const normalizedQuote = quote.replace(/\s+/g, ' ').trim();
  const index = context.indexOf(normalizedQuote);
  if (index < 0) return { quote: normalizedQuote };
  return {
    quote: normalizedQuote,
    prefix: context.slice(Math.max(0, index - 48), index) || undefined,
    suffix: context.slice(index + normalizedQuote.length, index + normalizedQuote.length + 48) || undefined,
  };
}

export function pointsToAttribute(points: PdfPoint[]): string {
  return points.map(({ x, y }) => `${x},${y}`).join(' ');
}
