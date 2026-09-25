import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserApiRequestSchema,
  handleBrowserApiRequest,
  runBrowserApiChat,
  saveBrowserApiKey,
} from '../../src/services/browserApi';

function installChromeStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const setAccessLevel = vi.fn(async () => undefined);
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'paperflow-test',
      lastError: undefined,
      sendMessage: (
        message: unknown,
        callback: (response: unknown) => void,
      ) => {
        const parsed = browserApiRequestSchema.parse(message);
        void handleBrowserApiRequest(parsed).then(callback);
      },
    },
    permissions: {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: values[key] })),
        set: vi.fn(async (entries: Record<string, unknown>) => {
          Object.assign(values, entries);
        }),
        remove: vi.fn(async (key: string) => {
          delete values[key];
        }),
        setAccessLevel,
      },
    },
  });
  return { values, setAccessLevel };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser API transport', () => {
  it('requests only the configured origin and stores the key locally', async () => {
    const { values, setAccessLevel } = installChromeStorage();

    const result = await saveBrowserApiKey(
      'paperflow-test-key',
      'https://api.deepseek.com/v1',
    );

    expect(result).toMatchObject({ ok: true, authenticated: true });
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.deepseek.com/*'],
    });
    expect(values['paperflow:api-key']).toBe('paperflow-test-key');
    expect(setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
  });

  it('discovers models without returning the key in the response', async () => {
    installChromeStorage();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleBrowserApiRequest({
      type: 'paperflow:api-models',
      apiKey: 'paperflow-test-key',
      baseUrl: 'https://api.deepseek.com/v1',
    });

    expect(result).toEqual({
      ok: true,
      authenticated: true,
      models: ['deepseek-chat', 'deepseek-reasoner'],
      detail: '2 models available.',
    });
    expect(JSON.stringify(result)).not.toContain('paperflow-test-key');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/v1/models');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer paperflow-test-key');
  });

  it('streams chat-completion deltas from the service worker transport', async () => {
    installChromeStorage({ 'paperflow:api-key': 'paperflow-test-key' });
    const stream = [
      'data: {"choices":[{"delta":{"content":"Paper"}}]}\n',
      'data: {"choices":[{"delta":{"content":"Flow"}}]}\n',
      'data: [DONE]\n',
    ].join('');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })));
    const deltas: string[] = [];

    const result = await runBrowserApiChat({
      type: 'paperflow:api-chat',
      question: 'Summarize',
      context: 'Paper context',
      images: [],
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      protocol: 'chat-completions',
      responseLanguage: 'en',
    }, (event) => {
      if (event.delta) deltas.push(event.delta);
    });

    expect(deltas).toEqual(['Paper', 'Flow']);
    expect(result).toMatchObject({ ok: true, event: 'complete', answer: 'PaperFlow' });
  });

  it('rejects insecure remote endpoints before making a request', async () => {
    installChromeStorage({ 'paperflow:api-key': 'paperflow-test-key' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleBrowserApiRequest({
      type: 'paperflow:api-test',
      model: 'deepseek-chat',
      baseUrl: 'http://api.deepseek.com/v1',
      protocol: 'chat-completions',
    });

    expect(result).toMatchObject({ ok: false, authenticated: false });
    expect(result.error).toContain('HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
