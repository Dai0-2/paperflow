import { z } from 'zod';
import type { BridgeResponse } from '../types';

const HOST_NAME = 'com.paperflow.ai';
const CURRENT_PROTOCOL_VERSION = 1;

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
  z.object({ action: z.literal('codex.chat'), ...chatFields }).strict(),
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
        resolve({ ok: false, error: runtimeError.message });
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
        : { ok: false, error: chrome.runtime.lastError?.message || 'The PaperFlow native host disconnected before completing the response.' });
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

function updateCachedStatus(changes: Partial<BridgeResponse>): void {
  if (!hostModePromise) return;
  hostModePromise = hostModePromise.then((mode) => ({
    ...mode,
    status: { ...mode.status, ...changes },
  }));
}

export async function getBridgeStatus(): Promise<BridgeResponse> {
  const host = await hostMode();
  if (host.kind === 'legacy') return host.status;
  if (!host.status.ok) return host.status;
  if (!host.status.codexAvailable) {
    return { ok: false, authenticated: false, error: 'Codex CLI was not found. Install it and run `codex login` in a terminal.' };
  }
  return nativeMessage({ action: 'codex.auth_status' });
}

export async function loginWithChatGPT(): Promise<BridgeResponse> {
  const host = await hostMode();
  if (host.kind === 'legacy') return nativeMessageUnchecked({ action: 'login' });
  const result = await nativeMessage({ action: 'codex.auth_status' });
  if (result.ok && !result.authenticated) {
    return { ...result, detail: result.detail || 'Run `codex login` in a terminal, then check again.' };
  }
  return result;
}

export async function sendToCodex(
  question: string,
  context: string,
  images: string[] = [],
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
      responseLanguage: responseLanguage === 'zh' ? 'zh' : 'en',
    }, onEvent)
    : nativeStream({ action: 'chat', question, context, images, responseLanguage }, onEvent);
}

export async function getApiStatus(): Promise<BridgeResponse> {
  const host = await hostMode();
  if (host.kind === 'legacy') return nativeMessageUnchecked({ action: 'api.status' });
  if (!host.status.ok) return host.status;
  return {
    ok: host.status.credentialStoreAvailable !== false,
    authenticated: host.status.apiKeyConfigured === true,
    detail: host.status.credentialStoreAvailable === false
      ? 'The operating-system credential store is unavailable.'
      : host.status.apiKeyConfigured
        ? 'API key is stored in the operating-system credential store.'
        : 'No API key saved.',
  };
}

export async function saveApiKey(apiKey: string): Promise<BridgeResponse> {
  const host = await hostMode();
  const result = host.kind === 'rust'
    ? await nativeMessage({ action: 'api_key.set', apiKey })
    : await nativeMessageUnchecked({ action: 'api.save_key', apiKey });
  if (result.ok) updateCachedStatus({ apiKeyConfigured: true });
  return result;
}

export async function deleteApiKey(): Promise<BridgeResponse> {
  const host = await hostMode();
  const result = host.kind === 'rust'
    ? await nativeMessage({ action: 'api_key.delete' })
    : await nativeMessageUnchecked({ action: 'api.delete_key' });
  if (result.ok) updateCachedStatus({ apiKeyConfigured: false });
  return result;
}

export async function testApiConnection(
  model = 'gpt-5.6-luna',
  baseUrl = 'https://api.openai.com/v1',
  protocol = 'responses',
): Promise<BridgeResponse> {
  const host = await hostMode();
  if (host.kind === 'legacy') return nativeMessageUnchecked({ action: 'api.status' });
  return nativeMessage({
    action: 'api.test',
    model,
    baseUrl,
    protocol: protocol === 'chat-completions' ? 'chat-completions' : 'responses',
  });
}

export async function sendToOpenAI(
  question: string,
  context: string,
  images: string[] = [],
  model = 'gpt-5.6-luna',
  baseUrl = 'https://api.openai.com/v1',
  protocol = 'responses',
  responseLanguage = 'en',
  onEvent?: (event: BridgeResponse) => void,
): Promise<BridgeResponse> {
  const host = await hostMode();
  return host.kind === 'rust'
    ? nativeStream({
      action: 'api.chat',
      question,
      context,
      images,
      model,
      baseUrl,
      protocol: protocol === 'chat-completions' ? 'chat-completions' : 'responses',
      responseLanguage: responseLanguage === 'zh' ? 'zh' : 'en',
    }, onEvent)
    : nativeStream({ action: 'api.chat', question, context, images, model, baseUrl, protocol, responseLanguage }, onEvent);
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
}
