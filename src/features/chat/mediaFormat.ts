import type { TFunction } from '@/lib/i18n';
import type { Lang } from '@/store/lang';

/**
 * The words the viewer and the gallery put round a picture: when it was sent,
 * and which month's shelf it sits on.
 *
 * Pure and given `now`, so the tests can pin "today" instead of racing the clock
 * at midnight.
 */

const LOCALES: Record<Lang, string> = { hi: 'hi-IN', en: 'en-IN' };

function parse(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function clock(d: Date, lang: Lang): string {
  return d.toLocaleTimeString(LOCALES[lang], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * "Today, 3:40 pm" · "Yesterday, 3:40 pm" · "12 Oct, 3:40 pm" · "12 Oct 2025,
 * 3:40 pm" — the line under the sender's name at the top of the viewer.
 */
export function viewerWhen(
  iso: string,
  lang: Lang,
  t: TFunction,
  now: Date = new Date(),
): string {
  const d = parse(iso);
  if (!d) return '';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  let day: string;
  if (sameDay(d, now)) day = t('chat.today');
  else if (sameDay(d, yesterday)) day = t('chat.yesterday');
  else {
    day = d.toLocaleDateString(LOCALES[lang], {
      day: 'numeric',
      month: 'short',
      ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }),
    });
  }
  return `${day}, ${clock(d, lang)}`;
}

/** Which month's shelf a picture sits on — the grouping key, not a label. */
export function monthKey(iso: string): string {
  const d = parse(iso);
  return d ? `${d.getFullYear()}-${d.getMonth() + 1}` : 'unknown';
}

/** "October 2026", or "This month" for the month we are in. */
export function monthHeading(
  iso: string,
  lang: Lang,
  t: TFunction,
  now: Date = new Date(),
): string {
  const d = parse(iso);
  if (!d) return '';
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
    return t('media.thisMonth');
  }
  return d.toLocaleDateString(LOCALES[lang], { month: 'long', year: 'numeric' });
}

/** "12 Oct 2026" — the date on a document row. */
export function shortDate(iso: string, lang: Lang): string {
  const d = parse(iso);
  if (!d) return '';
  return d.toLocaleDateString(LOCALES[lang], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
