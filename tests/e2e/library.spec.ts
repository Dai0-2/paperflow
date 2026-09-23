import { expect, test, type Page } from '@playwright/test';

async function seedLibrary(page: Page, count: number): Promise<void> {
  await page.evaluate(async (paperCount) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('paperflow-ai');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        ['papers', 'collections', 'collectionItems', 'tags', 'paperTags'],
        'readwrite',
      );
      for (const name of ['papers', 'collections', 'collectionItems', 'tags', 'paperTags']) {
        transaction.objectStore(name).clear();
      }
      const now = Date.now();
      transaction.objectStore('collections').put({
        id: 'collection:ml',
        name: 'Machine Learning',
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
        version: { counter: 1, deviceId: 'e2e' },
      });
      transaction.objectStore('tags').put({
        id: 'tag:transformers',
        name: 'Transformers',
        normalizedName: 'transformers',
        color: '#3c7a67',
        createdAt: now,
        updatedAt: now,
        version: { counter: 1, deviceId: 'e2e' },
      });
      for (let index = 0; index < paperCount; index += 1) {
        const id = `paper:e2e:${index}`;
        transaction.objectStore('papers').put({
          id,
          shortTitle: `Paper ${index}`,
          title: index === 9_999
            ? 'A Deliberately Long Academic Paper Title That Verifies Truncation Without Resizing the Virtual Row'
            : `Research Paper ${index}`,
          authors: index % 2 ? 'Ada Lovelace' : 'Grace Hopper',
          year: index % 5 === 0 ? '2024' : '2023',
          source: 'Proceedings of PaperFlow',
          journal: 'PaperFlow Research',
          url: `https://example.com/papers/${index}.pdf`,
          doi: `10.1000/paperflow.${index}`,
          abstract: 'A local-first research fixture used to verify the library workspace.',
          libraryState: 'saved',
          favorite: index % 11 === 0,
          readStatus: index % 3 === 0 ? 'read' : 'unread',
          createdAt: now - index,
          accessedAt: index < 7
            ? now - index * 24 * 60 * 60 * 1000
            : now - (index + 8) * 24 * 60 * 60 * 1000,
          updatedAt: now - index,
          version: { counter: 1, deviceId: 'e2e' },
        });
        if (index < 20) {
          transaction.objectStore('collectionItems').put({
            id: `collection:ml:${id}`,
            collectionId: 'collection:ml',
            paperId: id,
            createdAt: now,
            updatedAt: now,
            version: { counter: 1, deviceId: 'e2e' },
          });
          transaction.objectStore('paperTags').put({
            id: `${id}:tag:transformers`,
            paperId: id,
            tagId: 'tag:transformers',
            createdAt: now,
            updatedAt: now,
            version: { counter: 1, deviceId: 'e2e' },
          });
        }
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, count);
}

async function paperCollectionExists(
  page: Page,
  paperId: string,
  collectionId: string,
): Promise<boolean> {
  return page.evaluate(async ({ targetPaperId, targetCollectionId }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('paperflow-ai');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const exists = await new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction('collectionItems', 'readonly');
      const request = transaction.objectStore('collectionItems').get(
        `${targetCollectionId}:${targetPaperId}`,
      );
      request.onsuccess = () => resolve(Boolean(request.result && !request.result.deletedAt));
      request.onerror = () => reject(request.error);
    });
    database.close();
    return exists;
  }, { targetPaperId: paperId, targetCollectionId: collectionId });
}

test('virtualizes and filters a 10,000-paper library', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/library.html');
  await seedLibrary(page, 10_000);
  await page.reload();

  await expect(page.getByText('10000 items')).toBeVisible();
  const renderedRows = page.locator('.paper-table-row');
  await expect(renderedRows.first()).toBeVisible();
  expect(await renderedRows.count()).toBeLessThan(100);

  await page.getByRole('button', { name: /Recently read/ }).click();
  await expect(page.getByText('7 items')).toBeVisible();
  await page.getByRole('button', { name: /All papers/ }).click();

  await page.getByLabel('Search library').fill('author:"Ada Lovelace" year:2024 status:read');
  await expect(page.getByText('333 items')).toBeVisible();
  await expect(page.locator('.paper-table-row').filter({ hasText: 'Research Paper 15' }).first()).toBeVisible();

  await page.getByTitle('Clear search').click();
  await page.locator('.paper-table-scroll').evaluate((element) => {
    element.scrollTop = 20 * 52;
  });
  const draggedPaper = page.locator('.paper-table-row').filter({ hasText: 'Research Paper 20' }).first();
  const collection = page.locator('.collection-row').filter({ hasText: 'Machine Learning' });
  await expect(draggedPaper).toBeVisible();
  await draggedPaper.dragTo(collection);
  await expect.poll(() => paperCollectionExists(page, 'paper:e2e:20', 'collection:ml')).toBe(true);
  await collection.getByRole('button', { name: 'Machine Learning' }).click();
  await expect(page.getByText('21 items')).toBeVisible();

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settingsDialog = page.getByRole('dialog', { name: 'Library settings' });
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog).toContainText(
    'Sign in with Google to sync library records, notes, annotations, conversations, and optional PDFs',
  );
  await expect(settingsDialog.getByRole('checkbox', { name: /Open direct PDFs/ })).toBeChecked();
  await settingsDialog.getByTitle('Close').click();

  await page.getByRole('button', { name: /Google cloud library/ }).click();
  const cloudDialog = page.getByRole('dialog', { name: 'Google cloud library' });
  await expect(cloudDialog).toBeVisible();
  await expect(cloudDialog).toContainText('private account library');
  await cloudDialog.getByTitle('Close').click();
  await page.screenshot({ path: testInfo.outputPath('library-desktop.png'), fullPage: true });
});

test('keeps the inspector navigable on a narrow viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/library.html');
  await seedLibrary(page, 40);
  await page.reload();

  const sidebar = page.locator('.library-sidebar');
  await expect(sidebar).toBeHidden();
  await page.getByTitle('Toggle navigation').click();
  await expect(sidebar).toBeVisible();
  await expect(page.getByLabel('Close navigation')).toBeVisible();
  await page.getByRole('button', { name: /Recently read/ }).click();
  await expect(sidebar).toBeHidden();

  await expect(page.locator('.paper-inspector')).toBeHidden();
  await page.locator('.paper-table-row').first().click();
  await expect(page.locator('.paper-inspector')).toBeVisible();
  await page.getByTitle('Close inspector').click();
  await expect(page.locator('.paper-inspector')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('library-mobile.png'), fullPage: true });
});
