import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { DealerService, MeServiceEntry, MeServiceRun, MeServicesView } from '@dk/shared/types';

/**
 * The Services door's one new read: `GET /v1/me/services` (spec 4.2, 9 N1). It says how each service
 * RUNS (`run`), when it last ran and when it runs next, and how many things MDG did this week.
 *
 * It may be missing: an older server answers 404, a bad moment answers an error. The door and the
 * service pages draw without it, and never say "Working" without it (`serviceState` answers `null`
 * for every row that needs the server's word). So this file never throws a shape problem upward: an
 * answer that is not the shape it expects is the same as no answer.
 */
export const meServicesKey = ['me-services'] as const;

/** What was read: every field the app does not need is optional, so an older or newer server still reads. */
export type MeServicesRead = Omit<MeServicesView, 'asOf' | 'week'> & {
  asOf?: string;
  week?: MeServicesView['week'];
};

const RUNS: ReadonlySet<string> = new Set<MeServiceRun>([
  'ok',
  'running',
  'failing',
  'late',
  'held',
  'new',
  'on_request',
]);

/** The answer as the app uses it, or null when it is not a services answer at all. A row it cannot read is dropped. */
export function cleanMeServices(raw: unknown): MeServicesRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as { services?: unknown; asOf?: unknown; week?: unknown };
  if (!Array.isArray(v.services)) return null;
  const services = v.services.filter(
    (e): e is MeServiceEntry =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as MeServiceEntry).serviceId === 'string' &&
      RUNS.has((e as MeServiceEntry).run),
  );
  const week = v.week as Partial<MeServicesView['week']> | undefined;
  return {
    services,
    ...(typeof v.asOf === 'string' && !Number.isNaN(Date.parse(v.asOf)) ? { asOf: v.asOf } : {}),
    ...(week && typeof week.total === 'number' && Number.isFinite(week.total) && week.total >= 0
      ? {
          week: {
            since: typeof week.since === 'string' ? week.since : '',
            total: week.total,
            byKind: week.byKind ?? {},
          },
        }
      : {}),
  };
}

/**
 * Asked for once per visit to the door (a minute fresh). No retries: a route an older server does not
 * have must not be asked for again and again, and the door is useful without it.
 */
export function useMeServices() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  return useQuery({
    queryKey: meServicesKey,
    enabled: !!token && role !== 'admin',
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<MeServicesRead> => {
      const read = cleanMeServices(await api.get<unknown>('/v1/me/services'));
      if (!read) throw new Error('services answer not understood');
      return read;
    },
  });
}

/**
 * The route that has always existed, asked for ONLY while `/me/services` has failed: it tells which
 * services are attached, so the door can still list them. Its `lastRunAt` and `status` are not used
 * for health words (a stamp on a failed run too), only the ids.
 */
export function useAttachedServices({ enabled }: { enabled: boolean }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const dealerId = user?.dealerId ?? undefined;
  return useQuery({
    // Its own key: `['dealer-services', id]` holds whole `DealerService` rows for other screens.
    queryKey: ['services-door', 'attached', dealerId],
    enabled: enabled && !!token && !!dealerId && user?.role !== 'admin',
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<string[]> => {
      const list = await api.get<DealerService[]>(`/v1/dealers/${dealerId}/services`);
      return Array.isArray(list)
        ? list.map((s) => s.serviceId).filter((id): id is string => typeof id === 'string')
        : [];
    },
  });
}
