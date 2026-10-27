import { Check, Minus, X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { GuideVideoSheet } from '@/features/help/GuideVideoSheet';
import { videoTitle } from '@/features/help/helpView';
import { useGuideVideos } from '@/features/help/useGuideVideos';
import { cn } from '@/lib/cn';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';
import type { OutletSetupView, SetupStripState, SetupStripStep } from '@dk/shared/types';

import { LazyCardView } from './LazyCardView';
import {
  DEALER_STEPS,
  STRIP_LABEL_KEYS,
  currentStep,
  stripCaptionKey,
  stripVisible,
} from './stripView';
import { useOutletSetup } from './useOutletSetup';

const STATE_WORDS: Record<SetupStripState, MessageKey> = {
  done: 'setup.stateDone',
  current: 'setup.stateCurrent',
  todo: 'setup.stateTodo',
  skipped: 'setup.stateSkipped',
};

/** The card a strip step opens. */
const STEP_CARD = {
  company: 'company',
  billing: 'billing',
  payment: 'payment',
  logins: 'logins',
} as const;

function Dot({ state, index }: { state: SetupStripState; index: number }) {
  const base = 'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-medium';
  if (state === 'done') {
    return (
      <span className={cn(base, 'bg-wa-accent text-white')}>
        <Check width={15} strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span className={cn(base, 'border-2 border-wa-accent bg-wa-in text-wa-accent-strong')}>
        {index + 1}
      </span>
    );
  }
  if (state === 'skipped') {
    return (
      <span className={cn(base, 'border border-wa-divider bg-wa-row-active text-wa-meta')}>
        <Minus width={14} strokeWidth={2} aria-hidden />
      </span>
    );
  }
  return (
    <span className={cn(base, 'border border-wa-divider bg-wa-in text-wa-meta')}>{index + 1}</span>
  );
}

/**
 * The strip at the top of the owner's MDG chat while an outlet is being set up:
 * five steps — company, bill address, payment, logins, start — each done,
 * current, waiting or not needed, and one line saying what is happening now.
 *
 * Tapping the CURRENT step that the dealer does themselves opens that card in a
 * sheet over the chat, so nobody has to scroll back to find it. It closes by
 * itself once that step is done. The last step ("start") is MDG's, and is only
 * shown. It draws from the live view; for an outlet that is not being set up, or
 * is live, it draws nothing and takes no room. `hidden` is the page asking it to
 * step aside (messages being picked, a search open) without leaving the tree;
 * `disabled` is a thread that never carries setup (the managers' group), where it
 * does not even ask.
 */
/** The library id of the dealer's setup walkthrough (marketing/explainers/setup-steps). */
const SETUP_VIDEO_ID = 'setup_steps';

export function SetupStrip({
  hidden = false,
  disabled = false,
}: {
  hidden?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const q = useOutletSetup({ enabled: !disabled });
  const view = q.data;
  const [open, setOpen] = React.useState<SetupStripStep | null>(null);
  // "How setup works": the dealer's own walkthrough of these steps, once it is in
  // the library (uploaded) — never a dead link before then.
  // Not for a BPCL or HPCL pump: the walkthrough narrates Indian Oil's SDMS and IRAS
  // logins, which such an owner is never shown.
  const videos = useGuideVideos();
  const companyPump = view?.company === 'bpcl' || view?.company === 'hpcl';
  const setupVideo = companyPump
    ? null
    : (videos.data?.find((v) => v.id === SETUP_VIDEO_ID && v.available) ?? null);
  const [playing, setPlaying] = React.useState(false);

  const now = !disabled && view && stripVisible(view) ? currentStep(view) : null;
  // The step has moved on (the dealer saved it, or MDG's team did something):
  // the sheet that was open for it has nothing left to ask.
  React.useEffect(() => {
    if (open && open !== now) setOpen(null);
  }, [open, now]);

  if (disabled || hidden || !stripVisible(view)) return null;
  const caption = stripCaptionKey(view);
  // A server that sends a step this app has no words for (the retired services step
  // came first) is drawn without it: skipped, not drawn as a blank.
  const steps = view.strip.filter(({ step }) => step in STRIP_LABEL_KEYS);

  return (
    <div data-setup-strip className="shrink-0 border-b border-wa-divider bg-wa-bar px-2 pb-1.5 pt-1.5">
      <ol
        aria-label={t('setup.stripLabel')}
        // One column per step it draws: a server from before the company step still sends four.
        className={cn('grid gap-1', steps.length === 4 ? 'grid-cols-4' : 'grid-cols-5')}
      >
        {steps.map(({ step, state }, i) => {
          const tappable = state === 'current' && DEALER_STEPS.includes(step);
          const inner = (
            <>
              <Dot state={state} index={i} />
              <span
                className={cn(
                  'break-words text-center text-[11px] leading-tight',
                  state === 'current' ? 'font-medium text-wa-bar-text' : 'text-wa-meta',
                  state === 'skipped' && 'line-through',
                )}
              >
                {t(STRIP_LABEL_KEYS[step])}
              </span>
              <span className="sr-only">{t(STATE_WORDS[state])}</span>
            </>
          );
          return (
            <li key={step} data-step={step} data-state={state} className="min-w-0">
              {tappable ? (
                <button
                  type="button"
                  onClick={() => setOpen(step)}
                  className="flex min-h-11 w-full flex-col items-center gap-1 rounded-md px-0.5 py-0.5 active:bg-wa-row-active"
                >
                  {inner}
                </button>
              ) : (
                <div className="flex min-h-11 w-full flex-col items-center gap-1 px-0.5 py-0.5">
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {caption ? (
        <p className="px-1 pt-0.5 text-center text-[12px] leading-snug text-wa-meta" aria-live="polite">
          {t(caption)}
        </p>
      ) : null}
      {setupVideo ? (
        <p className="text-center">
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="min-h-8 px-2 text-[12px] font-medium text-wa-bar-text underline-offset-2 hover:underline"
          >
            ▶ {t('setup.howItWorks')}
          </button>
        </p>
      ) : null}
      {playing && setupVideo
        ? createPortal(
            <GuideVideoSheet
              id={setupVideo.id}
              title={videoTitle(setupVideo, lang)}
              onClose={() => setPlaying(false)}
            />,
            document.body,
          )
        : null}
      {open && open in STEP_CARD ? (
        <SetupSheet step={open} view={view} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}

/**
 * One setup card in a bottom sheet. The Back button and Escape close it, the
 * page behind it stops scrolling, and a form inside can be as tall as it needs:
 * the sheet scrolls, not the screen.
 */
function SetupSheet({
  step,
  view,
  onClose,
}: {
  step: SetupStripStep;
  view: OutletSetupView;
  onClose: () => void;
}) {
  const t = useT();
  const panelRef = useDialog(onClose);
  const titleId = React.useId();
  const card = STEP_CARD[step as keyof typeof STEP_CARD];
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.dismiss')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative mx-auto flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl bg-wa-in text-wa-bubble-text shadow-lg outline-none animate-in"
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
          <h2 id={titleId} className="text-[17px] font-medium">
            {t(STRIP_LABEL_KEYS[step])}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.dismiss')}
            className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-wa-meta active:bg-wa-row-active"
          >
            <X width={20} strokeWidth={1.75} />
          </button>
        </div>
        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          <LazyCardView card={card} view={view} />
        </div>
      </div>
    </div>
  );
}
