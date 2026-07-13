import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The build this bundle came from.
 *
 * Vercel exposes the commit SHA at build time, so a Sentry report can say which
 * deploy it came from — otherwise every issue is stamped with the same "unknown"
 * and you cannot tell a fixed bug from a live one. Falls back to nothing locally.
 */
const RELEASE = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VITE_RELEASE ?? '';

/**
 * Source-map upload. Build-time only: it adds NOTHING to what a dealer downloads.
 *
 * Without it, every stack trace Sentry shows is minified — `a.b.c is not a
 * function` at `index-Jq4LYgWJ.js:1:48210` — which is close to useless for the
 * thing we added Sentry to answer.
 *
 * `filesToDeleteAfterUpload` matters: the maps are uploaded to Sentry and then
 * REMOVED from the output, so they are never served publicly. A .map file on a
 * public URL hands anyone the app's full source.
 *
 * Skipped entirely when SENTRY_AUTH_TOKEN is absent, so local builds, forks and
 * CI without the secret behave exactly as before.
 */
const sourcemapUpload = process.env.SENTRY_AUTH_TOKEN
  ? [
      sentryVitePlugin({
        org: 'mdg-services',
        project: 'mdg-client',
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: { name: RELEASE || undefined },
        sourcemaps: { filesToDeleteAfterUpload: ['dist/assets/*.js.map'] },
        telemetry: false,
      }),
    ]
  : [];

export default defineConfig({
  // The Sentry plugin must come last so it sees the final, emitted bundle.
  plugins: [react(), ...sourcemapUpload],
  define: {
    // Sentry's documented tree-shaking flags. Without them the SDK ships its
    // debug logging and its whole performance-tracing tree, neither of which this
    // app uses — and every kilobyte here is paid for by a dealer on 2G.
    __SENTRY_DEBUG__: false,
    __SENTRY_TRACING__: false,
    __RRWEB_EXCLUDE_SHADOW_DOM__: true,
    __RRWEB_EXCLUDE_IFRAME__: true,
    // Vercel's VERCEL_GIT_COMMIT_SHA is not VITE_-prefixed, so Vite will not expose
    // it on its own. Inline it, so the running app stamps every report with the same
    // release the source maps were uploaded under — otherwise they never match.
    'import.meta.env.VITE_RELEASE': JSON.stringify(RELEASE),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@dk/shared/schemas': path.resolve(__dirname, './shared/src/schemas/index.ts'),
      '@dk/shared/types': path.resolve(__dirname, './shared/src/types/index.ts'),
      '@dk/shared': path.resolve(__dirname, './shared/src/index.ts'),
    },
  },
  build: {
    // Emitted only so the Sentry plugin can upload them; it then deletes them, so
    // no .map is ever served. With no auth token they are not generated at all.
    sourcemap: Boolean(process.env.SENTRY_AUTH_TOKEN),
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
