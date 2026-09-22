import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function createFixture(path: string): Promise<void> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText('PAPERFLOW ANNOTATION GEOMETRY TEST', {
    x: 72,
    y: 690,
    size: 22,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText('Stable text selection across zoom and reload.', {
    x: 72,
    y: 650,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  });
  await writeFile(path, await document.save());
}

async function annotationState(page: Page): Promise<{
  paperId?: string;
  annotations: Array<{
    type?: string;
    rect?: { x: number; y: number; width: number; height: number };
    quadPoints?: unknown[];
    strokes?: unknown[];
    comment?: string;
  }>;
}> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('paperflow-ai');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const readAll = <T>(storeName: string) => new Promise<T[]>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
    const [papers, annotations] = await Promise.all([
      readAll<{ id: string }>('papers'),
      readAll<{
        type?: string;
        rect?: { x: number; y: number; width: number; height: number };
        quadPoints?: unknown[];
        strokes?: unknown[];
        comment?: string;
        deletedAt?: number;
      }>('annotations'),
    ]);
    database.close();
    return {
      paperId: papers[0]?.id,
      annotations: annotations.filter((annotation) => !annotation.deletedAt),
    };
  });
}

async function selectText(page: Page, tool: 'Highlight' | 'Underline' | 'Strikeout'): Promise<void> {
  await page.getByTitle(tool).click();
  await page.evaluate(() => {
    const textNode = document.querySelector('.textLayer span')?.firstChild;
    const scroll = document.querySelector('.reader-scroll');
    if (!textNode || !scroll) throw new Error('PDF text layer was not ready.');
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(12, textNode.textContent?.length || 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    scroll.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
}

test('creates persistent annotations and exports a readable PDF copy', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const fixture = testInfo.outputPath('annotations-source.pdf');
  await createFixture(fixture);
  const sourceBefore = await readFile(fixture);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/reader.html');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('.textLayer span').first()).toBeVisible();
  await page.getByTitle('Save paper and PDF offline').click();
  await expect(page.getByTitle('PDF available offline')).toBeVisible();

  await selectText(page, 'Highlight');
  await expect.poll(async () => (await annotationState(page)).annotations.length).toBe(1);
  await selectText(page, 'Underline');
  await expect.poll(async () => (await annotationState(page)).annotations.length).toBe(2);
  await selectText(page, 'Strikeout');
  await expect.poll(async () => (await annotationState(page)).annotations.length).toBe(3);

  const layer = page.locator('.annotation-layer').first();
  const pageBox = await layer.boundingBox();
  if (!pageBox) throw new Error('Annotation layer was not visible.');

  await page.getByTitle('Text note').click();
  await page.mouse.click(pageBox.x + 500, pageBox.y + 180);
  await expect(page.getByLabel('Annotation inspector')).toBeVisible();
  await page.getByPlaceholder('Add a note').fill('Cross-device note');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.getByTitle('Area note').click();
  await page.mouse.move(pageBox.x + 120, pageBox.y + 230);
  await page.mouse.down();
  await page.mouse.move(pageBox.x + 280, pageBox.y + 330, { steps: 6 });
  await page.mouse.up();

  await page.getByTitle('Draw').click();
  await page.mouse.move(pageBox.x + 130, pageBox.y + 390);
  await page.mouse.down();
  await page.mouse.move(pageBox.x + 180, pageBox.y + 420, { steps: 4 });
  await page.mouse.move(pageBox.x + 240, pageBox.y + 385, { steps: 4 });
  await page.mouse.up();

  await expect.poll(async () => (await annotationState(page)).annotations.length).toBe(6);
  const beforeZoom = await page.locator('.annotation-area').boundingBox();
  await page.getByTitle('Zoom in').click();
  await expect(page.locator('.zoom-label')).toHaveText('110%');
  const afterZoom = await page.locator('.annotation-area').boundingBox();
  expect(afterZoom?.width || 0).toBeGreaterThan((beforeZoom?.width || 0) * 1.08);

  const state = await annotationState(page);
  const savedRect = state.annotations.find((annotation) => annotation.type === 'area')?.rect;
  expect(savedRect).toBeTruthy();
  expect(state.annotations.find((annotation) => annotation.type === 'highlight')?.quadPoints).toHaveLength(1);
  expect(state.annotations.find((annotation) => annotation.type === 'ink')?.strokes).toHaveLength(1);
  expect(state.annotations.find((annotation) => annotation.type === 'text')?.comment).toBe('Cross-device note');

  await page.waitForTimeout(350);
  await page.goto(`/reader.html?paperId=${encodeURIComponent(state.paperId || '')}`);
  await expect(page.locator('.annotation-area')).toBeVisible();
  expect((await annotationState(page)).annotations.find((annotation) => annotation.type === 'area')?.rect).toEqual(savedRect);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTitle('Export annotated PDF').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('annotations-source-paperflow-annotated.pdf');
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('The annotated PDF download was unavailable.');
  const exported = await PDFDocument.load(await readFile(downloadedPath));
  expect(exported.getPageCount()).toBe(1);
  expect(await readFile(fixture)).toEqual(sourceBefore);

  await page.screenshot({ path: testInfo.outputPath('reader-annotations.png'), fullPage: true });
});
