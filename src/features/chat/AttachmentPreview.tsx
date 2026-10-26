import { FileText, ImageOff, Mic, Pause, Play, VideoOff, X } from 'lucide-react';
import * as React from 'react';

import { Avatar, Spinner } from '@/components/ui';
import { playableSrc } from '@/features/help/helpView';
import { cn } from '@/lib/cn';
import {
  fetchFreshInlineUrl,
  useAttachmentDownload,
  type AttachmentSource,
} from '@/lib/downloadAttachment';
import { useT } from '@/lib/i18n';
import { formatBytes, formatDuration } from '@/lib/uploadAttachment';
import { useFreshImageSrc } from '@/lib/useFreshImageSrc';
import { WAVEFORM_BARS, pseudoPeaks } from '@/lib/waveform';
import { useAuthStore } from '@/store/auth';
import { isVideoAttachment, type Attachment, type AttachmentKind } from '@dk/shared/types';

import { fileTypeLabel } from './fileKind';
import { FileTypeBadge } from './FileTypeBadge';
import { VoiceTranscript, transcriptOf } from './VoiceTranscript';

export interface StagedFile {
  id: string;
  file: File;
  kind: AttachmentKind;
  /** MIME resolved at pick time (recovers empty Android-WebView File.type). */
  contentType?: string;
  /** Voice-note length in ms; only set for audio. */
  durationMs?: number;
  /** Captured 0..1 waveform peaks for a recorded voice note (local preview). */
  peaks?: number[];
  previewUrl?: string;
}

/**
 * The bars of a voice note. Bars before `progress` (0..1) are drawn dark (played),
 * the rest light. With `onScrub` the whole strip is a slider: press anywhere and
 * drag, and the note follows the finger, the way WhatsApp's does.
 */
function Waveform({
  peaks,
  progress,
  mine,
  knob,
  onScrub,
}: {
  peaks: number[];
  progress: number;
  mine?: boolean;
  /** Draw the round handle at the playhead (the received-note look). */
  knob?: boolean;
  onScrub?: (fraction: number, phase: 'start' | 'move' | 'end') => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const playedIdx = Math.round(progress * peaks.length);

  const fractionOf = (clientX: number): number | null => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onScrub) return;
    const f = fractionOf(e.clientX);
    if (f === null) return;
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer that is already gone cannot be captured; the drag just ends */
    }
    onScrub(f, 'start');
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !onScrub) return;
    const f = fractionOf(e.clientX);
    if (f !== null) onScrub(f, 'move');
  };
  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !onScrub) return;
    dragging.current = false;
    const f = fractionOf(e.clientX);
    if (f !== null) onScrub(f, 'end');
  };

  return (
    <div
      ref={ref}
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      className={cn(
        // `touch-none`: a horizontal drag here is the scrub, never a page scroll.
        // `w-full`, not `flex-1`: it sits in a column, where `flex-1` would grow
        // it by height from a zero basis and the bars would have no room.
        'relative flex h-7 w-full items-center gap-[2px]',
        onScrub ? 'cursor-pointer touch-none' : undefined,
      )}
    >
      {peaks.map((p, i) => (
        <span
          key={i}
          className={cn(
            'w-[2px] shrink-0 rounded-full',
            i < playedIdx
              ? mine
                ? 'bg-wa-bar-icon'
                : 'bg-wa-meta'
              : 'bg-black/20',
          )}
          style={{ height: `${Math.max(14, Math.round(p * 100))}%` }}
        />
      ))}
      {knob ? (
        <span
          className={cn(
            'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full',
            mine ? 'bg-wa-accent' : 'bg-wa-tick-read',
          )}
          style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      ) : null}
    </div>
  );
}

export function StagedAttachmentChip({
  staged,
  onRemove,
}: {
  staged: StagedFile;
  onRemove: () => void;
}) {
  const t = useT();
  if (staged.kind === 'audio') {
    // Prefer the peaks captured live while recording; otherwise a stable
    // pseudo-waveform seeded from the clip id so it never flickers.
    const peaks =
      staged.peaks && staged.peaks.length > 0
        ? staged.peaks
        : pseudoPeaks(staged.id, WAVEFORM_BARS);
    return (
      <div className="group relative flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 pr-8 shadow-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-wa-accent-strong">
          <Mic width={18} strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="w-[132px]">
            <Waveform peaks={peaks} progress={1} />
          </div>
          <p className="text-[11px] text-text-subtle">
            {staged.durationMs
              ? formatDuration(staged.durationMs)
              : t('chat.recorded')}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('chat.removeVoice')}
          className="absolute right-1 top-1 rounded-full p-1 text-text-muted hover:bg-surface-2"
        >
          <X width={12} strokeWidth={2} />
        </button>
      </div>
    );
  }

  const isImage = staged.kind === 'image';
  return (
    <div className="group relative flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 pr-8 shadow-sm">
      {isImage && staged.previewUrl ? (
        <img
          src={staged.previewUrl}
          alt={staged.file.name}
          decoding="async"
          draggable={false}
          className="h-10 w-10 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-text-muted">
          <FileText width={18} strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-text max-w-[140px]">
          {staged.file.name}
        </p>
        <p className="text-[11px] text-text-subtle">
          {formatBytes(staged.file.size)}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('chat.removeAttachment')}
        className="absolute right-1 top-1 rounded-full p-1 text-text-muted hover:bg-surface-2"
      >
        <X width={12} strokeWidth={2} />
      </button>
    </div>
  );
}

// ── Voice notes ───────────────────────────────────────────────────────────

const PLAYBACK_RATES = [1, 1.5, 2] as const;

/**
 * Module-level on purpose: only ONE voice note plays at a time, as in WhatsApp,
 * and the notes are separate components with no common parent that could hold
 * the rule. The second note to start silences the first.
 */
let playingElement: HTMLAudioElement | null = null;
/** The speed the dealer last chose sticks to the next note, as it does there. */
let chosenRate: (typeof PLAYBACK_RATES)[number] = 1;
/** Notes started during this session — the mic on a received one turns blue. */
const playedKeys = new Set<string>();

function rateLabel(rate: number): string {
  return `${rate}×`;
}

/** Inline player for a voice note, laid out like WhatsApp's. */
export function VoiceMessage({
  attachment,
  mine,
  senderName,
  source,
}: {
  attachment: Attachment;
  mine?: boolean;
  senderName?: string;
  /** The message it is in: how a link that is missing or stale gets replaced. */
  source?: AttachmentSource;
}) {
  const t = useT();
  // A note of mine has no `senderName` on it (the optimistic copy never had one),
  // and an avatar with "?" in it is not a good look for the dealer's own voice.
  const myName = useAuthStore((s) => s.user?.name);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const noteKey = attachment.storageKey || attachment.filename;
  const [src, setSrc] = React.useState(attachment.url);
  const [playing, setPlaying] = React.useState(false);
  const [currentMs, setCurrentMs] = React.useState(0);
  const [loadedMs, setLoadedMs] = React.useState<number | null>(null);
  const [rate, setRate] = React.useState<number>(chosenRate);
  const [played, setPlayed] = React.useState(() => playedKeys.has(noteKey));
  const [failed, setFailed] = React.useState(false);
  // This phone has no player for the kind of recording the note is. Not a stale
  // link, and no link can fix it, so it is kept apart from `failed`.
  const [unplayable, setUnplayable] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // Set when the dealer pressed play before there was a link: play as soon as
  // the link we asked for arrives.
  const playWhenReady = React.useRef(false);
  const refreshed = React.useRef(false);
  const wasPlayingBeforeScrub = React.useRef(false);

  // Prefer the duration we recorded; fall back to the media element's metadata.
  const totalMs = attachment.durationMs ?? loadedMs ?? 0;
  const progress = totalMs > 0 ? Math.min(1, currentMs / totalMs) : 0;

  // The wire Attachment carries no waveform peaks, so sent notes render a stable
  // pseudo-waveform seeded from the storageKey (deterministic — no flicker).
  const peaks = React.useMemo(
    () => pseudoPeaks(attachment.storageKey || attachment.filename, WAVEFORM_BARS),
    [attachment.storageKey, attachment.filename],
  );

  React.useEffect(() => {
    setSrc(attachment.url);
    setFailed(false);
    setUnplayable(false);
    refreshed.current = false;
  }, [attachment.url]);

  /**
   * Whether the phone's own player says it can never play this kind of
   * recording. An older iPhone cannot play WebM, which is what an Android phone
   * records; asking again for a fresh link, which is all "Tap to try again" can
   * do, would loop on 2G for nothing. Only read AFTER something failed: the
   * player reports `''` for a type it does not know, and a note that is fine
   * must never be called unplayable on a guess.
   */
  const phoneCannotPlay = React.useCallback((): boolean => {
    const el = audioRef.current;
    const type = attachment.contentType;
    return !!el && !!type && el.canPlayType(type) === '';
  }, [attachment.contentType]);

  /** `play()` was refused: say which of the two things it was. */
  const playFailed = React.useCallback(() => {
    if (phoneCannotPlay()) setUnplayable(true);
    else setFailed(true);
  }, [phoneCannotPlay]);

  // Strip the OS "cast / AirPlay" route from this hidden <audio> so a private
  // voice note can't surface a Now-Playing tile or be sent to a nearby device.
  // Done imperatively (not via native controls, which would re-expose a
  // download / context menu on the element).
  React.useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    (el as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback =
      true;
    el.setAttribute('x-webkit-airplay', 'deny');
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    return () => {
      // Leaving the screen stops the note, and frees the "who is playing" slot.
      if (playingElement === el) {
        el.pause();
        playingElement = null;
      }
    };
  }, []);

  // Play the moment a requested link lands.
  React.useEffect(() => {
    if (!src || !playWhenReady.current) return;
    playWhenReady.current = false;
    void audioRef.current?.play().catch(playFailed);
  }, [src, playFailed]);

  /** One fresh link through the message; after that the dealer asks again. */
  const askForLink = React.useCallback(async (): Promise<boolean> => {
    if (!source || source.messageId.startsWith('temp-')) return false;
    setBusy(true);
    try {
      setSrc(await fetchFreshInlineUrl(attachment, source));
      setFailed(false);
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }, [attachment, source]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el || busy) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    // Nothing a fresh link can change: leave the message where it is.
    if (unplayable) return;
    if (!src || failed) {
      playWhenReady.current = true;
      refreshed.current = true;
      void askForLink().then((ok) => {
        if (!ok) playWhenReady.current = false;
      });
      return;
    }
    void el.play().catch(playFailed);
  };

  const cycleRate = () => {
    const el = audioRef.current;
    const next =
      PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]) + 1) % PLAYBACK_RATES.length]!;
    chosenRate = next;
    setRate(next);
    if (el) el.playbackRate = next;
  };

  const scrub = (fraction: number, phase: 'start' | 'move' | 'end') => {
    const el = audioRef.current;
    if (!el || totalMs <= 0) return;
    if (phase === 'start') {
      wasPlayingBeforeScrub.current = !el.paused;
      // Hold the note still while the finger is on the bar, then carry on.
      if (!el.paused) el.pause();
    }
    el.currentTime = (fraction * totalMs) / 1000;
    setCurrentMs(fraction * totalMs);
    if (phase === 'end' && wasPlayingBeforeScrub.current) {
      wasPlayingBeforeScrub.current = false;
      void el.play().catch(playFailed);
    }
  };

  const avatar = (
    <span className="relative shrink-0">
      <Avatar name={mine ? (senderName ?? myName) : senderName} size={40} />
      <span
        className={cn(
          'absolute -bottom-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-wa-chip',
          mine ? '-right-0.5' : '-left-0.5',
          // A received note's mic turns blue once it has been played.
          !mine && played ? 'text-wa-tick-read' : 'text-wa-meta',
        )}
        data-testid="voice-mic"
        data-played={played ? 'true' : 'false'}
      >
        <Mic width={12} strokeWidth={2.25} />
      </span>
    </span>
  );

  // While a note plays, its speed pill takes the avatar's place.
  const sideSlot = playing ? (
    <button
      type="button"
      onClick={cycleRate}
      aria-label={t('chat.voiceSpeed', { rate: rateLabel(rate) })}
      className="flex h-10 min-w-[40px] shrink-0 items-center justify-center rounded-full bg-black/10 px-2 text-[13px] font-semibold tabular-nums text-wa-bar-icon"
    >
      {rateLabel(rate)}
    </button>
  ) : (
    avatar
  );

  // What the note says, once MDG has listened to it: under the player, not part of it.
  const transcript = transcriptOf(attachment);

  return (
    <>
      <div className="flex w-[min(68vw,264px)] items-center gap-2 py-1">
        {mine ? null : sideSlot}
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t('chat.pauseVoice') : t('chat.playVoice')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-wa-bar-icon"
        >
          {busy ? (
            <Spinner size={20} />
          ) : playing ? (
            <Pause width={24} strokeWidth={0} fill="currentColor" />
          ) : (
            <Play width={24} strokeWidth={0} fill="currentColor" />
          )}
        </button>
        {/* data-no-swipe: dragging the scrubber must never engage the
            swipe-to-reply gesture on the row. */}
        <div data-no-swipe className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Waveform peaks={peaks} progress={progress} mine={mine} knob onScrub={scrub} />
          <span
            className={cn(
              'text-[11px] tabular-nums',
              failed || unplayable ? 'text-danger' : 'text-wa-meta',
              unplayable && 'leading-tight',
            )}
          >
            {unplayable
              ? t('chat.voiceUnplayable')
              : failed
                ? t('chat.voiceFailed')
                : formatDuration(playing || currentMs > 0 ? currentMs : totalMs)}
          </span>
        </div>
        {mine ? sideSlot : null}
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={(e) => {
            const el = e.currentTarget;
            if (playingElement && playingElement !== el) playingElement.pause();
            playingElement = el;
            el.playbackRate = chosenRate;
            setRate(chosenRate);
            playedKeys.add(noteKey);
            setPlayed(true);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onEnded={(e) => {
            setPlaying(false);
            setCurrentMs(0);
            if (playingElement === e.currentTarget) playingElement = null;
          }}
          onError={() => {
            // A kind of recording this phone cannot play is not a stale link:
            // say so at once instead of fetching links that cannot help.
            if (phoneCannotPlay()) {
              setUnplayable(true);
              return;
            }
            // A stale link: ask once for a fresh one, then say so in words.
            if (!refreshed.current && source) {
              refreshed.current = true;
              void askForLink();
            } else {
              setFailed(true);
            }
          }}
          onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setLoadedMs(d * 1000);
          }}
          className="hidden"
        />
      </div>
      {transcript ? <VoiceTranscript text={transcript} /> : null}
    </>
  );
}

// ── Pictures ──────────────────────────────────────────────────────────────

/** The tallest a picture bubble grows (px). */
const MEDIA_MAX_H = 330;
/** What shape to reserve before the picture says what shape it is. */
const DEFAULT_RATIO = 1;
/** A very tall or very wide picture is cropped to these, as in WhatsApp. */
const MIN_RATIO = 0.6;
const MAX_RATIO = 2;

/**
 * Shapes already measured. A picture that scrolls out of the list and back in
 * (or whose row is rebuilt) starts at its real shape instead of at the default
 * and jumping — the box is reserved correctly the second time round.
 */
const knownRatios = new Map<string, number>();

function clampRatio(r: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
}

interface TileProps {
  attachment: Attachment;
  source: AttachmentSource;
  onOpen?: () => void;
  /** Inside an album the tile fills its cell; on its own it sizes itself from the picture. */
  fill?: boolean;
  /** "+N" drawn over the last tile of an album that holds more than it shows. */
  more?: number;
}

/**
 * One picture, drawn like WhatsApp's: sized by its own shape, a soft grey box
 * while it loads, a word and a retry when it will not.
 *
 * A link that goes stale is replaced once by `useFreshImageSrc`. A picture that
 * arrives with NO link at all — the live copy of a shared report, signed on the
 * next read but not on the way in — is asked for straight away, so it shows as a
 * picture and never as a file row.
 */
function ImageTile({ attachment, source, onOpen, fill, more }: TileProps) {
  const t = useT();
  const { src, refreshing, failed, onError, retry } = useFreshImageSrc(attachment, source);
  const unsent = source.messageId.startsWith('temp-');
  const uploading = attachment.storageKey.startsWith('local:');

  const asked = React.useRef(false);
  React.useEffect(() => {
    if (attachment.url || unsent || asked.current) return;
    asked.current = true;
    onError();
  }, [attachment.url, unsent, onError]);

  const [ratio, setRatio] = React.useState<number | undefined>(() =>
    knownRatios.get(attachment.storageKey),
  );

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (fill || !img.naturalWidth || !img.naturalHeight) return;
    const r = clampRatio(img.naturalWidth / img.naturalHeight);
    knownRatios.set(attachment.storageKey, r);
    if (knownRatios.size > 500) {
      // A long session can look at thousands of pictures; the oldest are the ones
      // least likely to scroll back into view.
      const oldest = knownRatios.keys().next().value;
      if (oldest !== undefined) knownRatios.delete(oldest);
    }
    setRatio((prev) => (prev === r ? prev : r));
  };

  const showFailed = failed && !refreshing;

  return (
    <button
      type="button"
      onClick={showFailed ? retry : onOpen}
      aria-label={showFailed ? t('chat.imageTapToRetry') : attachment.filename}
      className={cn(
        'relative block overflow-hidden bg-black/[0.06]',
        fill ? 'h-full w-full' : 'w-full rounded-md',
      )}
      style={
        fill
          ? undefined
          : { aspectRatio: String(ratio ?? DEFAULT_RATIO), maxHeight: MEDIA_MAX_H }
      }
    >
      {src && !showFailed ? (
        <img
          src={src}
          alt={attachment.filename}
          loading="lazy"
          decoding="async"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onLoad={handleLoad}
          onError={onError}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {showFailed ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-wa-meta">
          <ImageOff width={fill ? 20 : 26} strokeWidth={1.5} />
          {fill ? null : (
            <span className="text-[12px] leading-tight">{t('chat.imageTapToRetry')}</span>
          )}
        </span>
      ) : refreshing || (!src && !unsent) ? (
        // Waiting for a link to be signed: a spinner in the grey box. A picture
        // that has its link just loads into the box, which is already the right shape.
        <span className="absolute inset-0 flex items-center justify-center text-wa-meta">
          <Spinner size={18} />
        </span>
      ) : null}
      {uploading ? (
        // A picture still being sent: a dark veil and a spinner, like WhatsApp's
        // progress ring, so a slow upload on 2G reads as "sending", not "stuck".
        <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
          <Spinner size={26} />
        </span>
      ) : null}
      {more && more > 0 ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[26px] font-medium text-white">
          +{more}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The pictures of one message: one alone, or WhatsApp's album — two side by side,
 * three as one tall and two stacked, four or more as a 2×2 with "+N" over the
 * fourth. Tapping any of them opens the viewer at that picture.
 */
function ImageAlbum({
  images,
  source,
  onOpenImage,
}: {
  images: Attachment[];
  source: AttachmentSource;
  onOpenImage?: (attachment: Attachment) => void;
}) {
  if (images.length === 1) {
    const only = images[0]!;
    return (
      <ImageTile
        attachment={only}
        source={source}
        onOpen={() => onOpenImage?.(only)}
      />
    );
  }
  const shown = images.slice(0, 4);
  const hidden = images.length - shown.length;
  const layout =
    shown.length === 2
      ? 'grid-cols-2 grid-rows-1 [aspect-ratio:2/1]'
      : 'grid-cols-2 grid-rows-2 [aspect-ratio:1/1]';
  return (
    <div
      data-testid="album"
      data-count={images.length}
      className={cn(
        'grid w-full gap-[2px] overflow-hidden rounded-md bg-wa-chip',
        layout,
      )}
      style={{ maxHeight: MEDIA_MAX_H }}
    >
      {shown.map((a, i) => (
        <div
          // By position, not by storage key: a photo that was just sent changes its
          // key when the server confirms it, and a tile keyed on it would be torn
          // down and rebuilt — the picture would blink in every cell of the album.
          key={i}
          className={cn('relative min-h-0 min-w-0', shown.length === 3 && i === 0 && 'row-span-2')}
        >
          <ImageTile
            attachment={a}
            source={source}
            fill
            onOpen={() => onOpenImage?.(a)}
            more={i === 3 ? hidden : undefined}
          />
        </div>
      ))}
    </div>
  );
}

// ── Videos ────────────────────────────────────────────────────────────────

/** The tallest a video bubble grows: a portrait clip must not fill a short phone. */
const VIDEO_MAX_H = 'min(72vh, 560px)';

/**
 * A video plays in the bubble: portrait box, black behind it, the phone's own
 * controls, its length in a chip until it starts. The first frame is the poster
 * (`#t=0.1`), so a guide video shows what it is without a download.
 *
 * A video the assistant picked for a question carries `startSec`: the chapter that
 * answers it. It opens there (`#t=<second>`), and a phone that ignores the fragment
 * is moved once the video's length is known, so the dealer lands on the answer and
 * not on the start of a minute-long film.
 *
 * Its link is signed and goes stale, exactly as a voice note's does, and is
 * replaced the same way: a clip that arrives with NO link is asked for at once,
 * one that stops loading is asked for once more, and after that the box says so
 * in words and a tap tries again.
 */
export function VideoMessage({
  attachment,
  source,
}: {
  attachment: Attachment;
  /** The message it is in: how a link that is missing or stale gets replaced. */
  source?: AttachmentSource;
}) {
  const t = useT();
  const [src, setSrc] = React.useState(attachment.url);
  const [started, setStarted] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const refreshed = React.useRef(false);
  const asked = React.useRef(false);
  const failedNow = React.useRef(false);
  failedNow.current = failed;
  const unsent = !source || source.messageId.startsWith('temp-');
  // Where it opens: the chapter the assistant matched, else the first frame.
  const startAt = attachment.startSec && attachment.startSec > 0 ? attachment.startSec : 0;
  const startApplied = React.useRef(false);

  // A WORKING PLAYER KEEPS ITS LINK. Every refetch of the thread (a socket
  // reconnect on 2G, reopening the chat) brings the same video back with a newly
  // signed link, and swapping it in restarted a guide video from 0:00 halfway
  // through. A new link is taken only when there is none yet or the old one failed.
  React.useEffect(() => {
    if (!attachment.url) return;
    if (failedNow.current) {
      setSrc(attachment.url);
      setFailed(false);
      refreshed.current = false;
      return;
    }
    setSrc((cur) => cur ?? attachment.url);
  }, [attachment.url]);

  /** One fresh link through the message. */
  const askForLink = React.useCallback(async (): Promise<void> => {
    if (!source || source.messageId.startsWith('temp-')) return;
    setBusy(true);
    try {
      setSrc(await fetchFreshInlineUrl(attachment, source));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [attachment, source]);

  // A video that arrives with no link at all (the live copy of a message, signed
  // on the next read) is asked for straight away.
  React.useEffect(() => {
    if (attachment.url || unsent || asked.current) return;
    asked.current = true;
    refreshed.current = true;
    void askForLink();
  }, [attachment.url, unsent, askForLink]);

  const retry = () => {
    refreshed.current = true;
    void askForLink();
  };

  // The fragment is added here, never stored: a link that already has one is left alone.
  const playable = src ? playableSrc(src, startAt) : undefined;
  const waiting = !playable && !failed && !unsent;

  return (
    <div
      data-testid="video-message"
      // The player's own controls take the touch: dragging the seek bar must not
      // start a swipe-to-reply, nor a long press select the message — the same
      // protection the voice note's scrubber and the login box have.
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      className="relative w-full overflow-hidden rounded-md bg-black"
      style={{ aspectRatio: '9 / 16', maxHeight: VIDEO_MAX_H }}
    >
      {playable ? (
        <video
          src={playable}
          controls
          playsInline
          preload="metadata"
          disablePictureInPicture
          controlsList="nodownload noremoteplayback"
          aria-label={attachment.filename}
          onPlay={() => setStarted(true)}
          onLoadedMetadata={(e) => {
            // A WebView that ignored `#t=`: move it to the chapter, once. The
            // half-second slack leaves a phone that did honour it alone.
            const v = e.currentTarget;
            if (startAt > 0 && !startApplied.current && v.currentTime < startAt - 0.5) {
              startApplied.current = true;
              v.currentTime = startAt;
            }
          }}
          onError={() => {
            // A stale link: ask once for a fresh one, then say so in words.
            if (!refreshed.current && source) {
              refreshed.current = true;
              void askForLink();
            } else {
              setFailed(true);
            }
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}
      {attachment.durationMs && !started && !failed ? (
        <span
          data-testid="video-duration"
          className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[12px] tabular-nums leading-tight text-white"
        >
          {formatDuration(attachment.durationMs)}
        </span>
      ) : null}
      {failed ? (
        <button
          type="button"
          onClick={retry}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black px-3 text-center text-white/80"
        >
          <VideoOff width={28} strokeWidth={1.5} aria-hidden />
          <span className="text-[13px] leading-tight">{t('chat.voiceFailed')}</span>
        </button>
      ) : waiting || busy || (!playable && unsent) ? (
        <span className="absolute inset-0 flex items-center justify-center text-white/80">
          <Spinner size={22} />
        </span>
      ) : null}
    </div>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────

/**
 * A document in a bubble: the coloured type badge, the name over two lines, and
 * "PDF · 1.2 MB" under it.
 *
 * A button rather than a link, and the same download path the action sheet and
 * the Docs tab use. As an `<a href={attachment.url}>` it pointed at the same
 * 900-second signature the picture above does: tapping a PDF that had been in
 * the thread for a quarter of an hour left the app and landed the dealer on an
 * S3 page reading "Request has expired" — while the identical file, opened from
 * the Docs tab two taps away, downloaded fine. Presigning at tap time removes
 * the difference, and hands the native shell its gallery/browser split and its
 * failure toast for nothing.
 */
function DocumentAttachment({
  attachment,
  source,
}: {
  attachment: Attachment;
  source?: AttachmentSource;
}) {
  const download = useAttachmentDownload();
  const unsent = !source || source.messageId.startsWith('temp-');
  return (
    <button
      type="button"
      disabled={unsent}
      onClick={() => source && void download(attachment, source)}
      className="flex w-full items-center gap-3 rounded-md bg-black/[0.06] px-2.5 py-2 text-left active:bg-black/10 disabled:opacity-70"
    >
      <FileTypeBadge filename={attachment.filename} contentType={attachment.contentType} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-[14px] leading-snug text-wa-bubble-text">
          {attachment.filename}
        </span>
        <span className="block text-[12px] text-wa-meta">
          {fileTypeLabel(attachment.filename, attachment.contentType)} ·{' '}
          {formatBytes(attachment.size)}
        </span>
      </span>
    </button>
  );
}

// ── One message's attachments ─────────────────────────────────────────────

export interface SplitAttachments {
  images: Attachment[];
  voices: Attachment[];
  /** Anything whose type is video: played in the bubble, never a download row. */
  videos: Attachment[];
  docs: Attachment[];
}

/**
 * Sort a message's attachments into what is drawn how. An image is an image
 * whether or not it came with a link, a voice note is a voice note, and a video
 * is a video: none of them ever falls back to a file row.
 */
export function splitAttachments(attachments: readonly Attachment[]): SplitAttachments {
  const out: SplitAttachments = { images: [], voices: [], videos: [], docs: [] };
  for (const a of attachments) {
    if (a.kind === 'image') out.images.push(a);
    else if (a.kind === 'audio') out.voices.push(a);
    // A video is a file by `kind` (there is no video kind on the wire); its
    // content type is what says it plays.
    else if (isVideoAttachment(a)) out.videos.push(a);
    else out.docs.push(a);
  }
  return out;
}

export function AttachmentStack({
  attachments,
  mine,
  senderName,
  source,
  onOpenImage,
  mediaOverlay,
}: {
  attachments: readonly Attachment[];
  mine: boolean;
  senderName?: string;
  /** The message carrying them — how a stale or missing link gets re-signed. */
  source: AttachmentSource;
  onOpenImage?: (attachment: Attachment) => void;
  /** Drawn over the pictures' bottom-right corner: the time, when there is no caption. */
  mediaOverlay?: React.ReactNode;
}) {
  const { images, voices, videos, docs } = splitAttachments(attachments);
  return (
    <>
      {images.length > 0 ? (
        <div className="relative">
          <ImageAlbum images={images} source={source} onOpenImage={onOpenImage} />
          {mediaOverlay}
        </div>
      ) : null}
      {voices.map((a, i) => (
        <VoiceMessage
          key={`v-${i}`}
          attachment={a}
          mine={mine}
          senderName={senderName}
          source={source}
        />
      ))}
      {videos.map((a, i) => (
        <VideoMessage key={`vid-${i}`} attachment={a} source={source} />
      ))}
      {docs.map((a, i) => (
        <DocumentAttachment key={`d-${i}`} attachment={a} source={source} />
      ))}
    </>
  );
}
