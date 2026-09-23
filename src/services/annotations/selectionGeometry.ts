export interface SelectionClientRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function intersects(range: Range, node: Node): boolean {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

export function textSelectionRects(
  range: Range,
  pageElement: HTMLElement,
): SelectionClientRect[] {
  const textLayer = pageElement.querySelector<HTMLElement>('.textLayer');
  if (!textLayer) return [];

  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  const rects: SelectionClientRect[] = [];
  let node = walker.nextNode();
  while (node) {
    const value = node.textContent || '';
    if (value && intersects(range, node)) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : value.length;
      if (end > start && value.slice(start, end).trim()) {
        const textRange = document.createRange();
        textRange.setStart(node, start);
        textRange.setEnd(node, end);
        rects.push(...Array.from(textRange.getClientRects()));
        textRange.detach();
      }
    }
    node = walker.nextNode();
  }

  return compactSelectionRects(rects);
}

export function compactSelectionRects(
  rects: Iterable<SelectionClientRect>,
): SelectionClientRect[] {
  const result: SelectionClientRect[] = [];
  for (const rect of rects) {
    if (
      !Number.isFinite(rect.left)
      || !Number.isFinite(rect.top)
      || rect.width < 0.5
      || rect.height < 0.5
    ) continue;

    const duplicate = result.some((existing) => (
      Math.abs(existing.left - rect.left) < 0.5
      && Math.abs(existing.top - rect.top) < 0.5
      && Math.abs(existing.right - rect.right) < 0.5
      && Math.abs(existing.bottom - rect.bottom) < 0.5
    ));
    if (!duplicate) result.push(rect);
  }
  return result.sort((left, right) => left.top - right.top || left.left - right.left);
}

export function selectionRectBounds(
  rects: SelectionClientRect[],
): SelectionClientRect | undefined {
  if (!rects.length) return undefined;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
