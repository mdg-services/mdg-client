import { AlertCircle, CheckCircle2, Clock, MinusCircle, type LucideIcon } from 'lucide-react';

import { TONE_CLASS } from '@/features/payments/PaymentStatusChip';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { AutopayViewState } from '@dk/shared/types';

import { AUTOPAY_STATE_KEY, AUTOPAY_TONE } from './autopayView';

const STATE_ICON: Record<AutopayViewState, LucideIcon> = {
  setting_up: Clock,
  on: CheckCircle2,
  failing: AlertCircle,
  off: MinusCircle,
};

/**
 * The state of autopay in a word, wearing the same colours and size as the
 * payment status chip so the two read as one family on the Payments page.
 */
export function AutopayChip({ state }: { state: AutopayViewState }) {
  const t = useT();
  const Icon = STATE_ICON[state];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-base font-medium',
        TONE_CLASS[AUTOPAY_TONE[state]],
      )}
    >
      <Icon width={16} height={16} strokeWidth={2} aria-hidden />
      {t(AUTOPAY_STATE_KEY[state])}
    </span>
  );
}
