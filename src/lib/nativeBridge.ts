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
 *
 * The timeout MUST outlast a human. `PermissionsAndroid.request()` does not
 * resolve until the user actually answers the OS dialog, so this clock is really
 * measuring how long someone takes to read "Allow Dealer Kavach to record audio?"
 * and tap. It used to be 5s — which a real dealer reliably overran, so we
 * declared the mic denied and told them to go to Settings WHILE they were tapping
 * Allow. The only thing the deadline still guards is an ancient shell with no
 * handler at all (it would never reply); that deserves a slow fallback, not a
 * fast wrong answer. A dismissed or permanently-denied prompt still comes back
 * as `granted: false` immediately, so the legitimate "enable it in Settings"
 * message is unaffected.
 */
export function requestNativeMicPermission(timeoutMs = 60_000): Promise<boolean> {
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

/** What the shell did with a requested media download. */
export interface NativeDownloadResult {
  ok: boolean;
  /** 'gallery' = saved via the media library; 'browser' = handed to Chrome. */
  mode?: 'gallery' | 'browser';
  error?: string;
  /**
   * True when the shell never ACKNOWLEDGED the request — an old binary without
   * the 'media:download' handler (version skew during a Play rollout). The
   * caller should fall back to a plain browser download. A shell that acked
   * but then went silent is a FAILURE (no `timedOut`), not a fallback: the
   * shell may still be downloading, and opening the browser too would fetch
   * the file twice over the same 2G link.
   */
  timedOut?: boolean;
}

export interface NativeDownloadRequest {
  /** Correlation id — echoed back in the started + result events. */
  id: string;
  url: string;
  filename: string;
  contentType?: string;
  kind?: 'image' | 'file' | 'audio';
}

/**
 * How long to wait for the shell's 'native-media-download-started' ack. A new
 * shell injects it immediately after validating the request — before any slow
 * download/permission work — so silence this long means an old binary without
 * the handler.
 */
const DOWNLOAD_ACK_TIMEOUT_MS = 3000;
/**
 * Completion cap once the shell HAS acked: a chat photo over 2G plus a human
 * answering the gallery-permission prompt is slow, but not endless.
 */
const DOWNLOAD_RESULT_TIMEOUT_MS = 120_000;

interface PendingDownload {
  /** Settle with the shell's final result (clears whichever timer is armed). */
  settle: (result: NativeDownloadResult) => void;
  /** The shell acked: swap the short old-shell timer for the completion cap. */
  onStarted: () => void;
}

// Unlike the mic request (one prompt at a time), downloads can overlap, so each
// request is keyed by a correlation id and ONE shared pair of listeners
// dispatches the 'native-media-download(-started)' events to whichever request
// they belong to. Both listeners detach again once no request is pending.
const pendingDownloads = new Map<string, PendingDownload>();
let downloadListenersAttached = false;

const onDownloadResult = (e: Event) => {
  const detail = (
    e as CustomEvent<{
      id?: string;
      ok?: boolean;
      mode?: 'gallery' | 'browser';
      error?: string;
    }>
  ).detail;
  if (!detail?.id) return;
  const pending = pendingDownloads.get(detail.id);
  if (!pending) return; // stale/duplicate result — already timed out or settled
  pendingDownloads.delete(detail.id);
  pending.settle({ ok: !!detail.ok, mode: detail.mode, error: detail.error });
  detachDownloadListenersIfIdle();
};

// The started ack must NOT consume the pending entry — only the completion
// event or a timeout settles a request. It merely re-arms the timers.
const onDownloadStarted = (e: Event) => {
  const detail = (e as CustomEvent<{ id?: string }>).detail;
  if (!detail?.id) return;
  pendingDownloads.get(detail.id)?.onStarted();
};

function attachDownloadListeners(): void {
  if (downloadListenersAttached || typeof window === 'undefined') return;
  downloadListenersAttached = true;
  window.addEventListener('native-media-download', onDownloadResult as EventListener);
  window.addEventListener(
    'native-media-download-started',
    onDownloadStarted as EventListener,
  );
}

function detachDownloadListenersIfIdle(): void {
  if (!downloadListenersAttached || pendingDownloads.size > 0) return;
  downloadListenersAttached = false;
  window.removeEventListener('native-media-download', onDownloadResult as EventListener);
  window.removeEventListener(
    'native-media-download-started',
    onDownloadStarted as EventListener,
  );
}

/**
 * Ask the native shell to download a file (save an image to the gallery, or
 * hand anything else to the system browser). Two-phase protocol: the shell
 * acks with 'native-media-download-started' as soon as it takes the job, then
 * reports the outcome via 'native-media-download'.
 *
 * Resolves `{ ok: false, timedOut: true }` in a plain browser or when the
 * shell never acks within `ackTimeoutMs` (old binary — caller falls back to a
 * browser download). Once acked, a missing result within `resultTimeoutMs`
 * resolves `{ ok: false, error: 'timeout' }` WITHOUT `timedOut`, so the caller
 * reports failure instead of double-downloading via the browser.
 */
export function requestNativeDownload(
  req: NativeDownloadRequest,
  ackTimeoutMs = DOWNLOAD_ACK_TIMEOUT_MS,
  resultTimeoutMs = DOWNLOAD_RESULT_TIMEOUT_MS,
): Promise<NativeDownloadResult> {
  if (!isNativeShell() || typeof window === 'undefined') {
    return Promise.resolve({ ok: false, timedOut: true });
  }
  attachDownloadListeners();
  return new Promise<NativeDownloadResult>((resolve) => {
    let timer = window.setTimeout(() => {
      if (pendingDownloads.delete(req.id)) {
        resolve({ ok: false, timedOut: true });
        detachDownloadListenersIfIdle();
      }
    }, ackTimeoutMs);
    pendingDownloads.set(req.id, {
      settle: (result) => {
        window.clearTimeout(timer);
        resolve(result);
      },
      onStarted: () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (pendingDownloads.delete(req.id)) {
            resolve({ ok: false, error: 'timeout' });
            detachDownloadListenersIfIdle();
          }
        }, resultTimeoutMs);
      },
    });
    postToNative({ type: 'media:download', ...req });
  });
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
