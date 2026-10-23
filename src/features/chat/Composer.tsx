import {
  Camera,
  ChevronLeft,
  FileText,
  Lock,
  Mic,
  Paperclip,
  SendHorizonal,
  Trash2,
  Video,
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
import type { Message } from '@dk/shared/types';

import { StagedAttachmentChip, type StagedFile } from './AttachmentPreview';
import { AttachSheet, type AttachChoice } from './AttachSheet';
import { MediaSendPreview } from './MediaSendPreview';
import { type ReplyPreviewIcon } from './replyContext';

/** What the reply strip above the textarea shows (built by the chat screen). */
export interface ComposerReplyPreview {
  senderLabel: string;
  text: string;
  icon: ReplyPreviewIcon;
  /**
   * Do not summon the keyboard when this reply starts. Set when the reply was
   * raised by an ANSWER to one of MDG's requests — the photo is already in hand
   * and on its way to the preview, and a keyboard that opens over it is in the way
   * of the one thing asked. A reply the dealer starts by swiping a request is an
   * ordinary one: they are about to type.
   */
  quiet?: boolean;
}

/**
 * What the chat screen can ask the composer to do on its own.
 *
 * Each opens a file chooser for a request MDG posted ("Send photo", "Choose
 * file", "Choose from gallery"), and a chooser has to be opened INSIDE the tap
 * that asked for it — the Android System WebView drops one opened from an effect
 * or from a state change a render later. A request's button lives in a message
 * bubble far from this component's private file inputs, so the composer hands the
 * chat screen a way to click them in the same call.
 *
 * THE REQUEST IS NOT THE REPLY TARGET YET. Pressing a button only opens a
 * chooser, and the chooser can be left with nothing chosen — a cancelled camera
 * fires no event at all. If the request became the reply target at the tap, a
 * cancel would leave it quoted above the box, and the next photo the dealer sent
 * for any reason would go out as the answer to it (a register page is then filed
 * and received automatically; a paper lands as "sent" for a person to check).
 * So the composer holds the request as PENDING, and only when a file really
 * arrives does it tell the chat screen (`onAnswerPicked`) to make it the reply
 * target. Closing the preview, or taking the file back off the chip, hands it
 * back (`onAnswerDropped`).
 *
 * All three do nothing while the composer cannot send — no thread yet, or a voice
 * note being recorded: a camera that opens over a live recording ends it.
 */
export interface ComposerHandle {
  /** Open the rear camera for this request. */
  openCamera: (ask: Message) => void;
  /** Open the phone's files for this request: a photo or a PDF, one at a time. */
  openFiles: (ask: Message) => void;
  /** Open the phone's photos for this request: one picture, no camera. */
  openGallery: (ask: Message) => void;
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
   * A file has arrived for the request the dealer pressed a button on (see
   * {@link ComposerHandle}): the caller makes that request the reply target, so
   * the quote on the sent message and `answersAsk` both come from it.
   */
  onAnswerPicked?: (ask: Message) => void;
  /**
   * The dealer backed out of that answer — closed the preview or removed the
   * file — before sending it. The caller lets go of the reply target it set.
   */
  onAnswerDropped?: (ask: Message) => void;
  /**
   * Show the one-tap question chips above the input.
   *
   * The caller decides, and it says NO on an empty thread: the empty state
   * already offers its own two chips (`MessageList`'s `onQuickAction`), and
   * two sets on one screen is four chips and no clear first move.
   */
  showQuickReplies?: boolean;
}

/** What the Document choice offers. Photos have their own two doors. */
const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.txt';

/**
 * What "Choose file" on a request offers: a picture or a PDF, the two things MDG
 * can file against a request. (No Word or Excel here — they cannot be, and a
 * picker that offers them is a way to send a file nobody can use.)
 */
const ASK_FILE_ACCEPT = 'image/*,application/pdf';

/** The server's ceiling on attachments in one message. */
const MAX_ATTACHMENTS = 10;

function revokeNow(items: StagedFile[]): void {
  for (const s of items) if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
}


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
  video: Video,
  file: FileText,
};

export const Composer = React.forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    onSend,
    onTyping,
    disabled,
    sending,
    initialText,
    initialTextKey,
    replyingTo,
    onCancelReply,
    onAnswerPicked,
    onAnswerDropped,
    showQuickReplies,
  },
  handleRef,
) {
  const t = useT();
  const toast = useToast();
  const [text, setText] = React.useState(initialText ?? '');
  // Documents waiting to go — a chip each, above the box. (Photos do not wait
  // here: they pass through the full-screen preview below, and come back to this
  // list only if their send fails.)
  const [staged, setStaged] = React.useState<StagedFile[]>([]);
  // Photos in the full-screen preview; empty = the preview is closed.
  const [preview, setPreview] = React.useState<StagedFile[]>([]);
  const [attachOpen, setAttachOpen] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);
  // "Choose file" on a request: one picture or PDF, nothing else.
  const askFileRef = React.useRef<HTMLInputElement>(null);
  // "Choose from gallery" on a photo-only request: one picture, no camera.
  const askGalleryRef = React.useRef<HTMLInputElement>(null);
  // The request whose button the dealer pressed and whose chooser is open, with
  // nothing chosen yet, and WHICH chooser it opened. Only a file arriving from
  // that same chooser turns it into an answer.
  const pendingAnswerRef = React.useRef<{
    ask: Message;
    input: React.RefObject<HTMLInputElement | null>;
  } | null>(null);
  // The request a file really arrived for, until that answer is sent or dropped.
  const answeringRef = React.useRef<Message | null>(null);
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

  // Starting a reply focuses the input (WhatsApp behaviour: swipe → type) —
  // except the one an answer to one of MDG's requests raises, whose photo is
  // already in hand.
  React.useEffect(() => {
    if (replyingTo && !replyingTo.quiet) textareaRef.current?.focus();
  }, [replyingTo]);

  // Whatever is still waiting when the screen goes away has nowhere to be sent
  // from: let its local preview go. Read through a ref — the cleanup runs once,
  // and a closure over the first render's lists would only ever see them empty.
  const heldRef = React.useRef<StagedFile[]>([]);
  heldRef.current = [...staged, ...preview];
  React.useEffect(() => {
    return () => revokeNow(heldRef.current);
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
  // WHY THESE TWO, AND WHY "Sent today's photo?" IS NO LONGER ONE OF THEM.
  // A chip is worth its row only if it is a question a dealer actually asks AND
  // one nothing else on the screen already answers. The photo chip failed the
  // second test twice over. When a photo is owed, the request itself is in the
  // thread — a message with its own "Send photo" button — so the chip asked the
  // machine to describe a chore the thread was already showing, and when nothing
  // was owed its answer was one fixed sentence.
  //
  // "What do I need to do?" replaces it because it is the question the live
  // incident was about: at dealer 1E it was answered with "I couldn't check this
  // one myself. I've passed it to the MDG team…" and the thread went to a person
  // on the dealer's SECOND message. It now has a label of its own that answers
  // it — the papers owed, the register page, and where the report stands — so
  // the chip finally names something the machine can do.
  //
  // THEY ONLY FILL THE BOX. A conversational first line is an argument for
  // FEWER fixed chips, not more: the whole point is that the dealer can now type
  // their own question and be understood, so a menu of canned ones would teach
  // them the opposite. These two earn their place as a keyboard shortcut for the
  // two things typed most often on a Devanagari phone keyboard — not as the
  // interface. The composer is the interface.
  const quickReplies = React.useMemo(
    () => [t('chat.quickTodayReport'), t('chat.quickWhatNow')],
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
  //
  // PHOTOS GO TO THE PREVIEW, EVERYTHING ELSE TO A CHIP. Which door they came
  // through does not decide it — the file does: a picture picked from the
  // Document chooser is still a picture and deserves the same look-before-it-
  // goes, and a stray PDF that comes out of the Gallery is still a paper.
  const handlePickFiles = (
    files: FileList | null,
    opts?: {
      fromCamera?: boolean;
      /** The chooser the files came from, when a request's button can open it. */
      via?: React.RefObject<HTMLInputElement | null>;
    },
  ) => {
    if (!files || files.length === 0) return;
    const picked: StagedFile[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      if (!f) continue;
      const { kind, contentType } = resolveFileType(f, {
        assumeImage: opts?.fromCamera,
      });
      const previewUrl = kind === 'image' ? URL.createObjectURL(f) : undefined;
      picked.push({
        id: `${Date.now()}-${i}-${f.name || 'photo.jpg'}`,
        file: f,
        kind,
        contentType,
        previewUrl,
      });
    }
    // Ten to a message. What does not fit is dropped (and its preview let go)
    // with a word about why, rather than silently.
    const room = Math.max(0, MAX_ATTACHMENTS - staged.length - preview.length);
    const accepted = picked.slice(0, room);
    if (accepted.length < picked.length) {
      revokeNow(picked.slice(accepted.length));
      toast.info(t('composer.maxFiles', { n: MAX_ATTACHMENTS }));
    }
    const photos = accepted.filter((s) => s.kind === 'image');
    const papers = accepted.filter((s) => s.kind !== 'image');
    if (papers.length > 0) setStaged((curr) => [...curr, ...papers]);
    if (photos.length > 0) setPreview((curr) => [...curr, ...photos]);
    // A FILE HAS REALLY ARRIVED, so a request the dealer pressed a button on is
    // now being answered — and only now does it become the reply target.
    const pending = pendingAnswerRef.current;
    pendingAnswerRef.current = null;
    if (pending && pending.input === opts?.via && accepted.length > 0) {
      answeringRef.current = pending.ask;
      onAnswerPicked?.(pending.ask);
    }
    if (fileRef.current) fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
    if (askFileRef.current) askFileRef.current.value = '';
    if (askGalleryRef.current) askGalleryRef.current.value = '';
  };

  /**
   * Let go of a request that was being answered but will not be, now.
   *
   * Told to the caller, who set the reply target (`onAnswerPicked`) and is the
   * only one who can take it back. Safe to call with nothing being answered.
   */
  const dropAnswer = () => {
    const ask = answeringRef.current;
    if (!ask) return;
    answeringRef.current = null;
    onAnswerDropped?.(ask);
  };

  /**
   * The dealer went to a chooser of their own. Whatever a request's button
   * opened last and never got an answer from (a cancelled camera sends nothing)
   * is no longer what they are doing — the next file is theirs, not the answer.
   */
  const forgetPendingAnswer = () => {
    pendingAnswerRef.current = null;
  };

  const removeStaged = (id: string) => {
    setStaged((curr) => {
      const removed = curr.find((s) => s.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return curr.filter((s) => s.id !== id);
    });
    // Taking the last file off leaves nothing to answer with.
    if (staged.length <= 1 && preview.length === 0) dropAnswer();
  };

  /** ✕ on one thumbnail of the preview. Dropping the last one closes it. */
  const removePreviewed = (id: string) => {
    setPreview((curr) => {
      const removed = curr.find((s) => s.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return curr.filter((s) => s.id !== id);
    });
    if (preview.length <= 1 && staged.length === 0) dropAnswer();
  };

  /** Back / ✕ on the preview: nothing is kept. */
  const closePreview = () => {
    setPreview((curr) => {
      revokeNow(curr);
      return [];
    });
    // A paper already waiting as a chip still goes with its request.
    if (staged.length === 0) dropAnswer();
  };

  /** One door of the attach card: close it, open the matching chooser. */
  const chooseAttachment = (choice: AttachChoice) => {
    setAttachOpen(false);
    forgetPendingAnswer();
    // Clicked HERE, in the same tap — a chooser opened a beat later is refused
    // by the browser as not being the result of a gesture.
    const input =
      choice === 'document' ? fileRef : choice === 'camera' ? cameraRef : galleryRef;
    input.current?.click();
  };

  // Send the typed text plus any staged attachments (and optional extras that
  // haven't hit state yet, e.g. a just-finished recording or the photos from the
  // preview). `opts.text` stands in for the box when the words were typed
  // somewhere else — the preview's caption line.
  const doSend = async (extras: StagedFile[] = [], opts?: { text?: string }) => {
    const items = [...staged, ...extras];
    const body = (opts?.text ?? text).trim();
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
    // time. The preview URLs are let go only once the send has actually
    // succeeded, for the same reason: a restored photo has to still be viewable.
    // A failed photo comes back as a chip above the box, not as the full-screen
    // preview — the failure toast is already on screen, and a screen that jumps
    // up at the same moment is one more thing to read.
    setText('');
    setStaged([]);
    try {
      await onSend(body, outgoing);
      revokeNow(items);
      // The request was answered by that send; nothing is left to take back. (On
      // a failure it stays: the caller gives the reply target back with the
      // photo, and removing the photo must still let go of it.)
      answeringRef.current = null;
    } catch {
      setText((current) => (current ? current : body));
      setStaged((current) => (current.length > 0 ? current : items));
      // Swallowed on purpose: the chat screen has already shown the failure
      // toast, and two of the three callers here fire this without awaiting.
    }
  };

  /** Send from the preview: every photo, one message, the caption as its words. */
  const sendPreview = (caption: string) => {
    if (disabled) return;
    const photos = preview;
    setPreview([]);
    void doSend(photos, { text: caption });
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

  // The way in for a request's "Send photo" / "Choose file" / "Choose from
  // gallery" (see ComposerHandle). The click happens HERE, synchronously, in
  // whatever tap called it — the request is only remembered, not yet answered.
  React.useImperativeHandle(
    handleRef,
    () => {
      const open = (input: React.RefObject<HTMLInputElement | null>, ask: Message) => {
        if (disabled || recMode !== 'idle') return;
        pendingAnswerRef.current = { ask, input };
        input.current?.click();
      };
      return {
        openCamera: (ask) => open(cameraRef, ask),
        openFiles: (ask) => open(askFileRef, ask),
        openGallery: (ask) => open(askGalleryRef, ask),
      };
    },
    [disabled, recMode],
  );

  const ReplyIcon = replyingTo?.icon ? REPLY_ICONS[replyingTo.icon] : null;

  // The round green button beside the box, and the one control it is at a time:
  // send when there is something to send, the mic when there is not.
  const roundButton =
    'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-accent text-white';

  return (
    // The wallpaper's own colour, not a bar of its own: the box floats on the
    // thread the way WhatsApp's does, and there is no seam between the two.
    <div className="relative bg-wa-wallpaper safe-bottom">
      {staged.length > 0 && recMode === 'idle' ? (
        // Documents keep a chip each above the box; photos have their own screen.
        <div className="flex gap-2 overflow-x-auto overscroll-contain px-2 pt-2 scrollbar-thin">
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
        // attachment strip above. Hindi labels run long and a cheap phone is
        // 360px wide, so wrapping would push the input a whole row down the
        // screen every time the box was empty; a chip half in view is the
        // affordance that says there is more to the right.
        <div className="flex gap-2 overflow-x-auto overscroll-contain px-2 pt-2 scrollbar-thin">
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
              className="shrink-0 rounded-full border border-wa-divider bg-wa-chip px-3.5 py-1.5 text-sm text-wa-bubble-text shadow-sm active:bg-wa-row-active"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* The three file choosers live HERE, not inside the attach card or the
          idle row: the card closes in the same tap that opens a chooser, and an
          input that is unmounted before its picker answers can lose the answer
          on an Android WebView. */}
      <input
        ref={fileRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handlePickFiles(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
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
        onChange={(e) => handlePickFiles(e.target.files, { fromCamera: true, via: cameraRef })}
      />
      {/* "Choose file" on a request. One file: MDG files one picture or PDF per
          answer, so a picker that took ten would promise pages that never get
          read. A picture goes to the preview like any other; a PDF to a chip. */}
      <input
        ref={askFileRef}
        type="file"
        accept={ASK_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => handlePickFiles(e.target.files, { via: askFileRef })}
      />
      {/* "Choose from gallery" on a request that takes only a photo (a register
          page, a Kavach picture). The camera is not the only way to have one: the
          dealer has often photographed it already. One picture, for the same
          reason as above, and no `capture` — that is what would force the camera. */}
      <input
        ref={askGalleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handlePickFiles(e.target.files, { via: askGalleryRef })}
      />

      {recMode === 'locked' ? (
        <div className="flex items-end gap-1.5 px-2 pt-1.5">
          <div className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 rounded-3xl bg-wa-chip pl-1 pr-4 shadow-sm">
            <button
              type="button"
              aria-label={t('chat.cancelRecording')}
              onClick={cancelLocked}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wa-bar-icon active:bg-wa-row-active"
            >
              <Trash2 width={22} strokeWidth={1.75} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2 text-wa-bubble-text">
              <Lock width={14} strokeWidth={2} className="shrink-0 text-wa-meta" />
              <LiveWaveform
                getLevels={recorder.getLevels}
                active={recorder.status === 'recording'}
                bars={22}
              />
              <span className="shrink-0 text-sm font-medium tabular-nums text-wa-bubble-text">
                {formatDuration(recorder.elapsedMs)}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label={t('chat.sendVoice')}
            onClick={sendLocked}
            disabled={sending}
            className={cn(roundButton, 'disabled:cursor-not-allowed')}
          >
            {sending ? <Spinner size={18} /> : <SendHorizonal width={22} strokeWidth={1.75} />}
          </button>
        </div>
      ) : (
        <div className="relative flex items-end gap-1.5 px-2 pt-1.5">
          {/* One white pill holds the reply quote, the box and the two small
              icons; the round button is OUTSIDE it, as in WhatsApp. */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-wa-chip shadow-sm">
            {replyingTo && recMode === 'idle' ? (
              <div
                aria-label={t('chat.replyingTo', { name: replyingTo.senderLabel })}
                className="m-1.5 mb-0 flex items-center gap-2 rounded-2xl border-l-4 border-wa-accent-strong bg-wa-row-active py-1.5 pl-3 pr-1"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-wa-accent-strong">
                    {replyingTo.senderLabel}
                  </p>
                  <p className="flex items-center gap-1 text-[13px] text-wa-meta">
                    {ReplyIcon ? (
                      <ReplyIcon width={13} strokeWidth={1.75} className="shrink-0" />
                    ) : null}
                    <span className="truncate">{replyingTo.text}</span>
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={t('chat.cancelReply')}
                  onClick={onCancelReply}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-wa-meta active:bg-wa-divider"
                >
                  <X width={16} strokeWidth={2} />
                </button>
              </div>
            ) : null}

            <div className="flex items-end">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  onTyping?.();
                }}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={t('composer.message')}
                className={cn(
                  'min-h-[48px] max-h-[140px] min-w-0 flex-1 resize-none bg-transparent py-3 pl-4 pr-1',
                  'text-base leading-snug text-wa-bubble-text placeholder:text-wa-meta',
                  'focus:outline-none',
                )}
                disabled={disabled}
              />
              <button
                type="button"
                aria-label={t('composer.attach')}
                onClick={() => {
                  forgetPendingAnswer();
                  setAttachOpen(true);
                }}
                className="flex h-12 w-11 shrink-0 items-center justify-center text-wa-bar-icon active:opacity-60 disabled:opacity-40"
                disabled={disabled}
              >
                <Paperclip width={22} strokeWidth={1.75} />
              </button>
              {/* Gone the moment there is a character in the box, as WhatsApp's
                  is: the camera is for starting a message, not finishing one. */}
              {text.length === 0 ? (
                <button
                  type="button"
                  aria-label={t('chat.takePhoto')}
                  onClick={() => {
                    forgetPendingAnswer();
                    cameraRef.current?.click();
                  }}
                  className="flex h-12 w-11 shrink-0 items-center justify-center pr-1 text-wa-bar-icon active:opacity-60 disabled:opacity-40"
                  disabled={disabled}
                >
                  <Camera width={22} strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
          </div>

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
              className={cn(roundButton, 'transition-colors', 'disabled:cursor-not-allowed')}
            >
              {sending ? <Spinner size={18} /> : <SendHorizonal width={22} strokeWidth={1.75} />}
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
                roundButton,
                'relative z-10 touch-none select-none transition-transform',
                recMode === 'hold'
                  ? cancelArmed
                    ? 'scale-110 bg-danger'
                    : 'scale-125'
                  : 'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {recMode === 'hold' && cancelArmed ? (
                <Trash2 width={22} strokeWidth={1.75} />
              ) : (
                <Mic width={22} strokeWidth={1.75} />
              )}
            </button>
          )}

          {/* Press-and-hold overlay: covers the PILL while a finger is down — the
              round button stays out of it, in view and under the finger.
              pointer-events-none so the captured mic button (z-10) keeps every
              pointer event; the mic stays mounted so capture + pointerup survive. */}
          {recMode === 'hold' ? (
            <div className="pointer-events-none absolute bottom-0 left-2 right-[3.875rem] top-1.5 z-0 flex items-center gap-3 rounded-3xl bg-wa-chip px-3 shadow-sm">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  cancelArmed ? 'bg-danger/15 text-danger' : 'text-wa-meta',
                )}
              >
                <Trash2 width={18} strokeWidth={1.75} />
              </span>
              <div className={cn(cancelArmed ? 'text-danger' : 'text-wa-bubble-text')}>
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
              <span className="shrink-0 text-sm font-medium tabular-nums text-wa-bubble-text">
                {formatDuration(recorder.elapsedMs)}
              </span>
              <div
                ref={hintRef}
                className={cn(
                  'ml-auto flex min-w-0 items-center gap-1',
                  cancelArmed ? 'text-danger' : 'text-wa-meta',
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

      {attachOpen ? (
        <AttachSheet onClose={() => setAttachOpen(false)} onChoose={chooseAttachment} />
      ) : null}

      {preview.length > 0 ? (
        <MediaSendPreview
          items={preview}
          initialCaption={text}
          sending={sending}
          onClose={closePreview}
          onRemove={removePreviewed}
          onAddMore={() => galleryRef.current?.click()}
          onSend={sendPreview}
        />
      ) : null}
    </div>
  );
});
