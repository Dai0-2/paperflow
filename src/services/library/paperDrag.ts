export const PAPER_DRAG_TYPE = 'application/x-paperflow-paper-ids';

export function writePaperDragData(dataTransfer: DataTransfer, paperIds: string[]): void {
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(PAPER_DRAG_TYPE, JSON.stringify([...new Set(paperIds)]));
}

export function readPaperDragData(dataTransfer: DataTransfer): string[] {
  if (!dataTransfer.types.includes(PAPER_DRAG_TYPE)) return [];
  try {
    const value: unknown = JSON.parse(dataTransfer.getData(PAPER_DRAG_TYPE));
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
  } catch {
    return [];
  }
}
