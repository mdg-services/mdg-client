import { Camera, MessageCircle, X } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyState, Spinner } from '@/components/ui';
import { DensityLatestStrip } from '@/features/density/DensityLatestStrip';
import { DensityTodayCard } from '@/features/density/DensityTodayCard';
import { DensityWeekStrip } from '@/features/density/DensityWeekStrip';
import {
  densityDayLabel,
  useDensityDayPhotoUrl,
  useDensityMe,
} from '@/hooks/api/useDensity';
import { useLang, useT } from '@/lib/i18n';
import { useScrollLock } from '@/lib/useScrollLock';

function HelpFooter() {
  const navigate = useNavigate();
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => navigate('/chat')}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-medium text-brand shadow-sm active:bg-surface-2"
    >
      <MessageCircle width={16} strokeWidth={1.75} />
      {t('density.helpLine')}
    </button>
  );
}

/**
 * The register photo a day already carries, full screen.
 *
 * Written here rather than reusing the chat lightbox because that one recovers
 * an expired link through `/uploads/download-url`, and register photos are
 * deliberately NOT reachable from that route — reading one goes through the
 * dealer-scoped day endpoint, where the ownership check and the audit row live.
 * Reusing it would have shipped a refresh path that always fails.
 */
function DayPhotoViewer({
  businessDate,
  byAdmin,
  onClose,
}: {
  businessDate: string;
  byAdmin: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const { data, isLoading, isError } = useDensityDayPhotoUrl(businessDate);
  // Full-screen overlay on a page whose body scrolls: without this the register
  // page slides around behind the photo when the backdrop is dragged.
  useScrollLock();

  return (
    <div
      role="dialog"
      aria-label={densityDayLabel(lang, businessDate, 'full')}
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div className="safe-top flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">
            {densityDayLabel(lang, businessDate, 'full')}
          </p>
          {byAdmin ? (
            <p className="truncate text-xs text-white/70">
              {t('density.adminAdded')}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={t('common.dismiss')}
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/25"
        >
          <X width={22} strokeWidth={2} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        {isLoading ? (
          <Spinner size={24} />
        ) : isError || !data ? (
          <p className="max-w-xs text-center text-sm text-white/80">
            {t('common.helpDesc')}
          </p>
        ) : (
          <img
            src={data.viewUrl}
            alt={densityDayLabel(lang, businessDate, 'full')}
            decoding="async"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        )}
      </div>
    </div>
  );
}

/**
 * The dealer's density register: the last tanker's readings, and today's photo.
 *
 * Two jobs, in that order, because that is the order they matter in to the
 * person holding the phone — the figures are why they opened the screen, the
 * photo is what they owe. Everything else this service holds (the tanker
 * invoices, the PDFs, the amounts) stays on the MDG side; the dealer already has
 * those documents from IndianOil, and serving them here would widen the surface
 * for no new fact.
 */
export function DensityPage() {
  const t = useT();
  const meQuery = useDensityMe();

  const [viewing, setViewing] = React.useState<string | null>(null);
  /**
   * Filled in by the card with "open the camera for this day". The week strip
   * calls it directly so both entry points share ONE file input — a picker
   * opened anywhere but inside the tap itself is dropped by the WebView.
   */
  const captureRef = React.useRef<((businessDate: string) => void) | null>(null);

  // Above the early returns: a hook called on only some renders changes the hook
  // count between renders and takes the whole tree down with it.
  const onPickDay = React.useCallback((businessDate: string) => {
    captureRef.current?.(businessDate);
  }, []);
  const onViewPhoto = React.useCallback(
    (businessDate: string) => setViewing(businessDate),
    [],
  );

  const view = meQuery.data;

  if (meQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Spinner size={20} />
      </div>
    );
  }

  if (meQuery.isError || !view) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <EmptyState
          icon={<Camera width={28} strokeWidth={1.5} />}
          title={t('density.errorTitle')}
          description={t('common.helpDesc')}
        />
        <HelpFooter />
      </div>
    );
  }

  // Not switched on for this pump. A calm welcome, never a 404 and never an
  // empty list that reads like something is broken.
  if (!view.attached) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <h1 className="text-lg font-semibold tracking-tight text-text">
          {t('density.title')}
        </h1>
        <EmptyState
          icon={<Camera width={28} strokeWidth={1.5} />}
          title={t('density.notOnTitle')}
          description={t('density.notOnDesc')}
        />
        <HelpFooter />
      </div>
    );
  }

  const viewingDay = viewing
    ? view.days.find((d) => d.businessDate === viewing)
    : undefined;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <h1 className="text-lg font-semibold tracking-tight text-text">
        {t('density.title')}
      </h1>

      <DensityLatestStrip latest={view.latest} />

      <DensityTodayCard
        view={view}
        onViewPhoto={onViewPhoto}
        captureRef={captureRef}
      />

      <DensityWeekStrip
        view={view}
        onPickDay={onPickDay}
        onViewPhoto={onViewPhoto}
      />

      <HelpFooter />

      {viewing ? (
        <DayPhotoViewer
          businessDate={viewing}
          byAdmin={viewingDay?.uploadedBy?.kind === 'admin'}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
