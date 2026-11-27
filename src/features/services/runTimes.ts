import { fmtDay, fmtTime } from '@/lib/fmt';
import { translate } from '@/lib/i18n';
import type { Lang } from '@/store/lang';
import type { MeServiceEntry } from '@dk/shared/types';

import type { ServiceTimes } from './serviceState';

/**
 * "Last ran today 12:11 am." and "Next run today 7:35 pm.": the two facts a row and a page say about
 * how a service runs, each a sentence of its own so they never read as one run-on line. In the
 * dealer's clock and language. A date that cannot be read is left out, never printed as a dash.
 * `lastRanAt` is stamped on failed runs too, so the words say "ran", never "succeeded".
 */
export function runTimes(
  entry: Pick<MeServiceEntry, 'lastRanAt' | 'nextRunAt'> | undefined,
  lang: Lang,
  now: Date,
): ServiceTimes {
  const out: ServiceTimes = {};
  const at = (iso: string) => `${fmtDay(iso, lang, now)} ${fmtTime(iso, lang)}`;
  if (entry?.lastRanAt && !Number.isNaN(Date.parse(entry.lastRanAt))) {
    out.lastRan = translate(lang, 'svc.run.last', { time: at(entry.lastRanAt) });
  }
  if (entry?.nextRunAt && !Number.isNaN(Date.parse(entry.nextRunAt))) {
    out.next = translate(lang, 'svc.run.next', { time: at(entry.nextRunAt) });
  }
  return out;
}

/** The two sentences as one line. */
export function runLine(times: ServiceTimes): string {
  return [times.lastRan, times.next].filter(Boolean).join(' ');
}
