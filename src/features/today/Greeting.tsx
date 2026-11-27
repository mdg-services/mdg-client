import { useLang, useT } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';

import { greetingName, todayHeading } from './todayView';

/**
 * The words at the top of Today, drawn IN the bar (the page's h1), not as a block under it:
 * "नमस्ते, रमेश जी" in the reader's language (never "Sir", and just "नमस्ते" when there is no
 * real name), and one muted line under it with the pump's code, a manager's role word and the
 * date. The tab bar already says "Today", so the bar spends its line on the person instead,
 * and the first section starts right under it. No weather, no tips.
 */
export function useGreeting({
  day,
  outletCode,
  isManager,
}: {
  /** Today's business day (YYYY-MM-DD) from the feed; the phone's date until the feed answers. */
  day?: string;
  /** Shown only for a person who runs more than one pump, the one case where it tells them something. */
  outletCode?: string;
  isManager: boolean;
}): { title: string; line: string } {
  const t = useT();
  const lang = useLang();
  const name = greetingName(useAuthStore((s) => s.user?.name));
  const line = [outletCode, isManager ? t('today.role.manager') : null, todayHeading(day, lang)]
    .filter(Boolean)
    .join(' · ');
  return { title: name ? t('today.greeting', { name }) : t('today.greetingBare'), line };
}
