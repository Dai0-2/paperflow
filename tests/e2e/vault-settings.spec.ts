import { expect, test } from '@playwright/test';

test('shows an explicit unconfigured vault state without breaking narrow settings layout', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('paperflow:initialized', 'true');
  });
  await page.goto('/');
  await page.getByLabel('Settings and more').click();

  await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible();
  await expect(page.getByText('Google Drive sync is not configured')).toBeVisible();
  await expect(page.getByText('PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID', { exact: false })).toBeVisible();
  await expect(page.locator('.view-content.settings')).toHaveCSS('overflow-y', 'auto');
  await page.screenshot({ path: testInfo.outputPath('vault-settings-unconfigured.png'), fullPage: true });
});
