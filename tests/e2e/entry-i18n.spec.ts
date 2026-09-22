import { expect, test } from '@playwright/test';

test('stops a flagged PDF handler loop without loading the source', async ({ page }) => {
  const source = 'https://example.org/paper.pdf';
  const parameters = new URLSearchParams({
    url: source,
    paperflowSource: 'default-handler',
    paperflowDepth: '1',
    warning: 'pdf-handler-conflict',
    autoLoad: 'false',
  });

  await page.goto(`/reader.html?${parameters}`);

  await expect(page.locator('.reader-error')).toContainText('stopped a possible PDF-handler redirect loop');
  await expect(page.locator('.reader-open-state input')).toHaveValue(source);
  await expect(page.getByLabel('Page number')).toHaveValue('1');
});

test('uses the selected Chinese interface language across Reader and Library', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('paperflow:ui-language', 'zh');
  });

  await page.goto('/reader.html');
  await expect(page.getByRole('heading', { name: '打开研究论文' })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择本地 PDF' })).toBeVisible();

  await page.goto('/library.html');
  await expect(page.getByLabel('搜索资料库')).toBeVisible();
  await expect(page.getByRole('heading', { name: '全部论文' })).toBeVisible();
  await expect(page.getByText('此视图中没有论文')).toBeVisible();
});
