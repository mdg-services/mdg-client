import { fmtDay, fmtTime, indiaDay } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';

import { greetingName } from './todayView';

/** A moment far in the past, so `fmtDay` writes the date in full ("Tue 24 Nov") instead of "today". */
const LONG_AGO = new Date(0);

/**
 * The words at the top of Today, drawn in the page's bar (the page's h1): "नमस्ते, रमेश जी" in the
 * reader's language (never "Sir", and just "नमस्ते" when there is no real name), and one muted line
 * under it: a manager's role word, the date, and when the phone last checked ("Tue 24 Nov, checked
 * 9:40 am"). The line is left to the bar to drop at large text.
 */
export function useGreeting({
  day,
  isManager,
  checkedAt,
}: {
  /** Today's business day (YYYY-MM-DD) from the feed; the phone's date until the feed answers. */
  day?: string;
  isManager: boolean;
  /** When the feed in hand was last read (ms). Absent: the line is the date alone. */
  checkedAt?: number | null;
}): { title: string; line: string } {
  const t = useT();
  const lang = useLang();
  const name = greetingName(useAuthStore((s) => s.user?.name));
  const date = fmtDay(day ?? indiaDay(new Date()), lang, LONG_AGO);
  const dated = checkedAt ? t('today.page.subline', { date, time: fmtTime(checkedAt, lang) }) : date;
  const line = [isManager ? t('today.role.manager') : null, dated].filter(Boolean).join(' · ');
  return { title: name ? t('today.greeting', { name }) : t('today.greetingBare'), line };
}
