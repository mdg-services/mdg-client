import { cn } from '@/lib/cn';
import { fmtDay, fmtTime } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';

/**
 * "as of 9:40 am" or "from yesterday": how old a number is, said in words (spec 3.2). `at` is an
 * ISO time or a `YYYY-MM-DD` day, read on the India clock. `kind="time"` says the clock time;
 * `kind="day"` says the day. `checked` writes "Checked 9:10 am" instead, for a feed that is old. Text
 * it cannot read as a date is shown as given, so a caller's own words are never lost.
 */
export function AsOf({
  at,
  kind = 'time',
  checked = false,
  now,
  className,
}: {
  at: string;
  kind?: 'time' | 'day';
  checked?: boolean;
  /** For tests: the clock "today" and "yesterday" are counted from. */
  now?: Date;
  className?: string;
}) {
  const t = useT();
  const lang = useLang();
  const unreadable = Number.isNaN(new Date(at).getTime());
  let text: string;
  if (unreadable) text = at;
  else if (kind === 'day') text = t('kit.asOf.fromDay', { day: fmtDay(at, lang, now) });
  else text = t(checked ? 'kit.asOf.checked' : 'kit.asOf.at', { time: fmtTime(at, lang) });
  return <span className={cn('text-meta text-text-muted', className)}>{text}</span>;
}
