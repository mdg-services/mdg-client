import { FileText, Mic, Pause, Play, X } from 'lucide-react';
import * as React from 'react';

import type { Attachment, AttachmentKind } from '@dk/shared/types';

import { cn } from '@/lib/cn';
import { formatBytes, formatDuration } from '@/lib/uploadAttachment';

export interface StagedFile {
  id: string;
  file: File;
  kind: AttachmentKind;
  /** Voice-note length in ms; only set for audio. */
  durationMs?: number;
  previewUrl?: string;
}

export function StagedAttachmentChip({
  staged,
  onRemove,
}: {
  staged: StagedFile;
  onRemove: () => void;
}) {
  if (staged.kind === 'audio') {
    return (
      <div className="group relative flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 pr-8 shadow-sm">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Mic width={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text">Voice message</p>
          <p className="text-[11px] text-text-subtle">
            {staged.durationMs ? formatDuration(staged.durationMs) : 'Recorded'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove voice message"
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
        aria-label="Remove attachment"
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
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentMs, setCurrentMs] = React.useState(0);
  const [loadedMs, setLoadedMs] = React.useState<number | null>(null);

  // Prefer the duration we recorded; fall back to the media element's metadata.
  const totalMs = attachment.durationMs ?? loadedMs ?? 0;
  const progress = totalMs > 0 ? Math.min(100, (currentMs / totalMs) * 100) : 0;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
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
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
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
      <div className="flex min-w-[120px] flex-1 flex-col gap-1">
        <div
          className={cn(
            'h-1.5 w-full overflow-hidden rounded-full',
            mine ? 'bg-white/25' : 'bg-surface-2',
          )}
        >
          <div
            className={cn('h-full rounded-full', mine ? 'bg-white' : 'bg-brand')}
            style={{ width: `${progress}%` }}
          />
        </div>
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
        className="block overflow-hidden rounded-xl border border-border"
      >
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="max-h-72 w-auto max-w-full object-cover"
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
