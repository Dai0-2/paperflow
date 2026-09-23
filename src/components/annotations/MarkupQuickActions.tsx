import {
  MessageSquare,
  Palette,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { text } from '../../i18n';
import { pdfQuadToViewport, type PdfCoordinateViewport } from '../../services/annotations/coordinates';
import type { Annotation, Language } from '../../types';

const COLORS = ['#f4cf4f', '#67bd77', '#5e9ee8', '#df78a8', '#d85d5d'];
const TOOLBAR_WIDTH = 40;
const TOOLBAR_HEIGHT = 106;
const PANEL_GAP = 8;

interface PositionedPanel {
  left: number;
  top: number;
  width: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function panelPosition(
  toolbarLeft: number,
  toolbarTop: number,
  panelWidth: number,
  panelHeight: number,
  viewport: PdfCoordinateViewport,
): PositionedPanel {
  const left = toolbarLeft >= panelWidth + PANEL_GAP + 8
    ? toolbarLeft - panelWidth - PANEL_GAP
    : clamp(toolbarLeft + TOOLBAR_WIDTH + PANEL_GAP, 8, viewport.width - panelWidth - 8);
  return {
    left,
    top: clamp(toolbarTop, 8, Math.max(8, viewport.height - panelHeight - 8)),
    width: panelWidth,
  };
}

export function isMarkupAnnotation(annotation?: Annotation): boolean {
  return Boolean(
    annotation
    && (
      annotation.type === 'highlight'
      || annotation.type === 'underline'
      || annotation.type === 'strikeout'
      || (!annotation.type && (annotation.quadPoints || annotation.quads))
    ),
  );
}

export function MarkupQuickActions({
  annotation,
  viewport,
  language,
  onUpdate,
  onDelete,
}: {
  annotation: Annotation;
  viewport: PdfCoordinateViewport;
  language: Language;
  onUpdate: (
    annotationId: string,
    patch: Partial<Pick<Annotation, 'comment' | 'color'>>,
  ) => Promise<unknown>;
  onDelete: (annotationId: string) => Promise<void>;
}) {
  const [commentOpen, setCommentOpen] = useState(true);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [comment, setComment] = useState(annotation.comment || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setComment(annotation.comment || '');
  }, [annotation.comment]);

  useEffect(() => {
    setCommentOpen(true);
    setColorsOpen(false);
  }, [annotation.id]);

  const position = useMemo(() => {
    const points = (annotation.quadPoints || annotation.quads || [])
      .flatMap((quad) => pdfQuadToViewport(viewport, quad));
    if (!points.length) return undefined;
    const left = Math.min(...points.map((point) => point.x));
    const right = Math.max(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const bottom = Math.max(...points.map((point) => point.y));
    const fitsRight = right + PANEL_GAP + TOOLBAR_WIDTH <= viewport.width - 8;
    const toolbarLeft = fitsRight
      ? right + PANEL_GAP
      : clamp(left - PANEL_GAP - TOOLBAR_WIDTH, 8, viewport.width - TOOLBAR_WIDTH - 8);
    const toolbarTop = clamp(
      top + (bottom - top - TOOLBAR_HEIGHT) / 2,
      8,
      Math.max(8, viewport.height - TOOLBAR_HEIGHT - 8),
    );
    const commentWidth = Math.min(272, viewport.width - 16);
    const paletteWidth = Math.min(210, viewport.width - 16);
    return {
      toolbar: { left: toolbarLeft, top: toolbarTop },
      side: fitsRight ? 'right' : 'left',
      comment: panelPosition(toolbarLeft, toolbarTop, commentWidth, 178, viewport),
      palette: panelPosition(toolbarLeft, toolbarTop + 36, paletteWidth, 52, viewport),
    };
  }, [annotation.quadPoints, annotation.quads, viewport]);

  if (!position) return null;

  const update = async (
    patch: Partial<Pick<Annotation, 'comment' | 'color'>>,
  ): Promise<boolean> => {
    setSaving(true);
    try {
      await onUpdate(annotation.id, patch);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  };

  return <div
    className="markup-quick-actions"
    data-annotation-action
    data-side={position.side}
  >
    <div
      className="markup-quick-toolbar"
      role="toolbar"
      aria-label={text(language, 'Highlight actions', '高亮操作')}
      style={position.toolbar}
    >
      <button
        type="button"
        aria-label={text(language, 'Add comment', '添加评论')}
        data-active={commentOpen || Boolean(annotation.comment)}
        onClick={() => {
          setCommentOpen((open) => !open);
          setColorsOpen(false);
        }}
      ><MessageSquare /></button>
      <button
        type="button"
        className="markup-color-command"
        aria-label={text(language, 'Change highlight color', '更改高亮颜色')}
        data-active={colorsOpen}
        onClick={() => {
          setColorsOpen((open) => !open);
          setCommentOpen(false);
        }}
      >
        <Palette />
        <i style={{ '--annotation-color': annotation.color || COLORS[0] } as CSSProperties} />
      </button>
      <button
        type="button"
        className="markup-delete-command"
        aria-label={text(language, 'Delete highlight', '删除高亮')}
        onClick={() => void onDelete(annotation.id)}
      ><Trash2 /></button>
    </div>

    {colorsOpen && <div
      className="markup-color-popover"
      role="group"
      aria-label={text(language, 'Highlight color', '高亮颜色')}
      style={position.palette}
    >
      {COLORS.map((color) => <button
        key={color}
        type="button"
        aria-label={text(language, `Use ${color}`, `使用颜色 ${color}`)}
        data-active={(annotation.color || COLORS[0]) === color}
        style={{ '--annotation-color': color } as CSSProperties}
        onClick={() => {
          setColorsOpen(false);
          void update({ color });
        }}
      />)}
    </div>}

    {commentOpen && <aside
      className="markup-comment-popover"
      aria-label={text(language, 'Highlight comment', '高亮评论')}
      style={position.comment}
    >
      <label htmlFor={`markup-comment-${annotation.id}`}>
        {text(language, 'Comment', '评论')}
      </label>
      <textarea
        id={`markup-comment-${annotation.id}`}
        autoFocus
        value={comment}
        placeholder={text(language, 'Add a comment to this highlight', '为这处高亮添加评论')}
        onChange={(event) => setComment(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void update({ comment: comment.trim() }).then((saved) => {
              if (saved) setCommentOpen(false);
            });
          }
        }}
      />
      <footer>
        <button
          type="button"
          disabled={saving}
          onClick={() => void update({ comment: comment.trim() }).then((saved) => {
            if (saved) setCommentOpen(false);
          })}
        ><Save />{text(language, 'Save', '保存')}</button>
      </footer>
    </aside>}
  </div>;
}
