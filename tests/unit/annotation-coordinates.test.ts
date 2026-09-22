import { describe, expect, it } from 'vitest';
import {
  pdfQuadToViewport,
  pdfRectToViewport,
  rangeRectsToPdfQuads,
  viewportRectToPdfRect,
  type PdfCoordinateViewport,
} from '../../src/services/annotations/coordinates';

function viewport(scale: number): PdfCoordinateViewport {
  return {
    width: 100 * scale,
    height: 200 * scale,
    convertToPdfPoint: (x, y) => [x / scale, 200 - y / scale],
    convertToViewportPoint: (x, y) => [x * scale, (200 - y) * scale],
  };
}

describe('annotation PDF coordinates', () => {
  it('round-trips a region independently of zoom', () => {
    const pdfRect = viewportRectToPdfRect(viewport(2), {
      left: 20,
      top: 40,
      right: 100,
      bottom: 120,
    });

    expect(pdfRect).toEqual({ x: 10, y: 140, width: 40, height: 40 });
    expect(pdfRectToViewport(viewport(3), pdfRect)).toEqual({
      x: 30,
      y: 60,
      width: 120,
      height: 120,
    });
  });

  it('clips browser selection rectangles to their PDF page', () => {
    const quads = rangeRectsToPdfQuads([
      { left: 90, top: 120, right: 210, bottom: 150, width: 120, height: 30 },
      { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 },
    ], {
      left: 100,
      top: 100,
      right: 300,
      bottom: 500,
    }, viewport(2));

    expect(quads).toHaveLength(1);
    expect(pdfQuadToViewport(viewport(2), quads[0])).toEqual([
      { x: 0, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 50 },
      { x: 0, y: 50 },
    ]);
  });
});
