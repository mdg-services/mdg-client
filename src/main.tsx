import { QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { ToastProvider } from './components/ui';
import { loadEmbedBridge } from './features/embed/loadEmbedBridge';
import { isEmbedded } from './lib/embedMode';
import { initMonitoring } from './lib/monitoring';
import { queryClient } from './lib/queryClient';
import { clearRetiredStorage } from './lib/retiredStorage';
import { installTouchGuards } from './lib/touchGuards';

import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

// Install the WebView touch-affordance guards before first paint so the
// drag/contextmenu/pinch listeners exist before any image renders.
installTouchGuards();

// Arm error reporting before anything can crash. This costs a few hundred bytes and
// downloads nothing: the Sentry SDK is only fetched if something actually breaks
// (see lib/monitoring). With no VITE_SENTRY_DSN it is a no-op and shakes out.
initMonitoring();

// Drop what an older version stored for a feature this one no longer has.
clearRetiredStorage();

// Inside the Dealer Kavach extension's side panel (`?embed=extension`, ADR 0032 §6) the
// panel hands this app its sign-in. Its own chunk, so the web app and the phone shell
// never download it (and a chunk that fails to load shows the load-failed screen).
if (isEmbedded()) {
  void loadEmbedBridge();
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
