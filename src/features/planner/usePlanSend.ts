import * as React from 'react';

import { ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';

import type { PlanAction } from './planView';
import { sentPlaces } from './planView';
import { useResendPlannerBill, useRestartPlanner, type PlannerSendResult } from './usePlanner';

/**
 * The plan's one button, wherever it is drawn (the card, the chat strip): "Send the
 * payment link again" or "Start again". For a few seconds after a press the words
 * say where the link went instead, so the planner knows to look at WhatsApp.
 */
export function usePlanSend(action: PlanAction): {
  press: () => void;
  pending: boolean;
  /** The sentence to show after a press, or null. */
  said: string | null;
  /** True when `said` is a failure. */
  failed: boolean;
} {
  const t = useT();
  const resend = useResendPlannerBill();
  const restart = useRestartPlanner();
  const [said, setSaid] = React.useState<{ text: string; failed: boolean } | null>(null);
  React.useEffect(() => {
    if (!said) return;
    const id = window.setTimeout(() => setSaid(null), 8_000);
    return () => window.clearTimeout(id);
  }, [said]);

  const onSent = (r: PlannerSendResult | undefined) => {
    const where = sentPlaces(r, { and: t('planner.and'), email: t('planner.email') });
    setSaid({ text: where ? t('planner.sentTo', { where }) : t('planner.sentPlain'), failed: false });
  };
  const onError = (err: unknown) =>
    setSaid(
      err instanceof ApiError && err.status === 429
        ? { text: t('planner.sentJustNow'), failed: false }
        : { text: t('planner.sendFailed'), failed: true },
    );

  const press = () => {
    if (action === 'resend') resend.mutate(undefined, { onSuccess: onSent, onError });
    else if (action === 'restart') restart.mutate(undefined, { onSuccess: onSent, onError });
  };
  return {
    press,
    pending: resend.isPending || restart.isPending,
    said: said?.text ?? null,
    failed: said?.failed ?? false,
  };
}
