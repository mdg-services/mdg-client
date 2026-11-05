import { Check, FileText, Send, Upload } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT, type MessageKey } from '@/lib/i18n';
import {
  DU_OTP_REMARKS_MAX,
  type DuOtpAnswerInput,
  type DuOtpEditField,
  type DuOtpFileSlot,
} from '@dk/shared/schemas';
import {
  DU_OTP_REASONS,
  type DuOtpAckView,
  type DuOtpFileView,
  type DuOtpGroupView,
  type DuOtpReason,
  type DuOtpStep,
} from '@dk/shared/types';

import {
  DU_OTP_STEP_COUNT,
  REASON_KEY,
  SOURCE_KEY,
  STEP_TITLE_KEY,
  calibrationDatesOf,
  formatDmy,
  stepNumber,
} from './duOtpView';
import { useBringIntoView } from './useBringIntoView';

/**
 * The one input the DU OTP box asks for at a time (ADR 0033). Each step is its own
 * small component; the group's section picks the one `group.step` names, and
 * gives it two ways to answer: `onAnswer` for a plain answer and `onPaper` for a
 * file. Neither returns anything — the section owns the request, the busy flag
 * and the error words, and the server's reply (the whole fresh view) is what moves
 * the box to the next step.
 */

export const INPUT_CLASS =
  'w-full rounded-md border border-wa-divider bg-wa-in px-2.5 text-[16px] text-wa-bubble-text placeholder:text-wa-meta focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
export const PRIMARY_BUTTON =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 py-2 text-[15px] font-medium text-white active:opacity-90 disabled:opacity-60';
export const SECONDARY_BUTTON =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-wa-divider bg-wa-chip px-3 py-2 text-[15px] font-medium text-wa-bubble-text active:bg-wa-row-active disabled:opacity-60';
export const TEXT_BUTTON =
  'flex min-h-11 shrink-0 items-center justify-center rounded-md px-2 text-[14px] font-medium text-wa-accent-strong active:bg-black/10 disabled:opacity-60';
export const NOTICE_CLASS =
  'rounded-md bg-wa-notice px-2.5 py-1.5 text-[13px] leading-snug text-wa-bubble-text';

/** A line with a spinner: a robot is working, or a file is on its way, and the owner has nothing to do. */
export function BusyLine({ text }: { text: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-[14px] leading-snug">
      <Spinner size={16} />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}

/** Words the owner should read: something did not go through, or needs doing first. */
export function Notice({ text }: { text: string }) {
  return (
    <p role="alert" className={cn(NOTICE_CLASS, 'break-words')}>
      {text}
    </p>
  );
}

/** A paper, openable in a new tab through its short-lived link. */
function FileLink({ file }: { file: DuOtpFileView }) {
  const body = (
    <>
      <FileText width={16} strokeWidth={1.75} className="shrink-0 text-wa-meta" aria-hidden />
      <span className="min-w-0 break-all">{file.filename}</span>
    </>
  );
  if (!file.url) {
    return <span className="inline-flex items-center gap-1.5 text-[14px] leading-snug">{body}</span>;
  }
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 text-[14px] leading-snug text-wa-accent-strong underline"
    >
      {body}
    </a>
  );
}

export interface StepProps {
  view: DuOtpAckView;
  group: DuOtpGroupView;
  /** An answer or an upload is on its way: every control is off. */
  busy: boolean;
  /** A file is on its way (a part of `busy`): say so. */
  uploading: boolean;
  onAnswer: (body: DuOtpAnswerInput) => void;
  onPaper: (slot: DuOtpFileSlot, file: File) => void;
}

/** "Step 2 of 5" and what is being asked. The review is the end of the questions, so it has no number. */
function StepHeader({ step }: { step: DuOtpStep }) {
  const t = useT();
  const n = stepNumber(step);
  return (
    <div className="flex flex-col gap-0.5">
      {n !== null ? (
        <p className="text-[12px] font-medium leading-tight text-wa-meta">
          {t('chat.duOtpStep', { n, total: DU_OTP_STEP_COUNT })}
        </p>
      ) : null}
      <p className="text-[15px] font-medium leading-snug">{t(STEP_TITLE_KEY[step])}</p>
    </div>
  );
}

/** Step 1: why the dispensing unit was opened — at least one of the portal's four reasons. */
function ReasonsStep({ group, busy, onAnswer }: StepProps) {
  const t = useT();
  const [picked, setPicked] = React.useState<DuOtpReason[]>(group.inputs.reasons);

  const toggle = (reason: DuOtpReason) =>
    setPicked((cur) => (cur.includes(reason) ? cur.filter((r) => r !== reason) : [...cur, reason]));

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="sr-only">{t('chat.duOtpStepReasons')}</legend>
      <p className="text-[13px] leading-snug text-wa-meta">{t('chat.duOtpReasonsHint')}</p>
      {DU_OTP_REASONS.map((reason) => (
        <label
          key={reason}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-wa-divider bg-wa-in px-3 py-1.5 text-[15px] leading-snug"
        >
          <input
            type="checkbox"
            checked={picked.includes(reason)}
            disabled={busy}
            onChange={() => toggle(reason)}
            className="h-5 w-5 shrink-0 accent-wa-accent"
          />
          <span className="min-w-0 break-words">{t(REASON_KEY[reason])}</span>
        </label>
      ))}
      <button
        type="button"
        disabled={busy || picked.length === 0}
        aria-busy={busy}
        onClick={() =>
          onAnswer({
            step: 'reasons',
            group: group.key,
            // In the portal's own order, however they were ticked.
            reasons: DU_OTP_REASONS.filter((r) => picked.includes(r)),
          })
        }
        className={PRIMARY_BUTTON}
      >
        {busy ? <Spinner size={16} /> : null}
        {t('chat.duOtpNext')}
      </button>
    </fieldset>
  );
}

/**
 * Steps 2 to 4: a paper. Always "upload"; the certificate can also be fetched from
 * eMaaptaul or taken from the copy MDG holds, and the other document can be
 * skipped.
 *
 * The file input sits inside its label, so the phone's own chooser (files, camera,
 * gallery) opens from the owner's tap on the label, which an Android WebView
 * allows; it is cleared after each pick so the same file can be chosen again.
 */
function PaperStep({ slot, view, group, busy, uploading, onAnswer, onPaper }: StepProps & { slot: DuOtpFileSlot }) {
  const t = useT();
  const current = group.inputs[slot];
  const fetchView = view.fetch;
  const onFile = view.certificateOnFile;
  const isCertificate = slot === 'certificate';
  const fetching = isCertificate && fetchView.state === 'working';

  const onFileDetail = onFile
    ? [
        onFile.vcNumber ? t('chat.duOtpVc', { vc: onFile.vcNumber }) : '',
        formatDmy(onFile.calibrationDate)
          ? t('chat.duOtpDated', { date: formatDmy(onFile.calibrationDate)! })
          : '',
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <div className="flex flex-col gap-2">
      {current ? (
        <div className="flex flex-wrap items-center gap-x-2 text-[13px] text-wa-meta">
          <Check width={14} strokeWidth={2.5} className="shrink-0 text-success" aria-hidden />
          <span>{t('chat.duOtpAdded')}</span>
          <FileLink file={current} />
        </div>
      ) : null}

      <label
        className={cn(
          PRIMARY_BUTTON,
          'cursor-pointer focus-within:ring-2 focus-within:ring-focus-ring',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <Upload width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        {t('chat.duOtpUpload')}
        <input
          type="file"
          accept="application/pdf,image/*"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // So choosing the same file again (after a refusal) fires a change.
            e.target.value = '';
            if (file) onPaper(slot, file);
          }}
          className="sr-only"
        />
      </label>
      <p className="text-[12px] leading-snug text-wa-meta">{t('chat.duOtpUploadHint')}</p>
      {uploading ? <BusyLine text={t('chat.duOtpUploading')} /> : null}

      {isCertificate ? (
        <>
          <button
            type="button"
            disabled={busy || fetching}
            onClick={() => onAnswer({ step: 'certificate_fetch', group: group.key })}
            className={SECONDARY_BUTTON}
          >
            {t('chat.duOtpFetch')}
          </button>
          {onFile ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAnswer({ step: 'certificate_on_file', group: group.key })}
              className={SECONDARY_BUTTON}
            >
              <span className="min-w-0 break-words">
                {onFileDetail
                  ? `${t('chat.duOtpOnFile')} (${onFileDetail})`
                  : t('chat.duOtpOnFile')}
              </span>
            </button>
          ) : null}
          {fetching ? <BusyLine text={t('chat.duOtpFetching')} /> : null}
          {fetchView.state === 'needs_login' ? (
            // The app's own words, in the reader's language: the server's line is English, for the admin pane.
            <Notice text={t('chat.duOtpFetchLogin')} />
          ) : null}
          {fetchView.state === 'failed' ? (
            <>
              <Notice text={t('chat.duOtpFetchFailed')} />
              <p className="text-[13px] leading-snug text-wa-meta">
                {t('chat.duOtpFetchUploadInstead')}
              </p>
            </>
          ) : null}
        </>
      ) : null}

      {slot === 'other' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAnswer({ step: 'other_skip', group: group.key })}
          className={SECONDARY_BUTTON}
        >
          {t('chat.duOtpSkipOther')}
        </button>
      ) : null}
    </div>
  );
}

/** Step 5: a short remark for IndianOil, started from what the reasons ticked suggest. */
function RemarksStep({ group, busy, onAnswer }: StepProps) {
  const t = useT();
  const ids = React.useId();
  const bringIntoView = useBringIntoView();
  const [text, setText] = React.useState(group.inputs.remarks ?? group.suggestedRemarks);
  const trimmed = text.trim();
  // The server wants at least three characters, and the portal's box is one line.
  const canNext = trimmed.length >= 3 && !busy;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (canNext) onAnswer({ step: 'remarks', group: group.key, remarks: trimmed });
      }}
      className="flex flex-col gap-2"
    >
      <div>
        <label htmlFor={`${ids}-remarks`} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
          {t('chat.duOtpLblRemarks')}
        </label>
        <textarea
          id={`${ids}-remarks`}
          rows={3}
          value={text}
          maxLength={DU_OTP_REMARKS_MAX}
          disabled={busy}
          onChange={(e) => setText(e.target.value.replace(/[\r\n]+/g, ' '))}
          onFocus={bringIntoView}
          enterKeyHint="done"
          className={cn(INPUT_CLASS, 'resize-none py-2 leading-snug')}
        />
        <p className="mt-0.5 text-right text-[12px] tabular-nums leading-tight text-wa-meta">
          {text.length} / {DU_OTP_REMARKS_MAX}
        </p>
      </div>
      <button type="submit" disabled={!canNext} aria-busy={busy} className={PRIMARY_BUTTON}>
        {busy ? <Spinner size={16} /> : null}
        {t('chat.duOtpNext')}
      </button>
    </form>
  );
}

/** One line of the review: what it is, what was given, and a way to change it. */
function ReviewRow({
  label,
  field,
  busy,
  onChange,
  children,
}: {
  label: string;
  /** Absent for a line that is filled in by MDG and cannot be changed. */
  field?: DuOtpEditField;
  busy: boolean;
  onChange?: (field: DuOtpEditField) => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex items-start justify-between gap-2 border-b border-wa-divider py-1 last:border-b-0">
      <div className="min-w-0 py-1">
        <p className="text-[12px] leading-tight text-wa-meta">{label}</p>
        <div className="break-words text-[14px] leading-snug">{children}</div>
      </div>
      {field && onChange ? (
        <button
          type="button"
          disabled={busy}
          aria-label={t('chat.duOtpChangeField', { field: label })}
          onClick={() => onChange(field)}
          className={TEXT_BUTTON}
        >
          {t('chat.portalChange')}
        </button>
      ) : null}
    </div>
  );
}

/** A paper in the review: its name (openable), and where it came from when MDG supplied it. */
function PaperValue({ file }: { file: DuOtpFileView }) {
  const t = useT();
  const sourceKey: MessageKey | undefined = SOURCE_KEY[file.source];
  return (
    <>
      <FileLink file={file} />
      {sourceKey ? <p className="text-[12px] leading-tight text-wa-meta">{t(sourceKey)}</p> : null}
    </>
  );
}

/** The review: every answer with a Change, the calibration date, and Submit. */
function ReviewStep({ group, busy, onAnswer }: StepProps) {
  const t = useT();
  const { inputs } = group;
  const dates = calibrationDatesOf(group);
  const dash = '—';
  const change = (field: DuOtpEditField) => onAnswer({ step: 'edit', group: group.key, field });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <ReviewRow label={t('chat.duOtpLblReasons')} field="reasons" busy={busy} onChange={change}>
          {inputs.reasons.length > 0 ? inputs.reasons.map((r) => t(REASON_KEY[r])).join(', ') : dash}
        </ReviewRow>
        <ReviewRow label={t('chat.duOtpStepCertificate')} field="certificate" busy={busy} onChange={change}>
          {inputs.certificate ? <PaperValue file={inputs.certificate} /> : dash}
        </ReviewRow>
        <ReviewRow label={t('chat.duOtpStepReport')} field="serviceReport" busy={busy} onChange={change}>
          {inputs.serviceReport ? <PaperValue file={inputs.serviceReport} /> : dash}
        </ReviewRow>
        <ReviewRow label={t('chat.duOtpLblOther')} field="other" busy={busy} onChange={change}>
          {inputs.other ? (
            <PaperValue file={inputs.other} />
          ) : inputs.otherSkipped ? (
            t('chat.duOtpSkipOther')
          ) : (
            dash
          )}
        </ReviewRow>
        <ReviewRow label={t('chat.duOtpLblRemarks')} field="remarks" busy={busy} onChange={change}>
          {inputs.remarks?.trim() ? inputs.remarks : dash}
        </ReviewRow>
        <ReviewRow label={t('chat.duOtpLblDate')} busy={busy}>
          {dates.length > 0 ? dates.join(', ') : dash}
          <p className="text-[12px] leading-tight text-wa-meta">{t('chat.duOtpDateNote')}</p>
        </ReviewRow>
      </div>
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => onAnswer({ step: 'submit', group: group.key })}
        className={PRIMARY_BUTTON}
      >
        {busy ? <Spinner size={16} /> : <Send width={16} strokeWidth={2} className="shrink-0" aria-hidden />}
        {t('chat.duOtpSubmit')}
      </button>
    </div>
  );
}

/**
 * The step a collecting group is on: its header and its one input. Keyed by the
 * group's section on `step`, so what was typed in one step never leaks into the
 * next, and a step the owner went back to starts from what the server holds.
 */
export function CollectingStep(props: StepProps) {
  const step = props.group.step ?? 'reasons';
  return (
    <div data-du-step={step} className="mt-2 flex flex-col gap-2">
      <StepHeader step={step} />
      {step === 'reasons' ? <ReasonsStep {...props} /> : null}
      {step === 'certificate' ? <PaperStep {...props} slot="certificate" /> : null}
      {step === 'serviceReport' ? <PaperStep {...props} slot="serviceReport" /> : null}
      {step === 'other' ? <PaperStep {...props} slot="other" /> : null}
      {step === 'remarks' ? <RemarksStep {...props} /> : null}
      {step === 'review' ? <ReviewStep {...props} /> : null}
    </div>
  );
}
