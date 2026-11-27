import { StatusPill } from '@/components/kit';
import { useT } from '@/lib/i18n';
import type { DealerPayment } from '@dk/shared/types';

import { billStatus } from './billView';

/**
 * Where a bill stands, as a shape AND a word (spec 3.1): the tick for "Paid on time", the clock for
 * "Being confirmed" and for a bill autopay is about to take, the triangle for "Due", the circle-i
 * for money that went back. Never red, never colour alone. The kit's `StatusPill` draws it.
 */
export function PaymentStatusChip({
  payment,
}: {
  payment: Pick<
    DealerPayment,
    'status' | 'paidAt' | 'dueDate' | 'autopayOn' | 'waitingForAutopayApproval'
  >;
}) {
  const t = useT();
  const { status, key } = billStatus(payment);
  return <StatusPill status={status} word={t(key)} />;
}
