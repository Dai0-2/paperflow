import {
  PDFHexString,
  PDFDocument,
  rgb,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import type { Annotation, PdfPoint, PdfQuad } from '../../types';

const NAMED_COLORS: Record<string, string> = {
  yellow: '#f4cf4f',
  green: '#67bd77',
  blue: '#5e9ee8',
  pink: '#df78a8',
  red: '#d85d5d',
};

function colorFromCss(value?: string): RGB {
  const normalized = (NAMED_COLORS[value || ''] || value || '#f4cf4f').replace('#', '');
  const hex = /^[\da-f]{6}$/i.test(normalized) ? normalized : 'f4cf4f';
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function bounds(points: PdfPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function drawTextMarkup(
  page: PDFPage,
  annotation: Annotation,
  quads: PdfQuad[],
): void {
  const color = colorFromCss(annotation.color);
  for (const quad of quads) {
    const rectangle = bounds(quad.points);
    if (annotation.type === 'highlight') {
      page.drawRectangle({
        ...rectangle,
        color,
        opacity: 0.28,
        borderWidth: 0,
      });
      continue;
    }
    const y = annotation.type === 'strikeout'
      ? rectangle.y + rectangle.height * 0.5
      : rectangle.y + Math.max(0.8, rectangle.height * 0.08);
    page.drawLine({
      start: { x: rectangle.x, y },
      end: { x: rectangle.x + rectangle.width, y },
      thickness: Math.max(0.8, Math.min(2.2, rectangle.height * 0.08)),
      color,
      opacity: 0.95,
    });
  }
}

function drawAnnotation(page: PDFPage, annotation: Annotation): void {
  const type = annotation.type || 'highlight';
  const quads = annotation.quadPoints || annotation.quads || [];
  if (type === 'highlight' || type === 'underline' || type === 'strikeout') {
    drawTextMarkup(page, { ...annotation, type }, quads);
    return;
  }

  const color = colorFromCss(annotation.color);
  if (type === 'area' && annotation.rect) {
    page.drawRectangle({
      ...annotation.rect,
      borderColor: color,
      borderWidth: 1.5,
      color,
      opacity: 0.08,
      borderOpacity: 0.95,
    });
    return;
  }
  if (type === 'text' && annotation.rect) {
    const radius = Math.max(5, Math.min(9, annotation.rect.width / 2));
    page.drawCircle({
      x: annotation.rect.x + radius,
      y: annotation.rect.y + radius,
      size: radius,
      color,
      borderColor: rgb(1, 1, 1),
      borderWidth: 1,
      opacity: 0.95,
    });
    const contents = annotation.comment?.trim() || annotation.text.trim() || 'PaperFlow note';
    const reference = page.doc.context.register(page.doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [
        annotation.rect.x,
        annotation.rect.y,
        annotation.rect.x + Math.max(annotation.rect.width, radius * 2),
        annotation.rect.y + Math.max(annotation.rect.height, radius * 2),
      ],
      Contents: PDFHexString.fromText(contents),
      T: PDFHexString.fromText('PaperFlow'),
      Name: 'Comment',
      C: [color.red, color.green, color.blue],
      F: 4,
      Open: false,
    }));
    page.node.addAnnot(reference);
    return;
  }
  if (type === 'ink') {
    for (const stroke of annotation.strokes || []) {
      for (let index = 1; index < stroke.points.length; index += 1) {
        page.drawLine({
          start: stroke.points[index - 1],
          end: stroke.points[index],
          thickness: Math.max(0.5, stroke.width),
          color,
          opacity: 0.95,
          lineCap: 1,
        });
      }
    }
  }
}

export async function exportAnnotatedPdf(
  source: Uint8Array,
  annotations: Annotation[],
): Promise<Uint8Array> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(source.slice());
  } catch (reason) {
    throw new Error(
      reason instanceof Error
        ? `This PDF cannot be exported with embedded annotations: ${reason.message}`
        : 'This PDF cannot be exported with embedded annotations.',
    );
  }

  const pages = document.getPages();
  for (const annotation of annotations.filter((item) => !item.deletedAt)) {
    const page = pages[annotation.page - 1];
    if (page) drawAnnotation(page, annotation);
  }
  try {
    return await document.save();
  } catch (reason) {
    throw new Error(
      reason instanceof Error
        ? `The annotated PDF could not be written: ${reason.message}`
        : 'The annotated PDF could not be written.',
    );
  }
}

export function annotatedPdfName(sourceName: string): string {
  const base = sourceName.replace(/\.pdf$/i, '').trim() || 'paper';
  return `${base}-paperflow-annotated.pdf`;
}

export function annotationsAsJson(annotations: Annotation[]): string {
  return JSON.stringify({
    format: 'paperflow-annotations',
    version: 1,
    exportedAt: new Date().toISOString(),
    annotations: annotations.filter((annotation) => !annotation.deletedAt),
  }, null, 2);
}

export function annotationsAsMarkdown(annotations: Annotation[]): string {
  const visible = annotations
    .filter((annotation) => !annotation.deletedAt)
    .sort((left, right) => left.page - right.page || left.createdAt - right.createdAt);
  return [
    '# PaperFlow annotations',
    '',
    ...visible.flatMap((annotation) => [
      `## Page ${annotation.page} · ${annotation.type || 'highlight'}`,
      '',
      annotation.text ? `> ${annotation.text.replace(/\n/g, '\n> ')}` : '',
      annotation.comment || '',
      '',
    ]).filter(Boolean),
  ].join('\n');
}
