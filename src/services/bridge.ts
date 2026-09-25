import { z } from 'zod';
import type { BridgeResponse } from '../types';
import {
  deletePreviewApiKey,
  discoverApiModelsWithKey,
  getPreviewApiStatus,
  previewApiAvailable,
  resetPreviewApiForTests,
  savePreviewApiKey,
  sendPreviewApi,
  testPreviewApiConnection,
} from './previewApi';
import {
  deleteBrowserApiKey,
  discoverBrowserApiModels,
  getBrowserApiStatus,
  saveBrowserApiKey,
  sendBrowserApi,
  testBrowserApiConnection,
} from './browserApi';

const HOST_NAME = 'com.paperflow.ai';
const CURRENT_PROTOCOL_VERSION = 1;
const CODEX_AUTH_POLL_INTERVAL_MS = 1_000;
const CODEX_AUTH_TIMEOUT_MS = 5 * 60_000;

const bridgeResponseSchema = z.object({
  ok: z.boolean(),
  event: z.enum(['progress', 'delta', 'complete']).optional(),
  stage: z.string().max(128).optional(),
  delta: z.string().optional(),
  authenticated: z.boolean().optional(),
  detail: z.string().max(8192).optional(),
  answer: z.string().optional(),
  vaultKey: z.string().max(128).optional(),
  protocolVersion: z.number().int().positive().optional(),
  hostVersion: z.string().max(64).optional(),
  platform: z.string().max(64).optional(),
  codexAvailable: z.boolean().optional(),
  credentialStoreAvailable: z.boolean().optional(),
  apiKeyConfigured: z.boolean().optional(),
  models: z.array(z.string().min(1).max(128)).max(500).optional(),
  error: z.string().max(8192).optional(),
}).strict();

const chatFields = {
  question: z.string().min(1).max(20_000),
  context: z.string().max(180_000),
  images: z.array(z.string().max(900_000)).max(2),
  responseLanguage: z.enum(['en', 'zh']),
};

export const bridgeRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }).strict(),
  z.object({ action: z.literal('codex.auth_status') }).strict(),
  z.object({ action: z.literal('codex.login') }).strict(),
  z.object({
    action: z.literal('codex.chat'),
    ...chatFields,
    model: z.string().min(1).max(128).optional(),
  }).strict(),
  z.object({ action: z.literal('api_key.set'), apiKey: z.string().min(8).max(512) }).strict(),
  z.object({ action: z.literal('api_key.delete') }).strict(),
  z.object({
    action: z.literal('api.test'),
    model: z.string().min(1).max(128),
    baseUrl: z.string().min(1).max(2048),
    protocol: z.enum(['responses', 'chat-completions']),
  }).strict(),
  z.object({
    action: z.literal('api.chat'),
    ...chatFields,
    model: z.string().min(1).max(128),
    baseUrl: z.string().min(1).max(2048),
    protocol: z.enum(['responses', 'chat-completions']),
  }).strict(),
  z.object({
    action: z.literal('vault.store_device_key'),
    vaultId: z.string().uuid(),
    vaultKey: z.string().length(44),
  }).strict(),
  z.object({ action: z.literal('vault.load_device_key'), vaultId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('vault.delete_device_key'), vaultId: z.string().uuid() }).strict(),
]);

type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
type LegacyRequest = Record<string, unknown>;
type HostMode = { kind: 'rust'; status: BridgeResponse } | { kind: 'legacy'; status: BridgeResponse };

let hostModePromise: Promise<HostMode> | undefined;

function nativeHostError(message?: string): string {
  const detail = message || 'Could not connect to the PaperFlow native host.';
  if (/native messaging host.*not found|specified native messaging host.*not found/i.test(detail)) {
    return 'PaperFlow Native Host is not installed. Install it from the device-test package, reload the extension, then sign in.';
  }
  if (/native messaging host.*forbidden|access to the specified native messaging host/i.test(detail)) {
    return 'Chrome blocked the PaperFlow Native Host because the extension ID does not match. Install the stable-ID device-test build.';
  }
  return detail;
}

function parseResponse(response: unknown): BridgeResponse {
  const parsed = bridgeResponseSchema.safeParse(response);
  return parsed.success
    ? parsed.data
    : { ok: false, error: 'The PaperFlow native host returned an invalid response.' };
}

function nativeMessageUnchecked(payload: LegacyRequest): Promise<BridgeResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendNativeMessage) {
    return Promise.resolve({ ok: false, error: 'The local bridge is only available inside the Chrome extension.' });
  }
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, payload, (response: unknown) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        resolve({ ok: false, error: nativeHostError(runtimeError.message) });
        return;
      }
      resolve(parseResponse(response));
    });
  });
}

function nativeMessage(payload: BridgeRequest): Promise<BridgeResponse> {
  const parsed = bridgeRequestSchema.safeParse(payload);
  return parsed.success
    ? nativeMessageUnchecked(parsed.data)
    : Promise.resolve({ ok: false, error: 'PaperFlow blocked an invalid native-host request.' });
}

function nativeStream(payload: BridgeRequest | LegacyRequest, onEvent?: (event: BridgeResponse) => void): Promise<BridgeResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.connectNative) {
    return Promise.resolve({ ok: false, error: 'The local bridge is only available inside the Chrome extension.' });
  }
  let validatedPayload = payload;
  if ('action' in payload && typeof payload.action === 'string' && payload.action.includes('.')) {
    const parsed = bridgeRequestSchema.safeParse(payload);
    if (!parsed.success) return Promise.resolve({ ok: false, error: 'PaperFlow blocked an invalid native-host request.' });
    validatedPayload = parsed.data;
  }
  return new Promise((resolve) => {
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connectNative(HOST_NAME);
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : 'Could not connect to the PaperFlow native host.' });
      return;
    }
    let settled = false;
    let lastEvent: BridgeResponse | undefined;
    port.onMessage.addListener((message: unknown) => {
      const parsed = parseResponse(message);
      lastEvent = parsed;
      if (!parsed.ok && parsed.error === 'The PaperFlow native host returned an invalid response.') {
        settled = true;
        resolve(parsed);
        port.disconnect();
        return;
      }
      if (parsed.event === 'progress' || parsed.event === 'delta') {
        onEvent?.(parsed);
        return;
      }
      if (!settled) {
        settled = true;
        resolve(parsed);
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true;
      resolve(lastEvent?.ok === false
        ? lastEvent
        : { ok: false, error: nativeHostError(chrome.runtime.lastError?.message || 'The PaperFlow native host disconnected before completing the response.') });
    });
    port.postMessage(validatedPayload);
  });
}

async function detectHost(): Promise<HostMode> {
  const status = await nativeMessage({ action: 'status' });
  if (status.protocolVersion !== undefined) {
    if (status.protocolVersion > CURRENT_PROTOCOL_VERSION) {
      return {
        kind: 'rust',
        status: { ok: false, error: 'The PaperFlow native host is newer than this extension. Update the extension.' },
      };
    }
    return { kind: 'rust', status };
  }
  return { kind: 'legacy', status };
}

function hostMode(): Promise<HostMode> {
  hostModePromise ??= detectHost();
  return hostModePromise;
}

function refreshHostMode(): Promise<HostMode> {
  hostModePromise = detectHost();
  return hostModePromise;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

async function pollCodexAuthentication(signal: AbortSignal): Promise<BridgeResponse> {
  const deadline = Date.now() + CODEX_AUTH_TIMEOUT_MS;
  let latest: BridgeResponse = {
    ok: true,
    authenticated: false,
    detail: 'Waiting for Codex CLI sign-in to complete.',
  };
  while (!signal.aborted && Date.now() < deadline) {
    latest = await nativeMessage({ action: 'codex.auth_status' });
    if (latest.ok && latest.authenticated) return latest;
    await delay(CODEX_AUTH_POLL_INTERVAL_MS, signal);
  }
  return {
    ok: false,
    authenticated: false,
    error: latest.error || 'Codex sign-in timed out. Check `codex login status`, then try again.',
  };
}

export async function getBridgeStatus(): Promise<BridgeResponse> {
  const host = await refreshHostMode();
  if (host.kind === 'legacy') return host.status;
  if (!host.status.ok) return host.status;
  if (!host.status.codexAvailable) {
    return { ok: false, authenticated: false, error: 'Codex CLI was not found. Install the official Codex CLI, then use Sign in with ChatGPT.' };
  }
  return nativeMessage({ action: 'codex.auth_status' });
}

export async function loginWithChatGPT(): Promise<BridgeResponse> {
  const host = await hostMode();
  if (host.kind === 'legacy') return nativeMessageUnchecked({ action: 'login' });
  if (!host.status.ok) return host.status;
  if (!host.status.codexAvailable) {
    return {
      ok: false,
      authenticated: false,
      error: 'Codex CLI was not found. Install the official Codex CLI, then try again.',
    };
  }
  const current = await nativeMessage({ action: 'codex.auth_status' });
  if (current.ok && current.authenticated) return current;

  const polling = new AbortController();
  const result = await Promise.race([
    nativeMessage({ action: 'codex.login' }),
    pollCodexAuthentication(polling.signal),
  ]);
  polling.abort();
  if (result.ok && result.authenticated) return result;

  const confirmed = await nativeMessage({ action: 'codex.auth_status' });
  return confirmed.ok && confirmed.authenticated ? confirmed : result;
}

export async function sendToCodex(
  question: string,
  context: string,
  images: string[] = [],
  model?: string,
  responseLanguage = 'en',
  onEvent?: (event: BridgeResponse) => void,
): Promise<BridgeResponse> {
  const host = await hostMode();
  return host.kind === 'rust'
    ? nativeStream({
      action: 'codex.chat',
      question,
      context,
      images,
      ...(model ? { model } : {}),
      responseLanguage: responseLanguage === 'zh' ? 'zh' : 'en',
    }, onEvent)
    : nativeStream({ action: 'chat', question, context, images, responseLanguage }, onEvent);
}

export async function getApiStatus(): Promise<BridgeResponse> {
  if (previewApiAvailable()) return getPreviewApiStatus();
  return getBrowserApiStatus();
}

export async function saveApiKey(
  apiKey: string,
  baseUrl = 'https://api.openai.com/v1',
): Promise<BridgeResponse> {
  if (previewApiAvailable()) return savePreviewApiKey(apiKey);
  return saveBrowserApiKey(apiKey, baseUrl);
}

export async function deleteApiKey(): Promise<BridgeResponse> {
  if (previewApiAvailable()) return deletePreviewApiKey();
  return deleteBrowserApiKey();
}

export async function discoverApiModels(
  apiKey: string,
  baseUrl: string,
): Promise<BridgeResponse> {
  return previewApiAvailable()
    ? discoverApiModelsWithKey(apiKey, baseUrl)
    : discoverBrowserApiModels(apiKey, baseUrl);
}

export async function testApiConnection(
  model = 'gpt-4.1-mini',
  baseUrl = 'https://api.openai.com/v1',
  protocol = 'responses',
): Promise<BridgeResponse> {
  if (previewApiAvailable()) {
    return testPreviewApiConnection(
      model,
      baseUrl,
      protocol === 'chat-completions' ? 'chat-completions' : 'responses',
    );
  }
  return testBrowserApiConnection(
    model,
    baseUrl,
    protocol === 'chat-completions' ? 'chat-completions' : 'responses',
  );
}

export async function sendToOpenAI(
  question: string,
  context: string,
  images: string[] = [],
  model = 'gpt-4.1-mini',
  baseUrl = 'https://api.openai.com/v1',
  protocol = 'responses',
  responseLanguage = 'en',
  onEvent?: (event: BridgeResponse) => void,
): Promise<BridgeResponse> {
  if (previewApiAvailable()) {
    return sendPreviewApi(
      question,
      context,
      images,
      model,
      baseUrl,
      protocol === 'chat-completions' ? 'chat-completions' : 'responses',
      responseLanguage,
      onEvent,
    );
  }
  return sendBrowserApi(
    question,
    context,
    images,
    model,
    baseUrl,
    protocol === 'chat-completions' ? 'chat-completions' : 'responses',
    responseLanguage,
    onEvent,
  );
}

export async function getVaultCredentialStatus(): Promise<BridgeResponse> {
  const host = await hostMode();
  if (host.kind === 'legacy') return nativeMessageUnchecked({ action: 'vault.status' });
  return {
    ok: host.status.ok && host.status.credentialStoreAvailable === true,
    authenticated: host.status.credentialStoreAvailable === true,
    detail: host.status.credentialStoreAvailable
      ? 'The operating-system credential store is available.'
      : 'The operating-system credential store is unavailable.',
  };
}

export async function storeDeviceVaultKey(vaultId: string, vaultKey: string): Promise<BridgeResponse> {
  const host = await hostMode();
  return host.kind === 'rust'
    ? nativeMessage({ action: 'vault.store_device_key', vaultId, vaultKey })
    : nativeMessageUnchecked({ action: 'vault.store_device_key', vaultId, vaultKey });
}

export async function loadDeviceVaultKey(vaultId: string): Promise<BridgeResponse> {
  const host = await hostMode();
  return host.kind === 'rust'
    ? nativeMessage({ action: 'vault.load_device_key', vaultId })
    : nativeMessageUnchecked({ action: 'vault.load_device_key', vaultId });
}

export async function deleteDeviceVaultKey(vaultId: string): Promise<BridgeResponse> {
  const host = await hostMode();
  return host.kind === 'rust'
    ? nativeMessage({ action: 'vault.delete_device_key', vaultId })
    : nativeMessageUnchecked({ action: 'vault.delete_device_key', vaultId });
}

export function resetBridgeProbeForTests(): void {
  hostModePromise = undefined;
  resetPreviewApiForTests();
}
