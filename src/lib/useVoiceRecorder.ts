import * as React from 'react';

/**
 * Microphone recording via the MediaRecorder API, wrapped for chat voice notes.
 *
 * Works in Chrome/Android WebView (audio/webm;codecs=opus) and modern Safari
 * (audio/mp4). `supported` is false where MediaRecorder or getUserMedia is
 * missing so callers can hide the mic button gracefully.
 *
 * Note: inside the Expo Android WebView, getUserMedia only resolves if the
 * native shell grants the capture permission (see mdg-app WebView config).
 */
export type RecorderStatus = 'idle' | 'recording' | 'error';

export interface VoiceRecording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
];

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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

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
        cleanup();
        setStatus('idle');
        setElapsedMs(0);
        resolveRef.current?.({ blob, durationMs, mimeType: effectiveType });
        resolveRef.current = null;
      };
      streamRef.current = stream;
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
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
  }, [supported, cleanup]);

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

  React.useEffect(() => () => cleanup(), [cleanup]);

  return { supported, status, elapsedMs, start, stop, cancel };
}
