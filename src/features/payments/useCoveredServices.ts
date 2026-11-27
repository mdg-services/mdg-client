import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { pick, useLang } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import { BACKGROUND_SERVICE_IDS, OWNER_ONLY_SERVICE_IDS, serviceLabel } from '@dk/shared';
import type { DealerService } from '@dk/shared/types';

/**
 * The names of the services the plan covers (spec 4.8, "Plan card"): the services attached to this
 * pump and running, in the reader's language, with the background ones left out (the dealer never
 * sees those as a service) and, for a manager, the owner-only ones.
 *
 * It reads the route that exists today, `GET /v1/dealers/:id/services`, under the same query key as
 * the Services screen so the two share one answer. Null means "do not say": still loading, failed,
 * an answer of a shape this code does not know, or nothing running. The plan card then shows the
 * price alone: a missing list never hides the price.
 */
export function useCoveredServices(): string[] | null {
  const lang = useLang();
  const dealerId = useAuthStore((s) => s.user?.dealerId) ?? undefined;
  const isOwner = useAuthStore((s) => s.user?.role === 'dealer-owner');
  const query = useQuery<DealerService[]>({
    queryKey: ['dealer-services', dealerId],
    enabled: !!dealerId,
    queryFn: () => api.get<DealerService[]>(`/v1/dealers/${dealerId}/services`),
  });
  const data: unknown = query.data;
  if (!Array.isArray(data)) return null;
  const names: string[] = [];
  for (const row of data as Partial<DealerService>[]) {
    const id = row?.serviceId;
    if (typeof id !== 'string' || row.status !== 'ACTIVE') continue;
    if (BACKGROUND_SERVICE_IDS.includes(id)) continue;
    if (!isOwner && OWNER_ONLY_SERVICE_IDS.includes(id)) continue;
    const label = serviceLabel(id);
    const name = pick(lang, label.en, label.hi);
    if (!names.includes(name)) names.push(name);
  }
  return names.length > 0 ? names : null;
}
