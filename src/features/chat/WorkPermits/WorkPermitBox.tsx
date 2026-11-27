import { ArrowLeft, Camera, Download, FileText, PlayCircle, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { PdfViewer } from '@/components/PdfViewer';
import { ZoomableImage } from '@/components/ZoomableImage';
import { Spinner, useToast } from '@/components/ui';
import { GuideVideoSheet } from '@/features/help/GuideVideoSheet';
import { videoTitle } from '@/features/help/helpView';
import { useGuideVideos } from '@/features/help/useGuideVideos';
import {
  fetchWorkPermitFile,
  useAnswerWorkPermit,
  useAnswerWorkPermitPhoto,
  useWorkPermits,
} from '@/hooks/api/useWorkPermits';
import { cn } from '@/lib/cn';
import { deliverDownload } from '@/lib/downloadAttachment';
import { useLang, useT } from '@/lib/i18n';
import { fetchPdfBytes } from '@/lib/pdf';
import { useBackToClose } from '@/lib/useBackToClose';
import { useAuthStore } from '@/store/auth';
import type { WorkPermitAnswerInput } from '@dk/shared/schemas';
import {
  sayIn,
  type WorkPermitDealerView,
  type WorkPermitOption,
  type WorkPermitQuestion,
} from '@dk/shared/types';

import { dayReady, todayInIndia } from '../Complaints/complaintsView';
import {
  BusyLine,
  INPUT_CLASS,
  Notice,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TEXT_BUTTON,
} from '../DuOtpSteps';

import {
  isLiveBox,
  permitWhen,
  typedAnswer,
  workPermitOf,
  workPermitsErrorText,
} from './workPermitsView';

type Send = (body: WorkPermitAnswerInput) => void;

const CHIP =
  'flex min-h-11 w-full items-center gap-2 rounded-lg border border-wa-divider bg-wa-chip px-3 py-2 text-left text-body text-wa-bubble-text transition-colors duration-150 active:bg-wa-row-active disabled:opacity-60';

function Chip({
  option,
  busy,
  quiet,
  onTap,
}: {
  option: WorkPermitOption;
  busy: boolean;
  quiet?: boolean;
  onTap: () => void;
}) {
  const lang = useLang();
  const hint = option.hint ? sayIn(option.hint, lang) : '';
  return (
    <button
      type="button"
      data-work-permit-option={option.id}
      disabled={busy}
      onClick={onTap}
      className={cn(CHIP, quiet && 'border-dashed text-wa-accent-strong')}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="min-w-0 break-words font-medium leading-snug">{sayIn(option.label, lang)}</span>
        {hint ? (
          <span className="min-w-0 break-words text-meta font-normal leading-snug text-wa-meta">
            {hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function TypedAnswer({
  input,
  busy,
  onSend,
}: {
  input: 'number' | 'text';
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const t = useT();
  const [value, setValue] = React.useState('');
  const ready = typedAnswer(value, input);
  const go = () => {
    if (ready && !busy) onSend(ready);
  };
  const hint = input === 'number' ? t('chat.workPermitNumberHint') : t('chat.workPermitTextHint');
  return (
    <div className="flex items-stretch gap-2">
      <input
        data-work-permit-input={input}
        type="text"
        inputMode={input === 'number' ? 'numeric' : 'text'}
        enterKeyHint="send"
        value={value}
        maxLength={input === 'number' ? 20 : 1000}
        disabled={busy}
        placeholder={hint}
        aria-label={hint}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            go();
          }
        }}
        className={cn(INPUT_CLASS, 'min-h-11 min-w-0 flex-1')}
      />
      <button
        type="button"
        disabled={busy || !ready}
        onClick={go}
        className={cn(PRIMARY_BUTTON, 'w-auto shrink-0 px-4')}
      >
        {busy ? <Spinner size={16} /> : null}
        {t('chat.workPermitSend')}
      </button>
    </div>
  );
}

/** A day, picked in the box: it stops at today. */
function DateAnswer({ busy, onSend }: { busy: boolean; onSend: (day: string) => void }) {
  const t = useT();
  const [value, setValue] = React.useState('');
  const ready = dayReady(value);
  return (
    <div className="flex items-stretch gap-2">
      <input
        data-work-permit-input="date"
        type="date"
        value={value}
        max={todayInIndia()}
        disabled={busy}
        aria-label={t('chat.workPermitPickDay')}
        onChange={(e) => setValue(e.target.value)}
        className={cn(INPUT_CLASS, 'min-h-11 min-w-0 flex-1')}
      />
      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => ready && onSend(ready)}
        className={cn(PRIMARY_BUTTON, 'w-auto shrink-0 px-4')}
      >
        {busy ? <Spinner size={16} /> : null}
        {t('chat.workPermitSend')}
      </button>
    </div>
  );
}

/** A photo: the phone's own chooser, a preview, and only then Send. */
function PhotoAnswer({
  busy,
  uploading,
  onSend,
}: {
  busy: boolean;
  uploading: boolean;
  onSend: (file: File) => void;
}) {
  const t = useT();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="flex flex-col gap-2">
      {preview ? (
        <img
          src={preview}
          alt={t('chat.workPermitPhotoPreview')}
          className="max-h-56 w-full rounded-lg border border-wa-divider bg-wa-in object-contain"
        />
      ) : null}
      <label
        className={cn(
          SECONDARY_BUTTON,
          'cursor-pointer focus-within:ring-2 focus-within:ring-focus-ring',
          (busy || uploading) && 'pointer-events-none opacity-60',
        )}
      >
        <Camera width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        <span className="min-w-0 break-words">
          {file ? t('chat.workPermitPhotoReplace') : t('chat.workPermitPhotoTake')}
        </span>
        <input
          type="file"
          accept="image/*"
          disabled={busy || uploading}
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = '';
            if (picked) setFile(picked);
          }}
          className="sr-only"
        />
      </label>
      {file ? (
        <button
          type="button"
          disabled={busy || uploading}
          aria-busy={uploading}
          onClick={() => onSend(file)}
          className={PRIMARY_BUTTON}
        >
          {uploading ? <Spinner size={16} /> : null}
          {uploading ? t('chat.workPermitUploading') : t('chat.workPermitSend')}
        </button>
      ) : null}
    </div>
  );
}

/** The small "watch the video" link, only when the guide video really exists in the library. */
function VideoLink({ videoId }: { videoId: string }) {
  const t = useT();
  const lang = useLang();
  const videos = useGuideVideos();
  const [playing, setPlaying] = React.useState(false);
  const video = videos.data?.find((v) => v.id === videoId && v.available);
  if (!video) return null;
  return (
    <>
      <button
        type="button"
        data-work-permit-video={videoId}
        onClick={() => setPlaying(true)}
        className={cn(TEXT_BUTTON, 'gap-1.5 self-start px-0')}
      >
        <PlayCircle width={16} strokeWidth={2} aria-hidden />
        {t('chat.workPermitVideo')}
      </button>
      {playing
        ? createPortal(
            <GuideVideoSheet
              id={video.id}
              title={videoTitle(video, lang)}
              onClose={() => setPlaying(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function Asking({
  view,
  busy,
  uploading,
  onAnswer,
  onPhoto,
}: {
  view: WorkPermitDealerView;
  busy: boolean;
  uploading: boolean;
  onAnswer: Send;
  onPhoto: (questionId: string, file: File) => void;
}) {
  const lang = useLang();
  const q: WorkPermitQuestion | undefined = view.question;
  if (!q) return null;
  const base = { permitId: view.id, questionId: q.id } as const;
  const help = q.help ? sayIn(q.help, lang) : '';
  return (
    <div className="flex flex-col gap-2">
      <p className="break-words text-subheading leading-snug">{sayIn(q.prompt, lang)}</p>
      {help ? <p className="break-words text-meta leading-snug text-wa-meta">{help}</p> : null}
      {q.videoId ? <VideoLink videoId={q.videoId} /> : null}
      {q.options.length ? (
        <div className="flex flex-col gap-1.5">
          {q.options.map((o) => (
            <Chip
              key={o.id}
              option={o}
              busy={busy}
              quiet={o.id === q.moreOptionId}
              onTap={() => onAnswer({ step: 'option', ...base, optionId: o.id })}
            />
          ))}
        </div>
      ) : null}
      {view.canCancel ? (
        <LeaveIt busy={busy} onLeave={() => onAnswer({ step: 'cancel', permitId: view.id })} />
      ) : null}
      {q.input === 'date' ? (
        <DateAnswer busy={busy} onSend={(text) => onAnswer({ step: 'text', ...base, text })} />
      ) : q.input === 'photo' ? (
        <PhotoAnswer busy={busy} uploading={uploading} onSend={(file) => onPhoto(q.id, file)} />
      ) : q.input ? (
        <TypedAnswer
          input={q.input}
          busy={busy}
          onSend={(text) => onAnswer({ step: 'text', ...base, text })}
        />
      ) : null}
    </div>
  );
}

function LeaveIt({ busy, onLeave }: { busy: boolean; onLeave: () => void }) {
  const t = useT();
  return (
    <button type="button" disabled={busy} onClick={onLeave} className={cn(TEXT_BUTTON, 'order-last self-center')}>
      {t('chat.workPermitLeave')}
    </button>
  );
}

function Confirm({ view, busy, onAnswer }: { view: WorkPermitDealerView; busy: boolean; onAnswer: Send }) {
  const t = useT();
  const lang = useLang();
  const status = sayIn(view.statusLine, lang);
  return (
    <div className="flex flex-col gap-2">
      {view.summary?.length ? (
        <dl className="m-0 flex flex-col divide-y divide-wa-divider rounded-lg bg-wa-in px-3 py-0.5">
          {view.summary.map((row, i) => (
            <div key={i} className="flex flex-col gap-0.5 py-1.5">
              <dt className="text-meta leading-snug text-wa-meta">{sayIn(row.label, lang)}</dt>
              <dd className="m-0 min-w-0 break-words text-meta leading-snug">{sayIn(row.value, lang)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {status ? <p className="break-words text-meta leading-snug">{status}</p> : null}
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => onAnswer({ step: 'confirm', permitId: view.id })}
        className={PRIMARY_BUTTON}
      >
        {busy ? <Spinner size={16} /> : null}
        {t('chat.workPermitIssue')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onAnswer({ step: 'change', permitId: view.id })}
        className={SECONDARY_BUTTON}
      >
        {t('chat.workPermitChange')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onAnswer({ step: 'cancel', permitId: view.id })}
        className={cn(TEXT_BUTTON, 'self-center')}
      >
        {t('chat.workPermitLeave')}
      </button>
    </div>
  );
}

/**
 * A paper read inside the app (`PdfViewer`), never a link out: the app refuses every
 * way out that is not on its short list. The link is asked for when the reader opens,
 * because it lives only a few minutes.
 */
function PermitFile({
  permitId,
  doc,
  label,
  title,
}: {
  permitId: string;
  doc: 'pdf' | 'letter';
  label: string;
  title: string;
}) {
  const t = useT();
  const toast = useToast();
  const [reading, setReading] = React.useState(false);
  const urlRef = React.useRef<string | null>(null);
  return (
    <>
      <button
        type="button"
        data-work-permit-file={doc}
        onClick={() => setReading(true)}
        className={SECONDARY_BUTTON}
      >
        <FileText width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        {label}
      </button>
      {reading && doc === 'letter' ? (
        <LetterViewer permitId={permitId} title={title} onClose={() => setReading(false)} />
      ) : reading ? (
        <PdfViewer
          title={title}
          load={async () => {
            const { url } = await fetchWorkPermitFile(permitId, doc);
            urlRef.current = url;
            return fetchPdfBytes(url);
          }}
          onSave={() => {
            const url = urlRef.current;
            if (!url) return;
            deliverDownload({
              url,
              filename: `${title}.pdf`,
              contentType: 'application/pdf',
              kind: 'file',
            }).catch(() => toast.error(t('chat.downloadFailed')));
          }}
          onClose={() => setReading(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The Letter of Authorization is a picture (SDMS takes images only), so it opens full screen
 * inside the app, zoomable, with Save — never in the PDF reader, never a link out.
 */
function LetterViewer({ permitId, title, onClose }: { permitId: string; title: string; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  useBackToClose(onClose);
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    fetchWorkPermitFile(permitId, 'letter')
      .then((r) => live && setUrl(r.url))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [permitId]);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-label={title}>
      <div className="flex items-center gap-2 px-2 py-2 text-white">
        <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="rounded-full p-2">
          <ArrowLeft width={22} aria-hidden />
        </button>
        <p className="min-w-0 flex-1 truncate text-body">{title}</p>
        {url ? (
          <button
            type="button"
            aria-label={t('pdf.save')}
            className="rounded-full p-2"
            onClick={() =>
              deliverDownload({ url, filename: `${title}.png`, contentType: 'image/png', kind: 'image' }).catch(() =>
                toast.error(t('chat.downloadFailed')),
              )
            }
          >
            <Download width={22} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">
        {url ? (
          <ZoomableImage src={url} alt={title} onDismiss={onClose} onError={() => setFailed(true)} />
        ) : failed ? (
          <p className="p-6 text-center text-meta text-white/80">{t('pdf.failed')}</p>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Spinner size={28} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Screen({
  view,
  busy,
  uploading,
  onAnswer,
  onPhoto,
}: {
  view: WorkPermitDealerView;
  busy: boolean;
  uploading: boolean;
  onAnswer: Send;
  onPhoto: (questionId: string, file: File) => void;
}) {
  const t = useT();
  const lang = useLang();
  const status = sayIn(view.statusLine, lang);

  switch (view.screen) {
    case 'asking':
      return (
        <Asking
          key={view.question?.id}
          view={view}
          busy={busy}
          uploading={uploading}
          onAnswer={onAnswer}
          onPhoto={onPhoto}
        />
      );

    case 'looking_up':
      return <BusyLine text={status || t('chat.workPermitLookingUp')} />;

    case 'confirm':
      return <Confirm view={view} busy={busy} onAnswer={onAnswer} />;

    case 'issuing':
      return <BusyLine text={status || t('chat.workPermitIssuing')} />;

    case 'closing':
      return <BusyLine text={status || t('chat.workPermitClosing')} />;

    case 'issued': {
      const till = permitWhen(view.validTill, lang);
      return (
        <div className="flex flex-col gap-2">
          {view.number || till ? (
            <div data-work-permit-number className="flex flex-col gap-0.5 rounded-lg bg-wa-in px-3 py-2">
              {view.number ? (
                <>
                  <span className="text-meta leading-snug text-wa-meta">
                    {t('chat.workPermitNumberLabel')}
                  </span>
                  <span className="select-text break-all text-subheading leading-snug tabular-nums">
                    {view.number}
                  </span>
                </>
              ) : null}
              {till ? (
                <span className="text-meta leading-snug text-wa-meta">
                  {t('chat.workPermitValidTill', { when: till })}
                </span>
              ) : null}
            </div>
          ) : null}
          {status ? <p className="break-words text-meta leading-snug">{status}</p> : null}
          {view.hasPdf ? (
            <PermitFile
              permitId={view.id}
              doc="pdf"
              label={t('chat.workPermitViewPdf')}
              title={t('chat.workPermitPdfTitle')}
            />
          ) : null}
          {view.hasLetter ? (
            <PermitFile
              permitId={view.id}
              doc="letter"
              label={t('chat.workPermitViewLetter')}
              title={t('chat.workPermitLetterTitle')}
            />
          ) : null}
        </div>
      );
    }

    case 'done_ask':
      return (
        <div className="flex flex-col gap-2">
          <p className="break-words text-subheading leading-snug">
            {t('chat.workPermitDoneQuestion')}
          </p>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => onAnswer({ step: 'done', permitId: view.id, done: true })}
            className={PRIMARY_BUTTON}
          >
            {busy ? <Spinner size={16} /> : null}
            {t('chat.workPermitYesDone')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAnswer({ step: 'done', permitId: view.id, done: false })}
            className={SECONDARY_BUTTON}
          >
            {t('chat.workPermitMoreTime')}
          </button>
        </div>
      );

    case 'done':
    case 'failed':
    case 'cancelled':
      return status ? <p className="break-words text-meta leading-snug text-wa-meta">{status}</p> : null;
  }
}

/**
 * The work-permit box inside an MDG message (`message.workPermit`, ADR 0053).
 *
 * It draws the permit NOW, never what was true when the message was posted, and only
 * on the message the view names as `liveMessageId`; every other message of the same
 * permit keeps just its own words. It draws from the view's `screen` and never works
 * out what comes next: every answer returns the fresh view.
 */
export function WorkPermitBox({ permitId, messageId }: { permitId: string; messageId: string }) {
  const t = useT();
  const lang = useLang();
  const q = useWorkPermits();
  const view = workPermitOf(q.data, permitId);
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);

  const answer = useAnswerWorkPermit();
  const photo = useAnswerWorkPermitPhoto();
  const [error, setError] = React.useState<string | null>(null);
  const uploading = photo.isPending;
  const busy = answer.isPending || uploading;

  // A refusal belongs to the step it was given on.
  const where = view ? `${view.screen}:${view.question?.id ?? ''}` : '';
  React.useEffect(() => setError(null), [where]);

  const isMoved = (err: unknown) =>
    !!err && typeof err === 'object' && 'status' in err && err.status === 409;

  const send: Send = async (body) => {
    setError(null);
    try {
      await answer.mutateAsync(body);
    } catch (err) {
      // A 409 means the question moved; the view is already being asked for again.
      if (!isMoved(err)) setError(workPermitsErrorText(err, t, 'answer'));
    }
  };

  const sendPhoto = async (questionId: string, file: File) => {
    if (!dealerId) return;
    setError(null);
    try {
      await photo.mutateAsync({ dealerId, permitId, questionId, file });
    } catch (err) {
      if (!isMoved(err)) setError(workPermitsErrorText(err, t, 'photo'));
    }
  };

  // Not the live message (or the list has not arrived): the message's own words say it all.
  if (!view || !isLiveBox(view, messageId)) return null;

  return (
    <div
      data-work-permit
      data-screen={view.screen}
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-1"
    >
      <div className="rounded-lg bg-wa-row-active px-2.5 py-2.5">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-px flex size-7 shrink-0 items-center justify-center rounded-full bg-wa-in text-wa-accent-strong"
          >
            <ShieldCheck width={15} strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-meta leading-snug text-wa-meta">{t('chat.workPermitLabel')}</span>
            <span className="min-w-0 break-words text-subheading leading-snug">
              {sayIn(view.title, lang)}
            </span>
          </div>
        </div>

        <div key={view.screen} className="animate-in mt-2.5 flex flex-col gap-2">
          <Screen
            view={view}
            busy={busy}
            uploading={uploading}
            onAnswer={(body) => void send(body)}
            onPhoto={(qid, file) => void sendPhoto(qid, file)}
          />
          {error ? <Notice text={error} /> : null}
        </div>
      </div>
    </div>
  );
}
