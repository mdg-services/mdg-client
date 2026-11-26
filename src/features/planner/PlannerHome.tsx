import { ChevronRight, MessageCircleQuestion, Store } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { AppBar, type AppBarMenuItem } from '@/components/AppBar';
import { Button } from '@/components/ui';
import { BatteryGuideCard } from '@/features/push/BatteryGuide';
import { PushNotice } from '@/features/push/PushNotice';
import { useGreeting } from '@/features/today/Greeting';
import { useT, type MessageKey } from '@/lib/i18n';
import { markFirstScreen } from '@/lib/perfReport';

import { PlanStateCard } from './PlanStateCard';
import { useAskInChat } from './useAskInChat';
import { usePlannerView } from './usePlanner';

/** A few questions people planning a pump ask, to show what kind of thing to ask. */
const EXAMPLES: MessageKey[] = [
  'planner.example.distance',
  'planner.example.land',
  'planner.example.licences',
  'planner.example.selection',
];

/**
 * The planner's Today (ADR 0058): someone planning a pump has no reports, tasks or
 * outlet setup, so the outlet's Today would be a page of empty sections. Instead,
 * top to bottom: the plan card (and its one button), "Ask a question" with a few
 * examples that open the chat with the question typed in, and "Is your pump open
 * now?", the door to Dealer Kavach.
 */
export function PlannerHome() {
  const t = useT();
  const navigate = useNavigate();
  const ask = useAskInChat();
  const plan = usePlannerView();
  const greeting = useGreeting({ isManager: false });

  // "Opening the app" is counted up to the plan's first answer (or its failure), as
  // the outlet's Today counts up to its feed.
  const shown = !!plan.data || plan.isError;
  React.useEffect(() => {
    if (shown) markFirstScreen();
  }, [shown]);

  const menu = React.useMemo<AppBarMenuItem[]>(
    () => [{ key: 'settings', label: t('chatlist.settings'), onSelect: () => navigate('/settings') }],
    [t, navigate],
  );

  return (
    <>
      <AppBar
        variant="home"
        titleAsHeading
        title={greeting.title}
        subtitle={`${t('planner.title')} · ${greeting.line}`}
        menu={menu}
      />
      <div className="flex flex-1 flex-col bg-bg" data-testid="planner-home">
        <PushNotice />
        <BatteryGuideCard />
        <div className="flex flex-1 flex-col gap-6 px-4 pb-10 pt-4">
          <PlanStateCard />

          <section aria-labelledby="planner-ask" className="rounded-xl border border-border bg-surface p-4">
            <h2 id="planner-ask" className="text-subheading text-text">
              {t('planner.askTitle')}
            </h2>
            <p className="mt-2 text-body leading-relaxed text-text-muted">{t('planner.askLead')}</p>
            <Button
              size="lg"
              fullWidth
              className="mt-3"
              onClick={() => ask()}
              leftIcon={<MessageCircleQuestion width={20} strokeWidth={1.75} aria-hidden />}
            >
              {t('planner.askButton')}
            </Button>
            <h3 id="planner-examples" className="mt-5 text-meta font-semibold text-text-muted">
              {t('planner.examplesTitle')}
            </h3>
            <ul aria-labelledby="planner-examples" className="mt-2 flex flex-col gap-2">
              {EXAMPLES.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => ask(t(key))}
                    className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 py-2 text-left text-body text-text transition-colors active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <span className="min-w-0 flex-1">{t(key)}</span>
                    <ChevronRight className="size-5 shrink-0 text-text-subtle rtl:rotate-180" strokeWidth={1.75} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-meta leading-relaxed text-text-subtle">{t('planner.notAdvice')}</p>
          </section>

          <PumpOpenCard />
        </div>
      </div>
    </>
  );
}

/** "Is your pump open now?": the way to Dealer Kavach, on the home and nowhere loud. */
export function PumpOpenCard() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <section aria-labelledby="planner-open" className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
          <Store width={22} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="planner-open" className="text-subheading text-text">
            {t('planner.openTitle')}
          </h2>
          <p className="mt-1 text-body leading-relaxed text-text-muted">{t('planner.openBody')}</p>
        </div>
      </div>
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        className="mt-3"
        onClick={() => navigate('/switch-to-dealer-kavach')}
      >
        {t('planner.openButton')}
      </Button>
    </section>
  );
}
