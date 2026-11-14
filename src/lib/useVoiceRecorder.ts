import * as React from 'react';

import { errorMessage, errorName } from './errors';
import { micDiagnostics } from './micDiagnostics';
import { addCrumb, reportIssue } from './monitoring';
import {
  detectPlatform,
  nativeAppState,
  trackNativeAppState,
  type NativePlatform,
} from './nativeBridge';
import { WAVEFORM_BARS, downsamplePeaks } from './waveform';

/**
 * Microphone recording via the MediaRecorder API, wrapped for chat voice notes.
 *
 * Works in Chrome/Android WebView (audio/webm;codecs=opus) and Safari / the
 * iPhone's WebView (audio/mp4, first choice there — see `voiceMimeCandidates`).
 * `supported` is false where MediaRecorder or getUserMedia is missing so
 * callers can hide the mic button gracefully.
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
 * OPENING THE MIC GETS ONE QUIET SECOND CHANCE
 * --------------------------------------------
 * A start can fail for a moment and work a beat later: the app was pressed just
 * as it came back to the screen, or the phone had only just let go of the mic
 * after a call or a previous note. The dealer used to see "the microphone is
 * being used by another app" for that, on the first failure, with no retry. Now
 * a start that fails with NotReadableError or AbortError waits until the app is
 * on screen (up to 3 s), pauses 400 ms, and tries once more — and only if the
 * press is still wanted. A refusal, a missing mic or a hang is never retried:
 * trying again cannot change those.
 *
 * Waveform: alongside recording we tap the SAME MediaStream with a WebAudio
 * AnalyserNode to expose a live amplitude signal (`getLevels()`) and to
 * accumulate a downsampled peak array for the whole clip, returned from
 * `stop()` as `peaks`, plus the loudest moment (`maxPeak`) so a silent take can
 * be caught before it is sent. The AnalyserNode is optional: without WebAudio,
 * recording still works and the UI falls back to a simple indicator.
 */
export type RecorderStatus = 'idle' | 'recording' | 'interrupted' | 'error';

/** How a recording that stopped by itself stopped: the track ended, or the recorder failed. */
export type InterruptReason = 'ended' | 'error';

export interface VoiceRecording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  /** Downsampled 0..1 peaks across the whole clip (empty if WebAudio missing). */
  peaks: number[];
  /**
   * The loudest moment of the take, 0..1 (unboosted), or null when it could not
   * be measured (no WebAudio, or the meter never ran). Null must be read as
   * "assume there was speech" — guessing silence would block a good note.
   */
  maxPeak: number | null;
  /** The track went quiet because the phone took the microphone (a call, Siri). */
  wasMuted: boolean;
  /** 'stop' when someone asked; 'ended' or 'error' when it stopped by itself. */
  endedBy: 'stop' | InterruptReason;
}

/**
 * Why a `start()` did not end in a live microphone.
 *
 *  - `superseded` — nothing went wrong. Something newer (a cancel, a stop,
 *    another press) invalidated this attempt while it was still opening. The
 *    caller must NOT report this to the person using the app.
 *  - `unsupported` — no MediaRecorder or no getUserMedia at all.
 *  - `busy-self` — the previous voice note is still being finished (its
 *    `stop()` has not come back yet). Not a fault: the caller must leave that
 *    note alone (never cancel it) and ask for the press again in a moment.
 *  - `error` — the mic would not open, after the quiet retry where one applies.
 *    `name` is the DOMException name (or `RecorderStartError` when the mic
 *    opened but the phone's recorder would not start), which is the only thing
 *    that makes the advice we give true rather than a guess.
 */
export type StartFailure =
  | { cause: 'superseded' }
  | { cause: 'unsupported' }
  | { cause: 'busy-self' }
  | { cause: 'error'; name: string; message?: string; attempts?: number };

export type StartResult = { ok: true; session: number } | ({ ok: false } & StartFailure);

/** What the caller can tell the recorder about the press, for the report. */
export interface StartOptions {
  /** A voice note was playing when the mic was pressed (it is paused first). */
  voiceNotePlaying?: boolean;
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
];

/**
 * What to try, best first, on this phone.
 *
 * AN IPHONE PUTS AAC IN MP4 FIRST. Recent iOS can record WebM, and would pick it
 * from the common list, but an older iPhone cannot PLAY WebM — and a voice note
 * is only worth sending if the person at the other end can hear it. MP4 with
 * AAC plays on every phone MDG's dealers and team hold, so it leads there.
 * Android's order is unchanged: WebM/Opus is smaller, and every Android plays it.
 */
export function voiceMimeCandidates(platform: NativePlatform): string[] {
  return platform === 'ios'
    ? ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', ...MIME_CANDIDATES]
    : MIME_CANDIDATES;
}

/** Length of the rolling live-level buffer the composer animates. */
const LEVEL_BUFFER = 48;
/** Throttle for the whole-clip peak capture (ms between samples). */
const CAPTURE_INTERVAL_MS = 90;

/** The failures worth one more try: the start failed, not the permission. */
const RETRYABLE = new Set(['NotReadableError', 'AbortError']);
/** Pause before the retry, so the phone has let go of whatever held the mic. */
export const RETRY_DELAY_MS = 400;
/** Longest wait for the app to come back on screen before the retry. */
export const FOREGROUND_WAIT_MS = 3000;
/**
 * Breathing room between letting go of one microphone and asking for the next.
 * Some phones fail a start that arrives while the previous stream is still being
 * shut down, which looked to the dealer like "press right after sending fails".
 */
export const RELEASE_GAP_MS = 300;
/** Longest a new press waits for the previous note to finish flushing. */
export const STOP_FLUSH_WAIT_MS = 1500;
/** After a recorder error, how long to wait for its own `onstop` before finishing for it. */
const ERROR_FINISH_MS = 1000;
/**
 * After asking a recorder to stop, the longest we wait for its own `onstop`
 * before building the clip from what it has delivered. A recorder that never
 * fired `stop` used to leave the microphone on, and every later press waiting
 * on a note that would never finish.
 */
export const STOP_FINISH_MS = 3000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const m of voiceMimeCandidates(detectPlatform())) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  // Some browsers record fine with the default codec even if isTypeSupported
  // reports nothing; signal "default" so we still attempt recording.
  return '';
}

/** On screen, as far as both the page and the phone app can tell. */
function inForeground(): boolean {
  const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
  return visible && nativeAppState().state !== 'background';
}

/**
 * Resolve once the app is back on screen, or after `maxMs`, whichever is first.
 * A start retried while the phone still has the app in the background fails the
 * same way again, so the retry waits for the foreground first.
 */
function waitForForeground(maxMs: number): Promise<void> {
  if (inForeground()) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (inForeground()) done();
    };
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('native-app-state', check);
      window.removeEventListener('focus', check);
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('native-app-state', check);
    window.addEventListener('focus', check);
  });
}

/** Short enough to be a Sentry tag: error messages are fixed texts per engine. */
function shortMessage(message: string): string {
  return message.length > 60 ? `${message.slice(0, 57)}...` : message;
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
  /** Loudest raw sample so far (0..1) and how many samples the meter took. */
  maxPeak: number;
  samples: number;
  wasMuted: boolean;
  /** Set when the take stopped by itself, before `onstop` builds the clip. */
  endedBy: InterruptReason | null;
  /** The backstop that builds the clip if the recorder's own `onstop` never comes. */
  finishTimer: ReturnType<typeof setTimeout> | null;
  /** The clip has been built; makes `onerror` followed by `onstop` count once. */
  finished: boolean;
  /** Set once the take has released its microphone; makes teardown idempotent. */
  released: boolean;
  /** Track listeners to remove on release. */
  unlisten: Array<() => void>;
}

function teardown(take: Take): void {
  if (take.released) return;
  take.released = true;
  if (take.tick) clearInterval(take.tick);
  take.tick = null;
  if (take.raf != null) cancelAnimationFrame(take.raf);
  take.raf = null;
  if (take.finishTimer) clearTimeout(take.finishTimer);
  take.finishTimer = null;
  for (const off of take.unlisten) off();
  take.unlisten = [];
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

/** What one opening of the microphone came to, shared by every press that joined it. */
type OpenOutcome =
  | { ok: true; stream: MediaStream; attempts: number }
  | { ok: false; name: string; message: string; attempts: number };

/**
 * One getUserMedia in flight, however many presses want it.
 *
 * `owner` is the newest session that wants the stream. Press, let go before the
 * mic opens, press again: the second press JOINS this opening instead of asking
 * again. Two requests at once used to overwrite each other in the Android
 * WebView's single permission slot, so the first was never answered and the
 * press hung until the watchdog gave up.
 */
interface Opening {
  owner: number;
  promise: Promise<OpenOutcome>;
}

export function useVoiceRecorder() {
  const [status, setStatus] = React.useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = React.useState(0);
  /** The live track is muted: the phone has taken the mic (a call, Siri). */
  const [muted, setMuted] = React.useState(false);
  const [interruptReason, setInterruptReason] = React.useState<InterruptReason | null>(null);

  /**
   * The take currently on the microphone, if any.
   *
   * Only ever written by the code path that owns the matching session, so a
   * late callback from an abandoned take cannot null out a live one.
   */
  const takeRef = React.useRef<Take | null>(null);
  /**
   * Monotonic id of the newest attempt. Bumped by start and cancel — so "is
   * this still the current attempt?" has exactly ONE answer in the whole app,
   * rather than the two disagreeing counters this used to carry.
   */
  const sessionRef = React.useRef(0);
  const resolveRef = React.useRef<((r: VoiceRecording | null) => void) | null>(null);
  /** The `stop()` still waiting for its clip; a second stop() shares it. */
  const pendingStopRef = React.useRef<Promise<VoiceRecording | null> | null>(null);
  /**
   * A clip the recorder finished BY ITSELF (the track ended, the recorder
   * failed) with nobody waiting for it. Kept until `stop()` collects it, so the
   * dealer can still send what they said instead of losing it.
   */
  const orphanRef = React.useRef<VoiceRecording | null>(null);
  const openingRef = React.useRef<Opening | null>(null);
  /** Numbers the presses waiting on a note still being finished; the newest wins. */
  const waitTicketRef = React.useRef(0);
  /** When the last microphone was let go (ms since epoch). */
  const lastReleaseRef = React.useRef(0);
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
    pendingStopRef.current = null;
    resolve?.(value);
  }, []);

  /** Let go of a take's microphone and remember when, for the release gap. */
  const release = React.useCallback((take: Take) => {
    if (take.released) return;
    teardown(take);
    lastReleaseRef.current = Date.now();
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
      const raw = peak / 128;
      take.samples += 1;
      if (raw > take.maxPeak) take.maxPeak = raw;
      const level = Math.min(1, raw * 1.6);

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

  /**
   * Build the clip from a take that has stopped, and hand it to whoever wants it.
   *
   * Runs from `onstop` (and, as a backstop, from `finishLater` when a recorder
   * that errored or was asked to stop never fires `onstop`). Exactly once per take. The clip is built HERE and never in
   * a track's `ended` handler: the recorder delivers its last chunk just before
   * `onstop`, so a clip built earlier would be missing the end of the note.
   */
  const finishTake = React.useCallback(
    (take: Take) => {
      if (take.finished) return;
      take.finished = true;
      const blob = new Blob(take.chunks, { type: take.mimeType });
      const durationMs = Date.now() - take.startedAt;
      const peaks = downsamplePeaks(take.capture, WAVEFORM_BARS);
      // A meter that never ran, or ran on a suspended context (which reads flat
      // silence), measured nothing. Say "unknown", never "silent".
      const measured = take.samples > 0 && take.ctx?.state === 'running';
      const recording: VoiceRecording = {
        blob,
        durationMs,
        mimeType: take.mimeType,
        peaks,
        maxPeak: measured ? take.maxPeak : null,
        wasMuted: take.wasMuted,
        endedBy: take.endedBy ?? 'stop',
      };
      release(take);
      // A take that is no longer the current one must not touch shared state:
      // its stop belongs to a recording the user already moved on from.
      if (take.session !== sessionRef.current) return;
      if (takeRef.current === take) takeRef.current = null;
      setElapsedMs(0);
      setMuted(false);
      if (resolveRef.current) {
        setStatus('idle');
        settle(recording);
        return;
      }
      // Nobody asked for this stop: the phone ended it. Keep the clip for the
      // composer to offer back, instead of dropping what the dealer said.
      orphanRef.current = recording;
      addCrumb('mic: the recording stopped by itself', {
        endedBy: recording.endedBy,
        durationMs,
      });
      setInterruptReason(recording.endedBy === 'error' ? 'error' : 'ended');
      setStatus('interrupted');
    },
    [release, settle],
  );

  /**
   * Build the clip in `ms` unless the recorder's own `onstop` does it first.
   * One backstop per take: a later call never moves an earlier deadline.
   */
  const finishLater = React.useCallback(
    (take: Take, ms: number) => {
      if (take.finished || take.finishTimer) return;
      take.finishTimer = setTimeout(() => finishTake(take), ms);
    },
    [finishTake],
  );

  /** Report one failed press, once, however many presses joined its opening. */
  const reportFailure = React.useCallback(
    (
      err: unknown,
      outcome: { name: string; message: string; attempts: number },
      retryOutcome: string,
      askedAt: number,
      opts: StartOptions,
      superseded: boolean,
    ) => {
      void micDiagnostics(err, {
        attempt: outcome.attempts,
        retryOutcome,
        voiceNotePlaying: opts.voiceNotePlaying,
      }).then((diag) => {
        reportIssue({
          name: 'mic.blocked',
          // A failed mic is a handled path, not a crash: a fault in the product
          // rather than in the code — but it IS reported, because nothing else
          // would ever tell us.
          level: 'warning',
          tags: {
            'mic.error': outcome.name,
            'mic.message': shortMessage(outcome.message),
            'mic.retries': outcome.attempts - 1,
            'mic.retryOutcome': retryOutcome,
            'mic.permission': diag.permissionState,
            'mic.platform': diag.platform,
            'mic.needsAppUpdate': diag.needsAppUpdate,
            nativeShell: diag.nativeShell,
            secureContext: diag.secureContext,
            audioInputs: diag.audioInputs,
          },
          extra: {
            ...(diag as unknown as Record<string, unknown>),
            waitedMs: Date.now() - askedAt,
            superseded,
          },
          error: err,
        });
      });
    },
    [],
  );

  /**
   * Open the microphone, with the one quiet retry, as a single shared opening.
   * The retry runs only while somebody still wants the stream.
   */
  const beginOpening = React.useCallback(
    (session: number, opts: StartOptions): Opening => {
      const opening: Opening = { owner: session, promise: Promise.resolve(null as never) };
      const stillWanted = () => mountedRef.current && opening.owner === sessionRef.current;
      const ask = () => navigator.mediaDevices.getUserMedia({ audio: true });
      const askedAt = Date.now();

      const run = async (): Promise<OpenOutcome> => {
        addCrumb('mic: requesting getUserMedia');
        let firstErr: unknown;
        try {
          const stream = await ask();
          addCrumb('mic: getUserMedia granted', { waitedMs: Date.now() - askedAt });
          return { ok: true, stream, attempts: 1 };
        } catch (err) {
          firstErr = err;
        }
        // DOMException is not reliably `instanceof Error` — see lib/errors. On the
        // old Android WebViews we most need to hear from, `instanceof` silently
        // discards the name, and the name is the only thing that makes our advice
        // true: "allow it in Settings" is right for a refusal and wrong for a mic
        // that would not start.
        const first = {
          name: errorName(firstErr),
          message: errorMessage(firstErr) ?? '',
          attempts: 1,
        };
        if (!RETRYABLE.has(first.name)) {
          reportFailure(firstErr, first, 'none', askedAt, opts, !stillWanted());
          return { ok: false, ...first };
        }
        if (!stillWanted()) {
          reportFailure(firstErr, first, 'superseded', askedAt, opts, true);
          return { ok: false, ...first };
        }
        await waitForForeground(FOREGROUND_WAIT_MS);
        await sleep(RETRY_DELAY_MS);
        if (!stillWanted()) {
          reportFailure(firstErr, first, 'superseded', askedAt, opts, true);
          return { ok: false, ...first };
        }
        addCrumb('mic: quiet retry', { after: first.name });
        try {
          const stream = await ask();
          // Worth knowing: it tells us how often the retry is what saved a note.
          reportIssue({
            name: 'mic.retry-recovered',
            level: 'info',
            tags: { 'mic.error': first.name, 'mic.platform': detectPlatform() },
            extra: { firstMessage: first.message, waitedMs: Date.now() - askedAt },
          });
          return { ok: true, stream, attempts: 2 };
        } catch (err) {
          const second = { name: errorName(err), message: errorMessage(err) ?? '', attempts: 2 };
          reportFailure(err, second, 'failed-again', askedAt, opts, !stillWanted());
          return { ok: false, ...second };
        }
      };

      opening.promise = run().finally(() => {
        if (openingRef.current === opening) openingRef.current = null;
      });
      openingRef.current = opening;
      return opening;
    },
    [reportFailure],
  );

  /** Wire a recorder to its take: chunks, the clip on stop, and stopping by itself. */
  const wireTake = React.useCallback(
    (take: Take) => {
      const rec = take.recorder;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) take.chunks.push(e.data);
      };
      rec.onstop = () => finishTake(take);
      // A recorder that fails usually stops itself and fires `onstop`; the timer
      // is the backstop for one that does not, so the clip is never left hanging.
      rec.onerror = () => {
        if (take.finished) return;
        take.endedBy = take.endedBy ?? 'error';
        addCrumb('mic: the recorder reported an error');
        try {
          if (rec.state !== 'inactive') rec.stop();
        } catch {
          /* it may already be stopping */
        }
        finishLater(take, ERROR_FINISH_MS);
      };
    },
    [finishTake, finishLater],
  );

  /** Listen to the microphone track itself: ended, muted, unmuted. */
  const listenToTracks = React.useCallback(
    (take: Take) => {
      const tracks = take.stream.getTracks();
      for (const track of tracks) {
        if (typeof track.addEventListener !== 'function') continue;
        // The phone ended the track (a call took over, the mic was unplugged).
        //
        // The clip is never built here. When the phone ends the track the
        // recorder is often ALREADY inactive, but its last chunk — on most
        // phones that is all of the audio — is still queued, with `onstop`
        // behind it. Building now made an empty clip and lost the note. So ask
        // the recorder to stop if it has not, let `onstop` build the clip, and
        // keep a timer only for a recorder that never fires it.
        const onEnded = () => {
          if (take.finished || take.released) return;
          take.endedBy = take.endedBy ?? 'ended';
          try {
            if (take.recorder.state !== 'inactive') take.recorder.stop();
          } catch {
            /* it may already be stopping */
          }
          finishLater(take, STOP_FINISH_MS);
        };
        // A call or Siri usually MUTES the track rather than ending it: the
        // recording goes on, silent. The composer shows it and ends the take.
        const onMute = () => {
          take.wasMuted = true;
          if (take.session === sessionRef.current && !take.released) setMuted(true);
        };
        const onUnmute = () => {
          if (take.session === sessionRef.current && !take.released) setMuted(false);
        };
        track.addEventListener('ended', onEnded);
        track.addEventListener('mute', onMute);
        track.addEventListener('unmute', onUnmute);
        take.unlisten.push(() => {
          track.removeEventListener('ended', onEnded);
          track.removeEventListener('mute', onMute);
          track.removeEventListener('unmute', onUnmute);
        });
      }
    },
    [finishLater],
  );

  const start = React.useCallback(
    async (opts: StartOptions = {}): Promise<StartResult> => {
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

      // NEVER TEAR DOWN A NOTE THAT IS STILL BEING FINISHED. A press straight
      // after a send used to empty the clip that was flushing, so the note just
      // sent was lost. Wait for it (briefly) instead; a cancel meanwhile wins.
      //
      // THE NEWEST WAITING PRESS WINS. Two presses can both be waiting here.
      // Whichever resumed first used to take the mic, which was usually the
      // OLDER one, while the composer's watchdog had already moved on to the
      // newer press, so the press holding the mic had nobody watching it. The
      // ticket makes the older press step aside.
      const pendingStop = pendingStopRef.current;
      if (pendingStop) {
        const before = sessionRef.current;
        const ticket = ++waitTicketRef.current;
        const flushed = await Promise.race([
          pendingStop.then(() => true),
          sleep(STOP_FLUSH_WAIT_MS).then(() => false),
        ]);
        if (ticket !== waitTicketRef.current) return { ok: false, cause: 'superseded' };
        if (!flushed) return { ok: false, cause: 'busy-self' };
        if (before !== sessionRef.current || !mountedRef.current) {
          return { ok: false, cause: 'superseded' };
        }
      }

      // Claim the session BEFORE anything else async, and release whatever was
      // on the microphone first. Without this, pressing twice left two live
      // streams and the phone's recording indicator stayed lit behind a dead UI.
      const session = sessionRef.current + 1;
      sessionRef.current = session;
      orphanRef.current = null;
      setInterruptReason(null);
      setMuted(false);
      const previous = takeRef.current;
      if (previous) {
        takeRef.current = null;
        release(previous);
      }
      settle(null);

      let opening = openingRef.current;
      if (opening) {
        // A getUserMedia is already waiting (often on the permission dialog).
        // Join it rather than asking twice.
        opening.owner = session;
        addCrumb('mic: joined the opening already under way');
      } else {
        const gap = RELEASE_GAP_MS - (Date.now() - lastReleaseRef.current);
        if (gap > 0) {
          await sleep(gap);
          if (session !== sessionRef.current || !mountedRef.current) {
            return { ok: false, cause: 'superseded' };
          }
        }
        opening = beginOpening(session, opts);
      }

      const outcome = await opening.promise;
      if (!outcome.ok) {
        if (session !== sessionRef.current || !mountedRef.current) {
          return { ok: false, cause: 'superseded' };
        }
        setStatus('error');
        return {
          ok: false,
          cause: 'error',
          name: outcome.name,
          message: outcome.message,
          attempts: outcome.attempts,
        };
      }

      const stream = outcome.stream;
      // The permission dialog can outlive the intent: the person cancelled, or
      // pressed again, while it was up. The newest press that joined this
      // opening gets the stream; if nobody newer joined, give it straight back.
      if (session !== sessionRef.current || !mountedRef.current) {
        if (opening.owner === session || !mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          lastReleaseRef.current = Date.now();
        }
        addCrumb('mic: getUserMedia resolved after the attempt was abandoned');
        return { ok: false, cause: 'superseded' };
      }

      // From here to `rec.start()` anything can throw (an engine that refuses
      // the format, a recorder that will not start). A throw used to leave the
      // microphone live with nothing recording, and a misleading "didn't open"
      // 12 seconds later. Try the chosen format, then the phone's own default,
      // and let go of the mic if neither starts.
      const picked = pickMimeType() ?? '';
      let take: Take | null = null;
      let lastErr: unknown = null;
      for (const mime of picked ? [picked, ''] : ['']) {
        let rec: MediaRecorder | null = null;
        try {
          rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
          const candidate: Take = {
            session,
            stream,
            recorder: rec,
            chunks: [],
            mimeType: rec.mimeType || mime || 'audio/webm',
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
            maxPeak: 0,
            samples: 0,
            wasMuted: false,
            endedBy: null,
            finishTimer: null,
            finished: false,
            released: false,
            unlisten: [],
          };
          wireTake(candidate);
          rec.start();
          candidate.startedAt = Date.now();
          take = candidate;
          break;
        } catch (err) {
          lastErr = err;
          if (rec) {
            rec.ondataavailable = null;
            rec.onstop = null;
            rec.onerror = null;
            try {
              if (rec.state !== 'inactive') rec.stop();
            } catch {
              /* ignore */
            }
          }
        }
      }

      if (!take) {
        stream.getTracks().forEach((t) => t.stop());
        lastReleaseRef.current = Date.now();
        const failure = {
          name: 'RecorderStartError',
          message: errorMessage(lastErr) ?? '',
          attempts: outcome.attempts,
        };
        void micDiagnostics(lastErr, { attempt: outcome.attempts }).then((diag) => {
          reportIssue({
            name: 'mic.recorder-failed',
            level: 'error',
            tags: {
              'mic.error': errorName(lastErr),
              'mic.platform': diag.platform,
              nativeShell: diag.nativeShell,
            },
            extra: { ...(diag as unknown as Record<string, unknown>), picked },
            error: lastErr,
          });
        });
        setStatus('error');
        return { ok: false, cause: 'error', ...failure };
      }

      const live = take;
      listenToTracks(live);
      // Muted already on arrival: the phone handed over a mic it is using.
      if (stream.getTracks().some((t) => t.muted)) {
        live.wasMuted = true;
        setMuted(true);
      }
      takeRef.current = live;
      levelsRef.current = live.rolling;
      setupAnalyser(live);
      setStatus('recording');
      setElapsedMs(0);
      live.tick = setInterval(() => {
        setElapsedMs(Date.now() - live.startedAt);
      }, 200);
      return { ok: true, session };
    },
    [supported, release, settle, beginOpening, wireTake, listenToTracks, setupAnalyser],
  );

  /**
   * Stop and resolve with the finished recording (null if nothing recorded).
   *
   * With no live take, hands back a clip the recorder finished by itself, if
   * one is waiting — that is how an interrupted note reaches the review step.
   */
  const stop = React.useCallback((): Promise<VoiceRecording | null> => {
    if (pendingStopRef.current) return pendingStopRef.current;
    const take = takeRef.current;
    if (!take || take.finished) {
      const orphan = orphanRef.current;
      orphanRef.current = null;
      if (orphan) {
        setStatus('idle');
        setInterruptReason(null);
      }
      return Promise.resolve(orphan);
    }
    // A CHECK, not an assignment. This used to write the take's session back
    // into the counter, which could resurrect a take that a cancel had already
    // retired.
    if (take.session !== sessionRef.current) return Promise.resolve(null);
    const pending = new Promise<VoiceRecording | null>((resolve) => {
      resolveRef.current = resolve;
    });
    pendingStopRef.current = pending;
    // As with a track that ended: an inactive recorder may still be delivering
    // its last chunk, so the clip is left to `onstop`, never built here, and
    // the timer only covers a recorder that never fires it.
    try {
      if (take.recorder.state !== 'inactive') take.recorder.stop();
    } catch {
      /* it may already be stopping */
    }
    finishLater(take, STOP_FINISH_MS);
    return pending;
  }, [finishLater]);

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
    orphanRef.current = null;
    const take = takeRef.current;
    takeRef.current = null;
    if (take) {
      take.recorder.onstop = null;
      take.recorder.onerror = null;
      take.finished = true;
      if (take.recorder.state !== 'inactive') {
        try {
          take.recorder.stop();
        } catch {
          /* ignore */
        }
      }
      release(take);
    }
    settle(null);
    setStatus('idle');
    setElapsedMs(0);
    setMuted(false);
    setInterruptReason(null);
  }, [release, settle]);

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
    trackNativeAppState();
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      orphanRef.current = null;
      const take = takeRef.current;
      takeRef.current = null;
      if (take) {
        take.recorder.onstop = null;
        take.recorder.onerror = null;
        take.finished = true;
        teardown(take);
      }
      settle(null);
    };
  }, [settle]);

  return {
    supported,
    status,
    elapsedMs,
    muted,
    interruptReason,
    start,
    stop,
    cancel,
    getLevels,
    currentSession,
  };
}
