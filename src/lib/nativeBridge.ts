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
