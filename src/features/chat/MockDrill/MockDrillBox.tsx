import { Siren } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import {
  useAnswerMockDrill,
  useAnswerMockDrillPhoto,
  useMockDrill,
} from '@/hooks/api/useMockDrill';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { MockDrillAnswer } from '@dk/shared/schemas';
import type { MockDrillView } from '@dk/shared/types';

import { BusyLine, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_BUTTON } from '../DuOtpSteps';

import { CollectingStep } from './MockDrillSteps';
import { canGoBack, filedDay, mockDrillErrorText, scenarioName, stepOf } from './mockDrillView';

/** The words under the box while nothing is being asked: a line, or a returned report. */
function Quiet({ text }: { text: string }) {
  return <p className="break-words text-[14px] leading-snug">{text}</p>;
}

/**
 * The Mock Drill box inside an MDG message (`message.mockDrill`, ADR 0034).
 *
 * Every outlet must record an emergency mock drill on IndianOil's website now and
 * then, and the form there is long. MDG asks the owner (or the manager) only for
 * what nobody else can know: which emergency was practised, two photos, and which
 * day it was. Everything else is filled in.
 *
 * THE BOX DRAWS THE OUTLET'S STATE NOW, never what was true when it was posted: it
 * is a message, and a message cannot be edited, so it reads the live view and
 * follows it (`useMockDrill`). It draws from the view's `screen`, and from the open
 * submission's `step` while collecting; it never works out what comes next, the
 * server's reply to every answer is the whole view again.
 *
 * It is the only thing in the chat that asks for this view, so a chat with no box
 * in it never makes the call.
 */
export function MockDrillBox() {
  const t = useT();
  const q = useMockDrill();
  const view = q.data;
  const loadFailed = q.isError && !view;
  const { refetch } = q;

  const answer = useAnswerMockDrill();
  const photo = useAnswerMockDrillPhoto();
  const [error, setError] = React.useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = React.useState<1 | 2 | null>(null);
  const busy = answer.isPending || photo.isPending;

  // A refusal belongs to the step it was given on.
  const where = view ? `${view.screen}:${view.open?.step ?? ''}` : '';
  React.useEffect(() => setError(null), [where]);

  const send = async (body: MockDrillAnswer) => {
    setError(null);
    try {
      await answer.mutateAsync(body);
    } catch (err) {
      setError(mockDrillErrorText(err, t, 'answer'));
    }
  };

  const sendPhoto = async (slot: 1 | 2, file: File) => {
    if (!view) return;
    setError(null);
    setUploadingSlot(slot);
    try {
      await photo.mutateAsync({ dealerId: view.dealerId, slot, file });
    } catch (err) {
      setError(mockDrillErrorText(err, t, 'photo'));
    } finally {
      setUploadingSlot(null);
    }
  };

  const screen = view ? (view.active ? view.screen : 'off') : 'loading';

  return (
    <div
      data-mock-drill
      data-screen={loadFailed ? 'failed-load' : screen}
      // A touch in the box (a pick, a photo) must not select the message or start
      // a reply swipe: neither gesture may see it.
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-1"
    >
      <div className="rounded-md bg-wa-row-active px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 break-words text-[14px] font-medium leading-snug">
            <Siren width={14} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
            {t('chat.mockDrillTitle')}
          </p>
          {screen === 'loading' && !loadFailed ? <Spinner size={14} /> : null}
        </div>

        {loadFailed ? (
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[13px] leading-snug text-wa-meta">
              {t('chat.askStateFailed')}
            </span>
            <button type="button" onClick={() => void refetch()} className={TEXT_BUTTON}>
              {t('common.retry')}
            </button>
          </div>
        ) : null}

        {view ? (
          <div className="mt-2 flex flex-col gap-2">
            <Screen
              view={view}
              busy={busy}
              uploadingSlot={uploadingSlot}
              onAnswer={(body) => void send(body)}
              onPhoto={(slot, file) => void sendPhoto(slot, file)}
            />
            {error ? <Notice text={error} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** What IndianOil sent back on the last report, when it did: shown where a new drill is about to start. */
function ReturnedNotice({ view }: { view: MockDrillView }) {
  const t = useT();
  const remark = view.portal.returnRemark?.trim();
  if (view.portal.state !== 'returned' || !remark) return null;
  return <Notice text={t('chat.mockDrillReturned', { remark })} />;
}

function Screen({
  view,
  busy,
  uploadingSlot,
  onAnswer,
  onPhoto,
}: {
  view: MockDrillView;
  busy: boolean;
  uploadingSlot: 1 | 2 | null;
  onAnswer: (body: MockDrillAnswer) => void;
  onPhoto: (slot: 1 | 2, file: File) => void;
}) {
  const t = useT();

  if (!view.active) return <Quiet text={t('chat.mockDrillOff')} />;

  switch (view.screen) {
    case 'start':
      return (
        <>
          <ReturnedNotice view={view} />
          <Quiet text={t('chat.mockDrillStartLine')} />
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => onAnswer({ step: 'start_new' })}
            className={PRIMARY_BUTTON}
          >
            {busy ? <Spinner size={16} /> : null}
            {t('chat.mockDrillStart')}
          </button>
        </>
      );

    case 'choose': {
      const saved = view.setup
        ? scenarioName(view.setup.scenarioId, view.setup.scenarioLabel, view.scenarios)
        : null;
      return (
        <>
          <ReturnedNotice view={view} />
          <p className="text-[15px] font-medium leading-snug">{t('chat.mockDrillChooseTitle')}</p>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => onAnswer({ step: 'start_same' })}
            className={cn(PRIMARY_BUTTON, 'flex-col gap-0.5 text-center')}
          >
            <span className="flex items-center gap-2">
              {busy ? <Spinner size={16} /> : null}
              {t('chat.mockDrillSame')}
            </span>
            {saved ? (
              <span className="min-w-0 break-words text-[13px] font-normal leading-snug">
                {saved.label}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAnswer({ step: 'start_new' })}
            className={SECONDARY_BUTTON}
          >
            {t('chat.mockDrillNew')}
          </button>
        </>
      );
    }

    case 'collect': {
      const step = stepOf(view);
      const reason = view.open?.sentBackReason?.trim();
      return (
        <>
          {reason ? <Notice text={t('chat.mockDrillSentBack', { reason })} /> : null}
          {/* Keyed on the step: what was open in one step never leaks into the next. */}
          <CollectingStep
            key={step}
            step={step}
            view={view}
            busy={busy}
            uploadingSlot={uploadingSlot}
            onAnswer={onAnswer}
            onPhoto={onPhoto}
          />
          <div className="flex items-center justify-between gap-2 border-t border-wa-divider pt-1">
            {canGoBack(step, view) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAnswer({ step: 'back' })}
                className={TEXT_BUTTON}
              >
                {t('common.back')}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onAnswer({ step: 'cancel' })}
              className={TEXT_BUTTON}
            >
              {t('common.cancel')}
            </button>
          </div>
        </>
      );
    }

    case 'waiting':
      return (
        <BusyLine
          text={
            view.open?.state === 'review'
              ? t('chat.mockDrillWaitingCheck')
              : t('chat.mockDrillWaitingFiling')
          }
        />
      );

    case 'done': {
      const date = filedDay(view);
      return (
        <Quiet text={date ? t('chat.mockDrillDone', { date }) : t('chat.mockDrillDoneNoDate')} />
      );
    }

    case 'blocked':
      return <Quiet text={t('chat.mockDrillBlocked')} />;

    case 'failed':
      return (
        <>
          <Notice text={view.open?.failure?.trim() || t('chat.mockDrillFailedFallback')} />
          <p className="text-[13px] leading-snug text-wa-meta">{t('chat.duOtpTeamTold')}</p>
        </>
      );
  }
}
