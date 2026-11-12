import { Check, ClipboardCheck } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import {
  useAnswerDeclarations,
  useAnswerDeclarationsPhoto,
  useDeclarations,
  useDeclarationsBusy,
  useReuseDeclarationsPhotos,
} from '@/hooks/api/useDeclarations';
import { useT } from '@/lib/i18n';
import type { DeclarationsView, WashroomPhotoSlot } from '@dk/shared/types';

import { BusyLine, Notice, TEXT_BUTTON } from '../DuOtpSteps';

import { CollectScreen } from './DeclarationsSteps';
import { declarationsErrorText, lastFiledDay, nextDueDay } from './declarationsView';

/** The words under the box while nothing is being asked. */
function Quiet({ text }: { text: string }) {
  return <p className="break-words text-[14px] leading-snug">{text}</p>;
}

/**
 * The Declarations box inside an MDG message (`message.declarations`, ADR 0037).
 *
 * IndianOil wants two photos of the outlet's washroom every week, with a declaration
 * that the toilet is kept clean. MDG fills in the declaration on IndianOil's portal;
 * it asks the owner (or the manager) only for what nobody else has: the two photos,
 * and their word that they were taken today of their own washroom. If the outlet has filed
 * before, last time's two photos can be put back with one tap instead.
 *
 * THE BOX DRAWS THE OUTLET'S STATE NOW, never what was true when it was posted: it
 * is a message, and a message cannot be edited, so it reads the live view and
 * follows it (`useDeclarations`). It draws from the view's `screen` and never works
 * out what comes next; the server's reply to every answer is the whole view again.
 *
 * It shows only what the owner may see: the view it reads is the owner's own, with
 * nothing of the admin's pane in it, and a failed filing is always the same two
 * sentences, never the portal's words.
 *
 * A photo opens full size inside the app (`PhotoThumb`), never as a link out of it.
 *
 * It is the only thing in the chat that asks for this view, so a chat with no box
 * in it never makes the call.
 */
export function DeclarationsBox() {
  const t = useT();
  const q = useDeclarations();
  const view = q.data;
  const loadFailed = q.isError && !view;
  const { refetch } = q;

  const answer = useAnswerDeclarations();
  const photo = useAnswerDeclarationsPhoto();
  const reuse = useReuseDeclarationsPhotos();
  const [error, setError] = React.useState<string | null>(null);
  // Shared by every box in the thread: they draw one outlet's one view, so a photo on its
  // way from one box must hold the others still (see `useDeclarationsBusy`).
  const { busy, uploadingSlot, reusing } = useDeclarationsBusy();

  // A refusal belongs to the screen it was given on.
  const where = view ? view.screen : '';
  React.useEffect(() => setError(null), [where]);

  const send = async () => {
    setError(null);
    try {
      await answer.mutateAsync({ step: 'send', confirmFresh: true });
    } catch (err) {
      setError(declarationsErrorText(err, t, 'answer'));
    }
  };

  // "Use the same photos as last time". The server answers with the whole fresh view, so the
  // slots fill by themselves; a refusal (the old photos are gone) is shown in its own words.
  const reusePhotos = async () => {
    setError(null);
    try {
      await reuse.mutateAsync();
    } catch (err) {
      setError(declarationsErrorText(err, t, 'answer'));
    }
  };

  const sendPhoto = async (slot: WashroomPhotoSlot, file: File) => {
    if (!view) return;
    setError(null);
    try {
      await photo.mutateAsync({ dealerId: view.dealerId, slot, file });
    } catch (err) {
      setError(declarationsErrorText(err, t, 'photo'));
    }
  };

  const screen = view ? (view.active ? view.screen : 'off') : 'loading';

  return (
    <div
      data-declarations
      data-screen={loadFailed ? 'failed-load' : screen}
      // A touch in the box (a photo, a tick) must not select the message or start
      // a reply swipe: neither gesture may see it.
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-1"
    >
      <div className="rounded-md bg-wa-row-active px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 break-words text-[14px] font-medium leading-snug">
            <ClipboardCheck
              width={14}
              strokeWidth={2}
              className="shrink-0 text-wa-meta"
              aria-hidden
            />
            {t('chat.declTitle')}
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
              reusing={reusing}
              onPhoto={(slot, file) => void sendPhoto(slot, file)}
              onReuse={() => void reusePhotos()}
              onSend={() => void send()}
            />
            {error ? <Notice text={error} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The sentence that says what was last sent and when the next is due, with whichever dates there are. */
function IdleLine({ view }: { view: DeclarationsView }) {
  const t = useT();
  const last = lastFiledDay(view);
  const next = nextDueDay(view);
  if (last && next) return <Quiet text={t('chat.declIdleBoth', { last, next })} />;
  if (last) return <Quiet text={t('chat.declIdleLast', { last })} />;
  if (next) return <Quiet text={t('chat.declIdleNext', { next })} />;
  return <Quiet text={t('chat.declIdleNone')} />;
}

function Screen({
  view,
  busy,
  uploadingSlot,
  reusing,
  onPhoto,
  onReuse,
  onSend,
}: {
  view: DeclarationsView;
  busy: boolean;
  uploadingSlot: WashroomPhotoSlot | null;
  reusing: boolean;
  onPhoto: (slot: WashroomPhotoSlot, file: File) => void;
  onReuse: () => void;
  onSend: () => void;
}) {
  const t = useT();

  if (!view.active) return <Quiet text={t('chat.declOff')} />;

  switch (view.screen) {
    case 'idle':
      return <IdleLine view={view} />;

    case 'collect':
      return (
        <CollectScreen
          view={view}
          busy={busy}
          uploadingSlot={uploadingSlot}
          reusing={reusing}
          onPhoto={onPhoto}
          onReuse={onReuse}
          onSend={onSend}
        />
      );

    case 'waiting':
      return <BusyLine text={t('chat.declWaiting')} />;

    case 'done': {
      const date = lastFiledDay(view);
      return (
        <p className="flex items-start gap-1.5 break-words text-[14px] leading-snug">
          <Check
            width={16}
            strokeWidth={2.5}
            className="mt-0.5 shrink-0 text-success"
            aria-hidden
          />
          <span className="min-w-0">
            {date ? t('chat.declDone', { date }) : t('chat.declDoneNoDate')}
          </span>
        </p>
      );
    }

    case 'failed':
      return <Notice text={t('chat.declFailed')} />;
  }
}
