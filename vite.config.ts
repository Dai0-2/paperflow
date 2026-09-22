import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: 'index.html',
        reader: 'reader.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('node_modules') && /(react|remark|zustand)/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
});
