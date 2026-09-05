import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/lib/api';
import { reportIssue } from '@/lib/monitoring';
import {
  detectPlatform,
  getInjectedPushToken,
  isNativeShell,
  requestNativePushToken,
  type NativePlatform,
  type NativePushBlocked,
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
  } catch (error) {
    // Best-effort: push registration must never break the app. It is REPORTED
    // rather than swallowed, though — a silent catch here is half of why the
    // devices table sat empty for months with nothing to look at.
    reportIssue({
      name: 'push.register-failed',
      level: 'warning',
      tags: { platform },
      error: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Wires up the web half of the native push-notification bridge. Mount once,
 * inside an authenticated shell.
 *
 * - Asks the shell for this phone's token on every mount, and registers it.
 * - Listens for `expo-push-token` events and registers new tokens (de-duped).
 * - Listens for `expo-deep-link` events and navigates the SPA accordingly.
 * - Reports the reason when the shell cannot produce a token at all.
 *
 * ASKING ON EVERY MOUNT IS THE FIX, NOT AN OPTIMISATION. The token used to be
 * requested only by the login form. A session lasts a year now, so a dealer who
 * signed in once never returns to that form — and the token lives on `window`,
 * which the WebView discards on every cold start. Production held zero device
 * rows across seventeen accounts: no notification has ever been deliverable.
 * This hook mounts inside the authenticated shell, which is exactly the
 * condition "there is a session and a screen", so it is the right place to ask.
 *
 * No-op-safe in a normal browser (no shell to ask, no injected token, no
 * events fired).
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

    /**
     * The shell tried and could not. Worth a report and nothing else: there is
     * no action a dealer standing on a forecourt can take about a missing
     * Firebase config, and a toast about "push registration" would be the app
     * complaining at the one person who cannot fix it.
     */
    const onPushBlocked = (event: Event) => {
      const detail = (event as CustomEvent<NativePushBlocked>).detail ?? {};
      reportIssue({
        name: 'push.token-unavailable',
        level: 'warning',
        tags: { platform, reason: detail.reason ?? 'unknown' },
        extra: { detail: detail.detail },
      });
    };

    const onDeepLink = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail !== 'string' || detail.length === 0) return;
      window.__handledDeepLink = true;
      navigate(detail);
    };

    window.addEventListener('expo-push-token', onPushToken);
    window.addEventListener('native-push-blocked', onPushBlocked);
    window.addEventListener('expo-deep-link', onDeepLink);

    // Listeners first, THEN the ask — a shell that answers synchronously must
    // not find nobody listening.
    if (isNativeShell() && !getInjectedPushToken()) requestNativePushToken();

    return () => {
      window.removeEventListener('expo-push-token', onPushToken);
      window.removeEventListener('native-push-blocked', onPushBlocked);
      window.removeEventListener('expo-deep-link', onDeepLink);
    };
  }, [navigate]);
}
