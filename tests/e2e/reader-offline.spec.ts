import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function createFixture(path: string): Promise<void> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText('PAPERFLOW OCR OFFLINE TEST 2026', {
    x: 72,
    y: 680,
    size: 26,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText('Local research documents remain available without a network connection.', {
    x: 72,
    y: 630,
    size: 13,
    font,
    color: rgb(0, 0, 0),
  });
  await writeFile(path, await document.save());
}

async function databaseState(page: Page): Promise<{
  paperId?: string;
  libraryState?: string;
  documentState?: string;
  ocrStatus?: string;
  ocrText?: string;
}> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('paperflow-ai');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!['papers', 'documents', 'ocrPages'].every((name) => database.objectStoreNames.contains(name))) {
      database.close();
      return {};
    }
    const readAll = <T>(storeName: string) => new Promise<T[]>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
    const [papers, documents, ocrPages] = await Promise.all([
      readAll<{ id: string; libraryState?: string }>('papers'),
      readAll<{ localState: string }>('documents'),
      readAll<{ status: string; text: string }>('ocrPages'),
    ]);
    database.close();
    return {
      paperId: papers[0]?.id,
      libraryState: papers[0]?.libraryState,
      documentState: documents[0]?.localState,
      ocrStatus: ocrPages[0]?.status,
      ocrText: ocrPages[0]?.text,
    };
  });
}

test('stores a PDF offline and runs cancellable local OCR', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const fixture = testInfo.outputPath('offline-ocr.pdf');
  await createFixture(fixture);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/reader.html');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.getByLabel('Page number')).toHaveValue('1');
  await expect.poll(async () => (await databaseState(page)).paperId).toBeTruthy();

  await page.getByTitle('Save to PaperFlow').click();
  await expect(page.getByTitle('Saved to PaperFlow')).toBeVisible();
  await expect.poll(async () => (await databaseState(page)).libraryState).toBe('saved');
  await page.getByTitle('Save PDF offline').click();
  await expect(page.getByTitle('PDF available offline')).toBeVisible();
  await expect.poll(async () => (await databaseState(page)).documentState).toBe('available');

  await page.getByTitle('OCR pages').click();
  await page.getByRole('button', { name: 'Start OCR' }).click();
  await expect(page.getByRole('button', { name: 'Cancel OCR' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel OCR' }).click();
  await expect.poll(async () => (await databaseState(page)).ocrStatus).toBe('cancelled');

  await page.getByRole('button', { name: 'Start OCR' }).click();
  await expect.poll(async () => (await databaseState(page)).ocrStatus, { timeout: 90_000 }).toBe('complete');
  const state = await databaseState(page);
  expect(state.ocrText?.toLocaleUpperCase()).toContain('PAPERFLOW');

  await page.goto(`/reader.html?paperId=${encodeURIComponent(state.paperId || '')}`);
  await expect(page.getByLabel('Page number')).toHaveValue('1');
  await expect(page.getByTitle('PDF available offline')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reader-offline-ocr.png'), fullPage: true });
});
