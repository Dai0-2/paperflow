import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

interface ExtensionManifest {
  key?: string;
  oauth2?: {
    client_id: string;
    scopes: string[];
  };
  [key: string]: unknown;
}

const GOOGLE_OAUTH_CLIENT_ID_PATTERN =
  /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;
const DEFAULT_GOOGLE_OAUTH_CLIENT_ID =
  '326091083454-ru79mir7van6oos1m6e8vhnmf1ohll2v.apps.googleusercontent.com';
const PREVIEW_API_PATH = '/__paperflow-preview-api';
const MAX_PREVIEW_REQUEST_BYTES = 4_000_000;

interface PreviewUpstream {
  status: number;
  contentType: string;
  body: Uint8Array;
}

function curlPreviewRequest(
  endpoint: URL,
  apiKey: string,
  method: 'GET' | 'POST',
  payload?: unknown,
): Promise<PreviewUpstream> {
  return new Promise((resolveRequest, rejectRequest) => {
    const marker = '\n__PAPERFLOW_HTTP_STATUS__';
    const child = spawn('curl', [
      '--silent',
      '--show-error',
      '--no-buffer',
      '--request', method,
      '--header', 'Content-Type: application/json',
      '--header', 'Accept: text/event-stream, application/json',
      '--config', '/dev/fd/3',
      ...(method === 'POST' ? ['--data-binary', '@-'] : []),
      '--write-out', `${marker}%{http_code}`,
      endpoint.toString(),
    ], {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      rejectRequest(new Error('Preview API request timed out.'));
    }, 300_000);
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectRequest(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        rejectRequest(new Error(Buffer.concat(stderr).toString('utf8').trim() || 'System HTTP client failed.'));
        return;
      }
      const output = Buffer.concat(stdout);
      const markerBytes = Buffer.from(marker);
      const markerIndex = output.lastIndexOf(markerBytes);
      if (markerIndex < 0) {
        rejectRequest(new Error('System HTTP client returned an invalid response.'));
        return;
      }
      const status = Number(output.subarray(markerIndex + markerBytes.length).toString('utf8'));
      resolveRequest({
        status,
        contentType: 'application/json',
        body: output.subarray(0, markerIndex),
      });
    });

    const configStream = child.stdio[3];
    if (!configStream || !('write' in configStream)) {
      child.kill();
      clearTimeout(timer);
      rejectRequest(new Error('Could not create the secure API credential pipe.'));
      return;
    }
    const escapedKey = apiKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    configStream.end(`header = "Authorization: Bearer ${escapedKey}"\n`);
    child.stdin.end(method === 'POST' ? JSON.stringify(payload) : undefined);
  });
}

function isLocalCertificateError(error: unknown): boolean {
  const cause = error && typeof error === 'object'
    ? (error as { cause?: { code?: unknown } }).cause
    : undefined;
  return cause?.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'
    || cause?.code === 'SELF_SIGNED_CERT_IN_CHAIN';
}

function previewApiProxyPlugin(): Plugin {
  return {
    name: 'paperflow-preview-api-proxy',
    configureServer(server) {
      server.middlewares.use(PREVIEW_API_PATH, (request, response) => {
        void (async () => {
          if (request.method !== 'POST') {
            response.statusCode = 405;
            response.end('Method not allowed.');
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of request) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += bytes.length;
            if (size > MAX_PREVIEW_REQUEST_BYTES) {
              response.statusCode = 413;
              response.end('Preview API request is too large.');
              return;
            }
            chunks.push(bytes);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            endpoint?: unknown;
            apiKey?: unknown;
            method?: unknown;
            payload?: unknown;
          };
          const upstreamMethod = body.method === 'GET' ? 'GET' : 'POST';
          if (
            typeof body.endpoint !== 'string'
            || typeof body.apiKey !== 'string'
            || body.apiKey.length < 8
            || body.apiKey.length > 512
            || /\s/.test(body.apiKey)
            || (upstreamMethod === 'POST' && (!body.payload || typeof body.payload !== 'object'))
          ) {
            response.statusCode = 400;
            response.end('Invalid preview API request.');
            return;
          }
          const endpoint = new URL(body.endpoint);
          const local = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname);
          if (
            endpoint.username
            || endpoint.password
            || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && local))
            || !/\/(?:models|responses|chat\/completions)$/.test(endpoint.pathname)
          ) {
            response.statusCode = 400;
            response.end('Invalid preview API endpoint.');
            return;
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 300_000);
          try {
            let upstream: Response;
            try {
              upstream = await fetch(endpoint, {
                method: upstreamMethod,
                headers: {
                  Authorization: `Bearer ${body.apiKey}`,
                  'Content-Type': 'application/json',
                  Accept: 'text/event-stream, application/json',
                },
                body: upstreamMethod === 'POST' ? JSON.stringify(body.payload) : undefined,
                signal: controller.signal,
              });
            } catch (error) {
              if (!isLocalCertificateError(error) || process.platform === 'win32') throw error;
              const fallback = await curlPreviewRequest(endpoint, body.apiKey, upstreamMethod, body.payload);
              response.statusCode = fallback.status;
              response.setHeader('Content-Type', fallback.contentType);
              response.setHeader('Cache-Control', 'no-store');
              response.end(fallback.body);
              return;
            }
            response.statusCode = upstream.status;
            response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
            response.setHeader('Cache-Control', 'no-store');
            if (!upstream.body) {
              response.end();
              return;
            }
            const reader = upstream.body.getReader();
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              response.write(Buffer.from(value));
            }
            response.end();
          } catch (error) {
            response.statusCode = error instanceof Error && error.name === 'AbortError' ? 504 : 502;
            response.end(error instanceof Error ? error.message : 'Preview API proxy failed.');
          } finally {
            clearTimeout(timeout);
          }
        })().catch((error: unknown) => {
          response.statusCode = 400;
          response.end(error instanceof Error ? error.message : 'Invalid preview API request.');
        });
      });
    },
  };
}

function manifestPlugin(clientId: string, storeBuild: boolean): Plugin {
  return {
    name: 'paperflow-manifest',
    async generateBundle() {
      const [source, thirdPartyNotices] = await Promise.all([
        readFile(resolve('manifest.base.json'), 'utf8'),
        readFile(resolve('THIRD_PARTY_NOTICES.md'), 'utf8'),
      ]);
      const manifest = JSON.parse(source) as ExtensionManifest;
      if (storeBuild) delete manifest.key;
      if (clientId) {
        manifest.oauth2 = {
          client_id: clientId,
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        };
      }
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD_PARTY_NOTICES.md',
        source: thirdPartyNotices,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const googleOAuthClientId =
    env.PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID?.trim() || DEFAULT_GOOGLE_OAUTH_CLIENT_ID;
  const releaseBuild = mode === 'release' || env.PAPERFLOW_RELEASE === 'true';
  const storeBuild = releaseBuild || mode === 'store-draft';
  if (!GOOGLE_OAUTH_CLIENT_ID_PATTERN.test(googleOAuthClientId)) {
    throw new Error('PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID is not a valid Google OAuth client ID.');
  }

  return {
    plugins: [react(), previewApiProxyPlugin(), manifestPlugin(googleOAuthClientId, storeBuild)],
    define: {
      __PAPERFLOW_GOOGLE_OAUTH_CONFIGURED__: JSON.stringify(Boolean(googleOAuthClientId)),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          sidepanel: 'index.html',
          reader: 'reader.html',
          library: 'library.html',
          recovery: 'recovery.html',
          background: 'src/background.ts',
        },
        output: {
          entryFileNames(chunkInfo) {
            return chunkInfo.name === 'background'
              ? 'background.js'
              : 'assets/[name]-[hash].js';
          },
          manualChunks(id) {
            if (id.includes('pdfjs-dist')) return 'pdfjs';
            if (id.includes('node_modules') && /(react|remark|zustand)/.test(id)) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
