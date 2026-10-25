import { CheckCircle2, Clock, Undo2, XCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { PaymentStatus } from '@dk/shared/types';

import { STATUS_KEY, STATUS_TONE, type StatusTone } from './paymentView';

// Every pair is dark text on its own pale ground, checked to stay above 4.5:1:
// the reader is outdoors, on a cheap screen, and the chip is the one word on the
// card that says where the money stands.
export const TONE_CLASS: Record<StatusTone, string> = {
  warning: 'bg-warning-soft text-warning-strong',
  success: 'bg-success-soft text-emerald-800',
  info: 'bg-info-soft text-blue-800',
  neutral: 'bg-neutral-soft text-neutral',
};

const STATUS_ICON: Record<PaymentStatus, LucideIcon> = {
  due: Clock,
  processing: Clock,
  paid: CheckCircle2,
  cancelled: XCircle,
  partially_refunded: Undo2,
  refunded: Undo2,
};

/** The status of a payment in a word, in the dealer's language. 16px, like the rest. */
export function PaymentStatusChip({ status }: { status: PaymentStatus }) {
  const t = useT();
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-base font-medium',
        TONE_CLASS[STATUS_TONE[status]],
      )}
    >
      <Icon width={16} height={16} strokeWidth={2} aria-hidden />
      {t(STATUS_KEY[status])}
    </span>
  );
}
