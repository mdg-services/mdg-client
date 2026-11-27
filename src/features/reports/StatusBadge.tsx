import type { ReactElement } from 'react';

import type { Lang } from '@/store/lang';
import { AGING_REPORT_KINDS } from '@dk/shared';
import type { ReportKind } from '@dk/shared/types';

import { sayWords, type ReportStatusKey, type Words } from './types';

/**
 * How a report stands (ADR 0056 §2). Five different outlines, each with its own word, so a
 * dealer in sunlight or one who cannot tell red from green reads it from the SHAPE first:
 *
 *   problem    octagon with !        "Problem"        #b91c1c  (white on it 6.5:1)
 *   attention  triangle with !       "Needs a look"   #92400e  (7.1:1)
 *   waiting    clock                 "We are on it"   #1d4ed8  (6.7:1)
 *   ok         circle with a tick    "All fine"       #166534  (7.1:1)
 *   info       circle with i         "Info"           #475569  (7.6:1)
 *
 * The status colour never swaps roles with the family colour: a navy header with a red
 * Problem badge is a DSR problem; a red header never exists. The same hex values are the
 * Tailwind tokens `status-problem`, `status-attention`, `status-waiting`, `status-ok` and
 * `status-info` (each with `-soft` and `-ink`). Light colours only: the app has no dark mode (ADR 0060).
 */

export interface StatusStyle {
  /** The badge fill; white text and shape on it. */
  color: string;
  /** The tint of an alert card or a banner. */
  soft: string;
  /** The word beside the shape. */
  word: Words;
}

export const STATUS_STYLE: Record<ReportStatusKey, StatusStyle> = {
  problem: {
    color: '#b91c1c',
    soft: '#fee2e2',
    word: { hi: 'समस्या', hl: 'Problem', en: 'Problem' },
  },
  attention: {
    color: '#92400e',
    soft: '#fef3c7',
    word: { hi: 'ध्यान दें', hl: 'Dhyan dein', en: 'Needs a look' },
  },
  waiting: {
    color: '#1d4ed8',
    soft: '#dbeafe',
    word: { hi: 'हम देख रहे हैं', hl: 'Hum dekh rahe hain', en: 'We are on it' },
  },
  ok: {
    color: '#166534',
    soft: '#dcfce7',
    word: { hi: 'सब ठीक', hl: 'Sab theek', en: 'All fine' },
  },
  info: {
    color: '#475569',
    soft: '#e2e8f0',
    word: { hi: 'जानकारी', hl: 'Jaankari', en: 'Info' },
  },
};

/** The word for a status, in the reader's language (for a screen reader label or a plain-text share). */
export function statusWord(status: ReportStatusKey, lang: Lang): string {
  return sayWords(STATUS_STYLE[status].word, lang);
}

/**
 * The report's own three-way tag (`ok` / `attention` / `info`) as the badge's five. A
 * report only ever says the three; `problem` and `waiting` come from a kind's own tile,
 * alert or banner.
 */
export function statusFromTag(tag: 'ok' | 'attention' | 'info'): ReportStatusKey {
  return tag;
}

/**
 * How ONE report stands, for every screen that draws it (the Services hub rows, the Reports list and
 * the open report): an old alarm of the kinds the server ages out (status turned to plain
 * information) is information first, whatever its frozen snapshot still says; then the kind's own
 * alert; then the report's tag. Today reads the same aging rule through `isAgedAlarm`. Keeping the
 * order here means a day-old water check cannot say "Needs a look" in the overlay and "Info" in the list.
 */
export function reportVerdict(
  report: { kind: ReportKind; status: 'ok' | 'attention' | 'info' },
  alert: { severity: 'problem' | 'attention' } | null | undefined,
): ReportStatusKey {
  if (AGING_REPORT_KINDS.has(report.kind) && report.status === 'info') return 'info';
  if (alert) return alert.severity;
  return statusFromTag(report.status);
}

/** The silhouette inside a 20 x 20 box, drawn in one colour: the outline, a faint fill, the mark. */
function Shape({ status, c }: { status: ReportStatusKey; c: string }): ReactElement {
  const common = { fill: 'none', stroke: c, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const body = { fill: c, fillOpacity: 0.12, stroke: c, strokeWidth: 1.6, strokeLinejoin: 'round' } as const;
  switch (status) {
    case 'problem':
      // Octagon, with an exclamation mark.
      return (
        <>
          <polygon points="7,1.5 13,1.5 18.5,7 18.5,13 13,18.5 7,18.5 1.5,13 1.5,7" {...body} />
          <path d="M10 5.5v5.5" {...common} />
          <circle cx="10" cy="14" r="1.1" fill={c} />
        </>
      );
    case 'attention':
      // Triangle, with an exclamation mark.
      return (
        <>
          <polygon points="10,2 18.5,17 1.5,17" {...body} />
          <path d="M10 7.5v4.2" {...common} />
          <circle cx="10" cy="14.4" r="1" fill={c} />
        </>
      );
    case 'waiting':
      // Round clock face.
      return (
        <>
          <circle cx="10" cy="10" r="8" {...body} />
          <path d="M10 5.5V10l3 2" {...common} />
        </>
      );
    case 'ok':
      // Round, with a tick.
      return (
        <>
          <circle cx="10" cy="10" r="8" {...body} />
          <path d="M6 10.4l2.8 2.8L14 7.6" {...common} />
        </>
      );
    case 'info':
      // Round, with the letter i.
      return (
        <>
          <circle cx="10" cy="10" r="8" {...body} />
          <circle cx="10" cy="6.4" r="1.2" fill={c} />
          <path d="M10 9.4v5" {...common} />
        </>
      );
  }
}

/**
 * The status shape alone, in the status's ink, for a line of text that already says the word.
 * `size` is the size at normal text; a parent that sets `[&>svg]:h-[1.25em] [&>svg]:w-[1.25em]`
 * (the kit's `StatusPill` does) makes it grow with the text.
 */
export function StatusShape({ status, size = 20 }: { status: ReportStatusKey; size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="shrink-0">
      <Shape status={status} c={`var(--status-${status}-ink)`} />
    </svg>
  );
}

export interface StatusBadgeProps {
  status: ReportStatusKey;
  lang: Lang;
  /** Replaces the standard word ("Short", "Overdue"), which is still the only thing said in words. */
  word?: string;
  /** False draws the shape alone, with the word as its accessible name. Default true. */
  showWord?: boolean;
  className?: string;
}

/**
 * A quiet tag: the shape, then the word, in the status's ink on its pale tint (every pair
 * is at least 5.5:1). Secondary size (`text-meta`, 14 px) semibold; the shape grows with the
 * word and the word wraps rather than shrinks at 200% text. Not a button (no tap target of its own).
 */
export function StatusBadge({ status, lang, word, showWord = true, className = '' }: StatusBadgeProps): ReactElement {
  const style = STATUS_STYLE[status];
  const text = word ?? sayWords(style.word, lang);
  const svg = (
    // The width and height attributes are the fallback; the em sizes win, so the shape grows with the
    // word at 200% text instead of staying a small mark beside large letters.
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className="h-[1.25em] w-[1.25em] shrink-0"
    >
      <Shape status={status} c="currentColor" />
    </svg>
  );
  const tone = { backgroundColor: `var(--status-${status}-soft)`, color: `var(--status-${status}-ink)` };
  if (!showWord) {
    return (
      <span
        role="img"
        aria-label={text}
        data-status={status}
        className={`inline-flex min-h-7 min-w-7 items-center justify-center rounded-md p-0.5 text-meta ${className}`}
        style={tone}
      >
        {svg}
      </span>
    );
  }
  return (
    <span
      data-status={status}
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 py-0.5 text-meta font-semibold leading-snug ${className}`}
      style={tone}
    >
      {svg}
      <span className="min-w-0 break-words">{text}</span>
    </span>
  );
}
