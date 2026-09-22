import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('exports raw IndexedDB data from the recovery page', async ({ page }, testInfo) => {
  await page.goto('/recovery.html?reason=Upgrade%20failed');
  await expect(page.getByRole('heading', { name: 'Library recovery required' })).toBeVisible();
  await expect(page.getByText('Upgrade failed', { exact: true })).toBeVisible();

  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('paperflow-ai', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('papers', { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('papers', 'readwrite');
        transaction.objectStore('papers').put({
          id: 'paper:recovery',
          title: 'Recoverable paper',
        });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export recovery data' }).click();
  const download = await downloadPromise;
  const downloadPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(downloadPath);

  const exported = JSON.parse(await readFile(downloadPath, 'utf8')) as {
    format: string;
    database: string;
    version: number;
    stores: { papers: Array<{ id: string; title: string }> };
  };
  expect(exported).toMatchObject({
    format: 'paperflow-raw-recovery',
    database: 'paperflow-ai',
    version: 1,
  });
  expect(exported.stores.papers).toEqual([
    { id: 'paper:recovery', title: 'Recoverable paper' },
  ]);
  await expect(page.getByRole('status')).toHaveText('Recovery data exported.');
});
