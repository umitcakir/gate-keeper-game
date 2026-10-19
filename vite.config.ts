import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'client');

export default defineConfig({
  root,
  build: {
    outDir: resolve(import.meta.dirname, 'dist', 'public'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: { main: resolve(root, 'index.html'), admin: resolve(root, 'admin.html') },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
});
