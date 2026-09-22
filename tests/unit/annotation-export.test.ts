import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  annotatedPdfName,
  annotationsAsJson,
  annotationsAsMarkdown,
  exportAnnotatedPdf,
} from '../../src/services/annotations/exportPdf';
import type { Annotation } from '../../src/types';

const now = 1_700_000_000_000;

function annotation(
  id: string,
  type: Annotation['type'],
  geometry: Partial<Annotation>,
): Annotation {
  return {
    id,
    paperId: 'paper:test',
    page: 1,
    type,
    text: `${type} source text`,
    color: '#f4cf4f',
    comment: `${type} comment`,
    createdAt: now,
    ...geometry,
  };
}

describe('annotated PDF export', () => {
  it('writes all six annotation types into a readable copy without mutating the source', async () => {
    const document = await PDFDocument.create();
    document.addPage([300, 400]);
    const source = await document.save();
    const original = source.slice();
    const quadPoints = [{
      points: [
        { x: 30, y: 320 },
        { x: 160, y: 320 },
        { x: 160, y: 300 },
        { x: 30, y: 300 },
      ] as const,
    }];
    const annotations: Annotation[] = [
      annotation('highlight', 'highlight', { quadPoints }),
      annotation('underline', 'underline', { quadPoints }),
      annotation('strikeout', 'strikeout', { quadPoints }),
      annotation('text', 'text', { rect: { x: 200, y: 300, width: 18, height: 18 } }),
      annotation('area', 'area', { rect: { x: 40, y: 100, width: 120, height: 80 } }),
      annotation('ink', 'ink', {
        strokes: [{ width: 2, points: [{ x: 40, y: 60 }, { x: 80, y: 80 }, { x: 120, y: 55 }] }],
      }),
    ];

    const output = await exportAnnotatedPdf(source, annotations);
    const exported = await PDFDocument.load(output);
    const exportedAnnotations = exported.getPage(0).node.Annots();
    const textAnnotation = exportedAnnotations?.lookup(0, PDFDict);
    const contents = textAnnotation?.lookup(
      PDFName.of('Contents'),
      PDFString,
      PDFHexString,
    );

    expect(exported.getPageCount()).toBe(1);
    expect(output.byteLength).toBeGreaterThan(source.byteLength);
    expect(exportedAnnotations?.size()).toBe(1);
    expect(contents?.decodeText()).toBe('text comment');
    expect(source).toEqual(original);
  });

  it('provides stable PDF, JSON, and Markdown export names and fallbacks', () => {
    const annotations = [annotation('note', 'text', { rect: { x: 10, y: 10, width: 18, height: 18 } })];
    expect(annotatedPdfName('paper.pdf')).toBe('paper-paperflow-annotated.pdf');
    expect(JSON.parse(annotationsAsJson(annotations))).toMatchObject({
      format: 'paperflow-annotations',
      version: 1,
    });
    expect(annotationsAsMarkdown(annotations)).toContain('Page 1 · text');
    expect(annotationsAsMarkdown(annotations)).toContain('text comment');
  });
});
