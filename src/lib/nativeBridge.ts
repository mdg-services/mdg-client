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
    /**
     * Which phone the shell is running on, defined by the shell before any page
     * script runs. The user-agent cannot say: an iPad reports itself as a Mac.
     */
    __DK_NATIVE_PLATFORM__?: 'ios' | 'android';
  }
  interface WindowEventMap {
    /** The shell's answer to `push:status`, or its own news that the state changed. */
    'native-push-status': CustomEvent<NativePushStatusDetail>;
    /** The phone put the app in the background or brought it back. */
    'native-app-state': CustomEvent<NativeAppState>;
  }
}

/** Where the phone's notification permission stands. */
export type NativePushStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** What the shell reports about notification permission (`native-push-status`). */
export interface NativePushStatusDetail {
  /**
   * `unavailable` is Expo Go, or a binary with no notifications module: there
   * is nothing to turn on, so nothing should be offered.
   */
  status: NativePushStatus;
  /** False once the phone will never show the prompt again (iOS after one refusal). */
  canAskAgain: boolean;
}

/** What the phone is doing with the app (`native-app-state`). */
export type NativeAppState = 'active' | 'background';

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

/**
 * Ask the shell for this phone's push token.
 *
 * WHY THIS EXISTS AT ALL, WHEN LOGIN ALREADY ASKS
 * -----------------------------------------------
 * It used to be asked for in exactly one place: the moment the login form
 * succeeded. That was survivable while a session lasted twelve hours and every
 * dealer met the login screen each morning. A session now lasts a year, so a
 * dealer who signed in once may never see that screen again — and the token
 * lives on `window`, which a WebView throws away on every cold start. The
 * result was a production database with ZERO registered devices: not one
 * notification was ever deliverable to anyone.
 *
 * So the ask moved to "whenever an authenticated screen is on the phone",
 * which also covers the cases login never could: a dealer who declined the OS
 * prompt the first time and is now willing, a token Expo has rotated, and a
 * row the server dropped after Expo reported the device gone.
 *
 * FIRE AND FORGET. The answer does not come back to this call — it arrives as
 * an `expo-push-token` event, exactly as it does after login, so both routes
 * end at the same handler. A shell too old to know this message ignores it,
 * and login still works there.
 */
export function requestNativePushToken(): void {
  if (!isNativeShell()) return;
  postToNative({ type: 'push:register' });
}

/**
 * Ask the shell where notification permission stands, WITHOUT ever showing the
 * phone's prompt. That is what lets the app explain itself first and ask in its
 * own words, instead of the phone asking cold on the first screen.
 *
 * Resolves `null` when nothing answers within `timeoutMs`: a plain browser, or
 * a shell from before this message existed (it ignores what it does not know).
 * The caller reads `null` as "an old shell" and carries on the old way.
 */
export function requestNativePushStatus(
  timeoutMs = 1500,
): Promise<NativePushStatusDetail | null> {
  if (!isNativeShell() || typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer: { id?: ReturnType<typeof window.setTimeout> } = {};
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent<NativePushStatusDetail>).detail;
      if (!detail || typeof detail.status !== 'string') return;
      finish(detail);
    };
    const finish = (result: NativePushStatusDetail | null) => {
      if (timer.id !== undefined) window.clearTimeout(timer.id);
      window.removeEventListener('native-push-status', onStatus);
      resolve(result);
    };
    // Listening first, THEN asking: a shell that answers in the same tick must
    // not find nobody there.
    window.addEventListener('native-push-status', onStatus);
    postToNative({ type: 'push:status' });
    timer.id = window.setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Tell the shell which conversation is on screen. It clears that chat's
 * notifications from the phone's tray and keeps new ones for it from popping up
 * over the chat the dealer is already reading. Ignored by an older shell.
 */
export function postChatOpen(conversationId: string): void {
  if (!isNativeShell() || !conversationId) return;
  postToNative({ type: 'chat:open', conversationId });
}

/** The conversation left the screen: notifications for it may show again. */
export function postChatClose(): void {
  if (!isNativeShell()) return;
  postToNative({ type: 'chat:close' });
}

/** How hard the tap feels. `selection` is the light tick of a picker. */
export type HapticStyle = 'light' | 'medium' | 'selection';

/**
 * A small tick under the finger, for a long-press that took or a swipe that
 * fired. Android's WebView has `navigator.vibrate`; an iPhone's does not, so
 * inside the shell the tick is asked of the phone's own haptic engine instead.
 * A plain desktop browser gets neither, and nothing happens.
 */
export function haptic(style: HapticStyle = 'light'): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(10);
    return;
  }
  if (isNativeShell()) postToNative({ type: 'haptic', style });
}

/** Why the shell could not hand over a push token. */
export interface NativePushBlocked {
  /**
   * A short machine-readable cause: `expo-go`, `no-module`, `permission`, or
   * `token-failed`. Never a sentence — it is a tag, and Sentry groups on it.
   */
  reason?: string;
  /** The underlying error text, when there was one. */
  detail?: string;
  /**
   * With reason `permission`: whether the phone would still show its prompt.
   * False means only the phone's Settings can turn notifications on.
   */
  canAskAgain?: boolean;
}

/** What the shell's OS permission prompt came back with. */
export interface MicPermissionResult {
  granted: boolean;
  /**
   * Android has stopped asking ("Don't allow" twice, or "Never ask again").
   * Re-prompting from here can never show a dialog again — only the OS
   * settings page can turn it back on.
   */
  permanentlyDenied: boolean;
}

// A single in-flight request, so rapid repeated mic taps coalesce into ONE
// native prompt and ONE result (no stacked duplicate toasts, and only one
// 'native-mic-permission' listener alive at a time — the untagged event can't
// then resolve a stale request from a different tap).
let micRequestInFlight: Promise<MicPermissionResult> | null = null;

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
export function requestNativeMicPermission(
  timeoutMs = 60_000,
): Promise<MicPermissionResult> {
  if (!isNativeShell() || typeof window === 'undefined') {
    return Promise.resolve({ granted: false, permanentlyDenied: false });
  }
  if (micRequestInFlight) return micRequestInFlight;

  micRequestInFlight = new Promise<MicPermissionResult>((resolve) => {
    let settled = false;
    // Holder so the timer id can be set after `finish` is defined while keeping
    // the binding const (finish clears it once the promise settles).
    const timer: { id?: ReturnType<typeof window.setTimeout> } = {};
    const finish = (result: MicPermissionResult) => {
      if (settled) return;
      settled = true;
      if (timer.id !== undefined) window.clearTimeout(timer.id);
      window.removeEventListener(
        'native-mic-permission',
        onResult as EventListener,
      );
      micRequestInFlight = null;
      resolve(result);
    };
    const onResult = (e: Event) => {
      const detail = (
        e as CustomEvent<{ granted?: boolean; permanentlyDenied?: boolean }>
      ).detail;
      finish({
        granted: !!detail?.granted,
        // Only a shell new enough to report this can set it, so an older
        // binary during a Play rollout simply never offers the Settings
        // button rather than offering one that does nothing.
        permanentlyDenied: detail?.permanentlyDenied === true,
      });
    };
    window.addEventListener('native-mic-permission', onResult as EventListener);
    postToNative({ type: 'permission:requestMic' });
    timer.id = window.setTimeout(
      () => finish({ granted: false, permanentlyDenied: false }),
      timeoutMs,
    );
  });
  return micRequestInFlight;
}

/**
 * Open this app's OS settings page.
 *
 * Only worth offering when Android has stopped asking (`permanentlyDenied`):
 * that is the one state where "turn it on in Settings" is both the correct
 * advice and impossible to act on from inside the app. Silently ignored by a
 * shell too old to know the message.
 */
export function openNativeAppSettings(): void {
  if (!isNativeShell()) return;
  postToNative({ type: 'permission:openSettings' });
}

/**
 * How the shell delivered a download: 'gallery' = saved via the media library
 * (Photos on an iPhone); 'browser' = handed to Chrome or Safari; 'share' = shown
 * in the iPhone's share sheet, where the dealer picks Files, WhatsApp, Mail.
 */
export type NativeDownloadMode = 'gallery' | 'browser' | 'share';

/** What the shell did with a requested media download. */
export interface NativeDownloadResult {
  ok: boolean;
  mode?: NativeDownloadMode;
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
      mode?: NativeDownloadMode;
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
 * Which phone this is. Defaults to 'web'.
 *
 * The shell says so itself (`__DK_NATIVE_PLATFORM__`), because the user-agent
 * cannot be trusted for it: an iPad asks for desktop sites and reports a Mac.
 * Without that word, anything inside the shell that is not Android is an
 * iPhone or iPad; outside it, the user-agent is all there is.
 */
export function detectPlatform(): NativePlatform {
  if (typeof window !== 'undefined') {
    const said = window.__DK_NATIVE_PLATFORM__;
    if (said === 'ios' || said === 'android') return said;
  }
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (isNativeShell()) return 'ios';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'web';
}
