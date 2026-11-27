import { cn } from '@/lib/cn';

export interface ProgressBarProps {
  value: number;
  max: number;
  /** The number in words, always shown: "10 of 12 done". A bar without its number says nothing. */
  text: string;
  /** A tick on the track, with its name ("limit"). `at` is on the same scale as `max`. */
  marker?: { at: number; label: string };
  className?: string;
}

/** A bar and its number. The number is read out; the bar is the shape. */
export function ProgressBar({ value, max, text, marker, className }: ProgressBarProps) {
  const span = max > 0 ? max : 1;
  const pct = Math.min(100, Math.max(0, (value / span) * 100));
  const markerPct = marker ? Math.min(100, Math.max(0, (marker.at / span) * 100)) : null;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(Math.max(value, 0), max)}
        aria-valuetext={marker ? `${text}, ${marker.label}` : text}
        className="relative h-3 w-full overflow-hidden rounded-md bg-surface-2"
      >
        <div className="h-full rounded-md bg-brand" style={{ width: `${pct}%` }} />
        {markerPct !== null ? (
          <div
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-text"
            style={{ left: `${markerPct}%` }}
          />
        ) : null}
      </div>
      <p className="text-meta text-text">
        {text}
        {marker ? <span className="text-text-muted"> · {marker.label}</span> : null}
      </p>
    </div>
  );
}
