import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/lib/api';
import {
  detectPlatform,
  getInjectedPushToken,
  type NativePlatform,
} from '@/lib/nativeBridge';

/**
 * Tracks the push token most recently registered with the backend so logout
 * can unregister it. Module-level so it survives across hook re-mounts and is
 * readable from the auth store (outside React).
 */
let registeredPushToken: string | null = null;

export function getRegisteredPushToken(): string | null {
  return registeredPushToken;
}

export function clearRegisteredPushToken(): void {
  registeredPushToken = null;
}

async function registerToken(
  token: string,
  platform: NativePlatform,
): Promise<void> {
  if (!token) return;
  try {
    await api.post<{ registered: boolean }>('/v1/devices', { token, platform });
    registeredPushToken = token;
  } catch {
    // Best-effort: push registration must never break the app.
  }
}

/**
 * Wires up the web half of the native push-notification bridge. Mount once,
 * inside an authenticated shell.
 *
 * - Registers any already-injected Expo push token with the backend.
 * - Listens for `expo-push-token` events and registers new tokens (de-duped).
 * - Listens for `expo-deep-link` events and navigates the SPA accordingly.
 *
 * No-op-safe in a normal browser (no injected token, no events fired).
 */
export function usePushBridge(): void {
  const navigate = useNavigate();
  const lastSentToken = React.useRef<string | null>(null);

  React.useEffect(() => {
    const platform = detectPlatform();

    const send = (token: string | undefined | null) => {
      if (!token) return;
      if (lastSentToken.current === token) return;
      lastSentToken.current = token;
      void registerToken(token, platform);
    };

    // Register a token native may have injected before this mounted.
    send(getInjectedPushToken());

    const onPushToken = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      send(typeof detail === 'string' ? detail : undefined);
    };

    const onDeepLink = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail !== 'string' || detail.length === 0) return;
      window.__handledDeepLink = true;
      navigate(detail);
    };

    window.addEventListener('expo-push-token', onPushToken);
    window.addEventListener('expo-deep-link', onDeepLink);

    return () => {
      window.removeEventListener('expo-push-token', onPushToken);
      window.removeEventListener('expo-deep-link', onDeepLink);
    };
  }, [navigate]);
}
