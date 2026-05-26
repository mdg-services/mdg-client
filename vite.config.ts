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
      '@dk/shared/schemas': path.resolve(__dirname, '../shared/src/schemas/index.ts'),
      '@dk/shared/types': path.resolve(__dirname, '../shared/src/types/index.ts'),
      '@dk/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: { port: 5174, host: true },
});
