import {
  Camera,
  ChevronLeft,
  Lock,
  Mic,
  Paperclip,
  SendHorizonal,
  Trash2,
} from 'lucide-react';
import * as React from 'react';

import { StagedAttachmentChip, type StagedFile } from './AttachmentPreview';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import {
  formatDuration,
  resolveFileType,
  type OutgoingAttachment,
} from '@/lib/uploadAttachment';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';

export interface ComposerProps {
  onSend: (text: string, attachments: OutgoingAttachment[]) => Promise<void> | void;
  onTyping?: () => void;
  disabled?: boolean;
  sending?: boolean;
  initialText?: string;
}

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';

/** Leftward drag (px) that arms slide-to-cancel. */
const CANCEL_DX = 80;
/** Upward drag (px) that locks recording hands-free. */
const LOCK_DY = 72;
/** A press shorter than this is treated as a tap → hands-free locked mode. */
const TAP_MS = 350;

/** One in-flight press-and-hold gesture on the mic. */
interface Gesture {
  active: boolean;
  released: boolean;
  cancelArmed: boolean;
  startX: number;
  startY: number;
  startedAt: number;
  pointerId: number;
}

function extForMime(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * Animated microphone-level meter: a row of bars whose heights track the
 * recorder's live amplitude, read imperatively on rAF (no per-frame React
 * re-render). Falls back to a simple pulsing dot under prefers-reduced-motion.
 * Colour comes from the parent via `bg-current`.
 */
function LiveWaveform({
  getLevels,
  active,
  bars = 24,
  className,
}: {
  getLevels: () => number[];
  active: boolean;
  bars?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!active || reduced) return;
    const el = ref.current;
    if (!el) return;
    const kids = Array.from(el.children) as HTMLElement[];
    let raf = 0;
    const loop = () => {
      const levels = getLevels();
      const n = kids.length;
      const offset = levels.length - n;
      for (let i = 0; i < n; i += 1) {
        const idx = offset + i;
        const v = idx >= 0 ? (levels[idx] ?? 0) : 0;
        const s = 0.1 + Math.min(1, v) * 0.9;
        kids[i].style.transform = `scaleY(${s.toFixed(3)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced, getLevels]);

  if (reduced) {
    return (
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-danger"
      />
    );
  }
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn('flex h-6 items-center gap-[3px]', className)}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="h-full w-[3px] origin-center rounded-full bg-current"
          style={{ transform: 'scaleY(0.1)' }}
        />
      ))}
    </div>
  );
}

export function Composer({
  onSend,
  onTyping,
  disabled,
  sending,
  initialText,
}: ComposerProps) {
  const t = useT();
  const [text, setText] = React.useState(initialText ?? '');
  const [staged, setStaged] = React.useState<StagedFile[]>([]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const micBtnRef = React.useRef<HTMLButtonElement>(null);
  const hintRef = React.useRef<HTMLDivElement>(null);
  const recorder = useVoiceRecorder();

  // 'idle' = normal composer, 'hold' = finger down recording, 'locked' = hands-free.
  const [recMode, setRecMode] = React.useState<'idle' | 'hold' | 'locked'>('idle');
  const [cancelArmed, setCancelArmed] = React.useState(false);

  const gestureRef = React.useRef<Gesture | null>(null);
  const recStartedRef = React.useRef(false);
  // A pointer sequence fires a synthetic click afterwards; suppress it so the
  // keyboard/AT `onClick` path only runs for genuine keyboard activation.
  const suppressClickRef = React.useRef(false);
  // Ignore the ghost click that lands right after we swap to the locked bar.
  const clickGuardUntilRef = React.useRef(0);

  React.useEffect(() => {
    if (initialText !== undefined) setText(initialText);
  }, [initialText]);

  // auto-resize
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  React.useEffect(() => {
    return () => {
      staged.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasContent = text.trim().length > 0 || staged.length > 0;
  const canSend = hasContent && !disabled;

  // `fromCamera` items are known to be photos even when the OS hands back a File
  // with an empty MIME type (common on Android WebView), so classification can
  // safely assume an image.
  const handlePickFiles = (
    files: FileList | null,
    opts?: { fromCamera?: boolean },
  ) => {
    if (!files || files.length === 0) return;
    const next: StagedFile[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      if (!f) continue;
      const { kind, contentType } = resolveFileType(f, {
        assumeImage: opts?.fromCamera,
      });
      const previewUrl = kind === 'image' ? URL.createObjectURL(f) : undefined;
      next.push({
        id: `${Date.now()}-${i}-${f.name || 'photo.jpg'}`,
        file: f,
        kind,
        contentType,
        previewUrl,
      });
    }
    setStaged((curr) => [...curr, ...next].slice(0, 10));
    if (fileRef.current) fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  };

  const removeStaged = (id: string) => {
    setStaged((curr) => {
      const removed = curr.find((s) => s.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return curr.filter((s) => s.id !== id);
    });
  };

  // Send the typed text plus any staged attachments (and optional extras that
  // haven't hit state yet, e.g. a just-finished recording).
  const doSend = async (extras: StagedFile[] = []) => {
    const items = [...staged, ...extras];
    const body = text.trim();
    if (body.length === 0 && items.length === 0) return;
    if (disabled) return;

    const outgoing: OutgoingAttachment[] = items.map((s) => ({
      file: s.file,
      kind: s.kind,
      contentType: s.contentType,
      durationMs: s.durationMs,
      peaks: s.peaks,
    }));
    staged.forEach((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    });
    setText('');
    setStaged([]);
    await onSend(body, outgoing);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void doSend();
    }
  };

  // Stop, package the clip as a staged audio file, and send immediately. The
  // captured waveform peaks ride along on the staged item so a preview (and any
  // future review step) can show a real waveform.
  const stopAndSend = async () => {
    const rec = await recorder.stop();
    recStartedRef.current = false;
    if (!rec || rec.blob.size === 0) return;
    // Normalise to a clean base audio MIME: strip any ";codecs=…" suffix and
    // guarantee an audio/* type, so the presign allowlist accepts it and the
    // S3 PUT Content-Type matches what was signed. Some Android WebViews report
    // an empty blob type, which would otherwise become application/octet-stream.
    let mime = ((rec.mimeType || rec.blob.type || 'audio/webm').split(';')[0] || 'audio/webm').trim();
    if (!mime.startsWith('audio/')) mime = 'audio/webm';
    const ext = extForMime(mime);
    const file = new File([rec.blob], `voice-${Date.now()}.${ext}`, {
      type: mime,
    });
    const item: StagedFile = {
      id: `voice-${Date.now()}`,
      file,
      kind: 'audio',
      durationMs: rec.durationMs,
      peaks: rec.peaks,
    };
    await doSend([item]);
  };

  const withinClickGuard = () => Date.now() < clickGuardUntilRef.current;

  // Resolve a finished press-and-hold: cancel, tap→lock, or hold→send.
  const finishGesture = (g: Gesture) => {
    const heldMs = Date.now() - g.startedAt;
    gestureRef.current = null;
    if (g.cancelArmed) {
      recorder.cancel();
      setRecMode('idle');
      setCancelArmed(false);
      return;
    }
    if (heldMs < TAP_MS) {
      // Quick tap → hands-free locked mode (so a tap isn't a stuck/empty blip).
      clickGuardUntilRef.current = Date.now() + 500;
      setCancelArmed(false);
      setRecMode('locked');
      return;
    }
    // Genuine hold → release to send.
    setRecMode('idle');
    setCancelArmed(false);
    void stopAndSend();
  };

  const beginRecorder = async () => {
    recStartedRef.current = false;
    const ok = await recorder.start();
    const g = gestureRef.current;
    if (!ok) {
      // Permission denied / unsupported — reset and fall back to the file
      // picker so the user can still attach an audio file.
      gestureRef.current = null;
      recStartedRef.current = false;
      setRecMode('idle');
      setCancelArmed(false);
      fileRef.current?.click();
      return;
    }
    recStartedRef.current = true;
    // The gesture already ended (quick tap / release) before the mic was ready.
    if (g && !g.active && g.released) {
      finishGesture(g);
    }
  };

  const onMicPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    suppressClickRef.current = true;
    clickGuardUntilRef.current = 0;
    try {
      micBtnRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    gestureRef.current = {
      active: true,
      released: false,
      cancelArmed: false,
      startX: e.clientX,
      startY: e.clientY,
      startedAt: Date.now(),
      pointerId: e.pointerId,
    };
    setCancelArmed(false);
    setRecMode('hold');
    if (hintRef.current) hintRef.current.style.transform = 'translateX(0px)';
    void beginRecorder();
  };

  const onMicPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g || !g.active) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const slide = Math.max(-160, Math.min(0, dx));
    if (hintRef.current) hintRef.current.style.transform = `translateX(${slide}px)`;

    const wantCancel = dx <= -CANCEL_DX && Math.abs(dx) >= Math.abs(dy);
    if (wantCancel !== g.cancelArmed) {
      g.cancelArmed = wantCancel;
      setCancelArmed(wantCancel);
    }
    // Slide up to lock (hands-free), unless we're already arming a cancel.
    if (!wantCancel && dy <= -LOCK_DY && Math.abs(dy) > Math.abs(dx)) {
      try {
        micBtnRef.current?.releasePointerCapture(g.pointerId);
      } catch {
        /* ignore */
      }
      gestureRef.current = null;
      clickGuardUntilRef.current = Date.now() + 500;
      setCancelArmed(false);
      setRecMode('locked');
    }
  };

  const endGesture = (cancel: boolean, pointerId: number) => {
    const g = gestureRef.current;
    if (!g || !g.active) return;
    try {
      micBtnRef.current?.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
    g.active = false;
    g.released = true;
    if (cancel) g.cancelArmed = true;
    // If the mic hasn't finished starting, beginRecorder resolves the action.
    if (!recStartedRef.current) return;
    finishGesture(g);
  };

  const onMicClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (disabled) return;
    // Keyboard / assistive tech (no pointer sequence) → start hands-free locked.
    void startLockedRecording();
  };

  const startLockedRecording = async () => {
    const ok = await recorder.start();
    if (!ok) {
      fileRef.current?.click();
      return;
    }
    recStartedRef.current = true;
    setRecMode('locked');
  };

  const cancelLocked = () => {
    if (withinClickGuard()) return;
    recorder.cancel();
    recStartedRef.current = false;
    setRecMode('idle');
    setCancelArmed(false);
  };

  const sendLocked = () => {
    if (withinClickGuard()) return;
    setRecMode('idle');
    setCancelArmed(false);
    void stopAndSend();
  };

  return (
    <div className="border-t border-border bg-surface safe-bottom">
      {staged.length > 0 && recMode === 'idle' ? (
        <div className="flex gap-2 overflow-x-auto px-3 pt-3 scrollbar-thin">
          {staged.map((s) => (
            <StagedAttachmentChip
              key={s.id}
              staged={s}
              onRemove={() => removeStaged(s.id)}
            />
          ))}
        </div>
      ) : null}

      {recMode === 'locked' ? (
        <div className="flex items-center gap-3 px-3 py-3">
          <button
            type="button"
            aria-label={t('chat.cancelRecording')}
            onClick={cancelLocked}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2"
          >
            <Trash2 width={20} strokeWidth={1.75} />
          </button>
          <div className="flex flex-1 items-center gap-2 text-text">
            <Lock width={14} strokeWidth={2} className="shrink-0 text-text-muted" />
            <LiveWaveform
              getLevels={recorder.getLevels}
              active={recorder.status === 'recording'}
              bars={22}
            />
            <span className="shrink-0 text-sm font-medium tabular-nums text-text">
              {formatDuration(recorder.elapsedMs)}
            </span>
          </div>
          <button
            type="button"
            aria-label={t('chat.sendVoice')}
            onClick={sendLocked}
            disabled={sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-text-inverse hover:bg-brand-hover disabled:cursor-not-allowed"
          >
            {sending ? <Spinner size={16} /> : <SendHorizonal width={18} strokeWidth={1.75} />}
          </button>
        </div>
      ) : (
        <div className="relative flex items-end gap-2 px-3 py-3">
          <button
            type="button"
            aria-label={t('chat.takePhoto')}
            onClick={() => cameraRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2"
            disabled={disabled}
          >
            <Camera width={20} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label={t('chat.addPhoto')}
            onClick={() => fileRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-2"
            disabled={disabled}
          >
            <Paperclip width={20} strokeWidth={1.75} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => handlePickFiles(e.target.files)}
          />
          {/* Direct camera capture (rear-facing). On desktop the `capture` hint is
              ignored and this falls back to a normal file chooser. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handlePickFiles(e.target.files, { fromCamera: true })}
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onTyping?.();
            }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={t('chat.placeholder')}
            className={cn(
              'min-h-[40px] max-h-[140px] flex-1 resize-none rounded-2xl border border-border bg-surface-2 px-4 py-2.5',
              'text-[15px] text-text placeholder:text-text-subtle',
              'focus:outline-none focus:ring-2 focus:ring-focus-ring',
            )}
            disabled={disabled}
          />

          {canSend ? (
            <button
              type="button"
              aria-label={t('chat.send')}
              onClick={() => void doSend()}
              disabled={sending}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                'bg-brand text-text-inverse hover:bg-brand-hover',
                'disabled:cursor-not-allowed',
              )}
            >
              {sending ? <Spinner size={16} /> : <SendHorizonal width={18} strokeWidth={1.75} />}
            </button>
          ) : (
            <button
              ref={micBtnRef}
              type="button"
              aria-label={t('chat.recordVoice')}
              onPointerDown={onMicPointerDown}
              onPointerMove={onMicPointerMove}
              onPointerUp={(e) => endGesture(false, e.pointerId)}
              onPointerCancel={(e) => endGesture(true, e.pointerId)}
              onClick={onMicClick}
              onContextMenu={(e) => e.preventDefault()}
              disabled={disabled}
              className={cn(
                'relative z-10 flex h-10 w-10 shrink-0 touch-none select-none items-center justify-center rounded-full transition-transform',
                recMode === 'hold'
                  ? cancelArmed
                    ? 'scale-110 bg-danger text-text-inverse'
                    : 'scale-125 bg-brand text-text-inverse'
                  : 'bg-brand text-text-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-subtle',
              )}
            >
              {recMode === 'hold' && cancelArmed ? (
                <Trash2 width={20} strokeWidth={1.75} />
              ) : (
                <Mic width={20} strokeWidth={1.75} />
              )}
            </button>
          )}

          {/* Press-and-hold overlay: covers the input area while a finger is down.
              pointer-events-none so the captured mic button (z-10) keeps every
              pointer event; the mic stays mounted so capture + pointerup survive. */}
          {recMode === 'hold' ? (
            <div className="pointer-events-none absolute inset-0 z-0 flex items-center gap-3 bg-surface px-3">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  cancelArmed ? 'bg-danger/15 text-danger' : 'text-text-muted',
                )}
              >
                <Trash2 width={18} strokeWidth={1.75} />
              </span>
              <div className={cn(cancelArmed ? 'text-danger' : 'text-text')}>
                <LiveWaveform
                  getLevels={recorder.getLevels}
                  active={recorder.status === 'recording'}
                  bars={16}
                />
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums text-text">
                {formatDuration(recorder.elapsedMs)}
              </span>
              <div
                ref={hintRef}
                className={cn(
                  'ml-auto mr-12 flex items-center gap-1',
                  cancelArmed ? 'text-danger' : 'text-text-subtle',
                )}
              >
                <ChevronLeft width={16} strokeWidth={2} />
                <span className="whitespace-nowrap text-sm">
                  {cancelArmed ? t('chat.releaseToCancel') : t('chat.slideToCancel')}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
