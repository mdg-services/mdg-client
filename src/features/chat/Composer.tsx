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
import { micDiagnostics } from '@/lib/micDiagnostics';
import { addCrumb, reportIssue } from '@/lib/monitoring';
import {
  isNativeShell,
  openNativeAppSettings,
  requestNativeMicPermission,
} from '@/lib/nativeBridge';
import {
  formatDuration,
  resolveFileType,
  type OutgoingAttachment,
} from '@/lib/uploadAttachment';
import {
  useVoiceRecorder,
  type StartFailure,
  type StartResult,
} from '@/lib/useVoiceRecorder';
import { MAX_VOICE_DURATION_MS } from '@dk/shared/schemas';

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
  /**
   * Bumped by the caller on every seed, so the SAME chip tapped twice still
   * refills the box. Without it the effect below compares two identical strings,
   * decides nothing changed, and the chip reads as broken.
   */
  initialTextKey?: number;
  /** When set, a quote strip renders above the input (replying to a message). */
  replyingTo?: ComposerReplyPreview | null;
  onCancelReply?: () => void;
  /**
   * Show the one-tap question chips above the input.
   *
   * The caller decides, and it says NO on an empty thread: the empty state
   * already offers its own three chips (`MessageList`'s `onQuickAction`), and
   * two sets on one screen is six chips and no clear first move.
   */
  showQuickReplies?: boolean;
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
  /**
   * When the finger actually came up, or null while it is still down.
   *
   * THIS IS NOT THE SAME AS "when we got round to resolving the gesture", and
   * conflating the two is why a tap produced "Recording too short". The hold
   * length used to be measured at resolve time — which, when the mic was still
   * opening at release, is whenever getUserMedia happened to settle. A 150ms
   * tap on a slow phone measured 600ms, missed the tap threshold, and was
   * treated as a deliberate hold: stop a recorder that had just started, get
   * zero audio frames back, and tell the dealer their recording was too short.
   */
  releasedAt: number | null;
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
  initialTextKey,
  replyingTo,
  onCancelReply,
  showQuickReplies,
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
  // Cleared wherever a gesture ENDS, not only where a click arrives — the mic
  // button unmounts on every hold→locked swap, so the click it was waiting for
  // frequently never came and the flag stayed set, swallowing the next genuine
  // keyboard or TalkBack activation.
  const suppressClickRef = React.useRef(false);
  /**
   * Swallow exactly ONE click: the ghost that a pointer sequence fires at
   * whatever is now under the finger after the bar swaps to hands-free mode.
   *
   * This used to be a blunt 500ms window, which also ate the dealer's own
   * deliberate tap — press the mic, immediately think better of it, tap the
   * bin, and nothing at all happened. A one-shot flag cannot outlive the event
   * it exists for.
   */
  const swallowClickRef = React.useRef(false);
  /** Undoes the arming above; held so unmount can run it. */
  const disarmGhostRef = React.useRef<(() => void) | null>(null);
  /**
   * Watchdog for a mic that never opens (see START_TIMEOUT_MS), TAGGED WITH THE
   * ATTEMPT IT BELONGS TO.
   *
   * One untagged slot was shared by every attempt, and arming a second one
   * cleared the first. Worse, a superseded attempt disarmed before it checked
   * whether it had been superseded — so pressing twice left the live attempt
   * with no watchdog at all, and a mic that then hung froze the composer
   * permanently. That is the original "the mic does nothing" report, kept alive
   * by the mechanism added to prevent it.
   */
  const startTimerRef = React.useRef<{
    session: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  /**
   * The recorder session this composer believes it owns.
   *
   * There is exactly one source of truth for "is my attempt still current", and
   * it lives in the recorder. There used to be two counters bumped by disjoint
   * sets of callers, and every place they disagreed was a bug — most visibly
   * the one where cancelling a recording made the app announce that the
   * microphone was blocked.
   */
  const sessionRef = React.useRef(0);
  /** Never touch composer state from an async tail after unmount. */
  const unmountedRef = React.useRef(false);

  React.useEffect(() => {
    if (initialText !== undefined) setText(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the signal
  }, [initialText, initialTextKey]);

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

  // ── The one-tap questions ────────────────────────────────────────────────
  // They FILL the box; they never send. What a dealer types is theirs to review
  // and edit, and a chip that sent on tap would fire an unintended message every
  // time a thumb brushed the row.
  //
  // THEY DISAPPEAR THE MOMENT THERE IS A SINGLE CHARACTER IN THE BOX, and that
  // is the load-bearing line here. `setText(label)` REPLACES the contents — it
  // has to, for the same reason the `initialText` seed above does — so a chip
  // still on screen beside a half-typed sentence is a one-tap way to lose it.
  // The gate is `text.length`, not `text.trim().length`: the first keystroke
  // hides them, whatever it was.
  //
  // WHY THESE THREE, AND WHY "Sent today's photo?" IS NO LONGER ONE OF THEM.
  // A chip is worth its row only if it is a question a dealer actually asks AND
  // one nothing else on the screen already answers. The photo chip failed the
  // second test twice over. `features/asks/AskBar` sits directly above this
  // conversation and, whenever a paper is owed, says so in one line and opens
  // the camera on tap — so the chip asked the machine to describe a chore the
  // bar was already showing, which is the same "two lines about one chore"
  // mistake that got `DensityChatPin` unmounted. And when nothing was owed, its
  // answer was one fixed sentence.
  //
  // "What do I need to do?" replaces it because it is the question the live
  // incident was about: at dealer 1E it was answered with "I couldn't check this
  // one myself. I've passed it to the MDG team…" and the thread went to a person
  // on the dealer's SECOND message. It now has a label of its own that answers
  // it — the papers owed, the register page, and where the report stands — so
  // the chip finally names something the machine can do and the bar cannot.
  //
  // STILL THREE, AND THEY STILL ONLY FILL THE BOX. A conversational first line
  // is an argument for FEWER fixed chips, not more: the whole point is that the
  // dealer can now type their own question and be understood, so a menu of
  // canned ones would teach them the opposite. These three earn their place as a
  // keyboard shortcut for the three things typed most often on a Devanagari
  // phone keyboard — not as the interface. The composer is the interface.
  const quickReplies = React.useMemo(
    () => [
      t('chat.quickTodayReport'),
      t('chat.quickWhatNow'),
      t('chat.quickTalkSupport'),
    ],
    [t],
  );
  const showChips =
    !!showQuickReplies &&
    !disabled &&
    recMode === 'idle' &&
    !replyingTo &&
    text.length === 0 &&
    staged.length === 0;

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
    // Clear optimistically — the bubble appears at once and the box is ready for
    // the next line — but PUT IT BACK if the send throws. A dealer on a 2G
    // forecourt who has just typed a paragraph and watched it vanish, with only
    // "Please check your network and try again" to show for it, has nothing left
    // to try again WITH; the only way back was to type the whole thing a second
    // time. The preview URLs are revoked only once the send has actually
    // succeeded, for the same reason: a restored photo has to still be viewable.
    setText('');
    setStaged([]);
    try {
      await onSend(body, outgoing);
      staged.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
    } catch {
      setText((current) => (current ? current : body));
      setStaged((current) => (current.length > 0 ? current : items));
      // Swallowed on purpose: the chat screen has already shown the failure
      // toast, and two of the three callers here fire this without awaiting.
    }
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
    if (unmountedRef.current) return;
    if (!rec || rec.blob.size === 0) {
      // Silence here was indistinguishable from a send that worked: the bar
      // disappeared, no bubble arrived, and nothing said why. Usually the hold
      // was too short for the recorder to produce a frame.
      toast.error(t('chat.voiceTooShort'));
      return;
    }
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

  /**
   * Arm the swallow, and disarm it the moment a real finger goes down.
   *
   * THE GHOST CLICK HAS NO POINTERDOWN OF ITS OWN — that is the only reliable
   * thing about it. It is the tail of the gesture that started on the mic
   * button, dispatched at whatever is under the finger once the bar has swapped
   * over. A deliberate tap always begins with its own `pointerdown`, so
   * listening for one tells the two apart exactly, where a time window only
   * guesses. The timer is a backstop for the case where the ghost never comes
   * at all and nobody touches the screen again.
   */
  const armGhostClickSwallow = () => {
    disarmGhostRef.current?.();
    swallowClickRef.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const disarm = () => {
      swallowClickRef.current = false;
      disarmGhostRef.current = null;
      window.removeEventListener('pointerdown', disarm, true);
      if (timer) clearTimeout(timer);
    };
    timer = setTimeout(disarm, 400);
    window.addEventListener('pointerdown', disarm, true);
    disarmGhostRef.current = disarm;
  };

  /** True if this click was the ghost one, which is then spent. */
  const consumeGhostClick = () => {
    if (!swallowClickRef.current) return false;
    disarmGhostRef.current?.();
    return true;
  };

  /** Throw the current recording away and return the composer to normal. */
  const discardRecording = () => {
    recorder.cancel();
    gestureRef.current = null;
    recStartedRef.current = false;
    suppressClickRef.current = false;
    setRecMode('idle');
    setCancelArmed(false);
  };

  /** End the recording and send what was captured. */
  const finishAndSend = () => {
    gestureRef.current = null;
    suppressClickRef.current = false;
    setRecMode('idle');
    setCancelArmed(false);
    void stopAndSend();
  };

  /** Hand the recording over to the hands-free bar. */
  const promoteToLocked = () => {
    gestureRef.current = null;
    // The mic button is unmounting and Send mounts in the same place, directly
    // under the finger. Spend one click on nothing rather than on sending.
    armGhostClickSwallow();
    suppressClickRef.current = false;
    setCancelArmed(false);
    setRecMode('locked');
  };

  // Resolve a finished press-and-hold: cancel, tap→lock, or hold→send.
  const finishGesture = (g: Gesture) => {
    // Measured from when the FINGER came up, which is not when we got here.
    const heldMs = (g.releasedAt ?? Date.now()) - g.startedAt;
    gestureRef.current = null;
    suppressClickRef.current = false;
    if (g.cancelArmed) {
      discardRecording();
      return;
    }
    if (heldMs < TAP_MS) {
      // Quick tap → hands-free locked mode (so a tap isn't a stuck/empty blip).
      promoteToLocked();
      return;
    }
    // Genuine hold → release to send.
    finishAndSend();
  };

  /** Put the composer back in a usable state, whatever the recorder was doing. */
  const resetRecording = () => {
    disarmStartWatchdog();
    // `cancel()` bumps the recorder session, which is what invalidates any
    // getUserMedia still in flight — there is no second counter to keep in step.
    recorder.cancel();
    gestureRef.current = null;
    recStartedRef.current = false;
    suppressClickRef.current = false;
    setRecMode('idle');
    setCancelArmed(false);
  };

  /**
   * Say what is actually wrong — from the failure in hand, not from a ref.
   *
   * Every one of these used to produce "allow microphone access in Settings",
   * which is true only when the mic was refused. A dealer whose mic is busy
   * goes to Settings, finds the permission already granted, and reports the
   * mic broken again. Which is roughly what has been happening.
   *
   * It takes the failure as an ARGUMENT because the previous version read a
   * `lastError` ref at toast time — up to a minute after the failure it was
   * describing, by which point it could belong to a completely different
   * attempt. A cause that travels with its own result cannot drift.
   */
  const micMessage = (failure: StartFailure) => {
    if (failure.cause === 'unsupported') {
      return { title: t('chat.micUnavailable'), hint: t('chat.micUnavailableHint') };
    }
    if (failure.cause === 'superseded') {
      // Should never reach a human: nothing failed. Reported, not shown.
      return null;
    }
    switch (failure.name) {
      case 'NotReadableError':
      case 'AbortError':
        // The mic is allowed and present; something else has it open.
        return { title: t('chat.micBusy'), hint: t('chat.micBusyHint') };
      case 'NotFoundError':
      case 'OverconstrainedError':
        return { title: t('chat.micMissing'), hint: t('chat.micMissingHint') };
      case 'SecurityError':
      case 'TypeError':
        // Insecure context, or a WebView with no mediaDevices at all. Nothing
        // the dealer can do — don't send them somewhere pointless.
        return { title: t('chat.micUnavailable'), hint: t('chat.micUnavailableHint') };
      case 'Timeout':
        // The request never settled. Not a refusal, not a busy mic — we simply
        // never heard back, and trying again is the only thing that helps.
        return { title: t('chat.micTimeout'), hint: t('chat.micTimeoutHint') };
      default:
        // NotAllowedError, and anything new: it was refused.
        return { title: t('chat.micBlocked'), hint: t('chat.micBlockedHint') };
    }
  };

  const tellMicFailed = (failure: StartFailure, withSettings = false) => {
    const message = micMessage(failure);
    if (!message) return;
    toast.error(message.title, {
      description: message.hint,
      // Offered only where it is the ONLY thing that can help: Android has
      // stopped asking, so no amount of pressing the mic will ever show the
      // prompt again. Everywhere else a button to a settings screen with the
      // permission already granted is a dead end dressed as a fix.
      ...(withSettings
        ? { action: { label: t('chat.micOpenSettings'), onClick: openNativeAppSettings } }
        : {}),
    });
  };

  /**
   * The mic did not open. Decide whether that is worth asking the OS about, and
   * say something true either way.
   *
   * ONLY AN EXPLICIT REFUSAL RE-PROMPTS. This used to treat "no error name" as
   * a refusal, and "no error name" is exactly what a CANCELLED attempt looks
   * like — so discarding a voice note fired the Android permission dialog and a
   * "microphone is blocked" toast at a dealer whose microphone was working
   * perfectly, at the moment they chose not to use it. A superseded attempt now
   * returns early and says nothing at all, which is the only correct response
   * to something that did not fail.
   */
  const notifyMicBlocked = async (failure: StartFailure, session: number) => {
    if (failure.cause === 'superseded') return;
    const refused = failure.cause === 'error' && failure.name === 'NotAllowedError';

    if (isNativeShell() && refused) {
      addCrumb('mic: re-requesting the native permission');
      const answer = await requestNativeMicPermission();
      addCrumb('mic: native permission answered', { ...answer });
      // The prompt can sit on screen for a minute. Anything the dealer did in
      // the meantime owns the composer now — a stale resume must not seize it,
      // restart the mic underneath a live recording, or throw a toast over one.
      if (unmountedRef.current || session !== recorder.currentSession()) return;

      if (answer.granted) {
        // They asked for a voice note and then did what we asked. Start
        // recording rather than announcing success and making them press again.
        const result = await startWithWatchdog();
        if (unmountedRef.current) return;
        if (result.ok) {
          recStartedRef.current = true;
          sessionRef.current = result.session;
          setCancelArmed(false);
          setRecMode('locked');
          return;
        }
        if (result.cause === 'superseded') return;
        // Granted at the OS level and the mic STILL won't open. This is the
        // case worth shouting about: permission is not the problem, so whatever
        // is wrong is ours or the device's, and we have no other way to find out.
        reportIssue({
          name: 'mic.granted-but-unopenable',
          level: 'error',
          tags: { 'mic.error': result.cause === 'error' ? result.name : result.cause },
        });
        resetRecording();
        tellMicFailed(result);
        return;
      }
      tellMicFailed(failure, answer.permanentlyDenied);
      return;
    }

    tellMicFailed(failure);
  };

  /** Clear the watchdog — or only the one belonging to `session`, if given. */
  const disarmStartWatchdog = (session?: number) => {
    const armed = startTimerRef.current;
    if (!armed) return;
    if (session !== undefined && armed.session !== session) return;
    clearTimeout(armed.timer);
    startTimerRef.current = null;
  };

  /**
   * Give up on a mic that never opens.
   *
   * Only counts time the WebView is actually in the FOREGROUND: while the OS
   * permission dialog is on screen we are waiting on a human, not on a hung
   * mic, so the watchdog is disarmed (see the effect below) and re-armed on
   * return.
   */
  const armStartWatchdog = (session: number) => {
    disarmStartWatchdog();
    startTimerRef.current = {
      session,
      timer: setTimeout(() => {
        startTimerRef.current = null;
        // Someone else owns the mic now; their attempt carries its own clock.
        if (session !== recorder.currentSession()) return;
        // getUserMedia never settled, in the foreground, for 12 seconds. It did
        // not reject — it simply never answered, which no error name explains.
        // Nothing else in the app can see this, so it is reported here.
        void micDiagnostics().then((diag) => {
          reportIssue({
            name: 'mic.never-settled',
            level: 'error',
            tags: {
              nativeShell: diag.nativeShell,
              'mic.permission': diag.permissionState,
              audioInputs: diag.audioInputs,
            },
            extra: {
              ...(diag as unknown as Record<string, unknown>),
              timeoutMs: START_TIMEOUT_MS,
            },
          });
        });
        resetRecording(); // cancels the recorder → the pending start is void
        tellMicFailed({ cause: 'error', name: 'Timeout' });
      }, START_TIMEOUT_MS),
    };
  };

  /**
   * Open the mic with a hang watchdog around it. EVERY start goes through here.
   *
   * Two of the three start paths used to have no watchdog at all — including
   * the one that runs straight after a dealer taps "Allow", where a hang meant
   * they did exactly what was asked and the app then sat in silence forever.
   */
  const startWithWatchdog = async (): Promise<StartResult> => {
    const session = recorder.currentSession() + 1;
    armStartWatchdog(session);
    const result = await recorder.start();
    disarmStartWatchdog(session);
    return result;
  };

  const beginRecorder = async () => {
    recStartedRef.current = false;

    const result = await startWithWatchdog();
    if (unmountedRef.current) return;

    if (!result.ok) {
      if (result.cause === 'superseded') return;
      // Mic genuinely refused / missing / unusable — put the composer back and
      // say which of those it was.
      resetRecording();
      void notifyMicBlocked(result, recorder.currentSession());
      return;
    }

    sessionRef.current = result.session;
    // A newer attempt claimed the mic while this one was opening.
    if (result.session !== recorder.currentSession()) return;

    recStartedRef.current = true;
    const g = gestureRef.current;
    if (!g) {
      // The gesture was torn down while we waited (pointer lost to the OS
      // permission dialog). We are recording, so hand over the hands-free bar
      // instead of a dead press-and-hold overlay that can never be released.
      promoteToLocked();
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
    // A second finger must not take over the first one's recording. Without
    // this, a thumb resting on the screen re-based the slide deltas and armed
    // cancel by itself — the note vanished and nobody had touched the bin.
    if (gestureRef.current?.active) return;
    suppressClickRef.current = true;
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
      releasedAt: null,
    };
    setCancelArmed(false);
    setRecMode('hold');
    if (hintRef.current) hintRef.current.style.transform = 'translateX(0px)';
    void beginRecorder();
  };

  const onMicPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g || !g.active) return;
    if (e.pointerId !== g.pointerId) return;
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
      promoteToLocked();
    }
  };

  const endGesture = (cancel: boolean, pointerId: number) => {
    const g = gestureRef.current;
    if (!g || !g.active) return;
    if (pointerId !== g.pointerId) return;
    try {
      micBtnRef.current?.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
    g.active = false;
    g.released = true;
    // Stamped HERE, where the finger actually left, so a mic that opens late
    // cannot turn a tap into a hold.
    g.releasedAt = Date.now();
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
        // reachable, rather than an overlay that can never be released. The
        // finger may still be down and Send is about to mount underneath it,
        // which is why this swallows a click like every other promotion.
        promoteToLocked();
        return;
      }
      // Still opening the mic — mark it released so beginRecorder() resolves the
      // gesture once getUserMedia settles.
      if (g) {
        g.active = false;
        g.released = true;
        g.releasedAt = Date.now();
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
      // Back in the foreground with the mic still not open: put the clock back
      // on the attempt that is actually waiting. `recMode` is guaranteed 'hold'
      // by the effect's own guard above, so it is not re-checked here — it read
      // like a condition and guarded nothing.
      if (!recStartedRef.current && startTimerRef.current === null) {
        armStartWatchdog(recorder.currentSession());
      }
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

  // Never leave a watchdog running — or an async tail writing state — after the
  // composer goes away.
  React.useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (startTimerRef.current) clearTimeout(startTimerRef.current.timer);
      startTimerRef.current = null;
      disarmGhostRef.current?.();
    };
  }, []);

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
    const result = await startWithWatchdog();
    if (unmountedRef.current) return;
    if (!result.ok) {
      if (result.cause === 'superseded') return;
      resetRecording();
      void notifyMicBlocked(result, recorder.currentSession());
      return;
    }
    sessionRef.current = result.session;
    recStartedRef.current = true;
    setRecMode('locked');
  };

  const cancelLocked = () => {
    if (consumeGhostClick()) return;
    discardRecording();
  };

  const sendLocked = () => {
    if (consumeGhostClick()) return;
    finishAndSend();
  };

  /**
   * Stop a hands-free recording before it becomes unsendable.
   *
   * Locked mode has no natural end: a brushed mic button can leave the phone
   * recording in a pocket. Past ten minutes the clip fails the schema, and the
   * way it failed was the worst possible order — the whole file went UP over 2G
   * first, then came back rejected as "your message didn't go through", which
   * reads as a network problem and invites a retry that cannot succeed. Ending
   * it a few seconds short sends what was actually said.
   *
   * Through a REF, not a dependency: `sendLocked` closes over the composer's
   * current text and staged files and is rebuilt every render, so listing it
   * would re-run this on every keystroke, and freezing it with `[]` would send
   * the state as it was when the screen mounted. `firedRef` covers the gap
   * between the timer ticking past the limit and `recMode` becoming 'idle'.
   */
  const finishAndSendRef = React.useRef(finishAndSend);
  finishAndSendRef.current = finishAndSend;
  const maxReachedRef = React.useRef(false);
  React.useEffect(() => {
    // BOTH recording modes, not just hands-free. The cap used to be enforced
    // only in locked mode, so a finger held past ten minutes uploaded the whole
    // clip over 2G and had it rejected on arrival — the exact failure this cap
    // exists to prevent, reported to the dealer as "your message didn't go
    // through", which reads as a network problem and invites a doomed retry.
    if (recMode === 'idle') {
      maxReachedRef.current = false;
      return;
    }
    if (maxReachedRef.current) return;
    if (recorder.elapsedMs < MAX_VOICE_DURATION_MS - 5000) return;
    maxReachedRef.current = true;
    toast.info(t('chat.voiceMaxReached'));
    finishAndSendRef.current();
  }, [recMode, recorder.elapsedMs, toast, t]);

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

      {showChips ? (
        // Scrolls sideways rather than wrapping, exactly like the staged
        // attachment strip above. The three Hindi labels come to roughly 430px
        // and a cheap phone is 360px wide, so wrapping would push the input a
        // whole row down the screen every time the box was empty; a third chip
        // half in view is the affordance that says there is more to the right.
        <div className="flex gap-2 overflow-x-auto overscroll-contain px-3 pt-3 scrollbar-thin">
          {quickReplies.map((label) => (
            <button
              key={label}
              type="button"
              // Deliberately NOT focusing the textarea afterwards. Focus summons
              // the phone keyboard over half the screen, and the whole point of
              // the chip is the dealer who did not want to type: the button
              // beside the box has already turned into Send by the time the
              // keyboard would have finished animating in.
              onClick={() => setText(label)}
              className="shrink-0 rounded-full border border-border bg-surface-2 px-3.5 py-1.5 text-sm text-text active:bg-surface"
            >
              {label}
            </button>
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

          {/* A WebView with no MediaRecorder cannot record at all. The hook has
              always exposed `supported` and nothing read it, so the button was
              offered and failed on press — with a toast, which is a worse
              answer than not asking. */}
          {canSend || !recorder.supported ? (
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
                {/* Ten bars, not sixteen. The row is bin + waveform + timer +
                    "slide to cancel" inside 360px, and on a 360px phone the one
                    instruction telling a first-time user how to abandon a
                    recording was running off the right edge — in Hindi it read
                    "◀ रद्द करने के लि". The waveform is the only decorative
                    element in the row, so it gives up the space. */}
                <LiveWaveform
                  getLevels={recorder.getLevels}
                  active={recorder.status === 'recording'}
                  bars={10}
                />
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums text-text">
                {formatDuration(recorder.elapsedMs)}
              </span>
              <div
                ref={hintRef}
                className={cn(
                  'ml-auto mr-11 flex min-w-0 items-center gap-1',
                  cancelArmed ? 'text-danger' : 'text-text-subtle',
                )}
              >
                <ChevronLeft width={16} strokeWidth={2} className="shrink-0" />
                <span className="truncate text-sm">
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
