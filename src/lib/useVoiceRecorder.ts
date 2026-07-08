import * as React from 'react';

import { WAVEFORM_BARS, downsamplePeaks } from './waveform';

/**
 * Microphone recording via the MediaRecorder API, wrapped for chat voice notes.
 *
 * Works in Chrome/Android WebView (audio/webm;codecs=opus) and modern Safari
 * (audio/mp4). `supported` is false where MediaRecorder or getUserMedia is
 * missing so callers can hide the mic button gracefully.
 *
 * Note: inside the Expo Android WebView, getUserMedia only resolves if the
 * native shell grants the capture permission (see mdg-app WebView config).
 *
 * Waveform: alongside recording we tap the SAME MediaStream with a WebAudio
 * AnalyserNode to expose a live amplitude signal (`getLevels()` — a rolling
 * buffer of recent 0..1 peaks, read on an animation frame by the composer) and
 * to accumulate a downsampled peak array for the whole clip, returned from
 * `stop()` as `peaks` so the sent note can render a real static waveform. The
 * AnalyserNode is optional: if WebAudio is unavailable, recording still works
 * and the UI falls back to a simple recording indicator + a pseudo-waveform.
 */
export type RecorderStatus = 'idle' | 'recording' | 'error';

export interface VoiceRecording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  /** Downsampled 0..1 peaks across the whole clip (empty if WebAudio missing). */
  peaks: number[];
}

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

export function useVoiceRecorder() {
  const [status, setStatus] = React.useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = React.useState(0);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const startedAtRef = React.useRef(0);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = React.useRef<((r: VoiceRecording | null) => void) | null>(null);

  // WebAudio analysis (optional — recording works without it).
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const sourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const timeDataRef = React.useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rollingRef = React.useRef<number[]>(new Array(LEVEL_BUFFER).fill(0));
  const captureRef = React.useRef<number[]>([]);
  const rafRef = React.useRef<number | null>(null);
  const lastCaptureAtRef = React.useRef(0);

  const supported = React.useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined',
    [],
  );

  const cleanup = React.useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      analyserRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    timeDataRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const startSampling = React.useCallback(() => {
    const analyser = analyserRef.current;
    const data = timeDataRef.current;
    if (!analyser || !data) return;
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      // Peak deviation from the 128 midpoint → 0..1 amplitude, gently boosted
      // because speech is quiet relative to full scale.
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = Math.abs(data[i] - 128);
        if (v > peak) peak = v;
      }
      const level = Math.min(1, (peak / 128) * 1.6);

      const roll = rollingRef.current;
      roll.push(level);
      roll.shift();

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastCaptureAtRef.current >= CAPTURE_INTERVAL_MS) {
        captureRef.current.push(level);
        lastCaptureAtRef.current = now;
        // Bound growth on a very long note (10 min cap ≈ 6.7k samples).
        if (captureRef.current.length > 8000) captureRef.current.shift();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const setupAnalyser = React.useCallback(
    (stream: MediaStream) => {
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        // Started from a user gesture (pointerdown/click), but some engines still
        // hand back a suspended context — resume so samples actually flow.
        void ctx.resume?.().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        sourceRef.current = source;
        analyserRef.current = analyser;
        timeDataRef.current = new Uint8Array(analyser.fftSize);
        rollingRef.current = new Array(LEVEL_BUFFER).fill(0);
        captureRef.current = [];
        lastCaptureAtRef.current = 0;
        startSampling();
      } catch {
        // No WebAudio — recording continues; waveform falls back gracefully.
        audioCtxRef.current = null;
        analyserRef.current = null;
        sourceRef.current = null;
      }
    },
    [startSampling],
  );

  const start = React.useCallback(async (): Promise<boolean> => {
    if (!supported) {
      setStatus('error');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const picked = pickMimeType();
      const rec = picked ? new MediaRecorder(stream, { mimeType: picked }) : new MediaRecorder(stream);
      const effectiveType = rec.mimeType || picked || 'audio/webm';
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: effectiveType });
        const durationMs = Date.now() - startedAtRef.current;
        const peaks = downsamplePeaks(captureRef.current, WAVEFORM_BARS);
        cleanup();
        setStatus('idle');
        setElapsedMs(0);
        resolveRef.current?.({ blob, durationMs, mimeType: effectiveType, peaks });
        resolveRef.current = null;
      };
      streamRef.current = stream;
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setupAnalyser(stream);
      rec.start();
      setStatus('recording');
      setElapsedMs(0);
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
      return true;
    } catch {
      cleanup();
      setStatus('error');
      return false;
    }
  }, [supported, cleanup, setupAnalyser]);

  /** Stop and resolve with the finished recording (null if nothing recorded). */
  const stop = React.useCallback((): Promise<VoiceRecording | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === 'inactive') {
        resolve(null);
        return;
      }
      resolveRef.current = resolve;
      rec.stop();
    });
  }, []);

  /** Abort recording and discard audio. */
  const cancel = React.useCallback(() => {
    const rec = recorderRef.current;
    resolveRef.current = null;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    cleanup();
    setStatus('idle');
    setElapsedMs(0);
  }, [cleanup]);

  /**
   * Snapshot of the recent live amplitude peaks (oldest → newest), for the
   * composer's animated waveform. Read imperatively on rAF to avoid a React
   * re-render per frame. The array is fixed-length (`LEVEL_BUFFER`).
   */
  const getLevels = React.useCallback((): number[] => rollingRef.current, []);

  React.useEffect(() => () => cleanup(), [cleanup]);

  return { supported, status, elapsedMs, start, stop, cancel, getLevels };
}
