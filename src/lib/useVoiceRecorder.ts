import * as React from 'react';

import { errorName } from './errors';
import { micDiagnostics } from './micDiagnostics';
import { addCrumb, reportIssue } from './monitoring';
import { WAVEFORM_BARS, downsamplePeaks } from './waveform';

/**
 * Microphone recording via the MediaRecorder API, wrapped for chat voice notes.
 *
 * Works in Chrome/Android WebView (audio/webm;codecs=opus) and modern Safari
 * (audio/mp4). `supported` is false where MediaRecorder or getUserMedia is
 * missing so callers can hide the mic button gracefully.
 *
 * ONE RECORDING IS ONE "TAKE", AND A TAKE OWNS ITS OWN RESOURCES
 * --------------------------------------------------------------
 * This used to keep the stream, the recorder, the chunk buffer, the resolve
 * callback and the WebAudio nodes in one ref each — a single slot shared by
 * every attempt. Opening the mic is slow and permission-gated, so two attempts
 * overlap routinely on a cheap phone, and every overlap corrupted the other:
 * a new `start()` emptied the chunk array of a clip still being flushed, and
 * the old clip's `onstop` then ran `cleanup()` over the NEW stream and
 * recorder, leaving a recording bar that could never be sent. Both produced
 * "Recording too short" for audio that was recorded perfectly.
 *
 * So each attempt allocates a `Take` holding everything it owns, and nothing
 * reaches across takes. A take that has been superseded releases its own
 * microphone and touches nothing else.
 *
 * "SUPERSEDED" IS NOT A FAILURE, AND THAT DISTINCTION IS THE WHOLE BUG REPORT.
 * `start()` used to return a bare boolean, so a take abandoned because the user
 * cancelled was indistinguishable from a microphone that was refused — and the
 * composer, finding no error name to explain the `false`, concluded the dealer
 * had denied permission. It then fired the Android permission dialog and told
 * them to enable the microphone in Settings, on a working microphone, at the
 * moment they chose not to use it. The result type below makes that
 * unrepresentable.
 *
 * Waveform: alongside recording we tap the SAME MediaStream with a WebAudio
 * AnalyserNode to expose a live amplitude signal (`getLevels()`) and to
 * accumulate a downsampled peak array for the whole clip, returned from
 * `stop()` as `peaks`. The AnalyserNode is optional: without WebAudio,
 * recording still works and the UI falls back to a simple indicator.
 */
export type RecorderStatus = 'idle' | 'recording' | 'error';

export interface VoiceRecording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  /** Downsampled 0..1 peaks across the whole clip (empty if WebAudio missing). */
  peaks: number[];
}

/**
 * Why a `start()` did not end in a live microphone.
 *
 *  - `superseded` — nothing went wrong. Something newer (a cancel, a stop,
 *    another press) invalidated this attempt while it was still opening. The
 *    caller must NOT report this to the person using the app.
 *  - `unsupported` — no MediaRecorder or no getUserMedia at all.
 *  - `error` — getUserMedia rejected. `name` is the DOMException name, which is
 *    the only thing that makes the advice we give true rather than a guess.
 */
export type StartFailure =
  | { cause: 'superseded' }
  | { cause: 'unsupported' }
  | { cause: 'error'; name: string };

export type StartResult = ({ ok: true; session: number } | ({ ok: false } & StartFailure));

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
];

/** Length of the rolling live-level buffer the composer animates. */
const LEVEL_BUFFER = 48;
/** Throttle for the whole-clip peak capture (ms between samples). */
const CAPTURE_INTERVAL_MS = 90;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  // Some browsers record fine with the default codec even if isTypeSupported
  // reports nothing; signal "default" so we still attempt recording.
  return '';
}

/** Everything one recording attempt owns, so nothing is shared between two. */
interface Take {
  session: number;
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  mimeType: string;
  startedAt: number;
  tick: ReturnType<typeof setInterval> | null;
  ctx: AudioContext | null;
  source: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  timeData: Uint8Array<ArrayBuffer> | null;
  rolling: number[];
  capture: number[];
  raf: number | null;
  lastCaptureAt: number;
  /** Set once the take has released its microphone; makes teardown idempotent. */
  released: boolean;
}

function teardown(take: Take): void {
  if (take.released) return;
  take.released = true;
  if (take.tick) clearInterval(take.tick);
  take.tick = null;
  if (take.raf != null) cancelAnimationFrame(take.raf);
  take.raf = null;
  try {
    take.source?.disconnect();
  } catch {
    /* ignore */
  }
  try {
    take.analyser?.disconnect();
  } catch {
    /* ignore */
  }
  if (take.ctx && take.ctx.state !== 'closed') {
    void take.ctx.close().catch(() => {});
  }
  take.ctx = null;
  take.source = null;
  take.analyser = null;
  take.timeData = null;
  take.stream.getTracks().forEach((t) => t.stop());
}

export function useVoiceRecorder() {
  const [status, setStatus] = React.useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = React.useState(0);

  /**
   * The take currently on the microphone, if any.
   *
   * Only ever written by the code path that owns the matching session, so a
   * late callback from an abandoned take cannot null out a live one.
   */
  const takeRef = React.useRef<Take | null>(null);
  /**
   * Monotonic id of the newest attempt. Bumped by start, stop and cancel — so
   * "is this still the current attempt?" has exactly ONE answer in the whole
   * app, rather than the two disagreeing counters this used to carry.
   */
  const sessionRef = React.useRef(0);
  const resolveRef = React.useRef<((r: VoiceRecording | null) => void) | null>(null);
  /** Live levels survive between takes so the bar does not flash empty. */
  const levelsRef = React.useRef<number[]>(new Array(LEVEL_BUFFER).fill(0));
  const mountedRef = React.useRef(true);

  const supported = React.useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined',
    [],
  );

  /** Settle a pending stop() with `value`, exactly once. */
  const settle = React.useCallback((value: VoiceRecording | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(value);
  }, []);

  const startSampling = React.useCallback((take: Take) => {
    const loop = () => {
      const analyser = take.analyser;
      const data = take.timeData;
      if (!analyser || !data || take.released) return;
      analyser.getByteTimeDomainData(data);
      // Peak deviation from the 128 midpoint → 0..1 amplitude, gently boosted
      // because speech is quiet relative to full scale.
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = Math.abs(data[i] - 128);
        if (v > peak) peak = v;
      }
      const level = Math.min(1, (peak / 128) * 1.6);

      take.rolling.push(level);
      take.rolling.shift();

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - take.lastCaptureAt >= CAPTURE_INTERVAL_MS) {
        take.capture.push(level);
        take.lastCaptureAt = now;
        // Bound growth on a very long note (10 min cap ≈ 6.7k samples).
        if (take.capture.length > 8000) take.capture.shift();
      }
      take.raf = requestAnimationFrame(loop);
    };
    take.raf = requestAnimationFrame(loop);
  }, []);

  const setupAnalyser = React.useCallback(
    (take: Take) => {
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        // Started from a user gesture, but some engines still hand back a
        // suspended context — resume so samples actually flow.
        void ctx.resume?.().catch(() => {});
        const source = ctx.createMediaStreamSource(take.stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        take.ctx = ctx;
        take.source = source;
        take.analyser = analyser;
        take.timeData = new Uint8Array(analyser.fftSize);
        startSampling(take);
      } catch {
        // No WebAudio — recording continues; waveform falls back gracefully.
        take.ctx = null;
        take.analyser = null;
        take.source = null;
      }
    },
    [startSampling],
  );

  const start = React.useCallback(async (): Promise<StartResult> => {
    if (!supported) {
      setStatus('error');
      void micDiagnostics().then((diag) => {
        reportIssue({
          name: 'mic.unsupported',
          level: 'warning',
          tags: { nativeShell: diag.nativeShell, secureContext: diag.secureContext },
          extra: diag as unknown as Record<string, unknown>,
        });
      });
      return { ok: false, cause: 'unsupported' };
    }

    // Claim the session BEFORE anything async, and release whatever was on the
    // microphone first. Without this, pressing twice left two live streams and
    // the phone's recording indicator stayed lit behind a dead UI.
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    const previous = takeRef.current;
    if (previous) {
      takeRef.current = null;
      teardown(previous);
    }
    settle(null);

    const askedAt = Date.now();
    addCrumb('mic: requesting getUserMedia');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // DOMException is not reliably `instanceof Error` — see lib/errors. On the
      // old Android WebViews we most need to hear from, `instanceof` silently
      // discards the name, and the name is the only thing that makes our advice
      // true: "allow it in Settings" is right for a refusal and wrong for a mic
      // that is simply busy.
      const name = errorName(err);
      if (session === sessionRef.current) setStatus('error');
      void micDiagnostics(err).then((diag) => {
        reportIssue({
          name: 'mic.blocked',
          // A denied mic is a handled path, not a crash: a fault in the product
          // rather than in the code — but it IS reported, because nothing else
          // would ever tell us.
          level: 'warning',
          tags: {
            'mic.error': name,
            'mic.permission': diag.permissionState,
            nativeShell: diag.nativeShell,
            secureContext: diag.secureContext,
            audioInputs: diag.audioInputs,
          },
          extra: {
            ...(diag as unknown as Record<string, unknown>),
            waitedMs: Date.now() - askedAt,
            superseded: session !== sessionRef.current,
          },
          error: err,
        });
      });
      return { ok: false, cause: 'error', name };
    }

    // The permission dialog can outlive the intent: the person cancelled, or
    // pressed again, while it was up. Give the microphone straight back.
    if (session !== sessionRef.current || !mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      addCrumb('mic: getUserMedia resolved after the attempt was abandoned');
      return { ok: false, cause: 'superseded' };
    }

    addCrumb('mic: getUserMedia granted', { waitedMs: Date.now() - askedAt });
    const picked = pickMimeType();
    const rec = picked
      ? new MediaRecorder(stream, { mimeType: picked })
      : new MediaRecorder(stream);

    const take: Take = {
      session,
      stream,
      recorder: rec,
      chunks: [],
      mimeType: rec.mimeType || picked || 'audio/webm',
      startedAt: Date.now(),
      tick: null,
      ctx: null,
      source: null,
      analyser: null,
      timeData: null,
      rolling: new Array(LEVEL_BUFFER).fill(0),
      capture: [],
      raf: null,
      lastCaptureAt: 0,
      released: false,
    };

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) take.chunks.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(take.chunks, { type: take.mimeType });
      const durationMs = Date.now() - take.startedAt;
      const peaks = downsamplePeaks(take.capture, WAVEFORM_BARS);
      teardown(take);
      // A take that is no longer the current one must not touch shared state:
      // its stop belongs to a recording the user already moved on from.
      if (take.session !== sessionRef.current) return;
      takeRef.current = null;
      setStatus('idle');
      setElapsedMs(0);
      settle({ blob, durationMs, mimeType: take.mimeType, peaks });
    };

    takeRef.current = take;
    levelsRef.current = take.rolling;
    setupAnalyser(take);
    rec.start();
    setStatus('recording');
    setElapsedMs(0);
    take.tick = setInterval(() => {
      setElapsedMs(Date.now() - take.startedAt);
    }, 200);
    return { ok: true, session };
  }, [supported, setupAnalyser, settle]);

  /** Stop and resolve with the finished recording (null if nothing recorded). */
  const stop = React.useCallback((): Promise<VoiceRecording | null> => {
    return new Promise((resolve) => {
      const take = takeRef.current;
      if (!take || take.recorder.state === 'inactive') {
        resolve(null);
        return;
      }
      // Nothing newer may claim this microphone while the clip is flushing.
      sessionRef.current = take.session;
      resolveRef.current = resolve;
      take.recorder.stop();
    });
  }, []);

  /**
   * Abort recording and discard the audio, including a start() still waiting on
   * the permission prompt — so it can never hand back a live microphone.
   *
   * Settles any pending stop() with null rather than dropping its resolve on
   * the floor. A dropped resolve left `stopAndSend` awaiting a promise that
   * could never settle: the voice note vanished with no bubble and no message.
   */
  const cancel = React.useCallback(() => {
    sessionRef.current += 1;
    const take = takeRef.current;
    takeRef.current = null;
    if (take) {
      take.recorder.onstop = null;
      if (take.recorder.state !== 'inactive') {
        try {
          take.recorder.stop();
        } catch {
          /* ignore */
        }
      }
      teardown(take);
    }
    settle(null);
    setStatus('idle');
    setElapsedMs(0);
  }, [settle]);

  /**
   * Snapshot of the recent live amplitude peaks (oldest → newest), for the
   * composer's animated waveform. Read imperatively on rAF to avoid a React
   * re-render per frame. The array is fixed-length (`LEVEL_BUFFER`).
   */
  const getLevels = React.useCallback((): number[] => levelsRef.current, []);

  /** The newest attempt's id. Compare against a saved one to test supersession. */
  const currentSession = React.useCallback((): number => sessionRef.current, []);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      const take = takeRef.current;
      takeRef.current = null;
      if (take) {
        take.recorder.onstop = null;
        teardown(take);
      }
      settle(null);
    };
  }, [settle]);

  return {
    supported,
    status,
    elapsedMs,
    start,
    stop,
    cancel,
    getLevels,
    currentSession,
  };
}
