import { expect, test } from '@playwright/test';

test('shows an actionable device login guide when the native host is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Use Chrome extension' })).toBeDisabled();
  await expect(page.getByText('Device login guide')).toBeVisible();
  await expect(page.getByText('Extension ID needs attention')).toBeVisible();
  await expect(page.getByText('dffiahjmpkmellmjijffpcofoahbccoc')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Extension settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PaperFlow settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Codex commands' })).toBeVisible();
});

test('opens appearance settings before onboarding is complete', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Device login guide')).toBeVisible();
  await page.getByRole('button', { name: 'White' }).click();
  await page.getByRole('button', { name: 'Serif' }).click();
  const textSize = page.getByRole('slider', { name: 'Text size' });
  await textSize.fill('75');
  const smallTextSize = await page.getByRole('button', { name: 'Settings' }).evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).fontSize),
  );
  await textSize.fill('160');
  const largeTextSize = await page.getByRole('button', { name: 'Settings' }).evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(largeTextSize).toBeGreaterThan(smallTextSize * 2);

  await expect.poll(() => page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    fontFamily: document.documentElement.dataset.fontFamily,
    fontScale: document.documentElement.style.getPropertyValue('--ui-font-scale'),
    storedTheme: localStorage.getItem('paperflow:theme'),
    storedFont: localStorage.getItem('paperflow:font-family'),
    storedScale: localStorage.getItem('paperflow:font-scale'),
  }))).toEqual({
    theme: 'zotero',
    fontFamily: 'serif',
    fontScale: '1.6',
    storedTheme: 'zotero',
    storedFont: 'serif',
    storedScale: '160',
  });

  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(textSize).toHaveValue('100');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Your paper, understood.' })).toBeVisible();
});

test('configures an OpenAI-compatible relay during onboarding', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /OpenAI-compatible API/ }).click();

  const baseUrl = page.getByLabel('Base URL');
  const model = page.getByLabel('Model ID');
  const protocol = page.getByLabel('API format');
  await expect(baseUrl).toBeVisible();
  await baseUrl.fill('https://relay.example.com/v1');
  await model.selectOption('__custom__');
  await page.getByLabel('Custom model ID').fill('relay-model-v2');
  await protocol.selectOption('chat-completions');

  await expect(page.getByRole('button', { name: 'Test for this session' })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => ({
    baseUrl: localStorage.getItem('paperflow:api-base-url'),
    model: localStorage.getItem('paperflow:api-model'),
    protocol: localStorage.getItem('paperflow:api-protocol'),
  }))).toEqual({
    baseUrl: 'https://relay.example.com/v1',
    model: 'relay-model-v2',
    protocol: 'chat-completions',
  });
  await page.screenshot({ path: testInfo.outputPath('provider-relay-settings.png'), fullPage: true });
});

test('switches between API and subscription modes without losing either model', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto('/');

  await page.getByRole('button', { name: /OpenAI-compatible API/ }).click();
  await page.getByLabel('Model ID').selectOption('__custom__');
  await page.getByLabel('Custom model ID').fill('relay/model-v2');
  await expect(page.getByLabel('Base URL')).toBeVisible();

  await page.getByRole('button', { name: /ChatGPT subscription/ }).click();
  await expect(page.getByLabel('Base URL')).toBeHidden();
  await expect(page.getByText('Device login guide')).toBeVisible();

  await page.getByRole('button', { name: /OpenAI-compatible API/ }).click();
  await expect(page.getByLabel('Custom model ID')).toHaveValue('relay/model-v2');
  await expect.poll(() => page.evaluate(() => ({
    provider: localStorage.getItem('paperflow:provider'),
    apiModel: localStorage.getItem('paperflow:api-model'),
  }))).toEqual({
    provider: 'api',
    apiModel: 'relay/model-v2',
  });
});
