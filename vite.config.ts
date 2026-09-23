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
  const googleOAuthClientId = env.PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID?.trim() || '';
  const releaseBuild = mode === 'release' || env.PAPERFLOW_RELEASE === 'true';
  const storeBuild = releaseBuild || mode === 'store-draft';
  if (releaseBuild && !googleOAuthClientId) {
    throw new Error('PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID is required for release builds.');
  }
  if (googleOAuthClientId && !GOOGLE_OAUTH_CLIENT_ID_PATTERN.test(googleOAuthClientId)) {
    throw new Error('PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID is not a valid Google OAuth client ID.');
  }

  return {
    plugins: [react(), manifestPlugin(googleOAuthClientId, storeBuild)],
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
