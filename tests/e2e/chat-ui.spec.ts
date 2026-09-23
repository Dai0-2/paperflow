import { expect, test } from '@playwright/test';

test('keeps assistant actions visible and saves an answer as a library note', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('paperflow:initialized', 'true');
    localStorage.setItem('paperflow:provider', 'api');
    localStorage.setItem('paperflow:api-model', 'gpt-4.1-mini');
  });
  await page.goto('/');
  await expect(page.getByText('Open a PDF in Chrome to detect the current paper')).toBeVisible();

  await page.evaluate(async () => {
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
    const [paper] = await readAll<{ id: string }>('papers');
    const [thread] = await readAll<{ id: string }>('threads');
    if (!paper || !thread) throw new Error('Preview workspace was not initialized.');
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('messages', 'readwrite');
      const messages = transaction.objectStore('messages');
      messages.put({
        id: 'chat-user',
        paperId: paper.id,
        threadId: thread.id,
        sequence: 0,
        role: 'user',
        content: 'What is the key contribution?',
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      });
      messages.put({
        id: 'chat-assistant',
        paperId: paper.id,
        threadId: thread.id,
        sequence: 1,
        role: 'assistant',
        content: '## Key contribution\n\nThe paper introduces a faster evidence retrieval workflow.',
        model: 'gpt-4.1-mini',
        firstTokenMs: 840,
        durationMs: 2100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();

  const actions = page.getByLabel('Message actions').last();
  await expect(actions).toBeVisible();
  const answerBox = await page.locator('.message.assistant .message-body').last().boundingBox();
  const actionsBox = await actions.boundingBox();
  expect(answerBox).toBeTruthy();
  expect(actionsBox).toBeTruthy();
  expect(actionsBox!.y).toBeGreaterThanOrEqual(answerBox!.y + answerBox!.height);
  await expect(page.getByText('First response 0.8s')).toBeVisible();
  await page.getByRole('button', { name: 'gpt-4.1-mini' }).click();
  await expect(page.getByRole('dialog', { name: 'Choose model' })).toBeVisible();
  await expect(page.getByLabel('Custom model ID')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTitle('Save as a library note').click();
  await expect(page.getByTitle('Saved as a library note')).toBeDisabled();
  await expect.poll(() => page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('paperflow-ai');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction('notes', 'readonly');
      const request = transaction.objectStore('notes').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return count;
  })).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('chat-actions-model.png'), fullPage: true });
});
