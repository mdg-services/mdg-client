import { ImageIcon } from 'lucide-react';
import * as React from 'react';

import { DayStrip } from '@/components/kit/DayStrip';
import { EmptyCalm } from '@/components/kit/EmptyCalm';
import { ErrorCard } from '@/components/kit/ErrorCard';
import { InsightRow } from '@/components/kit/InsightRow';
import { SectionCard } from '@/components/kit/SectionCard';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { PhotoViewer } from '@/components/PhotoViewer';
import { Button } from '@/components/ui';
import { StatusShape } from '@/features/reports/StatusBadge';
import { useStaffBatches } from '@/hooks/api/useStaffDraft';
import { fmtDay } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';
import { useTn } from '@/lib/messages/_plural';
import { fmtPointsGrouped, istDate } from '@/lib/staff';
import type { StaffPointBatch } from '@dk/shared/types';

import { sheetHistory, type SheetDay } from './staffInsights';

/** The days of the feed shown before "Show older sheets". */
const FEED_DAYS = 7;
/** More gap days than this are counted, not listed. */
const GAPS_LISTED = 3;

type Item = { kind: 'batch'; batch: StaffPointBatch } | { kind: 'gap'; day: string };

const itemsOf = (day: SheetDay): Item[] =>
  day.batches.length === 0
    ? [{ kind: 'gap', day: day.day }]
    : day.batches.map((batch): Item => ({ kind: 'batch', batch }));

/**
 * "Sheets sent": the record the owner trusts when he asks "did we send yesterday's?". A strip of the
 * last days (a tick where a sheet went, a dashed ring where none did), one sentence naming the days
 * with no sheet, and the sheets themselves as a feed: the day, how many warriors and points, who
 * sent it, the paper photo, the note. A day with no sheet is a row of its own in the feed, so a hole
 * is seen where it falls. Today is not a gap until it is over, and nothing before the first sheet
 * ever sent is (see `sheetHistory`).
 *
 * It reads the last 200 sheets, which is more than a month. It loads with the page and fails on its
 * own: a sheet list that did not come never hides the warriors above it.
 */
export function SheetsSent({ dealerId }: { dealerId: string | undefined }) {
  const t = useT();
  const lang = useLang();
  const query = useStaffBatches(dealerId);
  const [showOlder, setShowOlder] = React.useState(false);
  // A zoomable viewer inside the app, never a new tab: a paper photo is handwriting.
  const [photo, setPhoto] = React.useState<{ src: string; day: string } | null>(null);

  const today = istDate();
  const batches = React.useMemo(() => query.data ?? [], [query.data]);
  const history = React.useMemo(() => sheetHistory(batches, today), [batches, today]);

  const groups = React.useMemo(() => [...history.days].reverse().map(itemsOf), [history.days]);
  const windowStart = history.days[0]?.day ?? today;
  const older = React.useMemo(
    () =>
      batches
        .filter((b) => b.workDate < windowStart)
        .sort(
          (a, b) => b.workDate.localeCompare(a.workDate) || b.createdAt.localeCompare(a.createdAt),
        ),
    [batches, windowStart],
  );
  const recent = groups.slice(0, FEED_DAYS).flat();
  const rest = [
    ...groups.slice(FEED_DAYS).flat(),
    ...older.map((batch): Item => ({ kind: 'batch', batch })),
  ];
  const feed = showOlder ? [...recent, ...rest] : recent;

  const gapSentence =
    history.gaps.length === 0
      ? null
      : history.gaps.length <= GAPS_LISTED
        ? t('warr.gaps.some', { days: history.gaps.map((d) => fmtDay(d, lang)).join(', ') })
        : t('warr.gaps.lots', { n: history.gaps.length, m: history.days.length });

  return (
    <SectionCard title={t('warr.sheets.title')} variant="list">
      {query.isLoading ? (
        <SkeletonBlock lines={3} className="py-3" />
      ) : query.isError ? (
        <div className="py-3">
          <ErrorCard text={t('common.loadFailed')} onRetry={() => void query.refetch()} />
        </div>
      ) : batches.length === 0 ? (
        <EmptyCalm text={t('warr.sheets.empty')} />
      ) : (
        <>
          <div className="flex flex-col gap-2 py-3">
            {gapSentence ? <InsightRow status="attention" text={gapSentence} /> : null}
            <DayStrip
              subject={t('warr.sheets.subject')}
              days={history.days.map((d) => ({
                day: d.day,
                state: d.batches.length > 0 ? 'came' : 'none',
              }))}
            />
          </div>

          <ul className="divide-y divide-border">
            {feed.map((item) =>
              item.kind === 'gap' ? (
                <li key={`gap-${item.day}`} className="flex min-h-14 items-center gap-2 py-3">
                  <span aria-hidden className="flex shrink-0 [&>svg]:h-5 [&>svg]:w-5">
                    <StatusShape status="attention" />
                  </span>
                  <p className="min-w-0 break-words text-body text-text">
                    {fmtDay(item.day, lang)} · {t('warr.sheets.none')}
                  </p>
                </li>
              ) : (
                <BatchRow
                  key={item.batch.id}
                  batch={item.batch}
                  onPhoto={(src, day) => setPhoto({ src, day })}
                />
              ),
            )}
          </ul>

          {rest.length > 0 ? (
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setShowOlder((v) => !v)}
              aria-expanded={showOlder}
            >
              {showOlder ? t('warr.sheets.fewer') : t('warr.sheets.older')}
            </Button>
          ) : null}
        </>
      )}

      {photo ? (
        <PhotoViewer
          src={photo.src}
          alt={t('warr.sheets.photoName', { day: photo.day })}
          onClose={() => setPhoto(null)}
        />
      ) : null}
    </SectionCard>
  );
}

function BatchRow({
  batch,
  onPhoto,
}: {
  batch: StaffPointBatch;
  onPhoto: (src: string, day: string) => void;
}) {
  const t = useT();
  const tn = useTn();
  const lang = useLang();
  const day = fmtDay(batch.workDate, lang);
  const summary = tn('warr.sheets.summary', batch.employeeCount, {
    points: fmtPointsGrouped(batch.totalPoints),
  });
  const by = batch.awardedByName ? t('warr.sheets.by', { name: batch.awardedByName }) : null;
  const entries = tn('warr.sheets.entries', batch.entryCount);
  return (
    <li className="flex flex-col gap-1 py-3">
      <p className="break-words text-body font-semibold text-text">{day}</p>
      <p className="break-words text-body text-text">{summary}</p>
      <p className="break-words text-meta text-text-muted">{by ? `${by} · ${entries}` : entries}</p>
      {batch.note ? (
        <p className="break-words text-body italic text-text-muted">{batch.note}</p>
      ) : null}
      {batch.hardCopyImageUrl ? (
        <Button
          variant="secondary"
          className="mt-1 self-start"
          leftIcon={<ImageIcon aria-hidden className="h-5 w-5" strokeWidth={2} />}
          aria-label={t('warr.sheets.photoName', { day })}
          onClick={() => onPhoto(batch.hardCopyImageUrl!, day)}
        >
          {t('warr.sheets.photo')}
        </Button>
      ) : null}
    </li>
  );
}
