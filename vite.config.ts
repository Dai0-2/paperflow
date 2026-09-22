import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

interface ExtensionManifest {
  oauth2?: {
    client_id: string;
    scopes: string[];
  };
  [key: string]: unknown;
}

function manifestPlugin(clientId: string): Plugin {
  return {
    name: 'paperflow-manifest',
    async generateBundle() {
      const source = await readFile(resolve('manifest.base.json'), 'utf8');
      const manifest = JSON.parse(source) as ExtensionManifest;
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
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const googleOAuthClientId = env.PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID?.trim() || '';
  const releaseBuild = mode === 'release' || env.PAPERFLOW_RELEASE === 'true';
  if (releaseBuild && !googleOAuthClientId) {
    throw new Error('PAPERFLOW_GOOGLE_OAUTH_CLIENT_ID is required for release builds.');
  }

  return {
    plugins: [react(), manifestPlugin(googleOAuthClientId)],
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
