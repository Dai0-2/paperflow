import type { ApiProtocol, BridgeResponse } from '../types';
import {
  apiErrorDetail,
  buildApiRequestPayload,
  normalizeApiEndpoint,
  normalizeModelsEndpoint,
  parseApiModelIds,
  readApiResponse,
} from './apiTransport';

const PREVIEW_PROXY_PATH = '/__paperflow-preview-api';
let volatileApiKey = '';

async function proxyRequest(
  endpoint: string,
  payload: Record<string, unknown> | undefined,
  apiKey = volatileApiKey,
  method: 'GET' | 'POST' = 'POST',
): Promise<Response> {
  return fetch(PREVIEW_PROXY_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, apiKey, method, payload }),
  });
}

export function previewApiAvailable(): boolean {
  return import.meta.env.DEV
    && typeof window !== 'undefined'
    && ['http:', 'https:'].includes(window.location.protocol)
    && !(typeof chrome !== 'undefined' && (chrome.runtime?.id || chrome.runtime?.sendNativeMessage));
}

export function getPreviewApiStatus(): BridgeResponse {
  return {
    ok: true,
    authenticated: Boolean(volatileApiKey),
    detail: volatileApiKey
      ? 'API key is held in memory for this preview tab.'
      : 'Enter an API key. Preview keys are cleared when this tab reloads.',
  };
}

export function savePreviewApiKey(apiKey: string): BridgeResponse {
  if (apiKey.length < 8 || apiKey.length > 512 || /\s/.test(apiKey)) {
    return { ok: false, authenticated: false, error: 'Enter a valid API key.' };
  }
  volatileApiKey = apiKey;
  return {
    ok: true,
    authenticated: true,
    detail: 'API key is held in memory for this preview tab and was not persisted.',
  };
}

export function deletePreviewApiKey(): BridgeResponse {
  volatileApiKey = '';
  return { ok: true, authenticated: false, detail: 'Preview API key cleared.' };
}

export async function discoverApiModelsWithKey(
  apiKey: string,
  baseUrl: string,
): Promise<BridgeResponse> {
  try {
    const endpoint = normalizeModelsEndpoint(baseUrl);
    const response = await proxyRequest(endpoint, undefined, apiKey, 'GET');
    const body = await response.text();
    if (!response.ok) return { ok: false, error: apiErrorDetail(response.status, body) };
    const models = parseApiModelIds(JSON.parse(body));
    return models.length
      ? { ok: true, authenticated: true, models, detail: `${models.length} models available.` }
      : { ok: false, error: 'The API returned no models. Use a custom model ID instead.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not load models from this API.',
    };
  }
}

export async function testPreviewApiConnection(
  model: string,
  baseUrl: string,
  protocol: ApiProtocol,
): Promise<BridgeResponse> {
  if (!volatileApiKey) return { ok: false, authenticated: false, error: 'Enter an API key first.' };
  try {
    const endpoint = normalizeApiEndpoint(baseUrl, protocol);
    const response = await proxyRequest(
      endpoint,
      buildApiRequestPayload('Reply with OK.', '', [], model, protocol, 'en', false),
    );
    const body = await response.text();
    if (!response.ok) return { ok: false, authenticated: false, error: apiErrorDetail(response.status, body) };
    return await readApiResponse(new Response(body, {
      status: response.status,
      headers: response.headers,
    }), protocol)
      ? { ok: true, authenticated: true, detail: 'API connection verified in this preview tab.' }
      : { ok: false, authenticated: false, error: 'The API returned no text.' };
  } catch (error) {
    return {
      ok: false,
      authenticated: false,
      error: error instanceof Error ? error.message : 'Could not reach the configured API endpoint.',
    };
  }
}

export async function sendPreviewApi(
  question: string,
  context: string,
  images: string[],
  model: string,
  baseUrl: string,
  protocol: ApiProtocol,
  responseLanguage: string,
  onEvent?: (event: BridgeResponse) => void,
): Promise<BridgeResponse> {
  if (!volatileApiKey) return { ok: false, error: 'Enter an API key in Settings first.' };
  try {
    const endpoint = normalizeApiEndpoint(baseUrl, protocol);
    onEvent?.({ ok: true, event: 'progress', stage: 'accepted' });
    const response = await proxyRequest(
      endpoint,
      buildApiRequestPayload(question, context, images, model, protocol, responseLanguage, true),
    );
    if (!response.ok) {
      return { ok: false, error: apiErrorDetail(response.status, await response.text()) };
    }
    onEvent?.({ ok: true, event: 'progress', stage: 'connected' });
    const answer = await readApiResponse(response, protocol, onEvent);
    return answer
      ? { ok: true, event: 'complete', answer }
      : { ok: false, error: 'The API returned no text.' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not reach the configured API endpoint.',
    };
  }
}

export function resetPreviewApiForTests(): void {
  volatileApiKey = '';
}
