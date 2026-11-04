import { apiFetch } from '@/lib/api';
import { embedOrigins } from '@/lib/embedMode';
import { takeSignOutReason, useAuthStore } from '@/store/auth';
import type { EmbedFromApp, EmbedFromExtension, User } from '@dk/shared/types';

import { useEmbedStore } from './embedState';

/**
 * The embedded app's half of the conversation with the extension's side panel
 * (ADR 0032 §6). The panel shows this app in an iframe at `/chat?embed=extension`:
 *
 *   app  → panel   `ready`        the app is up and has no sign-in
 *   panel → app    `auth`         the sign-in token (only believed from the panel's own origin)
 *   app  → panel   `token`        the server rolled the token forward; keep this one
 *   app  → panel   `signed-out`   the server ended the sign-in (`reason: 'refused'`), or the person
 *                                 pressed Log out (`reason: 'logout'`), which signs the extension out too
 *
 * THE TOKEN LIVES IN MEMORY AND NOWHERE ELSE. The store's saved copy is switched
 * off in this mode (`store/auth.ts`): writing it could replace the dealer's own web
 * sign-in in the same browser, and reading it could sign the panel in as somebody
 * the extension never asked for. The panel keeps the token (in its own storage) and
 * hands it over on every `ready`.
 */

/** A sign-in token is a few hundred characters. A message claiming more is not one. */
const MAX_TOKEN_LENGTH = 4096;

/** While no sign-in has come, ask again this often, in case the panel was not listening yet. */
const READY_RETRY_MS = 2000;
const READY_RETRIES = 10;

export interface EmbedBridgeOptions {
  /** The window that framed this one. Default: `window.parent`, when there is one. */
  parent?: Pick<Window, 'postMessage'> | null;
  /** Origins whose `auth` message is believed. Default: the published extension plus `VITE_EXTENSION_ORIGINS`. */
  origins?: string[];
  /** Load the signed-in profile with the token now in the store. Default: `GET /v1/auth/me`. */
  fetchUser?: () => Promise<User>;
  /** How often `ready` is repeated while no sign-in has come. */
  readyRetryMs?: number;
}

/**
 * Links that would leave the app open in a new tab. A page that loads in this
 * frame instead is either refused by that site (it may not be framed) or, worse,
 * replaces the chat inside the panel with no way back.
 */
export function openLeavingLinksInNewTab(): () => void {
  const onClick = (e: MouseEvent) => {
    // Bubble phase on the document: the app's own handlers have had their say first.
    if (e.defaultPrevented || e.button !== 0) return;
    const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;
    if (anchor.target && anchor.target !== '_self') return;
    if (anchor.hasAttribute('download')) return;
    let url: URL;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.origin === window.location.origin) return;
    e.preventDefault();
    window.open(url.href, '_blank', 'noopener');
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}

/** Start the conversation. Returns a function that stops it. Called once, from `main.tsx`. */
export function startEmbedBridge(options: EmbedBridgeOptions = {}): () => void {
  const parent =
    options.parent !== undefined
      ? options.parent
      : window.parent !== window
        ? window.parent
        : null;
  const origins = options.origins ?? embedOrigins();
  const fetchUser = options.fetchUser ?? (() => apiFetch<User>('/v1/auth/me'));

  // The origin the accepted `auth` came from: the only place a token is ever sent back to.
  let parentOrigin: string | null = null;
  // The token last received or sent up, so the store changing to it again says nothing.
  let known: string | null = null;
  // The token to try the profile again with.
  let held: string | null = null;
  let loading = false;
  // Bumped by every new sign-in and by sign-out, so a profile that arrives late is dropped.
  let generation = 0;

  const send = (message: EmbedFromApp, targetOrigin: string) => {
    try {
      parent?.postMessage(message, targetOrigin);
    } catch {
      // A panel that has gone away: nobody to tell.
    }
  };

  const signInWith = async (token: string): Promise<void> => {
    const mine = ++generation;
    known = token;
    held = token;
    loading = true;
    useEmbedStore.setState({ phase: 'waiting' });
    // In memory only: the saved copy is off in this mode. No user yet, so the
    // layout shows the opening screen until the profile is in.
    useAuthStore.setState({ token, user: null });
    try {
      const user = await fetchUser();
      if (mine !== generation) return;
      // Read the token again: the profile call may itself have brought a rolled one.
      const current = useAuthStore.getState().token;
      if (!current) return;
      loading = false;
      useAuthStore.getState().login({ token: current, user });
    } catch {
      if (mine !== generation) return;
      loading = false;
      // A 401 has already ended the sign-in and said so upward (the store's
      // subscription below). Anything else is a call that did not get through.
      if (useAuthStore.getState().token) useEmbedStore.setState({ phase: 'failed' });
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (!origins.includes(event.origin)) return;
    const data = event.data as Partial<EmbedFromExtension> | null;
    if (!data || typeof data !== 'object') return;
    if (data.source !== 'dk-ext' || data.type !== 'auth') return;
    const token = data.token;
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return;
    parentOrigin = event.origin;
    // The panel answers every `ready`, and `ready` is repeated: the same token again is no news.
    const state = useAuthStore.getState();
    if (state.token === token && (state.user || loading)) return;
    void signInWith(token);
  };

  // What the store does next is what the panel is told: a token the server rolled
  // forward, or the end of the sign-in (a 401 anywhere, or Log out).
  const unsubscribe = useAuthStore.subscribe((state, prev) => {
    if (state.token === prev.token) return;
    if (state.token) {
      if (state.token === known) return;
      known = state.token;
      held = state.token;
      if (parentOrigin) send({ source: 'dk-app', type: 'token', token: state.token }, parentOrigin);
    } else if (prev.token) {
      known = null;
      held = null;
      loading = false;
      generation += 1;
      useEmbedStore.setState({ phase: 'signed-out' });
      send({ source: 'dk-app', type: 'signed-out', reason: takeSignOutReason() }, parentOrigin ?? '*');
    }
  });

  window.addEventListener('message', onMessage);
  const stopLinks = openLeavingLinksInNewTab();
  document.documentElement.setAttribute('data-embed', 'extension');
  useEmbedStore.setState({
    phase: 'waiting',
    retry: () => {
      if (held) void signInWith(held);
    },
  });

  // `ready` carries nothing secret, so any parent may hear it; the token never goes anywhere
  // but the origin that sent the `auth`.
  send({ source: 'dk-app', type: 'ready' }, '*');
  let asked = 0;
  const timer = window.setInterval(() => {
    if (useAuthStore.getState().token || (asked += 1) > READY_RETRIES) {
      window.clearInterval(timer);
      return;
    }
    send({ source: 'dk-app', type: 'ready' }, '*');
  }, options.readyRetryMs ?? READY_RETRY_MS);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener('message', onMessage);
    unsubscribe();
    stopLinks();
    document.documentElement.removeAttribute('data-embed');
    useEmbedStore.setState({ retry: null });
  };
}
