import {
  Building2,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Flame,
  HardHat,
  KeyRound,
  ListChecks,
  RotateCw,
  ShieldCheck,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import { StatusBadge } from '@/features/reports/StatusBadge';
import { useLang, useT } from '@/lib/i18n';
import { imageAccept } from '@/lib/imageAccept';
import type { TodayTask, TodayTaskKind } from '@dk/shared/types';

import type { PhotoState } from './useInlinePhoto';
import { isPhotoTask, taskActionLabel } from './todayView';

/** One glyph per open box, so a card can be told apart from across the counter. */
const TASK_ICONS: Record<TodayTaskKind, LucideIcon> = {
  ask: Camera,
  sign_letter: FileSignature,
  portal_login: KeyRound,
  wemmis_login: KeyRound,
  password_pick: KeyRound,
  setup: ListChecks,
  du_otp: ShieldCheck,
  mock_drill: Flame,
  declarations: ClipboardCheck,
  complaint: Wrench,
  work_permit: HardHat,
  outlet_details: Building2,
  fuel_confirm: Truck,
};

/** The big action button: the brand's own black, 48 px or taller, full width of the card. */
export const ACTION_BUTTON =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-brand px-4 py-3 text-cta text-text-inverse transition-colors duration-150 active:bg-brand-hover disabled:opacity-70';

export interface WorkCardProps {
  task: TodayTask;
  /** Where this card's photo answer stands, when it is a photo ask. */
  photo?: PhotoState;
  onPhoto: (task: TodayTask, file: File) => void;
  /** "Try again". Returns false when there is no file to resend and the picker should open. */
  onRetry: (task: TodayTask) => boolean;
  onOpen: (task: TodayTask) => void;
  /** `li` in a list; `div` as one slide of the "Your work" slider. */
  as?: 'li' | 'div';
}

/**
 * One thing the dealer has to do: a black icon tile, a plain headline, one grey line, and
 * the ONE button that does it. A photo ask picks the photo here and sends it without
 * leaving Today; every other box opens the chat at the box.
 */
export function WorkCard({ task, photo, onPhoto, onRetry, onOpen, as = 'li' }: WorkCardProps) {
  const t = useT();
  const lang = useLang();
  const Icon = TASK_ICONS[task.kind] ?? ListChecks;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const photoTask = isPhotoTask(task);
  const actionWord = t(`today.act.${taskActionLabel(task)}`);

  const openPicker = () => inputRef.current?.click();

  let action: React.ReactNode;
  if (photoTask && photo === 'sending') {
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
  } else if (photoTask && photo === 'sent') {
    action = (
      <div data-photo-state="sent" className="flex flex-col gap-1">
        <p role="status" className="flex items-start gap-2 text-subheading text-status-ok-ink">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" strokeWidth={2.25} aria-hidden />
          {t('today.photo.sent')}
        </p>
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="flex min-h-11 w-fit items-center text-cta text-text underline underline-offset-4"
        >
          {t('today.seeInChat')}
        </button>
      </div>
    );
  } else if (photoTask && photo === 'failed') {
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
  } else if (photoTask) {
    action = (
      <button
        type="button"
        onClick={openPicker}
        aria-label={t('today.actionLabel', { action: actionWord, title: task.title })}
        className={ACTION_BUTTON}
      >
        <Camera className="size-5 shrink-0" strokeWidth={2.25} aria-hidden />
        {actionWord}
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={() => onOpen(task)}
        aria-label={t('today.actionLabel', { action: actionWord, title: task.title })}
        className={ACTION_BUTTON}
      >
        {actionWord}
      </button>
    );
  }

  const Root = as;
  return (
    <Root data-task-id={task.id} data-task-kind={task.kind} className="h-full">
      <div className="flex h-full flex-col px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-2 text-text"
            aria-hidden
          >
            <Icon width={20} strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="break-words text-subheading text-text">{task.title}</p>
            {task.late ? <StatusBadge status="attention" lang={lang} word={t('today.late')} className="w-fit" /> : null}
            {task.subtitle ? (
              <p className="break-words text-body text-text-muted">{task.subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-auto pt-3">{action}</div>
        {isPhotoTask(task) ? (
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
