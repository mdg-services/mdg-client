import { FileText, Mic, Pause, Play, X } from 'lucide-react';
import * as React from 'react';

import type { Attachment, AttachmentKind } from '@dk/shared/types';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { formatBytes, formatDuration } from '@/lib/uploadAttachment';
import { WAVEFORM_BARS, pseudoPeaks } from '@/lib/waveform';

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
 * Static waveform: a row of bars whose heights come from `peaks`. Bars before
 * `progress` (0..1) render in the accent colour (played), the rest are muted.
 * When `onSeek` is provided, clicking scrubs to that fraction.
 */
function Waveform({
  peaks,
  progress,
  mine,
  onSeek,
}: {
  peaks: number[];
  progress: number;
  mine?: boolean;
  onSeek?: (fraction: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const playedIdx = Math.round(progress * peaks.length);
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek(frac);
  };
  return (
    <div
      ref={ref}
      aria-hidden
      onClick={handleClick}
      className={cn(
        'flex h-6 flex-1 items-center gap-[2px]',
        onSeek ? 'cursor-pointer' : undefined,
      )}
    >
      {peaks.map((p, i) => (
        <span
          key={i}
          className={cn(
            'w-[2px] shrink-0 rounded-full',
            i < playedIdx
              ? mine
                ? 'bg-white'
                : 'bg-brand'
              : mine
                ? 'bg-white/35'
                : 'bg-surface-2',
          )}
          style={{ height: `${Math.max(12, Math.round(p * 100))}%` }}
        />
      ))}
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
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
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

/** Inline audio player for a received voice note. */
export function VoiceMessage({
  attachment,
  mine,
}: {
  attachment: Attachment;
  mine?: boolean;
}) {
  const t = useT();
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentMs, setCurrentMs] = React.useState(0);
  const [loadedMs, setLoadedMs] = React.useState<number | null>(null);

  // Prefer the duration we recorded; fall back to the media element's metadata.
  const totalMs = attachment.durationMs ?? loadedMs ?? 0;
  const progress = totalMs > 0 ? Math.min(1, currentMs / totalMs) : 0;

  // The wire Attachment carries no waveform peaks, so sent notes render a stable
  // pseudo-waveform seeded from the storageKey (deterministic — no flicker).
  const peaks = React.useMemo(
    () => pseudoPeaks(attachment.storageKey || attachment.filename, WAVEFORM_BARS),
    [attachment.storageKey, attachment.filename],
  );

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
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  };

  const seek = (fraction: number) => {
    const el = audioRef.current;
    if (!el || totalMs <= 0) return;
    el.currentTime = (fraction * totalMs) / 1000;
    setCurrentMs(fraction * totalMs);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl px-3 py-2.5 shadow-sm',
        mine
          ? 'bg-brand text-text-inverse'
          : 'bg-surface text-text border border-border',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('chat.pauseVoice') : t('chat.playVoice')}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          mine ? 'bg-white/20 text-text-inverse' : 'bg-brand/10 text-brand',
        )}
      >
        {playing ? (
          <Pause width={16} strokeWidth={2} />
        ) : (
          <Play width={16} strokeWidth={2} className="translate-x-[1px]" />
        )}
      </button>
      <div className="flex min-w-[132px] flex-1 flex-col gap-1">
        <Waveform peaks={peaks} progress={progress} mine={mine} onSeek={seek} />
        <span
          className={cn(
            'text-[11px] tabular-nums',
            mine ? 'text-white/80' : 'text-text-subtle',
          )}
        >
          {formatDuration(playing || currentMs > 0 ? currentMs : totalMs)}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={attachment.url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentMs(0);
        }}
        onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setLoadedMs(d * 1000);
        }}
        className="hidden"
      />
    </div>
  );
}

export function MessageAttachment({
  attachment,
  mine,
  onOpenImage,
}: {
  attachment: Attachment;
  mine?: boolean;
  onOpenImage?: (url: string) => void;
}) {
  if (attachment.kind === 'audio' && attachment.url) {
    return <VoiceMessage attachment={attachment} mine={mine} />;
  }
  if (attachment.kind === 'image' && attachment.url) {
    return (
      <button
        type="button"
        onClick={() => onOpenImage?.(attachment.url!)}
        className="block overflow-hidden rounded-xl border border-border bg-surface-2"
      >
        {/* lazy + async decode keeps image-heavy threads from janking / spiking
            memory; min height reserves space so late-loading images don't shift
            the scroll position. */}
        <img
          src={attachment.url}
          alt={attachment.filename}
          loading="lazy"
          decoding="async"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="max-h-72 min-h-[6rem] w-auto max-w-full object-cover"
        />
      </button>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface"
    >
      <FileText width={18} strokeWidth={1.75} className="text-text-muted" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-text max-w-[200px]">
          {attachment.filename}
        </span>
        <span className="text-[11px] text-text-subtle">
          {formatBytes(attachment.size)}
        </span>
      </span>
    </a>
  );
}
