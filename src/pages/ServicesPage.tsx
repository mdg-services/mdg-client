import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Wrench, XCircle } from 'lucide-react';
import * as React from 'react';


import { Card, CardContent, EmptyState, Spinner } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT, type MessageKey, type TFunction } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { Cadence, DealerService } from '@dk/shared/types';

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Plain-language cadence phrase — never the raw enum (adoption audit §6). */
const CADENCE_KEY: Record<Cadence, MessageKey> = {
  DAILY: 'services.runsDaily',
  WEEKLY: 'services.runsWeekly',
  MONTHLY: 'services.runsMonthly',
  YEARLY: 'services.runsYearly',
  ON_DEMAND: 'services.runsOnDemand',
};

function StatusPill({
  status,
  t,
}: {
  status: DealerService['status'];
  t: TFunction;
}) {
  const isActive = status === 'ACTIVE';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        isActive
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-amber-100 text-amber-700',
      )}
    >
      {isActive ? (
        <CheckCircle2 width={12} strokeWidth={2} />
      ) : (
        <XCircle width={12} strokeWidth={2} />
      )}
      {isActive ? t('services.active') : t('services.paused')}
    </span>
  );
}

export function ServicesPage() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const dealerId = user?.dealerId ?? undefined;

  const servicesQuery = useQuery<DealerService[]>({
    queryKey: ['dealer-services', dealerId],
    enabled: !!dealerId,
    queryFn: async () => {
      try {
        return await api.get<DealerService[]>('/v1/dealer-services', {
          dealerId,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return [];
        throw err;
      }
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-text">
          {t('services.title')}
        </h1>
      </div>

      {servicesQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Spinner size={20} />
        </div>
      ) : servicesQuery.isError ? (
        <EmptyState
          icon={<Wrench width={28} strokeWidth={1.5} />}
          title={t('services.errorTitle')}
          description={t('common.helpDesc')}
        />
      ) : !servicesQuery.data || servicesQuery.data.length === 0 ? (
        <EmptyState
          icon={<Wrench width={28} strokeWidth={1.5} />}
          title={t('services.emptyTitle')}
          description={t('services.emptyDesc')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {servicesQuery.data.map((svc) => (
            <Card key={svc.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">
                      {svc.serviceId}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {t(CADENCE_KEY[svc.cadence])}
                    </p>
                  </div>
                  <StatusPill status={svc.status} t={t} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-text-muted">
                  <div className="flex items-center gap-1.5">
                    <Clock width={12} strokeWidth={1.75} />
                    <span>{t('services.last', { date: formatDate(svc.lastRunAt) })}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock width={12} strokeWidth={1.75} />
                    <span>{t('services.next', { date: formatDate(svc.nextRunAt) })}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
