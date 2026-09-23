import { expect, test } from '@playwright/test';

test('configures an OpenAI-compatible relay during onboarding', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /OpenAI-compatible API/ }).click();

  const baseUrl = page.getByLabel('Base URL');
  const model = page.getByLabel('Model ID');
  const protocol = page.getByLabel('API format');
  await expect(baseUrl).toBeVisible();
  await baseUrl.fill('https://relay.example.com/v1');
  await model.fill('relay-model-v2');
  await protocol.selectOption('chat-completions');

  await expect(page.getByRole('button', { name: 'Save & test' })).toBeDisabled();
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
