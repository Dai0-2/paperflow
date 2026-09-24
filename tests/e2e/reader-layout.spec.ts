import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function createFixture(path: string): Promise<void> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let line = 0; line < 24; line += 1) {
    page.drawText(`PaperFlow focus line ${line + 1}`, {
      x: 72,
      y: 720 - line * 25,
      size: 12,
      font,
    });
  }
  await writeFile(path, await document.save());
}

test('keeps the reading focus while zooming and resizes the AI panel live', async ({ page }, testInfo) => {
  const fixture = testInfo.outputPath('reader-layout.pdf');
  await createFixture(fixture);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/reader.html');
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.getByLabel('Page number')).toHaveValue('1');

  await page.locator('.reader-scroll').evaluate((root) => {
    root.scrollTop = 170;
  });
  const focusRatio = () => page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.reader-scroll');
    const pdfPage = document.querySelector<HTMLElement>('.pdf-page');
    if (!root || !pdfPage) throw new Error('Reader page is unavailable.');
    const rootRect = root.getBoundingClientRect();
    const pageRect = pdfPage.getBoundingClientRect();
    const x = rootRect.left + rootRect.width / 2;
    const y = rootRect.top + rootRect.height / 2;
    return {
      x: (x - pageRect.left) / pageRect.width,
      y: (y - pageRect.top) / pageRect.height,
    };
  });
  const beforeZoom = await focusRatio();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom' })).toHaveText('110%');
  await page.waitForTimeout(80);
  const afterZoom = await focusRatio();
  expect(Math.abs(afterZoom.x - beforeZoom.x)).toBeLessThan(.04);
  expect(Math.abs(afterZoom.y - beforeZoom.y)).toBeLessThan(.04);

  const assistant = page.locator('.reader-assistant');
  const divider = page.locator('.reader-divider');
  const initial = await assistant.boundingBox();
  const dividerBox = await divider.boundingBox();
  expect(initial).toBeTruthy();
  expect(dividerBox).toBeTruthy();
  await page.mouse.move(dividerBox!.x + 1, dividerBox!.y + dividerBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(dividerBox!.x - 120, dividerBox!.y + dividerBox!.height / 2, { steps: 8 });
  const duringDrag = await assistant.boundingBox();
  await page.mouse.up();
  expect(duringDrag!.width).toBeGreaterThan(initial!.width + 80);

  await page.setViewportSize({ width: 900, height: 760 });
  await expect.poll(async () => (await assistant.boundingBox())?.width || 0).toBeLessThanOrEqual(540);
  const documentArea = await page.locator('.reader-document').boundingBox();
  expect(documentArea!.width).toBeGreaterThanOrEqual(360);
});
