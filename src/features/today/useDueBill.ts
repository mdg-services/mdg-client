import { useQuery } from '@tanstack/react-query';

import { paymentsListQueryKey } from '@/features/payments/api';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { DealerPaymentsList } from '@dk/shared/types';

/** The open bill that matters most, as far as Today says it: the day it falls due. Never an amount. */
export interface DueBill {
  dueOn: string;
}

/**
 * MDG's next open bill, for the days-only line of the notices row (spec 4.1). The setup block carries
 * the FIRST bill only; a pump that is live has its monthly bill in the bills list. The same cache entry
 * as the Bill-and-plan page reads, so opening that page right after costs no second request; only the
 * owner reads it (a manager never sees bills), and a missing or failing route is simply no line.
 */
export function useDueBill(enabled: boolean): DueBill | null {
  const token = useAuthStore((s) => s.token);
  const q = useQuery<DealerPaymentsList>({
    queryKey: paymentsListQueryKey,
    enabled: enabled && !!token,
    staleTime: 60_000,
    retry: false,
    queryFn: () => api.get<DealerPaymentsList>('/v1/payments/me'),
  });
  const items = Array.isArray(q.data?.items) ? q.data.items : [];
  const open = items
    .filter((p) => p.status === 'due' && typeof p.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.dueDate))
    .map((p) => (p.dueDate as string).slice(0, 10))
    .sort();
  return open[0] ? { dueOn: open[0] } : null;
}
