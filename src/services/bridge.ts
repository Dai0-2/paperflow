import type { BridgeResponse } from '../types';

const HOST_NAME = 'com.paperflow.ai';

function nativeMessage(payload: Record<string, unknown>): Promise<BridgeResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendNativeMessage) return Promise.resolve({ ok: false, error: 'The local bridge is only available inside the Chrome extension.' });
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, payload, (response?: BridgeResponse) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) return resolve({ ok: false, error: runtimeError.message });
      resolve(response || { ok: false, error: 'The PaperFlow Bridge returned no response.' });
    });
  });
}

function nativeStream(payload: Record<string, unknown>, onEvent?: (event: BridgeResponse) => void): Promise<BridgeResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.connectNative) return Promise.resolve({ ok: false, error: 'The local bridge is only available inside the Chrome extension.' });
  return new Promise((resolve) => {
    const port = chrome.runtime.connectNative(HOST_NAME);
    let settled = false;
    let lastEvent: BridgeResponse | undefined;
    port.onMessage.addListener((message: BridgeResponse) => {
      lastEvent = message;
      if (message.event === 'progress' || message.event === 'delta') { onEvent?.(message); return; }
      if (!settled) { settled = true; resolve(message); port.disconnect(); }
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true;
      resolve(lastEvent?.ok === false ? lastEvent : { ok: false, error: chrome.runtime.lastError?.message || 'The PaperFlow Bridge disconnected before completing the response.' });
    });
    port.postMessage(payload);
  });
}

export const getBridgeStatus = () => nativeMessage({ action: 'status' });
export const loginWithChatGPT = () => nativeMessage({ action: 'login' });
export const sendToCodex = (question: string, context: string, images: string[] = [], responseLanguage = 'en', onEvent?: (event: BridgeResponse) => void) => nativeStream({ action: 'chat', question, context, images, responseLanguage }, onEvent);
export const getApiStatus = () => nativeMessage({ action: 'api.status' });
export const saveApiKey = (apiKey: string) => nativeMessage({ action: 'api.save_key', apiKey });
export const deleteApiKey = () => nativeMessage({ action: 'api.delete_key' });
export const sendToOpenAI = (question: string, context: string, images: string[] = [], model = 'gpt-5.6-luna', baseUrl = 'https://api.openai.com/v1', protocol = 'responses', responseLanguage = 'en', onEvent?: (event: BridgeResponse) => void) => nativeStream({ action: 'api.chat', question, context, images, model, baseUrl, protocol, responseLanguage }, onEvent);
