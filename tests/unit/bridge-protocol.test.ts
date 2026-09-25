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
    expect(bridgeRequestSchema.safeParse({ action: 'codex.login' }).success).toBe(true);
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

  it('keeps API-key storage off the native host', async () => {
    const actions: string[] = [];
    const backgroundMessages: string[] = [];
    const responses = [
      {
        ok: true,
        protocolVersion: 1,
        codexAvailable: true,
        credentialStoreAvailable: true,
        apiKeyConfigured: false,
      },
      { ok: true, authenticated: true, detail: 'Signed in' },
    ];
    vi.stubGlobal('chrome', {
      permissions: {
        request: vi.fn(async () => true),
      },
      runtime: {
        id: 'paperflow-test',
        lastError: undefined,
        sendNativeMessage: (
          _host: string,
          payload: { action: string },
          callback: (response: unknown) => void,
        ) => {
          actions.push(payload.action);
          callback(responses.shift());
        },
        sendMessage: (
          payload: { type: string },
          callback: (response: unknown) => void,
        ) => {
          backgroundMessages.push(payload.type);
          callback({ ok: true, authenticated: true, detail: 'Saved in browser' });
        },
      },
    });

    expect((await getBridgeStatus()).authenticated).toBe(true);
    expect((await saveApiKey('paperflow-test-key', 'https://api.example.com/v1')).ok).toBe(true);
    expect(actions).toEqual(['status', 'codex.auth_status']);
    expect(backgroundMessages).toEqual(['paperflow:api-save-key']);
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

  it('starts the allow-listed Codex login action with the Rust host', async () => {
    const actions: string[] = [];
    const responses = [
      {
        ok: true,
        protocolVersion: 1,
        codexAvailable: true,
        credentialStoreAvailable: true,
        apiKeyConfigured: false,
      },
      { ok: true, authenticated: false, detail: 'Not signed in.' },
      { ok: true, authenticated: true, detail: 'Codex CLI sign-in completed.' },
      { ok: true, authenticated: true, detail: 'Signed in.' },
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

    expect((await loginWithChatGPT()).authenticated).toBe(true);
    expect(actions).toEqual([
      'status',
      'codex.auth_status',
      'codex.login',
      'codex.auth_status',
    ]);
  });

  it('stops waiting when auth status succeeds before the login process exits', async () => {
    const actions: string[] = [];
    let authChecks = 0;
    vi.stubGlobal('chrome', {
      runtime: {
        lastError: undefined,
        sendNativeMessage: (
          _host: string,
          payload: { action: string },
          callback: (response: unknown) => void,
        ) => {
          actions.push(payload.action);
          if (payload.action === 'status') {
            callback({
              ok: true,
              protocolVersion: 1,
              codexAvailable: true,
              credentialStoreAvailable: true,
              apiKeyConfigured: false,
            });
            return;
          }
          if (payload.action === 'codex.login') return;
          authChecks += 1;
          callback({
            ok: true,
            authenticated: authChecks > 1,
            detail: authChecks > 1 ? 'Logged in using ChatGPT' : 'Not logged in',
          });
        },
      },
    });

    await expect(loginWithChatGPT()).resolves.toMatchObject({
      ok: true,
      authenticated: true,
      detail: 'Logged in using ChatGPT',
    });
    expect(actions).toEqual([
      'status',
      'codex.auth_status',
      'codex.login',
      'codex.auth_status',
    ]);
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

  it('turns Chrome native-host failures into installation guidance', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        lastError: { message: 'Specified native messaging host not found.' },
        sendNativeMessage: (
          _host: string,
          _payload: { action: string },
          callback: (response: unknown) => void,
        ) => callback(undefined),
      },
    });

    const result = await getBridgeStatus();
    expect(result.error).toContain('Native Host is not installed');
    expect(result.error).toContain('device-test package');
  });
});
