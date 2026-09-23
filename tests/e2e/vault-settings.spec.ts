import { expect, test } from '@playwright/test';

test('shows an explicit unconfigured vault state without breaking narrow settings layout', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('paperflow:initialized', 'true');
  });
  await page.goto('/');
  await page.getByLabel('Settings and more').click();

  await expect(page.getByRole('checkbox', { name: /Open direct PDFs in PaperFlow/ }))
    .toBeChecked();
  await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible();
  const pdfBackup = page.getByRole('checkbox', { name: /Back up offline PDFs/ });
  await expect(pdfBackup).not.toBeChecked();
  await pdfBackup.check();
  await expect(pdfBackup).toBeChecked();
  await expect(page.getByText('Google Drive is unavailable in this build')).toBeVisible();
  await expect(page.getByText('development build does not include Google OAuth credentials', {
    exact: false,
  })).toBeVisible();
  await expect(page.locator('.view-content.settings')).toHaveCSS('overflow-y', 'auto');
  await page.screenshot({ path: testInfo.outputPath('vault-settings-unconfigured.png'), fullPage: true });
});
