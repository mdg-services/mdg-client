import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@dk/shared/schemas': path.resolve(__dirname, './shared/src/schemas/index.ts'),
      '@dk/shared/types': path.resolve(__dirname, './shared/src/types/index.ts'),
      '@dk/shared': path.resolve(__dirname, './shared/src/index.ts'),
    },
  },
  build: {
    // Match the older Chromium in Android 8–9 System WebView so cheap phones
    // parse the bundle without deopting. esbuild only lowers output syntax here;
    // Vite never injects runtime API polyfills, so nothing needed is dropped.
    target: 'es2019',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Stable, long-cached vendor chunks: a code-only deploy re-downloads just
        // the changed app/route chunk, not the whole framework. socket.io lands in
        // its own chunk that only the (lazy) authenticated shell pulls in, so the
        // login screen never fetches it. React + ReactDOM + Router MUST share one
        // chunk to avoid a split-React "dispatcher is null" runtime error.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'data-vendor': ['@tanstack/react-query', 'zustand'],
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'realtime-vendor': ['socket.io-client'],
        },
      },
    },
  },
  server: { port: 5174, host: true },
});
