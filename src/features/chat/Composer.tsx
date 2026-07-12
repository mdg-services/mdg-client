import {
  Camera,
  ChevronLeft,
  FileText,
  Lock,
  Mic,
  Paperclip,
  SendHorizonal,
  Trash2,
  X,
} from 'lucide-react';
import * as React from 'react';


import { Spinner, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { isNativeShell, requestNativeMicPermission } from '@/lib/nativeBridge';
import {
  formatDuration,
  resolveFileType,
  type OutgoingAttachment,
} from '@/lib/uploadAttachment';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';

import { StagedAttachmentChip, type StagedFile } from './AttachmentPreview';
import { type ReplyPreviewIcon } from './replyContext';

/** What the reply strip above the textarea shows (built by the chat screen). */
export interface ComposerReplyPreview {
  senderLabel: string;
  text: string;
  icon: ReplyPreviewIcon;
}

export interface ComposerProps {
  onSend: (text: string, attachments: OutgoingAttachment[]) => Promise<void> | void;
  onTyping?: () => void;
  disabled?: boolean;
  sending?: boolean;
  initialText?: string;
  /** When set, a quote strip renders above the input (replying to a message). */
  replyingTo?: ComposerReplyPreview | null;
  onCancelReply?: () => void;
}

const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';

/** Leftward drag (px) that arms slide-to-cancel. */
const CANCEL_DX = 80;
/** Upward drag (px) that locks recording hands-free. */
const LOCK_DY = 72;
/** A press shorter than this is treated as a tap → hands-free locked mode. */
const TAP_MS = 350;
/**
 * How long we wait for the mic to actually open before giving up.
 *
 * `getUserMedia` does not settle while the OS permission dialog is on screen,
 * and inside the Android WebView it can stay pending forever (the dialog is a
 * separate Activity; if its result never reaches the WebView the promise is
 * simply never resolved OR rejected). Without a ceiling the composer would sit
 * in the press-and-hold overlay indefinitely — no timer, no waveform, no way to
 * send, cancel or even type. Generous enough for a human to read and accept the
 * prompt; after it we always return the composer to a usable state.
 */
const START_TIMEOUT_MS = 12_000;

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

const REPLY_ICONS: Record<Exclude<ReplyPreviewIcon, null>, typeof Camera> = {
  image: Camera,
  audio: Mic,
  file: FileText,
  card: FileText,
};

export function Composer({
  onSend,
  onTyping,
  disabled,
  sending,
  initialText,
  replyingTo,
  onCancelReply,
}: ComposerProps) {
  const t = useT();
  const toast = useToast();
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
  // Watchdog for a mic that never opens (see START_TIMEOUT_MS).
  const startTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Identifies the current start attempt. Bumped by every new attempt and by
  // resetRecording(), so a getUserMedia that resolves late — after the watchdog
  // gave up, or after the user pressed again — can tell it has been superseded
  // and must not touch the composer.
  const attemptRef = React.useRef(0);

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

  // Starting a reply focuses the input (WhatsApp behaviour: swipe → type).
  React.useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
  }, [replyingTo]);

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

  /** Put the composer back in a usable state, whatever the recorder was doing. */
  const resetRecording = () => {
    attemptRef.current += 1;
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    recorder.cancel();
    gestureRef.current = null;
    recStartedRef.current = false;
    setRecMode('idle');
    setCancelArmed(false);
  };

  // The mic couldn't start (permission denied / unsupported / never opened).
  // Instead of silently opening the image/file picker (which read as "why is the
  // camera opening?"), try a just-in-time OS permission re-request inside the
  // native shell — the WebView's getUserMedia can't trigger the Android runtime
  // prompt itself. Once granted we START RECORDING rather than only announcing
  // success: the user already asked for a voice note, so making them press again
  // reads as "the mic still doesn't work". In a plain browser
  // requestNativeMicPermission resolves false, so it goes straight to the hint.
  const notifyMicBlocked = async () => {
    if (isNativeShell()) {
      const granted = await requestNativeMicPermission();
      if (granted) {
        const attempt = attemptRef.current + 1;
        attemptRef.current = attempt;
        const ok = await recorder.start();
        if (attempt !== attemptRef.current) return;
        if (ok) {
          recStartedRef.current = true;
          setCancelArmed(false);
          setRecMode('locked');
          return;
        }
        // Granted at the OS level but the mic still won't open — don't loop.
        toast.error(t('chat.micBlocked'), { description: t('chat.micBlockedHint') });
        return;
      }
    }
    toast.error(t('chat.micBlocked'), { description: t('chat.micBlockedHint') });
  };

  const disarmStartWatchdog = () => {
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
  };

  /**
   * Give up on a mic that never opens. Only counts time the WebView is actually
   * in the FOREGROUND: while the OS permission dialog is on screen we are waiting
   * on a human, not hung, so the watchdog is disarmed (see the effect below).
   */
  const armStartWatchdog = () => {
    disarmStartWatchdog();
    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      resetRecording(); // bumps attemptRef → any pending start becomes a no-op
      void notifyMicBlocked();
    }, START_TIMEOUT_MS);
  };

  const beginRecorder = async () => {
    recStartedRef.current = false;
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;

    // Never let a mic that won't open strand the composer in the hold overlay.
    armStartWatchdog();

    const ok = await recorder.start();

    disarmStartWatchdog();
    // Superseded: the watchdog gave up, or the user started a new attempt.
    if (attempt !== attemptRef.current) return;

    const g = gestureRef.current;
    if (!ok) {
      // Mic blocked (permission denied / unsupported) — reset and tell the user
      // how to enable it, rather than silently opening the image/file picker.
      resetRecording();
      void notifyMicBlocked();
      return;
    }
    recStartedRef.current = true;
    if (!g) {
      // The gesture was torn down while we waited (pointer lost to the OS
      // permission dialog). We are recording, so hand the user the hands-free
      // bar instead of a dead press-and-hold overlay they can never release.
      setCancelArmed(false);
      setRecMode('locked');
      return;
    }
    // The gesture already ended (quick tap / release) before the mic was ready.
    if (!g.active && g.released) {
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

  /**
   * Safety net for a press-and-hold whose finger-up never arrives.
   *
   * The first voice note opens the OS microphone prompt, which on Android is a
   * separate Activity stacked over the WebView. The page loses the pointer while
   * that dialog is up, so the `pointerup`/`pointercancel` on the mic button is
   * often never delivered: the gesture stays "finger down" forever and the
   * composer is stuck in the recording overlay — the exact "the mic does nothing"
   * report. Listen for the release on the WINDOW (it lands there once pointer
   * capture is lost) and treat losing the window/tab as a release too.
   */
  React.useEffect(() => {
    if (recMode !== 'hold') return;

    const release = () => {
      const g = gestureRef.current;
      if (recStartedRef.current) {
        // Already recording: hand over the hands-free bar so send/cancel stay
        // reachable, rather than an overlay that can never be released.
        gestureRef.current = null;
        setCancelArmed(false);
        setRecMode('locked');
        return;
      }
      // Still opening the mic — mark it released so beginRecorder() resolves the
      // gesture once getUserMedia settles.
      if (g) {
        g.active = false;
        g.released = true;
        gestureRef.current = null;
      }
    };
    const onWindowPointerEnd = () => {
      // Only relevant if the button never got its own pointerup (capture lost).
      if (gestureRef.current?.active) release();
    };
    // Losing the window means the OS mic dialog is up. We are now waiting on a
    // human to read and tap it — NOT on a hung mic — so stop the hang watchdog,
    // or it would abort a grant that is seconds from arriving. It resumes when
    // the dialog is dismissed and we are back in the foreground.
    const onWindowLost = () => {
      if (!recStartedRef.current) disarmStartWatchdog();
      release();
    };
    const onWindowBack = () => {
      if (recMode === 'hold' && !recStartedRef.current) armStartWatchdog();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onWindowLost();
      else onWindowBack();
    };

    window.addEventListener('pointerup', onWindowPointerEnd);
    window.addEventListener('pointercancel', onWindowPointerEnd);
    window.addEventListener('blur', onWindowLost);
    window.addEventListener('focus', onWindowBack);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointerup', onWindowPointerEnd);
      window.removeEventListener('pointercancel', onWindowPointerEnd);
      window.removeEventListener('blur', onWindowLost);
      window.removeEventListener('focus', onWindowBack);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [recMode]);

  // Never leave a watchdog running after the composer goes away.
  React.useEffect(
    () => () => {
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
    },
    [],
  );

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
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    const ok = await recorder.start();
    if (attempt !== attemptRef.current) return;
    if (!ok) {
      void notifyMicBlocked();
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

  const ReplyIcon = replyingTo?.icon ? REPLY_ICONS[replyingTo.icon] : null;

  return (
    <div className="border-t border-border bg-surface safe-bottom">
      {replyingTo && recMode === 'idle' ? (
        // Same strip pattern as the staged attachments: a dismissible preview
        // row pinned above the input while composing.
        <div
          aria-label={t('chat.replyingTo', { name: replyingTo.senderLabel })}
          className="flex items-center gap-2 px-3 pt-3"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border-l-[3px] border-brand bg-surface-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-text">
                {replyingTo.senderLabel}
              </p>
              <p className="flex items-center gap-1 text-xs text-text-muted">
                {ReplyIcon ? (
                  <ReplyIcon width={12} strokeWidth={1.75} className="shrink-0" />
                ) : null}
                <span className="truncate">{replyingTo.text}</span>
              </p>
            </div>
            <button
              type="button"
              aria-label={t('chat.cancelReply')}
              onClick={onCancelReply}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface active:bg-surface"
            >
              <X width={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : null}

      {staged.length > 0 && recMode === 'idle' ? (
        <div className="flex gap-2 overflow-x-auto overscroll-contain px-3 pt-3 scrollbar-thin">
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
              'text-base text-text placeholder:text-text-subtle',
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
