/**
 * Bridge helpers for talking to the Expo WebView shell that wraps this web app.
 *
 * Everything here is no-op-safe in a normal browser: when there is no
 * `window.ReactNativeWebView` (i.e. we are not running inside the native shell)
 * the post helpers simply do nothing, and the injected-token reader returns
 * undefined.
 */

export type NativePlatform = 'ios' | 'android' | 'web';

declare global {
  interface Window {
    /** Present only inside the React Native WebView. */
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    /** Injected by native after it obtains an Expo push token. */
    __EXPO_PUSH_TOKEN__?: string;
    /** Set by the SPA once it consumes a deep link so native knows. */
    __handledDeepLink?: boolean;
  }
}

/**
 * Send a structured message to the native shell. No-op in a normal browser.
 */
export function postToNative(msg: object): void {
  try {
    const bridge =
      typeof window !== 'undefined' ? window.ReactNativeWebView : undefined;
    bridge?.postMessage(JSON.stringify(msg));
  } catch {
    // Best-effort: never let bridge messaging break app flow.
  }
}

/**
 * Read the Expo push token native may have injected onto `window`.
 */
export function getInjectedPushToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.__EXPO_PUSH_TOKEN__;
}

/** True when running inside the Expo native shell (vs a plain browser). */
export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && !!window.ReactNativeWebView;
}

// A single in-flight request, so rapid repeated mic taps coalesce into ONE
// native prompt and ONE result (no stacked duplicate toasts, and only one
// 'native-mic-permission' listener alive at a time — the untagged event can't
// then resolve a stale request from a different tap).
let micRequestInFlight: Promise<boolean> | null = null;

/**
 * Ask the native shell to request the OS microphone permission (the Android
 * RECORD_AUDIO runtime grant), which the WebView's getUserMedia cannot trigger
 * on its own. Resolves true only if the shell reports it granted. In a plain
 * browser — or if the shell never answers within `timeoutMs` — resolves false so
 * the caller falls back to guiding the user to Settings.
 *
 * Native replies by dispatching a `native-mic-permission` CustomEvent with
 * detail `{ granted: boolean }` (see mdg-app buildMicPermissionResultInjection).
 * The timeout is short (5s): a real PermissionsAndroid answer arrives in well
 * under a second, so a longer wait only means an old shell without this handler
 * (version-skew during a Play rollout) — we shouldn't leave the user staring at
 * dead air.
 */
export function requestNativeMicPermission(timeoutMs = 5000): Promise<boolean> {
  if (!isNativeShell() || typeof window === 'undefined') {
    return Promise.resolve(false);
  }
  if (micRequestInFlight) return micRequestInFlight;

  micRequestInFlight = new Promise<boolean>((resolve) => {
    let settled = false;
    // Holder so the timer id can be set after `finish` is defined while keeping
    // the binding const (finish clears it once the promise settles).
    const timer: { id?: ReturnType<typeof window.setTimeout> } = {};
    const finish = (granted: boolean) => {
      if (settled) return;
      settled = true;
      if (timer.id !== undefined) window.clearTimeout(timer.id);
      window.removeEventListener(
        'native-mic-permission',
        onResult as EventListener,
      );
      micRequestInFlight = null;
      resolve(granted);
    };
    const onResult = (e: Event) => {
      const detail = (e as CustomEvent<{ granted?: boolean }>).detail;
      finish(!!detail?.granted);
    };
    window.addEventListener('native-mic-permission', onResult as EventListener);
    postToNative({ type: 'permission:requestMic' });
    timer.id = window.setTimeout(() => finish(false), timeoutMs);
  });
  return micRequestInFlight;
}

/**
 * Best-effort platform detection from the user-agent. Defaults to 'web'.
 */
export function detectPlatform(): NativePlatform {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'web';
}
