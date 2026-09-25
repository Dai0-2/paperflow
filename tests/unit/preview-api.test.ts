import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  discoverApiModelsWithKey,
  resetPreviewApiForTests,
  savePreviewApiKey,
  sendPreviewApi,
  testPreviewApiConnection,
} from '../../src/services/previewApi';

afterEach(() => {
  resetPreviewApiForTests();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('preview API transport', () => {
  it('discovers model IDs returned by an OpenAI-compatible provider', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: 'deepseek-chat' },
        { id: 'deepseek-reasoner' },
        { id: 'deepseek-chat' },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await discoverApiModelsWithKey(
      'paperflow-test-key',
      'https://api.deepseek.com/v1',
    );

    expect(result).toMatchObject({
      ok: true,
      models: ['deepseek-chat', 'deepseek-reasoner'],
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      endpoint: string;
      method: string;
    };
    expect(body).toMatchObject({
      endpoint: 'https://api.deepseek.com/v1/models',
      method: 'GET',
    });
  });

  it('tests a Responses API endpoint without persisting the key', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: 'OK',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    expect(savePreviewApiKey('paperflow-test-key').ok).toBe(true);
    const result = await testPreviewApiConnection(
      'gpt-5.5',
      'https://api.example.com/v1',
      'responses',
    );

    expect(result).toMatchObject({ ok: true, authenticated: true });
    expect(localStorage.length).toBe(0);
    const proxyCall = fetchMock.mock.calls.find(([path]) => path === '/__paperflow-preview-api');
    expect(proxyCall).toBeDefined();
    const [path, init] = proxyCall as unknown as [string, RequestInit];
    expect(path).toBe('/__paperflow-preview-api');
    const body = JSON.parse(String(init.body)) as {
      endpoint: string;
      apiKey: string;
      payload: { model: string; store: boolean; stream: boolean };
    };
    expect(body).toMatchObject({
      endpoint: 'https://api.example.com/v1/responses',
      apiKey: 'paperflow-test-key',
      payload: { model: 'gpt-5.5', store: false, stream: false },
    });
  });

  it('streams response deltas through the local preview proxy', async () => {
    const stream = [
      'data: {"type":"response.output_text.delta","delta":"Paper"}\n',
      'data: {"type":"response.output_text.delta","delta":"Flow"}\n',
      'data: [DONE]\n',
    ].join('');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })));
    savePreviewApiKey('paperflow-test-key');
    const deltas: string[] = [];

    const result = await sendPreviewApi(
      'Summarize',
      'Paper context',
      [],
      'gpt-5.5',
      'https://api.example.com/v1',
      'responses',
      'en',
      (event) => {
        if (event.delta) deltas.push(event.delta);
      },
    );

    expect(deltas).toEqual(['Paper', 'Flow']);
    expect(result).toMatchObject({ ok: true, answer: 'PaperFlow' });
  });
});
