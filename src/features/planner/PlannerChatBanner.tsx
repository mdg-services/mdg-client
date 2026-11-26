import { canPayHere } from '@/features/payments/policy';
import { cn } from '@/lib/cn';
import { useT, type MessageKey } from '@/lib/i18n';

import { useIsPlanner } from './isPlanner';
import { planButtonKey, planSendable, planSummary } from './planView';
import { usePlannerView } from './usePlanner';
import { usePlanSend } from './usePlanSend';

/** The strip's line for each state that has one: with the button, and without it (phone apps, switch off). */
const LINES: Record<'waiting' | 'paused' | 'stopped', { withButton: MessageKey; stateOnly: MessageKey }> = {
  waiting: { withButton: 'planner.bannerWaiting', stateOnly: 'planner.bannerWaitingApp' },
  paused: { withButton: 'planner.bannerPaused', stateOnly: 'planner.bannerPausedApp' },
  stopped: { withButton: 'planner.bannerStopped', stateOnly: 'planner.bannerStoppedApp' },
};

/**
 * The slim strip at the top of a planner's chat while the plan is not active
 * (ADR 0058 §4.1, §5, §13.3): a question asked now gets the fixed "plan not active"
 * reply, so the strip says why before they type, with the same send button as the
 * home card, word for word (`planButtonKey`): the chat's own lines quote that label,
 * so the strip right above them must show the same one. It never carries a pay button
 * or a link: the details go to WhatsApp and SMS.
 *
 * One live region, on the line: it is what changes ("Sent on WhatsApp and SMS."). A
 * failed send replaces it with its own alert. A region around the whole strip would
 * read the button out again on every change, and a region inside another is read
 * unevenly by screen readers.
 *
 * Inside the phone apps it follows the outlet bill strip (ADR 0022 §1): the button
 * shows only while the server's resend switch allows it, and without the button the
 * line says the state alone, never where or how to pay.
 *
 * `hidden` steps it aside (messages being picked, a search open) without leaving
 * the tree, as the other strips above the thread do; `disabled` is a thread that
 * never carries it (anyone who is not a planner, the managers' group).
 */
export function PlannerChatBanner({ hidden = false, disabled = false }: { hidden?: boolean; disabled?: boolean }) {
  const planner = useIsPlanner();
  const q = usePlannerView();
  const plan = q.data ? planSummary(q.data) : null;
  const send = usePlanSend(plan?.action ?? null);
  const t = useT();
  if (disabled || !planner || hidden || !q.data || !plan || plan.state === 'active') return null;

  const state = plan.state;
  const sendable = planSendable(plan, q.data, canPayHere());
  const words = LINES[state];
  const button = planButtonKey(plan);
  return (
    <div
      data-planner-banner={state}
      className={cn(
        'flex shrink-0 items-center gap-2 border-b px-3 py-1.5',
        state === 'stopped'
          ? 'border-danger/20 bg-danger-soft text-danger'
          : 'border-warning/20 bg-warning-soft text-warning-strong',
      )}
    >
      {/* A failed send mounts its own alert, so it is read at once and only once. */}
      {send.failed ? (
        <p role="alert" className="min-w-0 flex-1 text-meta font-medium leading-snug">
          {send.said}
        </p>
      ) : (
        <p role="status" className="min-w-0 flex-1 text-meta font-medium leading-snug">
          {send.said ?? t(sendable ? words.withButton : words.stateOnly)}
        </p>
      )}
      {sendable && button && !send.said ? (
        <button
          type="button"
          onClick={send.press}
          disabled={send.pending}
          className="min-h-12 max-w-[50%] shrink-0 rounded-full border border-current px-3 py-1 text-center text-meta font-semibold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
        >
          {send.pending ? t('planner.sending') : t(button)}
        </button>
      ) : null}
    </div>
  );
}
