import { AskMdgButton } from '@/components/kit/AskMdgButton';
import { ErrorCard } from '@/components/kit/ErrorCard';
import { SkeletonBlock } from '@/components/kit/SkeletonBlock';
import { useComplaints } from '@/hooks/api/useComplaints';
import { useWorkPermits } from '@/hooks/api/useWorkPermits';
import { fmtDay, indiaDay } from '@/lib/fmt';
import { COMPLAINT_FINAL_STAGES, WORK_PERMIT_FINAL_STAGES, sayIn } from '@dk/shared/types';
import type { ComplaintDealerView, WorkPermitDealerView } from '@dk/shared/types';

import { Fact, PanelHeading, PanelList, PanelRow, PanelStack, Small, type PanelCtx } from './parts';

/**
 * The two services that work in chat boxes and have no report kind: their pages list what the box
 * holds, from its own routes (`/v1/me/complaints`, `/v1/me/work-permits`). Each asks for its list only
 * while its page is open, draws its own loading and failure, and never touches the other sections.
 */

const THIRTY_DAYS_MS = 30 * 86_400_000;

/** Whole days since an instant, India calendar. */
export function daysSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const from = Date.parse(`${indiaDay(new Date(iso))}T00:00:00Z`);
  const to = Date.parse(`${indiaDay(now)}T00:00:00Z`);
  return Number.isNaN(from) || Number.isNaN(to)
    ? null
    : Math.max(0, Math.round((to - from) / 86_400_000));
}

/** Complaints still open, newest first, and the ones closed in the last 30 days. */
export function splitComplaints(
  list: readonly ComplaintDealerView[],
  now: Date,
): { open: ComplaintDealerView[]; closed: ComplaintDealerView[] } {
  const ordered = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const open = ordered.filter((c) => !COMPLAINT_FINAL_STAGES.includes(c.stage));
  const closed = ordered.filter(
    (c) =>
      (c.stage === 'closed' || c.stage === 'auto_closed') &&
      now.getTime() - Date.parse(c.updatedAt) <= THIRTY_DAYS_MS,
  );
  return { open, closed };
}

export function ComplaintsPanel({ ctx }: { ctx: PanelCtx }) {
  const { t, tn, lang, now } = ctx;
  const q = useComplaints();
  if (q.isPending) return <SkeletonBlock lines={3} />;
  if (q.isError) return <ErrorCard text={t('svc.box.error')} onRetry={() => void q.refetch()} />;
  const { open, closed } = splitComplaints(
    Array.isArray(q.data?.complaints) ? q.data.complaints : [],
    now,
  );
  return (
    <PanelStack>
      <p className="break-words text-title text-text">
        {open.length === 0 ? t('svc.comp.none') : tn('svc.comp.open', open.length)}
      </p>
      {open.length > 0 ? (
        <PanelList label={t('svc.comp.openList')}>
          {open.map((c) => {
            const age = daysSince(c.filedAt, now);
            const engineer = c.engineer?.name
              ? t('svc.comp.engineer', { name: c.engineer.name })
              : null;
            const eta = c.engineer?.etaHours
              ? tn('svc.comp.eta', Math.round(c.engineer.etaHours))
              : null;
            const meta = [
              sayIn(c.statusLine, lang),
              age === null ? null : age === 0 ? t('svc.comp.today') : tn('svc.comp.days', age),
              engineer,
              eta,
            ]
              .filter(Boolean)
              .join(' · ');
            return <PanelRow key={c.id} text={sayIn(c.title, lang)} meta={meta} />;
          })}
        </PanelList>
      ) : null}
      {closed.length > 0 ? (
        <>
          <PanelHeading>{t('svc.comp.closed')}</PanelHeading>
          <PanelList label={t('svc.comp.closed')}>
            {closed.map((c) => (
              <PanelRow
                key={c.id}
                text={sayIn(c.title, lang)}
                meta={fmtDay(c.updatedAt, lang, now)}
              />
            ))}
          </PanelList>
        </>
      ) : null}
      <AskMdgButton
        label={t('svc.comp.ask')}
        draft={t('svc.comp.draft')}
        className="self-stretch"
      />
    </PanelStack>
  );
}

/** The permit that is in force, and the others still open or lately closed. */
export function splitPermits(list: readonly WorkPermitDealerView[]): {
  active: WorkPermitDealerView[];
  others: WorkPermitDealerView[];
} {
  const ordered = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active = ordered.filter(
    (p) => p.stage === 'issued' || p.stage === 'closing' || p.stage === 'extending',
  );
  const others = ordered.filter(
    (p) =>
      !active.includes(p) && !WORK_PERMIT_FINAL_STAGES.includes(p.stage) && p.stage !== 'lapsed',
  );
  return { active, others };
}

export function PermitsPanel({ ctx }: { ctx: PanelCtx }) {
  const { t, lang, now } = ctx;
  const q = useWorkPermits();
  if (q.isPending) return <SkeletonBlock lines={3} />;
  if (q.isError) return <ErrorCard text={t('svc.box.error')} onRetry={() => void q.refetch()} />;
  const { active, others } = splitPermits(Array.isArray(q.data?.permits) ? q.data.permits : []);
  return (
    <PanelStack>
      {active.length === 0 ? <Fact>{t('svc.permit.none')}</Fact> : null}
      {active.length > 0 ? (
        <PanelList label={t('svc.permit.activeList')}>
          {active.map((p) => {
            const meta = [
              sayIn(p.statusLine, lang),
              p.number ? t('svc.permit.number', { no: p.number }) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <PanelRow
                key={p.id}
                text={
                  <>
                    {sayIn(p.title, lang)}
                    {p.validTill ? (
                      <span className="block text-body font-semibold">
                        {t('svc.permit.till', { day: fmtDay(p.validTill, lang, now) })}
                      </span>
                    ) : null}
                  </>
                }
                meta={meta}
              />
            );
          })}
        </PanelList>
      ) : null}
      {others.length > 0 ? (
        <PanelList label={t('svc.permit.otherList')}>
          {others.map((p) => (
            <PanelRow key={p.id} text={sayIn(p.title, lang)} meta={sayIn(p.statusLine, lang)} />
          ))}
        </PanelList>
      ) : null}
      <Small>{t('svc.permit.window')}</Small>
      <AskMdgButton
        label={t('svc.permit.ask')}
        draft={t('svc.permit.draft')}
        className="self-stretch"
      />
    </PanelStack>
  );
}
