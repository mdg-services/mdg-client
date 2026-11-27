import { CheckCircle2, CircleX, Clock, PauseCircle, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import { canPayHere } from '@/features/payments/policy';
import { formatDay } from '@/features/setup/cardView';
import { cn } from '@/lib/cn';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import type { PlannerView } from '@dk/shared/types';

import { planButtonKey, planLines, planSendable, planSummary, showPlanPrice, type PlanState } from './planView';
import { usePlannerView } from './usePlanner';
import { usePlanSend } from './usePlanSend';

const STATE_WORDS: Record<PlanState, MessageKey> = {
  active: 'planner.state.active',
  waiting: 'planner.state.waiting',
  paused: 'planner.state.paused',
  stopped: 'planner.state.stopped',
};

const STATE_ICON = { active: CheckCircle2, waiting: Clock, paused: PauseCircle, stopped: CircleX } as const;

/**
 * The planner's plan, on the home screen and in Settings: a badge that says the
 * state in words and with an icon (never by colour alone), one or two plain lines,
 * the price, and the one button the state allows. Reads `GET /v1/me/planner`.
 *
 * Inside the phone apps (Android and iPhone) it follows ADR 0022 §1 like the outlet
 * bill: the state and what was paid, read-only. The button shows there only while
 * the server's resend switch allows it (`resendInApp`), the lines without the button
 * never say where or how to pay, and the price is printed only beside an active plan.
 */
export function PlanStateCard() {
  const t = useT();
  const q = usePlannerView();
  if (q.data) return <PlanStateCardView view={q.data} />;
  if (q.isError) {
    return (
      <section className={CARD} aria-labelledby="plan-title">
        <h2 id="plan-title" className="text-subheading text-text">
          {t('planner.planTitle')}
        </h2>
        <p className="mt-2 text-body text-text-muted">{t('planner.loadFailed')}</p>
        <Button
          variant="secondary"
          size="lg"
          className="mt-3"
          onClick={() => void q.refetch()}
          loading={q.isFetching}
          leftIcon={<RefreshCw width={16} strokeWidth={1.75} aria-hidden />}
        >
          {t('common.retry')}
        </Button>
      </section>
    );
  }
  return (
    <section className={CARD} role="status" aria-busy="true">
      <span className="sr-only">{t('planner.loading')}</span>
      <div aria-hidden className="h-5 w-28 animate-pulse rounded bg-surface-2" />
      <div aria-hidden className="mt-3 h-4 w-full animate-pulse rounded bg-surface-2" />
      <div aria-hidden className="mt-2 h-4 w-2/3 animate-pulse rounded bg-surface-2" />
    </section>
  );
}

const CARD = 'rounded-xl border border-border bg-surface p-4';

export function PlanStateCardView({ view }: { view: PlannerView }) {
  const t = useT();
  const lang = useLang();
  const plan = planSummary(view);
  const send = usePlanSend(plan.action);
  const date = formatDay(plan.paidThrough, lang);
  const payHere = canPayHere();
  const sendable = planSendable(plan, view, payHere);
  const button = sendable ? planButtonKey(plan) : null;
  const lines = planLines(plan, date, sendable).map((l) => ('date' in l ? t(l.key, { date: l.date }) : t(l.key)));
  const Icon = STATE_ICON[plan.state];

  return (
    <section className={CARD} aria-labelledby="plan-title" data-plan-state={plan.state}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plan-title" className="text-subheading text-text">
          {t('planner.planTitle')}
        </h2>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-meta font-semibold',
            plan.state === 'active'
              ? 'bg-success-soft text-success'
              : plan.state === 'waiting' || plan.state === 'paused'
                ? 'bg-warning-soft text-warning-strong'
                : 'bg-danger-soft text-danger',
          )}
        >
          <Icon width={16} strokeWidth={2} aria-hidden />
          {t(STATE_WORDS[plan.state])}
        </span>
      </div>
      {lines.map((line) => (
        <p key={line} className="mt-2 text-body leading-relaxed text-text">
          {line}
        </p>
      ))}
      {showPlanPrice(plan, payHere) ? <p className="mt-2 text-meta text-text-muted">{t('planner.price')}</p> : null}
      {button ? (
        <div className="mt-3">
          <Button
            size="lg"
            fullWidth
            variant={plan.action === 'restart' ? 'primary' : 'secondary'}
            onClick={send.press}
            loading={send.pending}
          >
            {send.pending ? t('planner.sending') : t(button)}
          </Button>
          <p
            aria-live={send.failed ? 'assertive' : 'polite'}
            role={send.failed ? 'alert' : undefined}
            className={cn('mt-2 min-h-[1.25rem] text-meta', send.failed ? 'text-danger' : 'text-text')}
          >
            {send.said ?? ''}
          </p>
        </div>
      ) : null}
    </section>
  );
}
