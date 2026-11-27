import { Camera, CheckCircle2, RotateCw } from 'lucide-react';
import * as React from 'react';

import { StatusPill } from '@/components/kit';
import type { NeedsMeItem } from '@/features/glance/needsMe';
import { serviceNameOf } from '@/features/today/serviceName';
import { useLang, useT } from '@/lib/i18n';
import { imageAccept } from '@/lib/imageAccept';
import { tnIn } from '@/lib/messages/_plural';
import type { TodayTask } from '@dk/shared/types';

import { isPhotoTask, taskActionLabel } from './todayView';
import type { PhotoState } from './useInlinePhoto';

/** The big action button: the brand's own black, 48 px or taller, full width of the card. */
export const ACTION_BUTTON =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-cta text-text-inverse transition-colors duration-150 active:bg-brand-hover disabled:opacity-70';

export interface WorkCardProps {
  item: NeedsMeItem;
  /** Where this card's photo answer stands, when it is a photo ask. */
  photo?: PhotoState;
  onPhoto: (task: TodayTask, file: File) => void;
  /** "Try again". Returns false when there is no file to resend and the picker should open. */
  onRetry: (task: TodayTask) => boolean;
  /** An open box: the chat at the box. */
  onOpenTask: (task: TodayTask) => void;
  /** Anything else in the list (an alert opens its report, a Kavach point opens Kavach). */
  onOpenItem: (item: NeedsMeItem) => void;
  /** One more plain line under the title (the kind's own words for a report that needs a look). */
  detail?: string;
  /** `li` in a list; `div` as one slide of the slider. */
  as?: 'li' | 'div';
}

/**
 * One thing that waits for the dealer (spec 4.1): its shape and word (never colour alone), what it
 * is, which service it belongs to and how long it has waited, and the ONE button that does it. A photo
 * ask picks the photo here and sends it without leaving Today; every other box opens the chat at the
 * box; a report that needs a look opens the report; a Kavach point opens Kavach.
 */
export function WorkCard({ item, photo, onPhoto, onRetry, onOpenTask, onOpenItem, detail, as = 'li' }: WorkCardProps) {
  const t = useT();
  const lang = useLang();
  const task = item.task;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const photoTask = !!task && isPhotoTask(task);
  const actionWord = task
    ? t(`today.act.${taskActionLabel(task)}`)
    : item.source === 'kavach'
      ? t('today.row.kavach.open')
      : t('today.seeDetails');
  const spoken = t('today.actionLabel', { action: actionWord, title: item.text });
  const openPicker = () => inputRef.current?.click();

  let action: React.ReactNode;
  if (task && photoTask && photo === 'sending') {
    action = (
      <p
        role="status"
        aria-busy="true"
        data-photo-state="sending"
        className="flex min-h-12 items-center gap-2 text-body font-medium text-text"
      >
        <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-text-muted border-t-transparent" aria-hidden />
        {t('today.photo.sending')}
      </p>
    );
  } else if (task && photoTask && photo === 'sent') {
    action = (
      <div data-photo-state="sent" className="flex flex-col gap-1">
        <p role="status" className="flex items-start gap-2 text-subheading text-status-ok-ink">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" strokeWidth={2.25} aria-hidden />
          {t('today.photo.sent')}
        </p>
        <button
          type="button"
          onClick={() => onOpenTask(task)}
          className="flex min-h-11 w-fit items-center text-cta text-text underline underline-offset-4"
        >
          {t('today.seeInChat')}
        </button>
      </div>
    );
  } else if (task && photoTask && photo === 'failed') {
    action = (
      <div data-photo-state="failed" className="flex flex-col gap-2">
        <p role="alert" className="text-subheading text-status-problem-ink">
          {t('today.photo.failed')}
        </p>
        <button
          type="button"
          onClick={() => {
            if (!onRetry(task)) openPicker();
          }}
          className={ACTION_BUTTON}
        >
          <RotateCw className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
          {t('today.photo.retry')}
        </button>
      </div>
    );
  } else if (task && photoTask) {
    action = (
      <button type="button" onClick={openPicker} aria-label={spoken} className={ACTION_BUTTON}>
        <Camera className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
        {actionWord}
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={() => (task ? onOpenTask(task) : onOpenItem(item))}
        aria-label={spoken}
        className={ACTION_BUTTON}
      >
        {actionWord}
      </button>
    );
  }

  // "Daily sales report, waiting 2 days": which service, how long.
  const service = serviceNameOf(item.serviceId, lang);
  const days = item.waitingDays;
  // A late card says HOW late in its own pill ("3 days waiting"), so the small print does not say it again.
  const lateInPill = item.late && days !== undefined && days >= 1;
  const age =
    days === undefined || lateInPill
      ? null
      : days <= 0
        ? t('glance.waiting.today')
        : tnIn(lang, 'glance.waiting', days);
  const metaLine = [service, age].filter(Boolean).join(', ');

  // A shape and a word, always: late work is the triangle with its waiting time; the rest wears its own.
  const late = item.late;
  const pill = late ? (
    <StatusPill status="attention" word={lateInPill ? tnIn(lang, 'today.lateDays', days) : t('today.late')} />
  ) : item.status === 'waiting' ? (
    <StatusPill status="waiting" word={t('today.row.status.needsYou')} />
  ) : (
    <StatusPill status={item.status} />
  );

  const Root = as;
  const rootProps = task
    ? { 'data-task-id': task.id, 'data-task-kind': task.kind }
    : { 'data-needs-id': item.id, 'data-needs-source': item.source };
  return (
    <Root {...rootProps} data-needs-status={item.status} className="h-full">
      <div className="flex h-full flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">{pill}</div>
        <p className="break-words text-subheading font-medium text-text">{item.text}</p>
        {task?.subtitle ? <p className="break-words text-body text-text-muted">{task.subtitle}</p> : null}
        {!task && detail ? <p className="break-words text-body text-text-muted">{detail}</p> : null}
        {metaLine ? <p className="break-words text-meta text-text-muted">{metaLine}</p> : null}
        <div className="mt-auto pt-1">{action}</div>
        {task && isPhotoTask(task) ? (
          // The picker lives in the card, not behind the button: a button that is
          // unmounted while the picker is open can lose the answer on an Android WebView.
          // No `capture`: without it the phone offers the camera and the gallery together.
          <input
            ref={inputRef}
            type="file"
            accept={imageAccept(task.action.acceptsFile)}
            className="hidden"
            data-testid={`today-photo-input-${task.id}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onPhoto(task, file);
            }}
          />
        ) : null}
      </div>
    </Root>
  );
}
