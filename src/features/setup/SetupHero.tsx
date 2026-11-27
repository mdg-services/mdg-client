import { Check, Minus } from 'lucide-react';
import * as React from 'react';

import { AskMdgButton, HelpChip, InsightRow, ProgressBar, StatusPill } from '@/components/kit';
import { Button, Card } from '@/components/ui';
import { PortalLoginBox } from '@/features/chat/PortalLoginBox';
import { usePortalLogins } from '@/hooks/api/usePortalLogins';
import { cn } from '@/lib/cn';
import { indiaDay } from '@/lib/fmt';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import { PORTAL_NAMES, type OutletSetupView, type PortalLoginState, type SetupStripState, type SetupStripStep } from '@dk/shared/types';

import { companyLabel, formatDay, isPastDue, istToday } from './cardView';
import {
  STEP_FORM,
  STEP_TITLES,
  STEP_WHY,
  TURN_WORDS,
  heroShows,
  mdgIsWorking,
  refusedLogins,
  savedLogins,
  turnOf,
  type Turn,
} from './heroView';
import { LazyCardView } from './LazyCardView';
import { STRIP_LABEL_KEYS, stripCaptionKey } from './stripView';
import { useOutletSetup } from './useOutletSetup';

/**
 * THE SETUP HERO ON TODAY (spec 4.9). While the pump is not live, the card at the top of Today is
 * this, not the verdict: "Setting up your pump", whose turn it is ("Your turn", "MDG's turn", "All
 * done": `OutletSetupView.waitingOn`), how many of the five steps are done, and the five steps in
 * order. The step the owner must do opens its own form right in the card (the same forms the chat
 * card uses, `inCard`), so the work is where the owner lands and not two taps away in the chat. A
 * done step shows what MDG now holds (the company, the bill name and its due date, the logins saved
 * and when). The four numbers Today will show are dashed ghosts until the services start. A login the
 * portal refused is a Needs-you row at the top. A manager sees all of it read-only (`canEdit`).
 *
 * Payments stay read-only: the bill line is the existing `PaymentCard` (no pay button, no way to pay).
 * Status is never colour alone: every step has a shape and a word ("Done", "Now", "Later").
 *
 * The hero draws NOTHING when the pump is live, not set up through the app, or while the answer is on
 * its way: Today asks `useSetupHeroActive()` whether to put it in the verdict's place.
 */
export function SetupHero() {
  const t = useT();
  const q = useOutletSetup();
  const titleId = React.useId();
  const view = q.data;
  if (!heroShows(view)) return null;

  const steps = view.strip.filter(({ step }) => step in STRIP_LABEL_KEYS);
  const done = steps.filter((s) => s.state === 'done' || s.state === 'skipped').length;
  const turn = turnOf(view);
  const caption = stripCaptionKey(view);
  // The refused-login row is only for a login that was saved and has since stopped working.
  const loginsStep = steps.find((s) => s.step === 'logins')?.state;
  const checkLogins = loginsStep === 'done' || loginsStep === 'skipped';

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      data-testid="setup-hero"
      data-turn={turn}
      className="flex flex-col gap-3 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={titleId} className="min-w-0 break-words text-title text-text">
          {t('first.setup.title')}
        </h2>
        <TurnPill turn={turn} />
      </div>

      <ProgressBar value={done} max={steps.length} text={t('flow.progress', { done, total: steps.length })} />

      {caption ? (
        <p className="break-words text-body text-text" aria-live="polite">
          {t(caption)}
        </p>
      ) : null}
      {!view.canEdit ? <p className="break-words text-meta text-text-muted">{t('first.setup.managerNote')}</p> : null}

      {checkLogins ? <RefusedLogins view={view} /> : null}

      <ol aria-label={t('first.setup.title')} className="divide-y divide-border">
        {steps.map(({ step, state }, i) => (
          <StepRow key={step} view={view} step={step} state={state} n={i + 1} />
        ))}
      </ol>

      <GhostSlots />

      <HelpChip videoId="setup_steps" className="self-start" />
    </Card>
  );
}

/**
 * Should Today put the setup hero in the verdict card's place? True once the setup answer is in and the
 * pump is still on its way to live. False while it loads, on a live pump and for an admin.
 */
export function useSetupHeroActive(): boolean {
  return heroShows(useOutletSetup().data);
}

function TurnPill({ turn }: { turn: Turn }) {
  const t = useT();
  const status = turn === 'mdg' ? 'waiting' : turn === 'done' ? 'ok' : 'attention';
  return <StatusPill status={status} word={t(TURN_WORDS[turn])} />;
}

const STATE_WORDS: Record<SetupStripState, MessageKey> = {
  done: 'first.setup.state.done',
  current: 'first.setup.state.now',
  todo: 'first.setup.state.later',
  skipped: 'first.setup.state.skipped',
};

/** The tag at a step's right: a shape and a word, never colour alone. */
function StateTag({ state, mdgWorking }: { state: SetupStripState; mdgWorking: boolean }) {
  const t = useT();
  if (state === 'done') return <StatusPill status="ok" word={t(STATE_WORDS.done)} />;
  if (state === 'current') {
    return mdgWorking ? (
      <StatusPill status="waiting" word={t('first.setup.state.mdgNow')} />
    ) : (
      <StatusPill status="attention" word={t(STATE_WORDS.current)} />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-text-muted">
      {state === 'skipped' ? (
        <Minus aria-hidden width={16} strokeWidth={2.2} />
      ) : (
        <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border-2 border-border-strong" />
      )}
      <span>{t(STATE_WORDS[state])}</span>
    </span>
  );
}

function StepRow({
  view,
  step,
  state,
  n,
}: {
  view: OutletSetupView;
  step: SetupStripStep;
  state: SetupStripState;
  n: number;
}) {
  const t = useT();
  const form = STEP_FORM[step];
  const open = state === 'current';
  const mdgWorking = open && mdgIsWorking(view, step);
  const finished = state === 'done' || state === 'skipped';
  return (
    <li
      data-testid={`hero-step-${step}`}
      data-step={step}
      data-state={state}
      className={cn('flex flex-col gap-2 py-3 first:pt-0 last:pb-0', state === 'todo' && 'text-text-muted')}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 break-words text-subheading text-text">
          <span className="tabular-nums">{n}.</span> {t(STEP_TITLES[step])}
        </h3>
        <StateTag state={state} mdgWorking={mdgWorking} />
      </div>

      {finished ? <DoneAnswer view={view} step={step} state={state} /> : null}

      {!finished && !open ? <p className="break-words text-body text-text-muted">{t(STEP_WHY[step])}</p> : null}

      {open && !form ? <p className="break-words text-body text-text-muted">{t(STEP_WHY[step])}</p> : null}

      {open && form ? (
        // The step's own form, exactly as the chat card draws it: a tap or "Save" saves it, and the hero
        // moves on by itself when the server says the step is done. Not `flow-dense`: that class would
        // shrink the text and the taps below the app's floors.
        <div data-no-swipe>
          {form === 'payment' ? <BillLine view={view} /> : <LazyCardView card={form} view={view} inCard />}
          {step === 'company' && view.canEdit ? <OtherCompany /> : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The first bill while it is not paid, said in DAYS and never in rupees: the amount belongs to Bill and
 * plan, not to Today (spec question 6, default). No pay button and no way to pay either (ADR 0022).
 */
function BillLine({ view }: { view: OutletSetupView }) {
  const t = useT();
  const lang = useLang();
  const { state, dueOn } = view.payment;
  if (state !== 'sent') return <p className="break-words text-body text-text-muted">{t('setup.payPreparing')}</p>;
  const due = formatDay(dueOn, lang);
  return (
    <div className="flex flex-col gap-1">
      {due ? <p className="break-words text-body text-text">{t('first.setup.billDue', { date: due })}</p> : null}
      {isPastDue(dueOn, istToday()) ? (
        <p className="break-words text-body font-semibold text-status-problem-ink">{t('setup.billOverdue')}</p>
      ) : due ? (
        <p className="break-words text-meta text-text-muted">{t('setup.billMeanwhile', { date: due })}</p>
      ) : null}
    </div>
  );
}

/** A pump that is with another company: the owner says so to MDG, in the chat, in his own words. */
function OtherCompany() {
  const t = useT();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="min-w-0 break-words text-body text-text-muted">{t('first.setup.otherCompany')}</p>
      <AskMdgButton draft={t('first.setup.otherCompanyDraft')} />
    </div>
  );
}

/** What a finished step holds, in one or two plain lines. */
function DoneAnswer({
  view,
  step,
  state,
}: {
  view: OutletSetupView;
  step: SetupStripStep;
  state: SetupStripState;
}) {
  const t = useT();
  const lang = useLang();
  if (state === 'skipped') return null;
  const mdgDid = (by: 'dealer' | 'mdg' | null) =>
    by === 'mdg' ? <p className="break-words text-meta text-text-muted">{t('setup.filledByMdg')}</p> : null;

  switch (step) {
    case 'company':
      return view.company ? (
        <div>
          <p className="break-words text-body font-semibold text-text">{companyLabel(view.company, lang)}</p>
          {mdgDid(view.companySavedBy)}
        </div>
      ) : null;
    case 'billing': {
      if (!view.billing) return null;
      const due = view.payment.state === 'sent' ? formatDay(view.payment.dueOn, lang) : '';
      return (
        <div>
          <p className="break-words text-body font-semibold text-text">
            {due ? t('first.setup.billAnswer', { name: view.billing.name, date: due }) : view.billing.name}
          </p>
          {mdgDid(view.billingSavedBy)}
        </div>
      );
    }
    case 'payment':
      // The paid bill, its date and "View receipt": the one link a paid bill may have (ADR 0022).
      return <LazyCardView card="payment" view={view} inCard />;
    case 'logins':
      return <LoginsAnswer view={view} />;
    case 'start':
      return <p className="break-words text-body font-semibold text-text">{t('setup.started')}</p>;
  }
}

/** The portals saved, each with the day it was saved and by whom. Asks for the list only when drawn. */
function LoginsAnswer({ view }: { view: OutletSetupView }) {
  const t = useT();
  const lang = useLang();
  const q = usePortalLogins();
  const saved = q.data ? savedLogins(view, q.data.portals) : [];
  if (saved.length === 0) {
    return <p className="break-words text-body font-semibold text-text">{t('flow.loginsSaved')}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {saved.map((p) => {
        const portal = PORTAL_NAMES[p.portal] ?? p.portal;
        const date = p.savedAt ? formatDay(indiaDay(new Date(p.savedAt)), lang) : '';
        const mdg = p.savedBy === 'mdg';
        const text = date
          ? t(mdg ? 'first.setup.loginSavedMdg' : 'first.setup.loginSaved', { portal, date })
          : t(mdg ? 'first.setup.loginSavedMdgNoDate' : 'first.setup.loginSavedNoDate', { portal });
        return (
          <li key={p.portal} className="flex items-start gap-2 text-body text-text">
            <Check aria-hidden width={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-status-ok-ink" />
            <span className="min-w-0 break-words">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A login the portal refused is a "Needs you" row at the top of the hero: one sentence naming the
 * portal and the day, and (for the owner) a button that opens that portal's own box to type it again.
 * The list is asked for only here, after the logins step is done.
 */
function RefusedLogins({ view }: { view: OutletSetupView }) {
  const t = useT();
  const q = usePortalLogins();
  const refused = q.data ? refusedLogins(q.data.portals) : [];
  if (refused.length === 0) return null;
  return (
    <section aria-label={t('first.setup.needsYou')} data-testid="hero-needs-you" className="rounded-lg bg-status-problem-soft p-3">
      <h3 className="text-subheading text-status-problem-ink">{t('first.setup.needsYou')}</h3>
      <div className="mt-1 divide-y divide-border">
        {refused.map((p) => (
          <RefusedRow key={p.portal} login={p} canEdit={view.canEdit} />
        ))}
      </div>
    </section>
  );
}

function RefusedRow({ login, canEdit }: { login: PortalLoginState; canEdit: boolean }) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = React.useState(false);
  const portal = PORTAL_NAMES[login.portal] ?? login.portal;
  const date = login.refusedAt ? formatDay(indiaDay(new Date(login.refusedAt)), lang) : '';
  const text = date ? t('first.setup.refused', { portal, date }) : t('first.setup.refusedNoDate', { portal });
  return (
    <div data-testid={`hero-refused-${login.portal}`}>
      <InsightRow
        status="problem"
        text={text}
        {...(canEdit && !open ? { action: { label: t('first.setup.refusedAction'), onPress: () => setOpen(true) } } : {})}
      />
      {open ? (
        <div className="pb-2">
          <PortalLoginBox portals={[login.portal]} />
          <Button variant="secondary" size="md" className="mt-2" onClick={() => setOpen(false)}>
            {t('first.setup.refusedClose')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const GHOST_SLOTS: readonly MessageKey[] = [
  'first.setup.slot.sales',
  'first.setup.slot.variation',
  'first.setup.slot.deposit',
  'first.setup.slot.score',
];

/** The four numbers Today will show, as dashed empty places: the owner sees what is coming. */
function GhostSlots() {
  const t = useT();
  return (
    <div>
      <p className="text-meta text-text-muted">{t('first.setup.ghostTitle')}</p>
      <ul
        aria-label={t('first.setup.ghostTitle')}
        data-testid="hero-ghost-slots"
        className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2"
      >
        {GHOST_SLOTS.map((key) => (
          <li
            key={key}
            data-ghost-slot={key}
            className="flex min-h-20 flex-col justify-between gap-1 rounded-xl border-2 border-dashed border-border-strong p-3"
          >
            <span className="break-words text-meta font-semibold text-text-muted">{t(key)}</span>
            <span className="text-meta text-text-subtle">{t('first.setup.ghostWait')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
