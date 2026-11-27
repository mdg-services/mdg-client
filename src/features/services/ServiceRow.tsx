import { ChevronRight } from 'lucide-react';

import { StatusPill } from '@/components/kit/StatusPill';
import { cn } from '@/lib/cn';
import { fmtDay, fmtTime } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';

import { runLine } from './runTimes';
import { ServiceIcon } from './ServiceIcon';
import type { HubRow } from './servicesModel';
import { serviceStateWord } from './serviceState';

/**
 * Long words wrap anywhere: `break-words` alone does not shrink a word's minimum width, so a row with
 * "acknowledgement" at 200% text pushed the page sideways (measured, 40 px). `anywhere` does.
 */
const WRAP = 'min-w-0 [overflow-wrap:anywhere]';

/**
 * One service on the door: its picture, its plain name, one line of what its newest report said, the
 * state as a shape AND a word (only when the server has said), and when it last ran and runs next.
 * A service with a page is one 44px+ button ending in a chevron; one without (a data feed) is plain
 * text with what it does and when it runs next. Names and sentences wrap, nothing is cut off.
 */
export function ServiceRow({ row, onOpen }: { row: HubRow; onOpen: (serviceId: string) => void }) {
  const t = useT();
  const lang = useLang();
  const { state, times } = row;

  // "Last checked" is the time of the newest report: said only while the server's own run times are not known.
  const lastChecked =
    !times.lastRan && row.lastSeenAt
      ? t('svc.row.lastChecked', {
          time: `${fmtDay(row.lastSeenAt, lang)} ${fmtTime(row.lastSeenAt, lang)}`,
        })
      : null;
  const timeLine = times.lastRan || times.next ? runLine(times) : (lastChecked ?? '');
  // With no report yet a row still says something true: when you ask, when MDG files it, or that none has come.
  const noReportLine =
    row.group === 'ask'
      ? t('svc.row.askInChat')
      : row.group === 'filed'
        ? t('svc.page.filedWhenDue')
        : row.times.lastRan
          ? null
          : t('svc.row.none');
  const said = row.result ?? (row.tappable ? noReportLine : row.about || null);
  // A service that is stopped or late cannot vouch for what its newest report says: that is what it
  // KNEW, not how things are now. Say so in words, with the time, so the line and the pill never
  // disagree ("all fine" beside "stopped").
  const stale = state?.id === 'stopped' || state?.id === 'late';
  const seenAt = row.lastSeenAt ? fmtTime(row.lastSeenAt, lang) : '';
  const line =
    stale && row.result
      ? t('svc.row.lastKnown', { line: row.result }) +
        (seenAt && !row.result.includes(seenAt)
          ? ` (${fmtDay(row.lastSeenAt!, lang)} ${seenAt})`
          : '')
      : said;

  const body = (
    <>
      <ServiceIcon serviceId={row.id} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
        <span className={cn(WRAP, 'text-body font-medium text-text')}>{row.name}</span>
        {line ? <span className={cn(WRAP, 'text-body text-text-muted')}>{line}</span> : null}
        {state ? <StatusPill status={state.status} word={serviceStateWord(state, lang)} /> : null}
        {timeLine ? (
          <span className={cn(WRAP, 'text-meta text-text-muted')}>{timeLine}</span>
        ) : null}
      </span>
      {row.tappable ? (
        <ChevronRight aria-hidden className="mt-2 h-5 w-5 shrink-0 text-text-subtle" />
      ) : null}
    </>
  );
  const base = 'flex min-h-14 w-full min-w-0 items-start gap-3 py-3';
  return (
    <li data-service-row={row.id} data-state={state?.id ?? 'none'} className="min-w-0">
      {row.tappable ? (
        <button
          type="button"
          onClick={() => onOpen(row.id)}
          className={cn(base, 'rounded-md active:bg-surface-2')}
        >
          {body}
        </button>
      ) : (
        <div className={base}>{body}</div>
      )}
    </li>
  );
}
