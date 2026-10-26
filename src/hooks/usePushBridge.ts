import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '@/lib/api';
import { reportIssue } from '@/lib/monitoring';
import {
  detectPlatform,
  getInjectedPushToken,
  isNativeShell,
  requestNativePushStatus,
  requestNativePushToken,
  type NativePlatform,
  type NativePushBlocked,
  type NativePushStatusDetail,
} from '@/lib/nativeBridge';
import { usePushStore } from '@/store/push';

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
 * Let the phone show its notification prompt NOW. The card on the chat list and
 * the row in Settings call this once the dealer has said yes to the app's own
 * explanation. The answer comes back as an `expo-push-token` event (granted) or
 * a `native-push-blocked` one (refused), which the hook below turns into state.
 */
export function requestPushPermission(): void {
  requestNativePushToken();
}

/**
 * Wires up the web half of the native push-notification bridge. Mount once,
 * inside an authenticated shell.
 *
 * - Learns where notification permission stands WITHOUT asking the phone, and
 *   publishes it as `pushState` so the app can explain before the phone asks.
 * - Registers this phone's token whenever permission is already granted.
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
 * WHAT CHANGED FOR THE IPHONE. An iPhone shows the notification prompt exactly
 * once; a dealer who taps "Don't allow" on a prompt that arrived cold, before
 * seeing a single message, has switched notifications off for good. So the
 * first mount asks the shell only for the STATE. A phone that was never asked
 * gets `ask`, and the chat list explains and offers the button; the prompt
 * comes from `requestPushPermission`, not from here. An older shell that does
 * not know the state message simply never answers, and is asked for the token
 * the old way.
 *
 * `navigate` is read through a ref, not listed as a dependency: react-router
 * hands out a new one on every path change, and the effect used to tear down
 * and redo this whole conversation with the shell on every screen the dealer
 * opened.
 *
 * No-op-safe in a normal browser (no shell to ask, no injected token, no
 * events fired).
 */
export function usePushBridge(): void {
  const navigate = useNavigate();
  const navigateRef = React.useRef(navigate);
  React.useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  const lastSentToken = React.useRef<string | null>(null);

  React.useEffect(() => {
    const platform = detectPlatform();
    const setPushState = usePushStore.getState().setPushState;
    let cancelled = false;
    // True while the first "where do we stand?" answer is awaited. The same
    // event that answers it also reaches the listener below; the answer is
    // acted on once, by the code that asked.
    let awaitingFirstStatus = false;

    const send = (token: string | undefined | null) => {
      if (!token) return;
      // A token in hand means the phone said yes, whatever was believed before.
      setPushState('on');
      if (lastSentToken.current === token) return;
      lastSentToken.current = token;
      void registerToken(token, platform);
    };

    const applyStatus = (status: NativePushStatusDetail) => {
      switch (status.status) {
        case 'granted':
          setPushState('on');
          // Allowed, but no token yet (a fresh start, or permission turned on in
          // Settings while the app was away): fetch it. This never prompts.
          if (!lastSentToken.current && !getInjectedPushToken()) requestNativePushToken();
          break;
        case 'undetermined':
          // Never asked. Nothing is posted: the prompt waits for the dealer.
          setPushState('ask');
          break;
        case 'denied':
          setPushState('off');
          break;
        case 'unavailable':
          setPushState('unavailable');
          break;
      }
    };

    const onPushToken = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      send(typeof detail === 'string' ? detail : undefined);
    };

    const onPushStatus = (event: Event) => {
      if (awaitingFirstStatus) return;
      const detail = (event as CustomEvent<NativePushStatusDetail>).detail;
      if (detail && typeof detail.status === 'string') applyStatus(detail);
    };

    /**
     * The shell tried and could not. A refusal is the dealer's own choice, so it
     * becomes state (the chat list tells them where to change it) and is NOT
     * reported — it used to fill the error quota with people saying no. Anything
     * else is worth a report and nothing more: there is no action a dealer
     * standing on a forecourt can take about a missing Firebase config, and a
     * toast about "push registration" would be the app complaining at the one
     * person who cannot fix it.
     */
    const onPushBlocked = (event: Event) => {
      const detail = (event as CustomEvent<NativePushBlocked>).detail ?? {};
      if (detail.reason === 'permission') {
        setPushState('off');
        return;
      }
      if (detail.reason === 'expo-go' || detail.reason === 'no-module') {
        setPushState('unavailable');
      }
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
      navigateRef.current(detail);
    };

    window.addEventListener('expo-push-token', onPushToken);
    window.addEventListener('native-push-status', onPushStatus);
    window.addEventListener('native-push-blocked', onPushBlocked);
    window.addEventListener('expo-deep-link', onDeepLink);

    // Listeners first, THEN the ask — a shell that answers synchronously must
    // not find nobody listening.
    const injected = getInjectedPushToken();
    if (injected) {
      // Register a token native injected before this mounted.
      send(injected);
    } else if (isNativeShell()) {
      awaitingFirstStatus = true;
      void requestNativePushStatus(1500).then((status) => {
        awaitingFirstStatus = false;
        if (cancelled) return;
        if (status) applyStatus(status);
        // No answer: a shell from before the state message. It hands over the
        // token (asking the phone if it must) exactly as it always did.
        else requestNativePushToken();
      });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('expo-push-token', onPushToken);
      window.removeEventListener('native-push-status', onPushStatus);
      window.removeEventListener('native-push-blocked', onPushBlocked);
      window.removeEventListener('expo-deep-link', onDeepLink);
    };
  }, []);
}
