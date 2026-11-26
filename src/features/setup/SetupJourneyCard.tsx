import * as React from 'react';
import { createPortal } from 'react-dom';

import { CardFrame, RowShell, VideoRow, type MarkKind } from '@/features/flowCard/CardParts';
import { GuideVideoSheet } from '@/features/help/GuideVideoSheet';
import { videoTitle } from '@/features/help/helpView';
import { useGuideVideos } from '@/features/help/useGuideVideos';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import { PORTAL_NAMES, type OutletSetupView, type SetupStripState, type SetupStripStep } from '@dk/shared/types';

import { companyLabel } from './cardView';
import { LazyCardView } from './LazyCardView';
import { STRIP_LABEL_KEYS, stripCaptionKey } from './stripView';

/**
 * "डीलर कवच शुरू करें" — THE SETUP AS ONE CARD (ADR 0059, owner 26 Nov 2026).
 *
 * Every step of getting an outlet started is a row of one card: "5 में से 3 पूरे" and a
 * thin green bar at the top, the done steps ticked with what was given, the current
 * step open right inside the card (the company buttons, the bill form, the bill, the
 * portal logins with "सेव करें"), the later steps greyed, and the setup video at the
 * foot. It replaces the strip over the chat and the four separate cards down it: the
 * steps' own forms are reused as they are, so saving works exactly as before.
 *
 * It draws the outlet's state NOW (`GET /me/setup`), on the newest setup message only.
 */
const SETUP_VIDEO_ID = 'setup_steps';

/** The steps a card opens a form for. `start` is MDG's and only says what is happening. */
const STEP_FORM: Partial<Record<SetupStripStep, 'company' | 'billing' | 'payment' | 'logins'>> = {
  company: 'company',
  billing: 'billing',
  payment: 'payment',
  logins: 'logins',
};

const STATE_WORD: Record<SetupStripState, MessageKey> = {
  done: 'setup.stateDone',
  current: 'setup.stateCurrent',
  todo: 'setup.stateTodo',
  skipped: 'setup.stateSkipped',
};

function markOf(state: SetupStripState, mdgWorking: boolean): MarkKind {
  if (state === 'done' || state === 'skipped') return 'done';
  if (state === 'current') return mdgWorking ? 'working' : 'open';
  return 'later';
}

export function SetupJourneyCard({ view }: { view: OutletSetupView }) {
  const t = useT();
  const lang = useLang();
  const titleId = React.useId();
  const videos = useGuideVideos();
  const video = videos.data?.find((v) => v.id === SETUP_VIDEO_ID && v.available) ?? null;
  const [playing, setPlaying] = React.useState(false);

  // A server that sends a step this app has no words for is drawn without it.
  const steps = view.strip.filter(({ step }) => step in STRIP_LABEL_KEYS);
  const done = steps.filter((s) => s.state === 'done' || s.state === 'skipped').length;
  const caption = stripCaptionKey(view);

  /** What a done step holds, in one line. */
  const answerOf = (step: SetupStripStep, state: SetupStripState): string | null => {
    if (state === 'skipped') return t('setup.stateSkipped');
    switch (step) {
      case 'company':
        return view.company ? companyLabel(view.company, lang) : null;
      case 'billing':
        return view.billing?.name ?? null;
      case 'payment':
        return view.payment.paidOn ? t('flow.paid') : t('setup.nowBillSent');
      case 'logins':
        return view.loginsNeeded.length > 0
          ? view.loginsNeeded.map((p) => PORTAL_NAMES[p] ?? p).join(' · ')
          : t('flow.loginsSaved');
      case 'start':
        return t('setup.nowWatch');
    }
  };

  return (
    <CardFrame
      titleId={titleId}
      title={t('flow.setupTitle')}
      progress={{ done, total: steps.length, label: t('flow.progress', { done, total: steps.length }) }}
      testId="setup-journey-card"
    >
      <ol aria-label={t('flow.setupTitle')}>
        {steps.map(({ step, state }, i) => {
          const form = STEP_FORM[step];
          // The last step is MDG's: while it is current the team is at work, not the owner.
          const mdgWorking = state === 'current' && !form;
          const answer = state === 'done' || state === 'skipped' ? answerOf(step, state) : null;
          return (
            <RowShell
              key={step}
              kind={markOf(state, mdgWorking)}
              n={i + 1}
              stateWord={t(STATE_WORD[state])}
              muted={state === 'todo'}
              rowKey={step}
              testId={`setup-row-${step}`}
            >
              {answer ? (
                <>
                  <p className="text-meta text-wa-meta">{t(STRIP_LABEL_KEYS[step])}</p>
                  <p className="break-words text-body font-semibold">{answer}</p>
                </>
              ) : (
                <p className={state === 'todo' ? 'text-body text-wa-meta' : 'break-words text-subheading'}>
                  {t(STRIP_LABEL_KEYS[step])}
                </p>
              )}
              {/* What MDG is doing now, on MDG's own step: a dealer's step has its form's own question. */}
              {state === 'current' && !form && caption ? (
                <p className="mt-0.5 break-words text-meta text-wa-meta" aria-live="polite">
                  {t(caption)}
                </p>
              ) : null}
              {state === 'current' && form ? (
                // The step's own form, as it always was: a tap or "सेव करें" saves it, and the
                // card moves on by itself when the server says the step is done.
                <div className="mt-1" data-no-swipe>
                  <LazyCardView card={form} view={view} />
                </div>
              ) : null}
            </RowShell>
          );
        })}
      </ol>
      {video ? (
        <VideoRow
          title={videoTitle(video, lang)}
          seconds={video.durationMs ? Math.round(video.durationMs / 1000) : null}
          onPlay={() => setPlaying(true)}
        />
      ) : null}
      {playing && video
        ? createPortal(<GuideVideoSheet id={video.id} title={videoTitle(video, lang)} onClose={() => setPlaying(false)} />, document.body)
        : null}
    </CardFrame>
  );
}
