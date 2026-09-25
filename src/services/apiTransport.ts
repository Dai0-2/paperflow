import type { ApiProtocol, BridgeResponse } from '../types';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function validatedUrl(rawUrl: string): URL {
  if (!rawUrl.trim() || rawUrl.length > 2_048) {
    throw new Error('Enter a valid API Base URL.');
  }
  const url = new URL(rawUrl.trim());
  const local = LOCAL_HOSTS.has(url.hostname);
  if (
    url.username
    || url.password
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
  ) {
    throw new Error('Base URL must use HTTPS. HTTP is allowed only for localhost.');
  }
  return url;
}

export function apiOriginPattern(baseUrl: string): string {
  return `${validatedUrl(baseUrl).origin}/*`;
}

export function normalizeApiEndpoint(baseUrl: string, protocol: ApiProtocol): string {
  const url = validatedUrl(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');
  if (protocol === 'responses') {
    url.pathname = path.endsWith('/chat/completions')
      ? `${path.slice(0, -'/chat/completions'.length)}/responses`
      : path.endsWith('/responses') ? path : `${path}/responses`;
  } else {
    url.pathname = path.endsWith('/responses')
      ? `${path.slice(0, -'/responses'.length)}/chat/completions`
      : path.endsWith('/chat/completions') ? path : `${path}/chat/completions`;
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function normalizeModelsEndpoint(baseUrl: string): string {
  const url = validatedUrl(baseUrl);
  const path = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/responses$/, '');
  url.pathname = path.endsWith('/models') ? path : `${path}/models`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function instructions(language: string): string {
  return `You are PaperFlow, a precise research-paper reading assistant. Use only the supplied context, say when it is insufficient, answer in ${language === 'zh' ? 'Chinese' : 'English'}, and use Markdown. Cite factual claims from the supplied paper as [Page N]. Never invent page numbers. For math, use only $...$ for inline formulas and $$...$$ for display formulas; never wrap formulas in plain brackets.`;
}

export function buildApiRequestPayload(
  question: string,
  context: string,
  images: string[],
  model: string,
  protocol: ApiProtocol,
  language: string,
  stream: boolean,
): Record<string, unknown> {
  const prompt = `PAPER CONTEXT\n${context || '[No extracted paper text available]'}\n\nUSER QUESTION\n${question}`;
  if (protocol === 'responses') {
    return {
      model,
      instructions: instructions(language),
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          ...images.map((image) => ({ type: 'input_image', image_url: image })),
        ],
      }],
      store: false,
      stream,
      ...(stream ? {} : { max_output_tokens: 16 }),
    };
  }
  return {
    model,
    messages: [
      { role: 'system', content: instructions(language) },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.map((image) => ({ type: 'image_url', image_url: { url: image } })),
        ],
      },
    ],
    stream,
    ...(stream ? {} : { max_tokens: 16 }),
  };
}

export function apiErrorDetail(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string; message?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
    if (typeof parsed.error?.message === 'string') return parsed.error.message;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // Keep the bounded text fallback.
  }
  const detail = body.trim().slice(0, 500);
  return detail || `The API rejected the request with HTTP ${status}.`;
}

export function extractApiResponseText(payload: unknown, protocol: ApiProtocol): string {
  if (!payload || typeof payload !== 'object') return '';
  const root = payload as Record<string, unknown>;
  if (protocol === 'chat-completions') {
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const message = choices[0] && typeof choices[0] === 'object'
      ? (choices[0] as { message?: { content?: unknown } }).message
      : undefined;
    return typeof message?.content === 'string' ? message.content.trim() : '';
  }
  if (typeof root.output_text === 'string') return root.output_text.trim();
  const output = Array.isArray(root.output) ? root.output : [];
  return output.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    return content.flatMap((part) => (
      part
      && typeof part === 'object'
      && (part as { type?: unknown }).type === 'output_text'
      && typeof (part as { text?: unknown }).text === 'string'
        ? [(part as { text: string }).text]
        : []
    ));
  }).join('\n').trim();
}

export function apiEventDelta(payload: unknown, protocol: ApiProtocol): string {
  if (!payload || typeof payload !== 'object') return '';
  const event = payload as Record<string, unknown>;
  if (protocol === 'responses') {
    return event.type === 'response.output_text.delta' && typeof event.delta === 'string'
      ? event.delta
      : '';
  }
  const choices = Array.isArray(event.choices) ? event.choices : [];
  const delta = choices[0] && typeof choices[0] === 'object'
    ? (choices[0] as { delta?: { content?: unknown } }).delta?.content
    : undefined;
  return typeof delta === 'string' ? delta : '';
}

export function parseApiModelIds(payload: unknown): string[] {
  const entries = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown }).models)
        ? (payload as { models: unknown[] }).models
        : [];
  return [...new Set(entries.flatMap((entry) => {
    if (typeof entry === 'string') return [entry.trim()];
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as { id?: unknown; model?: unknown; name?: unknown };
    const value = [row.id, row.model, row.name].find((candidate) => typeof candidate === 'string');
    return typeof value === 'string' ? [value.trim()] : [];
  }).filter(Boolean))].slice(0, 500);
}

export async function readApiResponse(
  response: Response,
  protocol: ApiProtocol,
  onEvent?: (event: BridgeResponse) => void,
): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (!response.body || !contentType.includes('text/event-stream')) {
    const body = await response.text();
    try {
      return extractApiResponseText(JSON.parse(body), protocol);
    } catch {
      return '';
    }
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop() || '';
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, '');
      if (!data || data === '[DONE]') continue;
      try {
        const delta = apiEventDelta(JSON.parse(data), protocol);
        if (!delta) continue;
        answer += delta;
        onEvent?.({ ok: true, event: 'delta', stage: 'writing', delta });
      } catch {
        // Ignore provider-specific stream metadata.
      }
    }
    if (done) break;
  }
  return answer.trim();
}
