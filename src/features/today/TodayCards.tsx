import { CalendarClock } from 'lucide-react';
import * as React from 'react';

import { InsightRow, ListRow, SectionCard } from '@/components/kit';
import type { ComingUpItem, PumpNowRow } from '@/features/glance/glanceModel';
import { kindStyle } from '@/features/reports/kindStyle';
import { sayWords } from '@/features/reports/types';
import { fmtDay, fmtTime } from '@/lib/fmt';
import { useLang, useT } from '@/lib/i18n';
import { tn, tnIn } from '@/lib/messages/_plural';
import type { TodayReport } from '@dk/shared/types';

/**
 * The three cards under the four numbers (spec 4.1): Pump now, Coming up, Done for you. That is the
 * cap: a number is shown in full in one place only (spec 3.4), and these are the short pointers.
 * Every row opens the page that holds it; a row exists only when its data exists.
 */

// ── A. Pump now ─────────────────────────────────────────────────────────────

export interface PumpNowCardProps {
  rows: PumpNowRow[];
  /** What a row's tap does, or undefined when the row opens nothing. */
  pressFor: (row: PumpNowRow) => (() => void) | undefined;
  onPlanOrder: (row: PumpNowRow) => void;
  onAskStock: () => void;
}

export function PumpNowCard({ rows, pressFor, onPlanOrder, onAskStock }: PumpNowCardProps) {
  const t = useT();
  if (rows.length === 0) return null;
  return (
    <SectionCard title={t('glance.section.now')} variant="list">
      {rows.map((row) => {
        const meta = [...(row.more ?? []), ...(row.meta ? [row.meta] : [])].join(' · ');
        const action =
          row.action === 'planOrder'
            ? { label: t('today.card.planOrder'), onPress: () => onPlanOrder(row), variant: 'primary' as const }
            : row.action === 'askStock'
              ? { label: t('today.card.askStock'), onPress: onAskStock, variant: 'secondary' as const }
              : undefined;
        const press = pressFor(row);
        return (
          <div key={row.id} data-pump-row={row.id} data-row-status={row.status}>
            <InsightRow
              status={row.status}
              text={row.text}
              {...(meta ? { meta } : {})}
              {...(action ? { action } : {})}
              {...(press ? { onPress: press } : {})}
            />
          </div>
        );
      })}
    </SectionCard>
  );
}

// ── B. Coming up ────────────────────────────────────────────────────────────

export function ComingUpCard({
  items,
  pressFor,
}: {
  items: ComingUpItem[];
  pressFor: (item: ComingUpItem) => (() => void) | undefined;
}) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <SectionCard title={t('glance.section.coming')} variant="list">
      {items.map((item) => {
        const press = pressFor(item);
        return (
          <div key={`${item.id}:${item.day}`} data-coming-up={item.id}>
            <ListRow
              leading={<CalendarClock aria-hidden className="h-5 w-5 text-text-muted" strokeWidth={1.75} />}
              title={item.text}
              {...(press ? { onPress: press } : {})}
            />
          </div>
        );
      })}
    </SectionCard>
  );
}

// ── C. Done for you ─────────────────────────────────────────────────────────

/** How many receipts and how many new reports show before "N more" / the two buttons. */
export const DONE_SHOWN = 3;
export const NEW_REPORTS_SHOWN = 3;

export interface DoneCardProps {
  /** MDG's receipts of today, newest first, each with the line its kind gives it. */
  done: Array<{ report: TodayReport; headline: string }>;
  /** The newest reports not already a row above, each with the line its kind gives it. */
  newReports: Array<{ report: TodayReport; headline: string }>;
  now: Date;
  onOpenReport: (report: TodayReport) => void;
  onSeeReports: () => void;
  onSeeServices: () => void;
}

export function DoneCard({ done, newReports, now, onOpenReport, onSeeReports, onSeeServices }: DoneCardProps) {
  const t = useT();
  const lang = useLang();
  const [all, setAll] = React.useState(false);
  const shown = all ? done : done.slice(0, DONE_SHOWN);
  const hidden = done.length - DONE_SHOWN;
  // "MDG did 6 things today"; with nothing done yet and new reports to read, the card is the new
  // reports and nothing else (no empty sentence above them); with neither, one calm line.
  const reportsOnly = done.length === 0 && newReports.length > 0;
  const title = done.length > 0 ? tnIn(lang, 'glance.done', done.length) : reportsOnly ? t('today.card.newReports') : t('glance.section.done');
  return (
    <SectionCard title={title} variant="list">
      {done.length > 0 ? (
        <>
          {shown.map(({ report, headline }) => (
            <div key={report.messageId} data-report-id={report.messageId} data-report-kind={report.kind}>
              <InsightRow
                status="ok"
                text={headline}
                value={fmtTime(report.sentAt, lang)}
                onPress={() => onOpenReport(report)}
              />
            </div>
          ))}
          {hidden > 0 ? (
            <button
              type="button"
              aria-expanded={all}
              onClick={() => setAll((v) => !v)}
              className="flex min-h-11 w-full items-center justify-center rounded-md px-4 text-cta text-text underline underline-offset-4 active:bg-surface-2"
            >
              {all ? t('today.less') : tn('kit.more', hidden)}
            </button>
          ) : null}
        </>
      ) : reportsOnly ? null : (
        <p data-testid="today-done-clear" className="py-3 text-body text-text-muted">
          {t('today.done.clear')}
        </p>
      )}
      {newReports.length > 0 ? (
        <div className={reportsOnly ? undefined : 'pt-3'}>
          {reportsOnly ? null : <h3 className="mb-1 text-subheading text-text">{t('today.card.newReports')}</h3>}
          <div className="divide-y divide-border">
            {newReports.slice(0, NEW_REPORTS_SHOWN).map(({ report: r, headline }) => {
              const name = sayWords(kindStyle(r.kind).names, lang);
              const day = fmtDay(r.day ?? r.sentAt, lang, now);
              const where = t('today.card.reportRow', { name, day });
              // What it says first (its own one-line headline and its status), where it is from underneath.
              return (
                <div key={r.messageId} data-report-id={r.messageId} data-report-kind={r.kind}>
                  <InsightRow
                    // A shape and a word only where there is something to look at: a tick on every report
                    // would say "All fine" under a verdict that may not.
                    {...(r.status === 'attention' ? { status: 'attention' as const } : {})}
                    text={headline.trim() || where}
                    {...(headline.trim() ? { meta: where } : {})}
                    onPress={() => onOpenReport(r)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 pt-2">
        <TextButton onClick={onSeeReports}>{t('today.pump.seeAll')}</TextButton>
        <TextButton onClick={onSeeServices}>{t('today.card.seeServices')}</TextButton>
      </div>
    </SectionCard>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 flex min-h-11 items-center rounded-md px-2 text-cta text-text underline underline-offset-4 active:bg-surface-2"
    >
      {children}
    </button>
  );
}
