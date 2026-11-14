import { errorMessage, errorName } from './errors';
import { isOldAndroidAppForMic } from './micPolicy';
import { detectPlatform, isNativeShell, nativeAppState } from './nativeBridge';

/**
 * Everything we wish we had known the first time a dealer said "the mic doesn't
 * work".
 *
 * `getUserMedia` fails for reasons that look identical in the UI and are not
 * remotely the same problem:
 *
 *   NotAllowedError   — permission refused. Either the OS denied RECORD_AUDIO, or
 *                       the WebView refused the web-layer request. "Enable it in
 *                       Settings" is the right advice ONLY here.
 *   NotReadableError  — the mic is allowed but the phone could not START it. On
 *                       Android this is almost never "another app": since Android
 *                       10 a second app gets silence rather than a failure. In the
 *                       Dealer Kavach Android app up to 0.1.x it is the missing
 *                       MODIFY_AUDIO_SETTINGS permission, on every press (see
 *                       lib/micPolicy). On an iPhone it can be a real call or Siri.
 *                       Sending this user to Settings is useless either way.
 *   NotFoundError     — there is no audio input device at all.
 *   SecurityError     — not a secure context.
 *   AbortError        — the browser engine gave up on the start: a timeout, a page
 *                       being shut down, or (in WebKit) an unnamed capture failure.
 *                       It does NOT mean the mic is busy, in either engine.
 *   TypeError         — navigator.mediaDevices is missing entirely (ancient WebView,
 *                       or the page is not on https).
 *
 * The recorder used to swallow all of these with a bare `catch {}`, so every one of
 * them produced the same "allow microphone access in Settings" message. If the real
 * cause was any of the others, that advice could never work — which is one way a
 * dealer keeps reporting a mic that "still" does not work after two rounds of fixes.
 *
 * This snapshot is attached to every mic report so the next one is answerable
 * instead of a guess.
 */

export interface MicDiagnostics {
  /** The DOMException name — the single most valuable field here. */
  errorName?: string;
  errorMessage?: string;
  /** Inside the Expo Android WebView, or a plain browser? */
  nativeShell: boolean;
  /** getUserMedia is unavailable outside a secure context, and fails silently-ish. */
  secureContext: boolean;
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  /** Which container the device can actually record — empty means none of ours. */
  supportedMimeTypes: string[];
  /** From the Permissions API where it exists: granted | denied | prompt. */
  permissionState?: string;
  /** 0 here with a NotFoundError means the device genuinely has no microphone. */
  audioInputs?: number;
  /** Carries the Android + WebView/Chrome version, which is the other half of the story. */
  userAgent: string;
  /** 'ios' | 'android' | 'web', as the shell says (an iPad's user agent says Mac). */
  platform: string;
  /** The browser engine's major version from the user agent: Chrome 120 → "chrome-120". */
  engineVersion?: string;
  /** 'visible' or 'hidden' at the moment of the report. */
  visibilityState?: string;
  /** The last thing the phone app said about being on screen: active | background. */
  nativeAppState?: string;
  /** How long ago the phone app last said it was back on screen, in ms. */
  msSinceActive?: number;
  /** What this phone app build says it can do (`__DK_NATIVE_FEATURES__`). */
  shellFeatures?: string[];
  /**
   * An Android phone app built without MODIFY_AUDIO_SETTINGS (no `mic-ready`): its
   * mic can never start. Counting these says how many dealers still need the update.
   */
  needsAppUpdate: boolean;
}

/** Context only the caller knows, folded into the snapshot. */
export interface MicContext {
  /** 1 for the first try, 2 when the quiet retry ran too. */
  attempt?: number;
  /** none | failed-again | superseded | skipped | recovered */
  retryOutcome?: string;
  /** A voice note was playing when the mic was pressed. */
  voiceNotePlaying?: boolean;
  /** The track arrived already muted (the phone had taken the mic). */
  mutedOnArrival?: boolean;
}

const MIME_CANDIDATES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
];

function supportedMimeTypes(): string[] {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return [];
  return MIME_CANDIDATES.filter((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

/** "chrome-120" from a Chrome or Android WebView user agent, "safari-26" from WebKit. */
export function engineVersion(ua: string): string | undefined {
  const chrome = /Chrome\/(\d+)/.exec(ua);
  if (chrome) return `chrome-${chrome[1]}`;
  const safari = /Version\/(\d+)[.\d]* .*Safari/.exec(ua);
  if (safari) return `safari-${safari[1]}`;
  const ios = /OS (\d+)_\d+.* like Mac OS X/.exec(ua);
  if (ios) return `ios-${ios[1]}`;
  return undefined;
}

/**
 * Collect the state of the world around a mic failure.
 *
 * Best-effort and never throws: this runs at the moment something is already going
 * wrong, and a diagnostic that breaks the error path is worse than no diagnostic.
 */
export async function micDiagnostics(
  error?: unknown,
  context: MicContext = {},
): Promise<MicDiagnostics & MicContext> {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const shell = isNativeShell();
  const app = nativeAppState();
  const features =
    typeof window !== 'undefined' && Array.isArray(window.__DK_NATIVE_FEATURES__)
      ? [...window.__DK_NATIVE_FEATURES__]
      : undefined;
  const platform = detectPlatform();

  const diag: MicDiagnostics & MicContext = {
    ...context,
    // NOT `instanceof Error`: getUserMedia rejects with a DOMException, which is
    // not an Error on the older WebViews we most need to hear from. See lib/errors.
    errorName: error !== undefined ? errorName(error) : undefined,
    errorMessage: error !== undefined ? errorMessage(error) : undefined,
    nativeShell: shell,
    secureContext: typeof window !== 'undefined' && window.isSecureContext === true,
    hasMediaDevices: Boolean(md),
    hasGetUserMedia: Boolean(md?.getUserMedia),
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    supportedMimeTypes: supportedMimeTypes(),
    userAgent: ua,
    platform,
    engineVersion: engineVersion(ua),
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : undefined,
    nativeAppState: app.state ?? undefined,
    msSinceActive: app.state === 'active' && app.at > 0 ? Date.now() - app.at : undefined,
    shellFeatures: features,
    needsAppUpdate: isOldAndroidAppForMic(),
  };

  // The Permissions API is the only way to tell "denied once" apart from "never
  // asked". Not every WebView implements the microphone name, hence the guard.
  try {
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (perms?.query) {
      const status = await perms.query({ name: 'microphone' as PermissionName });
      diag.permissionState = status.state;
    }
  } catch {
    /* the WebView doesn't know this permission name — no answer is an answer */
  }

  // Distinguishes "no microphone on this device" from "the microphone is refused".
  try {
    if (md?.enumerateDevices) {
      const devices = await md.enumerateDevices();
      diag.audioInputs = devices.filter((d) => d.kind === 'audioinput').length;
    }
  } catch {
    /* ignore */
  }

  return diag;
}
