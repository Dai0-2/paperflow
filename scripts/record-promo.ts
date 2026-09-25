import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium, type Browser, type Page } from '@playwright/test';

type PromoController = {
  ready: boolean;
  done: boolean;
  durationMs: number;
  seek: (milliseconds: number) => void;
};

type PromoWindow = Window & {
  __paperflowPromo?: PromoController;
};

const ROOT = process.cwd();
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const FRAMES_DIR = path.join(ARTIFACTS_DIR, 'promo-frames');
const TEMP_VIDEO_DIR = path.join(ARTIFACTS_DIR, '.promo-video');
const OUTPUT_WEBM = path.join(ARTIFACTS_DIR, 'paperflow-promo.webm');
const PORT = Number(process.env.PROMO_PORT || 4177);
const BASE_URL = process.env.PROMO_BASE_URL || `http://127.0.0.1:${PORT}`;
const SHOWCASE_PATH = '/website/showcase/';
const FRAME_TIMES = [1_500, 5_000, 9_500, 13_700, 17_500, 20_300, 23_300, 26_400];

function showcaseUrl(query: string): string {
  return new URL(`${SHOWCASE_PATH}?${query}`, BASE_URL).toString();
}

async function endpointAvailable(): Promise<boolean> {
  try {
    const response = await fetch(showcaseUrl('scene=1'), { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await endpointAvailable()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Showcase server did not become ready at ${BASE_URL}`);
}

async function startServer(): Promise<ChildProcess | undefined> {
  if (await endpointAvailable()) {
    console.log(`Using existing server at ${BASE_URL}`);
    return undefined;
  }

  const executable = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite',
  );
  const server = spawn(executable, ['--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverError = '';
  server.stderr?.on('data', (chunk: Buffer) => {
    serverError += chunk.toString();
  });
  try {
    await waitForServer();
  } catch (error) {
    server.kill('SIGTERM');
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${serverError}`.trim());
  }
  console.log(`Started showcase server at ${BASE_URL}`);
  return server;
}

async function waitForPromo(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    () => Boolean((window as PromoWindow).__paperflowPromo?.ready),
    undefined,
    { timeout: 15_000 },
  );
}

async function captureValidationFrames(browser: Browser): Promise<void> {
  await rm(FRAMES_DIR, { recursive: true, force: true });
  await mkdir(FRAMES_DIR, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(showcaseUrl('scene=1&recording=1'), { waitUntil: 'networkidle' });
  await waitForPromo(page);

  const dimensions = await page.evaluate(() => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    document: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    },
    body: {
      width: document.body.scrollWidth,
      height: document.body.scrollHeight,
    },
  }));

  if (
    dimensions.viewport.width !== 1920
    || dimensions.viewport.height !== 1080
    || dimensions.document.width > 1920
    || dimensions.document.height > 1080
    || dimensions.body.width > 1920
    || dimensions.body.height > 1080
  ) {
    throw new Error(`Showcase overflow detected: ${JSON.stringify(dimensions)}`);
  }

  for (const [index, timestamp] of FRAME_TIMES.entries()) {
    await page.evaluate((milliseconds) => {
      (window as PromoWindow).__paperflowPromo?.seek(milliseconds);
    }, timestamp);
    await page.waitForTimeout(80);
    const sceneNumber = index + 1;
    await page.screenshot({
      path: path.join(FRAMES_DIR, `scene-${sceneNumber}-${timestamp}ms.png`),
      animations: 'disabled',
      scale: 'css',
    });
  }

  if (consoleErrors.length) {
    throw new Error(`Browser errors during validation:\n${consoleErrors.join('\n')}`);
  }

  await context.close();
  console.log(`Captured ${FRAME_TIMES.length} validation frames in ${FRAMES_DIR}`);
}

async function recordVideo(browser: Browser): Promise<void> {
  await rm(TEMP_VIDEO_DIR, { recursive: true, force: true });
  await mkdir(TEMP_VIDEO_DIR, { recursive: true });
  await rm(OUTPUT_WEBM, { force: true });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    recordVideo: {
      dir: TEMP_VIDEO_DIR,
      size: { width: 1920, height: 1080 },
    },
  });
  const page = await context.newPage();
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(showcaseUrl('autoplay=1&recording=1'), { waitUntil: 'networkidle' });
  await waitForPromo(page);
  const video = page.video();
  if (!video) throw new Error('Playwright did not initialize video recording.');

  await page.waitForFunction(
    () => Boolean((window as PromoWindow).__paperflowPromo?.done),
    undefined,
    { timeout: 36_000, polling: 100 },
  );
  await page.waitForTimeout(180);
  await context.close();
  await video.saveAs(OUTPUT_WEBM);

  if (browserErrors.length) {
    throw new Error(`Browser errors during recording:\n${browserErrors.join('\n')}`);
  }

  const output = await stat(OUTPUT_WEBM);
  if (output.size < 100_000) {
    throw new Error(`Recorded video is unexpectedly small (${output.size} bytes).`);
  }

  await rm(TEMP_VIDEO_DIR, { recursive: true, force: true });
  console.log(`Recorded ${OUTPUT_WEBM} (${(output.size / 1_048_576).toFixed(1)} MiB)`);
}

async function stopServer(server: ChildProcess | undefined): Promise<void> {
  if (!server || server.killed) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => server.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (!server.killed) server.kill('SIGKILL');
}

async function main(): Promise<void> {
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  const server = await startServer();
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--hide-scrollbars', '--disable-infobars'],
    });
    await captureValidationFrames(browser);
    await recordVideo(browser);
  } finally {
    await browser?.close();
    await stopServer(server);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
