import { StickyNote } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AnnotationDraft } from '../../repositories/annotationRepository';
import {
  pdfPointToViewport,
  pdfQuadToViewport,
  pdfRectToViewport,
  pointsToAttribute,
  viewportPointToPdf,
  viewportRectToPdfRect,
  type PdfCoordinateViewport,
} from '../../services/annotations/coordinates';
import type { Annotation, PdfPoint } from '../../types';
import type { AnnotationTool } from '../../hooks/useAnnotationTool';

interface Drawing {
  pointerId: number;
  start: PdfPoint;
  current: PdfPoint;
  points: PdfPoint[];
}

function localPoint(event: ReactPointerEvent<HTMLDivElement>): PdfPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function strokeWidthInViewport(
  viewport: PdfCoordinateViewport,
  point: PdfPoint,
  width: number,
): number {
  const start = pdfPointToViewport(viewport, point);
  const end = pdfPointToViewport(viewport, { x: point.x + width, y: point.y });
  return Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
}

function markupShape(
  annotation: Annotation,
  viewport: PdfCoordinateViewport,
  selected: boolean,
  onSelect: () => void,
) {
  const quads = annotation.quadPoints || annotation.quads || [];
  const color = annotation.color || '#f4cf4f';
  return quads.map((quad, index) => {
    const points = pdfQuadToViewport(viewport, quad);
    const bottomLeft = points[3];
    const bottomRight = points[2];
    const centerLeft = {
      x: (points[0].x + points[3].x) / 2,
      y: (points[0].y + points[3].y) / 2,
    };
    const centerRight = {
      x: (points[1].x + points[2].x) / 2,
      y: (points[1].y + points[2].y) / 2,
    };
    if (annotation.type === 'underline') {
      return <line
        key={index}
        className="annotation-hit"
        data-selected={selected}
        x1={bottomLeft.x}
        y1={bottomLeft.y - 1}
        x2={bottomRight.x}
        y2={bottomRight.y - 1}
        stroke={color}
        strokeWidth={selected ? 3 : 2}
        onClick={onSelect}
      />;
    }
    if (annotation.type === 'strikeout') {
      return <line
        key={index}
        className="annotation-hit"
        data-selected={selected}
        x1={centerLeft.x}
        y1={centerLeft.y}
        x2={centerRight.x}
        y2={centerRight.y}
        stroke={color}
        strokeWidth={selected ? 3 : 2}
        onClick={onSelect}
      />;
    }
    return <polygon
      key={index}
      className="annotation-hit annotation-highlight"
      data-selected={selected}
      points={pointsToAttribute(points)}
      fill={color}
      stroke={selected ? color : 'transparent'}
      strokeWidth={selected ? 1.5 : 0}
      onClick={onSelect}
    />;
  });
}

export function AnnotationLayer({
  viewport,
  annotations,
  tool,
  color,
  selectedId,
  onCreate,
  onSelect,
}: {
  viewport: PdfCoordinateViewport;
  annotations: Annotation[];
  tool: AnnotationTool;
  color: string;
  selectedId?: string;
  onCreate: (draft: AnnotationDraft) => Promise<Annotation>;
  onSelect: (id: string) => void;
}) {
  const [drawing, setDrawing] = useState<Drawing>();
  const drawingRef = useRef<Drawing | undefined>(undefined);
  const canDraw = tool === 'text' || tool === 'area' || tool === 'ink';
  const previewRect = useMemo(() => {
    if (!drawing) return undefined;
    return {
      x: Math.min(drawing.start.x, drawing.current.x),
      y: Math.min(drawing.start.y, drawing.current.y),
      width: Math.abs(drawing.current.x - drawing.start.x),
      height: Math.abs(drawing.current.y - drawing.start.y),
    };
  }, [drawing]);

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canDraw || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[data-annotation-action], .annotation-hit')) return;
    event.preventDefault();
    const value = localPoint(event);
    if (tool === 'text') {
      const rect = viewportRectToPdfRect(viewport, {
        left: value.x - 9,
        top: value.y - 9,
        right: value.x + 9,
        bottom: value.y + 9,
      });
      void onCreate({ page: 0, type: 'text', color, text: '', rect });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { pointerId: event.pointerId, start: value, current: value, points: [value] };
    drawingRef.current = next;
    setDrawing(next);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drawingRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const value = localPoint(event);
    const next = {
      ...current,
      current: value,
      points: tool === 'ink' ? [...current.points, value] : current.points,
    };
    drawingRef.current = next;
    setDrawing(next);
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drawingRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drawingRef.current = undefined;
    setDrawing(undefined);
    if (tool === 'area') {
      const width = Math.abs(current.current.x - current.start.x);
      const height = Math.abs(current.current.y - current.start.y);
      if (width < 5 || height < 5) return;
      const rect = viewportRectToPdfRect(viewport, {
        left: Math.min(current.start.x, current.current.x),
        top: Math.min(current.start.y, current.current.y),
        right: Math.max(current.start.x, current.current.x),
        bottom: Math.max(current.start.y, current.current.y),
      });
      void onCreate({ page: 0, type: 'area', color, text: '', rect });
    } else if (tool === 'ink' && current.points.length > 1) {
      const pdfPoints = current.points.map((value) => viewportPointToPdf(viewport, value));
      const widthVector = viewportPointToPdf(viewport, { x: 2, y: 0 });
      const origin = viewportPointToPdf(viewport, { x: 0, y: 0 });
      const width = Math.max(0.75, Math.hypot(widthVector.x - origin.x, widthVector.y - origin.y));
      void onCreate({
        page: 0,
        type: 'ink',
        color,
        text: '',
        strokes: [{ points: pdfPoints, width }],
      });
    }
  };

  return <div
    className="annotation-layer"
    data-tool={tool}
    data-drawing={canDraw}
    onPointerDown={start}
    onPointerMove={move}
    onPointerUp={finish}
    onPointerCancel={finish}
  >
    <svg viewBox={`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="none" aria-label="Page annotations">
      {annotations.map((annotation) => {
        const selected = annotation.id === selectedId;
        const select = () => onSelect(annotation.id);
        if (
          annotation.type === 'highlight'
          || annotation.type === 'underline'
          || annotation.type === 'strikeout'
          || (!annotation.type && (annotation.quadPoints || annotation.quads))
        ) {
          return <g key={annotation.id}>{markupShape(annotation, viewport, selected, select)}</g>;
        }
        if (annotation.type === 'area' && annotation.rect) {
          const rect = pdfRectToViewport(viewport, annotation.rect);
          return <rect
            key={annotation.id}
            className="annotation-hit annotation-area"
            data-selected={selected}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill={annotation.color || '#f4cf4f'}
            stroke={annotation.color || '#f4cf4f'}
            onClick={select}
          />;
        }
        if (annotation.type === 'ink') {
          return <g key={annotation.id}>
            {(annotation.strokes || []).map((stroke, index) => {
              const points = stroke.points.map((value) => pdfPointToViewport(viewport, value));
              const strokeWidth = stroke.points[0]
                ? strokeWidthInViewport(viewport, stroke.points[0], stroke.width)
                : 1;
              return <polyline
                key={index}
                className="annotation-hit annotation-ink"
                data-selected={selected}
                points={pointsToAttribute(points)}
                fill="none"
                stroke={annotation.color || '#f4cf4f'}
                strokeWidth={strokeWidth}
                onClick={select}
              />;
            })}
          </g>;
        }
        return null;
      })}
      {previewRect && tool === 'area' && <rect className="annotation-preview-area" {...previewRect} />}
      {drawing && tool === 'ink' && <polyline
        className="annotation-preview-ink"
        points={pointsToAttribute(drawing.points)}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />}
    </svg>
    {annotations.filter((annotation) => annotation.type === 'text' && annotation.rect).map((annotation) => {
      const rect = pdfRectToViewport(viewport, annotation.rect!);
      return <button
        key={annotation.id}
        className="annotation-text-marker"
        data-annotation-action
        data-selected={annotation.id === selectedId}
        title={annotation.comment || 'Text note'}
        aria-label={`Text note on page ${annotation.page}`}
        style={{ left: rect.x, top: rect.y, color: annotation.color || '#f4cf4f' }}
        onClick={() => onSelect(annotation.id)}
      ><StickyNote /></button>;
    })}
  </div>;
}
