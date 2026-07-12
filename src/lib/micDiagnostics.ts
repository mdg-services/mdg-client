import { errorMessage, errorName, isErrorLike } from './errors';
import { isNativeShell } from './nativeBridge';

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
 *   NotReadableError  — the mic exists and is allowed, but something else has it:
 *                       a phone call, a voice assistant, another app. Sending this
 *                       user to Settings is useless — the permission is already on.
 *   NotFoundError     — there is no audio input device at all.
 *   SecurityError     — not a secure context.
 *   AbortError        — the OS tore the request down.
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
}

const MIME_CANDIDATES = [
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

/**
 * Collect the state of the world around a mic failure.
 *
 * Best-effort and never throws: this runs at the moment something is already going
 * wrong, and a diagnostic that breaks the error path is worse than no diagnostic.
 */
export async function micDiagnostics(error?: unknown): Promise<MicDiagnostics> {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;

  const diag: MicDiagnostics = {
    // NOT `instanceof Error`: getUserMedia rejects with a DOMException, which is
    // not an Error on the older WebViews we most need to hear from. See lib/errors.
    errorName: error !== undefined ? errorName(error) : undefined,
    errorMessage: error !== undefined ? errorMessage(error) : undefined,
    nativeShell: isNativeShell(),
    secureContext: typeof window !== 'undefined' && window.isSecureContext === true,
    hasMediaDevices: Boolean(md),
    hasGetUserMedia: Boolean(md?.getUserMedia),
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    supportedMimeTypes: supportedMimeTypes(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
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
