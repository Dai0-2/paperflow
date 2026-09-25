import { z } from 'zod';
import type { ApiProtocol, BridgeResponse } from '../types';
import {
  apiErrorDetail,
  apiOriginPattern,
  buildApiRequestPayload,
  normalizeApiEndpoint,
  normalizeModelsEndpoint,
  parseApiModelIds,
  readApiResponse,
} from './apiTransport';

const API_KEY_STORAGE_KEY = 'paperflow:api-key';
const API_STREAM_PORT = 'paperflow:api-stream';
const API_TIMEOUT_MS = 5 * 60_000;

const apiKeySchema = z.string().min(8).max(512).refine((value) => !/\s/.test(value));
const apiProtocolSchema = z.enum(['responses', 'chat-completions']);
const apiBaseUrlSchema = z.string().min(1).max(2_048);
const modelSchema = z.string().min(1).max(128);
const chatFields = {
  question: z.string().min(1).max(20_000),
  context: z.string().max(180_000),
  images: z.array(z.string().max(900_000)).max(2),
  model: modelSchema,
  baseUrl: apiBaseUrlSchema,
  protocol: apiProtocolSchema,
  responseLanguage: z.enum(['en', 'zh']),
};

export const browserApiRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paperflow:api-status') }).strict(),
  z.object({ type: z.literal('paperflow:api-save-key'), apiKey: apiKeySchema }).strict(),
  z.object({ type: z.literal('paperflow:api-delete-key') }).strict(),
  z.object({
    type: z.literal('paperflow:api-models'),
    apiKey: apiKeySchema,
    baseUrl: apiBaseUrlSchema,
  }).strict(),
  z.object({
    type: z.literal('paperflow:api-test'),
    model: modelSchema,
    baseUrl: apiBaseUrlSchema,
    protocol: apiProtocolSchema,
  }).strict(),
]);

export const browserApiChatSchema = z.object({
  type: z.literal('paperflow:api-chat'),
  ...chatFields,
}).strict();

type BrowserApiRequest = z.infer<typeof browserApiRequestSchema>;
type BrowserApiChatRequest = z.infer<typeof browserApiChatSchema>;

function browserRuntimeAvailable(): boolean {
  return typeof chrome !== 'undefined'
    && Boolean(chrome.runtime?.id && chrome.runtime?.sendMessage);
}

function validApiKey(apiKey: string): boolean {
  return apiKeySchema.safeParse(apiKey).success;
}

async function restrictApiKeyStorage(): Promise<void> {
  try {
    await chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch {
    // Older Chromium builds do not expose access-level controls.
  }
}

async function storedApiKey(): Promise<string> {
  const stored = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
  const apiKey = stored[API_KEY_STORAGE_KEY];
  return typeof apiKey === 'string' && validApiKey(apiKey) ? apiKey : '';
}

function requestHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: 'text/event-stream, application/json',
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  outerSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  outerSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, API_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', abort);
  }
}

async function discoverModels(apiKey: string, baseUrl: string): Promise<BridgeResponse> {
  const endpoint = normalizeModelsEndpoint(baseUrl);
  const response = await fetchWithTimeout(endpoint, {
    method: 'GET',
    headers: requestHeaders(apiKey),
  });
  const body = await response.text();
  if (!response.ok) return { ok: false, error: apiErrorDetail(response.status, body) };
  const models = parseApiModelIds(JSON.parse(body));
  return models.length
    ? { ok: true, authenticated: true, models, detail: `${models.length} models available.` }
    : { ok: false, error: 'The API returned no models. Use a custom model ID instead.' };
}

async function testConnection(
  model: string,
  baseUrl: string,
  protocol: ApiProtocol,
): Promise<BridgeResponse> {
  const apiKey = await storedApiKey();
  if (!apiKey) return { ok: false, authenticated: false, error: 'Enter an API key first.' };
  const endpoint = normalizeApiEndpoint(baseUrl, protocol);
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: requestHeaders(apiKey),
    body: JSON.stringify(buildApiRequestPayload(
      'Reply with OK.',
      '',
      [],
      model,
      protocol,
      'en',
      false,
    )),
  });
  const body = await response.text();
  if (!response.ok) {
    return { ok: false, authenticated: false, error: apiErrorDetail(response.status, body) };
  }
  try {
    const answer = await readApiResponse(new Response(body, {
      status: response.status,
      headers: response.headers,
    }), protocol);
    return answer
      ? { ok: true, authenticated: true, detail: 'API connection verified. Key saved in this browser profile.' }
      : { ok: false, authenticated: false, error: 'The API returned no text.' };
  } catch {
    return { ok: false, authenticated: false, error: 'The API returned an invalid response.' };
  }
}

export async function handleBrowserApiRequest(
  request: BrowserApiRequest,
): Promise<BridgeResponse> {
  try {
    if (request.type === 'paperflow:api-status') {
      const configured = Boolean(await storedApiKey());
      return {
        ok: true,
        authenticated: configured,
        apiKeyConfigured: configured,
        detail: configured
          ? 'API key is saved in this browser profile.'
          : 'No API key saved.',
      };
    }
    if (request.type === 'paperflow:api-save-key') {
      await restrictApiKeyStorage();
      await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: request.apiKey });
      return {
        ok: true,
        authenticated: true,
        apiKeyConfigured: true,
        detail: 'API key saved in this browser profile.',
      };
    }
    if (request.type === 'paperflow:api-delete-key') {
      await chrome.storage.local.remove(API_KEY_STORAGE_KEY);
      return {
        ok: true,
        authenticated: false,
        apiKeyConfigured: false,
        detail: 'API key removed from this browser profile.',
      };
    }
    if (request.type === 'paperflow:api-models') {
      return await discoverModels(request.apiKey, request.baseUrl);
    }
    return await testConnection(request.model, request.baseUrl, request.protocol);
  } catch (error) {
    return {
      ok: false,
      authenticated: false,
      error: error instanceof Error && error.name === 'AbortError'
        ? 'The API request timed out.'
        : error instanceof Error
          ? error.message
          : 'Could not reach the configured API endpoint.',
    };
  }
}

export async function runBrowserApiChat(
  request: BrowserApiChatRequest,
  onEvent?: (event: BridgeResponse) => void,
  signal?: AbortSignal,
): Promise<BridgeResponse> {
  try {
    const apiKey = await storedApiKey();
    if (!apiKey) return { ok: false, error: 'Enter an API key in Settings first.' };
    const endpoint = normalizeApiEndpoint(request.baseUrl, request.protocol);
    onEvent?.({ ok: true, event: 'progress', stage: 'accepted' });
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: requestHeaders(apiKey),
      body: JSON.stringify(buildApiRequestPayload(
        request.question,
        request.context,
        request.images,
        request.model,
        request.protocol,
        request.responseLanguage,
        true,
      )),
    }, signal);
    if (!response.ok) {
      return { ok: false, error: apiErrorDetail(response.status, await response.text()) };
    }
    onEvent?.({ ok: true, event: 'progress', stage: 'connected' });
    const answer = await readApiResponse(response, request.protocol, onEvent);
    return answer
      ? { ok: true, event: 'complete', answer }
      : { ok: false, error: 'The API returned no text.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.name === 'AbortError'
        ? 'The API request was cancelled or timed out.'
        : error instanceof Error
          ? error.message
          : 'Could not reach the configured API endpoint.',
    };
  }
}

function sameExtension(senderId: string | undefined): boolean {
  return !senderId || senderId === chrome.runtime.id;
}

export function registerBrowserApiHandlers(): void {
  void restrictApiKeyStorage();
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const parsed = browserApiRequestSchema.safeParse(message);
    if (!parsed.success || !sameExtension(sender.id)) return undefined;
    void handleBrowserApiRequest(parsed.data).then(sendResponse);
    return true;
  });
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== API_STREAM_PORT || !sameExtension(port.sender?.id)) return;
    const controller = new AbortController();
    let started = false;
    let disconnected = false;
    const postMessage = (message: BridgeResponse) => {
      if (!disconnected) port.postMessage(message);
    };
    port.onDisconnect.addListener(() => {
      disconnected = true;
      controller.abort();
    });
    port.onMessage.addListener((message: unknown) => {
      if (started) return;
      started = true;
      const parsed = browserApiChatSchema.safeParse(message);
      if (!parsed.success) {
        postMessage({ ok: false, error: 'PaperFlow blocked an invalid API request.' });
        return;
      }
      void runBrowserApiChat(
        parsed.data,
        postMessage,
        controller.signal,
      ).then(postMessage);
    });
  });
}

function parseBrowserResponse(response: unknown): BridgeResponse {
  if (!response || typeof response !== 'object' || typeof (response as { ok?: unknown }).ok !== 'boolean') {
    return { ok: false, error: 'The PaperFlow background service returned an invalid response.' };
  }
  return response as BridgeResponse;
}

function sendBrowserMessage(request: BrowserApiRequest): Promise<BridgeResponse> {
  if (!browserRuntimeAvailable()) {
    return Promise.resolve({ ok: false, error: 'The browser API bridge is only available inside the Chrome extension.' });
  }
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(request, (response: unknown) => {
      const runtimeError = chrome.runtime.lastError;
      resolve(runtimeError
        ? { ok: false, error: runtimeError.message }
        : parseBrowserResponse(response));
    });
  });
}

async function requestOriginPermission(baseUrl: string): Promise<BridgeResponse | undefined> {
  try {
    const origin = apiOriginPattern(baseUrl);
    const granted = await chrome.permissions.request({ origins: [origin] });
    return granted
      ? undefined
      : { ok: false, authenticated: false, error: 'Permission to access this API provider was not granted.' };
  } catch (error) {
    return {
      ok: false,
      authenticated: false,
      error: error instanceof Error ? error.message : 'Could not request access to this API provider.',
    };
  }
}

async function hasOriginPermission(baseUrl: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [apiOriginPattern(baseUrl)] });
  } catch {
    return false;
  }
}

export function getBrowserApiStatus(): Promise<BridgeResponse> {
  return sendBrowserMessage({ type: 'paperflow:api-status' });
}

export async function saveBrowserApiKey(
  apiKey: string,
  baseUrl: string,
): Promise<BridgeResponse> {
  if (!validApiKey(apiKey)) {
    return { ok: false, authenticated: false, error: 'Enter a valid API key.' };
  }
  const permissionError = await requestOriginPermission(baseUrl);
  return permissionError || sendBrowserMessage({ type: 'paperflow:api-save-key', apiKey });
}

export function deleteBrowserApiKey(): Promise<BridgeResponse> {
  return sendBrowserMessage({ type: 'paperflow:api-delete-key' });
}

export async function discoverBrowserApiModels(
  apiKey: string,
  baseUrl: string,
): Promise<BridgeResponse> {
  if (!await hasOriginPermission(baseUrl)) {
    const permissionError = await requestOriginPermission(baseUrl);
    if (permissionError) return permissionError;
  }
  return sendBrowserMessage({ type: 'paperflow:api-models', apiKey, baseUrl });
}

export async function testBrowserApiConnection(
  model: string,
  baseUrl: string,
  protocol: ApiProtocol,
): Promise<BridgeResponse> {
  const permissionError = await requestOriginPermission(baseUrl);
  return permissionError || sendBrowserMessage({
    type: 'paperflow:api-test',
    model,
    baseUrl,
    protocol,
  });
}

export async function sendBrowserApi(
  question: string,
  context: string,
  images: string[],
  model: string,
  baseUrl: string,
  protocol: ApiProtocol,
  responseLanguage: string,
  onEvent?: (event: BridgeResponse) => void,
): Promise<BridgeResponse> {
  if (!browserRuntimeAvailable()) {
    return { ok: false, error: 'The browser API bridge is only available inside the Chrome extension.' };
  }
  if (!await hasOriginPermission(baseUrl)) {
    return {
      ok: false,
      error: 'PaperFlow does not have access to this API provider. Save and test the endpoint in Settings first.',
    };
  }
  return new Promise((resolve) => {
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect({ name: API_STREAM_PORT });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : 'Could not connect to the PaperFlow background service.' });
      return;
    }
    let settled = false;
    port.onMessage.addListener((message: unknown) => {
      const response = parseBrowserResponse(message);
      if (response.event === 'progress' || response.event === 'delta') {
        onEvent?.(response);
        return;
      }
      if (!settled) {
        settled = true;
        resolve(response);
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        error: chrome.runtime.lastError?.message
          || 'The PaperFlow background service disconnected before completing the response.',
      });
    });
    port.postMessage({
      type: 'paperflow:api-chat',
      question,
      context,
      images,
      model,
      baseUrl,
      protocol,
      responseLanguage: responseLanguage === 'zh' ? 'zh' : 'en',
    } satisfies BrowserApiChatRequest);
  });
}
