import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bridgeRequestSchema,
  getBridgeStatus,
  loginWithChatGPT,
  resetBridgeProbeForTests,
  saveApiKey,
} from '../../src/services/bridge';

afterEach(() => {
  resetBridgeProbeForTests();
  vi.unstubAllGlobals();
});

describe('native host protocol', () => {
  it('accepts only allow-listed actions and exact fields', () => {
    expect(bridgeRequestSchema.safeParse({ action: 'status' }).success).toBe(true);
    expect(bridgeRequestSchema.safeParse({
      action: 'vault.load_device_key',
      vaultId: '18ea83a8-49f8-4e32-970f-02cbf129d4c2',
    }).success).toBe(true);
    expect(bridgeRequestSchema.safeParse({
      action: 'shell.exec',
      command: 'whoami',
    }).success).toBe(false);
    expect(bridgeRequestSchema.safeParse({
      action: 'status',
      command: 'whoami',
    }).success).toBe(false);
  });

  it('rejects invalid vault keys and oversized chat fields', () => {
    expect(bridgeRequestSchema.safeParse({
      action: 'vault.store_device_key',
      vaultId: 'not-a-uuid',
      vaultKey: 'secret',
    }).success).toBe(false);
    expect(bridgeRequestSchema.safeParse({
      action: 'codex.chat',
      question: 'x'.repeat(20_001),
      context: '',
      images: [],
      model: 'gpt-5.6-sol',
      responseLanguage: 'en',
    }).success).toBe(false);
    expect(bridgeRequestSchema.safeParse({
      action: 'codex.chat',
      question: 'Summarize',
      context: '',
      images: [],
      model: 'gpt-5.6-sol',
      responseLanguage: 'en',
    }).success).toBe(true);
  });

  it('probes Rust protocol once and uses only v1 action names', async () => {
    const actions: string[] = [];
    const responses = [
      {
        ok: true,
        protocolVersion: 1,
        codexAvailable: true,
        credentialStoreAvailable: true,
        apiKeyConfigured: false,
      },
      { ok: true, authenticated: true, detail: 'Signed in' },
      { ok: true, authenticated: true, detail: 'Saved' },
    ];
    vi.stubGlobal('chrome', {
      runtime: {
        lastError: undefined,
        sendNativeMessage: (
          _host: string,
          payload: { action: string },
          callback: (response: unknown) => void,
        ) => {
          actions.push(payload.action);
          callback(responses.shift());
        },
      },
    });

    expect((await getBridgeStatus()).authenticated).toBe(true);
    expect((await saveApiKey('paperflow-test-key')).ok).toBe(true);
    expect(actions).toEqual(['status', 'codex.auth_status', 'api_key.set']);
  });

  it('keeps the Python action mapping for one compatibility release', async () => {
    const actions: string[] = [];
    vi.stubGlobal('chrome', {
      runtime: {
        lastError: undefined,
        sendNativeMessage: (
          _host: string,
          payload: { action: string },
          callback: (response: unknown) => void,
        ) => {
          actions.push(payload.action);
          callback({ ok: true, authenticated: payload.action === 'login' });
        },
      },
    });

    expect((await loginWithChatGPT()).authenticated).toBe(true);
    expect(actions).toEqual(['status', 'login']);
  });

  it('re-probes the host when the user checks status after an upgrade', async () => {
    const actions: string[] = [];
    const responses = [
      { ok: true, authenticated: true, detail: 'Legacy host' },
      {
        ok: true,
        protocolVersion: 1,
        codexAvailable: true,
        credentialStoreAvailable: true,
        apiKeyConfigured: false,
      },
      { ok: true, authenticated: true, detail: 'Rust host' },
    ];
    vi.stubGlobal('chrome', {
      runtime: {
        lastError: undefined,
        sendNativeMessage: (
          _host: string,
          payload: { action: string },
          callback: (response: unknown) => void,
        ) => {
          actions.push(payload.action);
          callback(responses.shift());
        },
      },
    });

    expect((await getBridgeStatus()).detail).toBe('Legacy host');
    expect((await getBridgeStatus()).detail).toBe('Rust host');
    expect(actions).toEqual(['status', 'status', 'codex.auth_status']);
  });
});
