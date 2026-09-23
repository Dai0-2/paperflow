import { describe, expect, it } from 'vitest';
import {
  compactSelectionRects,
  selectionRectBounds,
} from '../../src/services/annotations/selectionGeometry';

describe('selection geometry', () => {
  it('drops empty and duplicate rectangles before creating annotation geometry', () => {
    const rects = compactSelectionRects([
      { left: 10, top: 20, right: 50, bottom: 30, width: 40, height: 10 },
      { left: 10.2, top: 20.1, right: 50.2, bottom: 30.1, width: 40, height: 10 },
      { left: 0, top: 0, right: 0, bottom: 10, width: 0, height: 10 },
      { left: 12, top: 35, right: 72, bottom: 45, width: 60, height: 10 },
    ]);

    expect(rects).toHaveLength(2);
    expect(selectionRectBounds(rects)).toEqual({
      left: 10,
      top: 20,
      right: 72,
      bottom: 45,
      width: 62,
      height: 25,
    });
  });
});
