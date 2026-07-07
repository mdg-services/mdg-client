/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

// Reuse the app's Vite config (aliases, React plugin) so tests resolve '@/…' and
// '@dk/shared/…' exactly like the app does. The build-only options (manualChunks,
// target) are ignored by Vitest.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
      clearMocks: true,
      unstubGlobals: true,
      unstubEnvs: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  }),
);
