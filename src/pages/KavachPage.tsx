import { onlineManager } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { AppBar, type AppBarMenuItem } from '@/components/AppBar';
import { PdfViewer } from '@/components/PdfViewer';
import { Button, EmptyState } from '@/components/ui';
import { KavachDetailSheet } from '@/features/kavach/KavachDetailSheet';
import { KavachRow } from '@/features/kavach/KavachRow';
import { KavachSummary } from '@/features/kavach/KavachSummary';
import { sectionsOf, titleOf, type KavachSections } from '@/features/kavach/kavachView';
import { rowKey, useKavachActions } from '@/features/kavach/useKavachActions';
import { OutletChip } from '@/features/outlets/OutletChip';
import { OutletSheet } from '@/features/outlets/OutletSheet';
import { PhotoConfirmSheet } from '@/features/today/PhotoConfirmSheet';
import { MoreButton, SectionHeading } from '@/features/today/TodayRows';
import { fetchKavachSheet, useKavach } from '@/hooks/api/useKavach';
import { cn } from '@/lib/cn';
import { useLang, useT } from '@/lib/i18n';
import { imageAccept } from '@/lib/imageAccept';
import { fetchPdfBytes } from '@/lib/pdf';
import { markFirstScreen } from '@/lib/perfReport';
import { useAuthStore } from '@/store/auth';
import type { KavachDealerItem } from '@dk/shared/types';

/** How many "Coming up" rows show before "N more". */
const UPCOMING_LIMIT = 5;

/**
 * The Kavach tab (ADR 0057 §5): how much of the pump's checklist is done today, and what is left.
 *
 * Top to bottom: the ring with the % and one plain sentence; "Do now" (sent back first, then late,
 * then due soonest), each row with its one button; "With MDG" (sent, waiting for a check); "Done"
 * (folded away until opened); "Coming up"; and "When it happens", the points with no clock, each with
 * Send photo. Everything sits on ruled white sheets, in the reader's language.
 *
 * It reads the one `GET /v1/kavach/me` the tab badge and the Today tile read too. A photo goes
 * out through the camera, the "Send this photo?" sheet and the Kavach upload; the row moves to
 * "With MDG" at once. The dealer never marks a point done: MDG's check, or our own data, does.
 *
 * Where Kavach is not started for the pump the tab is not shown, and this address says so calmly.
 */
export function KavachPage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const q = useKavach();
  const actions = useKavachActions(lang);
  const view = q.data;
  const isOwner = useAuthStore((st) => st.user?.role) === 'dealer-owner';

  const online = React.useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    () => true,
  );

  const [outletsOpen, setOutletsOpen] = React.useState(false);
  const closeOutlets = React.useCallback(() => setOutletsOpen(false), []);
  const menu = React.useMemo<AppBarMenuItem[]>(
    () => [{ key: 'settings', label: t('chatlist.settings'), onSelect: () => navigate('/settings') }],
    [t, navigate],
  );

  const settled = !q.isPending || q.isError || q.fetchStatus === 'idle';
  React.useEffect(() => {
    if (settled) markFirstScreen();
  }, [settled]);

  const sections = React.useMemo(() => (view ? sectionsOf(view, actions.sentKeys) : null), [view, actions.sentKeys]);

  // One camera input and one picker for the whole page: the row that asked is remembered.
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const chooseRef = React.useRef<HTMLInputElement>(null);
  const target = React.useRef<KavachDealerItem | null>(null);
  const openCamera = React.useCallback((item: KavachDealerItem) => {
    target.current = item;
    cameraRef.current?.click();
  }, []);
  const openChoose = React.useCallback((item: KavachDealerItem) => {
    target.current = item;
    chooseRef.current?.click();
  }, []);
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const row = target.current;
    if (file && row) actions.pick(row, file);
  };
  const { retry } = actions;
  const onRetry = React.useCallback(
    (item: KavachDealerItem) => {
      if (!retry(item)) openCamera(item);
    },
    [retry, openCamera],
  );

  const [detail, setDetail] = React.useState<{ item: KavachDealerItem; section: keyof KavachSections } | null>(null);
  // The sheet shows the row as it stands now (MDG may approve or send it back while it is open).
  const live = React.useMemo(() => {
    if (!detail || !sections) return detail;
    for (const sec of ['now', 'week', 'others', 'data', 'waiting', 'done', 'upcoming', 'events'] as const) {
      const hit = sections[sec].find((i) => rowKey(i) === rowKey(detail.item));
      if (hit) return { item: hit, section: sec };
    }
    return detail;
  }, [detail, sections]);
  const [sheet, setSheet] = React.useState<KavachDealerItem | null>(null);
  const [doneOpen, setDoneOpen] = React.useState(false);
  const [othersOpen, setOthersOpen] = React.useState(false);
  const [dataOpen, setDataOpen] = React.useState(false);
  const [upcomingAll, setUpcomingAll] = React.useState(false);

  const row = (item: KavachDealerItem, section: keyof KavachSections) => (
    <KavachRow
      key={rowKey(item) + section}
      item={item}
      section={section}
      send={actions.entries[rowKey(item)]}
      onCamera={openCamera}
      onChoose={openChoose}
      onSheet={setSheet}
      onRetry={onRetry}
      onOpen={(it) => setDetail({ item: it, section })}
    />
  );

  let body: React.ReactNode;
  const parked = q.isPending && q.fetchStatus === 'paused';
  if ((q.isError || parked) && !view) {
    body = (
      <EmptyState
        icon={<ShieldCheck width={28} strokeWidth={1.5} />}
        title={t('kavach.error.title')}
        description={t('kavach.error.desc')}
        cta={
          <Button size="lg" onClick={() => void q.refetch()} loading={q.isFetching} leftIcon={<RefreshCw width={16} strokeWidth={1.75} />}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  } else if (!view || !sections) {
    body = <Loading />;
  } else if (!view.on) {
    body = (
      <EmptyState
        icon={<ShieldCheck width={28} strokeWidth={1.5} />}
        title={t('kavach.off.title')}
        description={t('kavach.off.desc')}
        cta={
          <Button size="lg" variant="secondary" onClick={() => navigate('/', { replace: true })}>
            {t('kavach.off.back')}
          </Button>
        }
      />
    );
  } else {
    const { now, week, others, data, waiting, done, upcoming, events } = sections;
    const upcomingShown = upcomingAll ? upcoming : upcoming.slice(0, UPCOMING_LIMIT);
    body = (
      <>
        <KavachSummary view={view} />

        <section aria-labelledby="kavach-now">
          <SectionHeading id="kavach-now" count={now.length}>
            {t('kavach.sec.now')}
          </SectionHeading>
          {now.length > 0 ? (
            <Rows labelledBy="kavach-now">{now.map((i) => row(i, 'now'))}</Rows>
          ) : (
            <p
              data-testid="kavach-all-done"
              className="flex items-start gap-2.5 border-y border-border px-0.5 py-3 text-body text-text-muted"
            >
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-status-ok-ink" strokeWidth={1.75} aria-hidden />
              <span>{waiting.length > 0 ? t('kavach.sec.nowClear') : t('kavach.allDone')}</span>
            </p>
          )}
        </section>

        {week.length > 0 ? (
          <section aria-labelledby="kavach-week">
            <SectionHeading id="kavach-week" count={week.length}>
              {t('kavach.sec.week')}
            </SectionHeading>
            <Rows labelledBy="kavach-week">{week.map((i) => row(i, 'week'))}</Rows>
          </section>
        ) : null}

        {waiting.length > 0 ? (
          <section aria-labelledby="kavach-waiting">
            <SectionHeading id="kavach-waiting" count={waiting.length}>
              {t('kavach.sec.waiting')}
            </SectionHeading>
            <Rows labelledBy="kavach-waiting">{waiting.map((i) => row(i, 'waiting'))}</Rows>
          </section>
        ) : null}

        {others.length > 0 ? (
          <Folded
            id="kavach-others"
            title={t(isOwner ? 'kavach.sec.managerDoes' : 'kavach.sec.ownerDoes')}
            count={others.length}
            open={othersOpen}
            onToggle={() => setOthersOpen((v) => !v)}
          >
            {others.map((i) => row(i, 'others'))}
          </Folded>
        ) : null}

        {data.length > 0 ? (
          <Folded
            id="kavach-data"
            title={t('kavach.sec.data')}
            count={data.length}
            open={dataOpen}
            onToggle={() => setDataOpen((v) => !v)}
          >
            {data.map((i) => row(i, 'data'))}
          </Folded>
        ) : null}

        {done.length > 0 ? (
          <section aria-labelledby="kavach-done">
            <h2 id="kavach-done" className="mb-1 text-heading text-text">
              <button
                type="button"
                aria-expanded={doneOpen}
                aria-controls="kavach-done-list"
                onClick={() => setDoneOpen((v) => !v)}
                data-testid="kavach-done-toggle"
                className="flex min-h-12 w-full items-center gap-2 px-0.5 text-left"
              >
                <span>{t('kavach.sec.done')}</span>
                <span className="font-normal tabular-nums text-text-muted">{done.length}</span>
                <ChevronDown
                  width={20}
                  strokeWidth={1.75}
                  aria-hidden
                  className={cn('ml-auto shrink-0 transition-transform duration-150', doneOpen && 'rotate-180')}
                />
              </button>
            </h2>
            {doneOpen ? (
              <div id="kavach-done-list">
                <Rows labelledBy="kavach-done">{done.map((i) => row(i, 'done'))}</Rows>
              </div>
            ) : null}
          </section>
        ) : null}

        {upcoming.length > 0 ? (
          <section aria-labelledby="kavach-upcoming">
            <SectionHeading id="kavach-upcoming" count={upcoming.length}>
              {t('kavach.sec.upcoming')}
            </SectionHeading>
            <Rows labelledBy="kavach-upcoming">{upcomingShown.map((i) => row(i, 'upcoming'))}</Rows>
            {upcoming.length > UPCOMING_LIMIT ? (
              <MoreButton
                hiddenCount={upcoming.length - UPCOMING_LIMIT}
                expanded={upcomingAll}
                about={t('kavach.sec.upcoming')}
                onToggle={() => setUpcomingAll((v) => !v)}
              />
            ) : null}
          </section>
        ) : null}

        {events.length > 0 ? (
          <section aria-labelledby="kavach-events">
            <SectionHeading id="kavach-events">{t('kavach.sec.events')}</SectionHeading>
            <Rows labelledBy="kavach-events">{events.map((i) => row(i, 'events'))}</Rows>
          </section>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col" data-testid="kavach-page">
      <AppBar
        variant="home"
        title={t('kavach.title')}
        actions={<OutletChip onOpen={() => setOutletsOpen(true)} />}
        menu={menu}
      />
      {outletsOpen ? <OutletSheet onClose={closeOutlets} /> : null}

      {(!online || q.isError) && view ? (
        <p
          role="status"
          data-testid="kavach-offline"
          className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-status-info-soft px-3 py-2.5 text-body font-medium text-status-info-ink"
        >
          <WifiOff width={20} strokeWidth={2} className="shrink-0" aria-hidden />
          {t('kavach.offline')}
        </p>
      ) : null}

      <div className="flex flex-1 flex-col gap-6 px-4 pb-10 pt-4">{body}</div>

      {/* The pickers: the camera goes straight to the back lens; the other takes a photo or, where the point allows, a PDF. */}
      <input
        ref={cameraRef}
        type="file"
        accept={imageAccept()}
        capture="environment"
        className="hidden"
        data-testid="kavach-camera-input"
        onChange={onFile}
      />
      <input
        ref={chooseRef}
        type="file"
        accept={imageAccept(true)}
        className="hidden"
        data-testid="kavach-choose-input"
        onChange={onFile}
      />

      {actions.pending ? (
        <PhotoConfirmSheet
          pending={actions.pending}
          onSend={actions.confirmPending}
          onReplace={actions.replacePending}
          onClose={actions.cancelPending}
        />
      ) : null}

      {detail && live ? (
        <KavachDetailSheet item={live.item} section={live.section} onClose={() => setDetail(null)} />
      ) : null}

      {/* Our own sheet, read inside the app: the file never leaves it. */}
      {sheet?.checkId ? (
        <PdfViewer
          title={titleOf(sheet, lang)}
          load={() => fetchKavachSheet(sheet.checkId as string).then((r) => fetchPdfBytes(r.url))}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

/** A section folded away until opened: for rows this reader only needs to know about. */
function Folded({
  id,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-1 text-heading text-text">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          onClick={onToggle}
          className="flex min-h-12 w-full items-center gap-2 px-0.5 text-left"
        >
          <span>{title}</span>
          <span className="font-normal tabular-nums text-text-muted">{count}</span>
          <ChevronDown
            width={20}
            strokeWidth={1.75}
            aria-hidden
            className={cn('ml-auto shrink-0 transition-transform duration-150', open && 'rotate-180')}
          />
        </button>
      </h2>
      {open ? (
        <div id={`${id}-list`}>
          <Rows labelledBy={id}>{children}</Rows>
        </div>
      ) : null}
    </section>
  );
}

/** The rounded white sheet a list of rows sits on. */
function Rows({ children, labelledBy }: { children: React.ReactNode; labelledBy: string }) {
  return (
    <ul aria-labelledby={labelledBy} className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {children}
    </ul>
  );
}

/** Grey blocks where the sheets will be, so the page has its shape before the answer comes. */
function Loading() {
  const t = useT();
  return (
    <div role="status" aria-busy="true" data-testid="kavach-skeleton" className="flex flex-col gap-6">
      <span className="sr-only">{t('kavach.loading')}</span>
      <div aria-hidden className="h-52 animate-pulse rounded-xl border border-border bg-surface" />
      <div aria-hidden>
        <div className="mb-2.5 h-5 w-32 animate-pulse rounded bg-surface-2" />
        <div className="h-48 animate-pulse rounded-xl border border-border bg-surface" />
      </div>
    </div>
  );
}
