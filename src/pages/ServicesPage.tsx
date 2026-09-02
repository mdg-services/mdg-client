import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Wrench, XCircle } from 'lucide-react';
import * as React from 'react';


import { Card, CardContent, EmptyState, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { pick, useLang, useT, type MessageKey, type TFunction } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import type { Lang } from '@/store/lang';
import { serviceLabel } from '@dk/shared';
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

/**
 * The service's name in the reader's language. The names are shared data, not
 * catalog keys, so they come through `pick()` like every other bilingual field
 * on a contract rather than through `t()`.
 */
function serviceName(lang: Lang, serviceId: string): string {
  const label = serviceLabel(serviceId);
  return pick(lang, label.en, label.hi);
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
  const lang = useLang();
  const user = useAuthStore((s) => s.user);
  const dealerId = user?.dealerId ?? undefined;

  // `GET /v1/dealers/:id/services` is the route that exists. This page used to
  // ask for `/v1/dealer-services?dealerId=…`, which the backend has never
  // served — that router only registers PATCH/DELETE/POST on `/:dsId` — and it
  // caught the resulting 404 and returned `[]`, so every dealer who has ever
  // opened this screen was told they have no services at all. The catch is gone
  // with the bad path: a real failure now falls through to the error state this
  // page already renders, which is the only way the NEXT broken path gets seen.
  const servicesQuery = useQuery<DealerService[]>({
    queryKey: ['dealer-services', dealerId],
    enabled: !!dealerId,
    queryFn: () => api.get<DealerService[]>(`/v1/dealers/${dealerId}/services`),
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
                    {/* The dealer's own word for the service, never the plugin
                        slug — `credit-dod-monitoring` is the name of a folder on
                        our server and it meant nothing to the person reading it. */}
                    <p className="truncate text-sm font-semibold text-text">
                      {serviceName(lang, svc.serviceId)}
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
