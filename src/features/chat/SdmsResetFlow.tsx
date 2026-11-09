import { useQueryClient } from '@tanstack/react-query';
import { Check, Eye, EyeOff, Lock } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import {
  invalidatePortalLogins,
  useAnswerSdmsReset,
  useSdmsReset,
  useStartSdmsReset,
} from '@/hooks/api/usePortalLogins';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import {
  SDMS_NEW_PASSWORD_RE,
  SDMS_RESET_ALREADY_ANSWERED,
  SDMS_RESET_NO_SAP_CODE,
  SDMS_RESET_OTP_RE,
  type SdmsResetRetry,
  type SdmsResetView,
} from '@dk/shared/types';

const INPUT_CLASS =
  'h-11 w-full rounded-md border border-wa-divider bg-wa-in px-2.5 text-[16px] text-wa-bubble-text placeholder:text-wa-meta focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
const PRIMARY_BUTTON =
  'flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90 disabled:opacity-60';
const TEXT_BUTTON =
  'flex min-h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10';
const NOTICE_CLASS = 'rounded-md bg-wa-notice px-2.5 py-1.5 text-[13px] leading-snug text-wa-bubble-text';

const RETRY_KEY: Record<SdmsResetRetry, MessageKey> = {
  wrong_otp: 'chat.sdmsResetWrongOtp',
  password_used: 'chat.sdmsResetUsed',
  password_rule: 'chat.sdmsResetRuleRefused',
};

/** The words under a start or an answer that did not go through. */
export function sdmsResetErrorKey(err: unknown, step: 'start' | 'answer'): MessageKey {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.code === SDMS_RESET_NO_SAP_CODE) return 'chat.sdmsResetNoSap';
    if (err.status === 409 && err.code === SDMS_RESET_ALREADY_ANSWERED) return 'chat.sdmsResetTaken';
    if (err.status === 409) return 'chat.sdmsResetOver';
    if (err.status === 429) return 'chat.portalRateLimited';
  }
  return step === 'start' ? 'chat.sdmsResetSendFailed' : 'chat.portalSaveFailed';
}

/** "4:52" until the OTP stops being taken, or null once it has. */
function useTimeLeft(expiresAt: string | null): string | null {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const left = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
  if (!Number.isFinite(left) || left <= 0) return null;
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

function BusyLine({ text }: { text: string }) {
  return (
    <p role="status" className="mt-2 flex items-center gap-2 text-[14px] leading-snug">
      <Spinner size={16} />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}

/**
 * The OTP and the new password, twice. What is typed lives only in this form's
 * state and the one call that sends it; the fields are emptied the moment the
 * server has them. The password is checked against IndianOil's own rule before it
 * is sent, so a password the portal would refuse never costs the owner the OTP.
 */
function OtpAndPasswordForm({
  reset,
  pending,
  error,
  onSubmit,
}: {
  reset: SdmsResetView;
  pending: boolean;
  error: MessageKey | null;
  onSubmit: (vars: { otp: string; password: string }) => Promise<boolean>;
}) {
  const t = useT();
  const ids = React.useId();
  const [otp, setOtp] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [repeat, setRepeat] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [localError, setLocalError] = React.useState<MessageKey | null>(null);
  const timeLeft = useTimeLeft(reset.expiresAt);

  // A refused try comes back here: clear what IndianOil turned down.
  const lastRetry = React.useRef(reset.retry);
  React.useEffect(() => {
    if (reset.retry && reset.retry !== lastRetry.current) {
      if (reset.retry === 'wrong_otp') setOtp('');
      else {
        setPassword('');
        setRepeat('');
      }
    }
    lastRetry.current = reset.retry;
  }, [reset.retry]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const code = otp.replace(/\D/g, '');
    if (!SDMS_RESET_OTP_RE.test(code)) return setLocalError('chat.sdmsResetOtpBad');
    if (!SDMS_NEW_PASSWORD_RE.test(password)) return setLocalError('chat.sdmsResetRuleBad');
    if (password !== repeat) return setLocalError('chat.sdmsResetMismatch');
    setLocalError(null);
    if (await onSubmit({ otp: code, password })) {
      setOtp('');
      setPassword('');
      setRepeat('');
    }
  };

  const shown = localError ?? error;
  return (
    <form
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => void submit(e)}
      autoComplete="off"
      noValidate
      className="mt-2 flex flex-col gap-2"
    >
      <p className="text-[13px] leading-snug text-wa-bubble-text">
        {reset.sentTo ?? t('chat.sdmsResetSent')}
        {timeLeft ? <span className="block text-wa-meta">{t('chat.sdmsResetTimeLeft', { time: timeLeft })}</span> : null}
      </p>
      {reset.retry ? (
        <p role="alert" className={NOTICE_CLASS}>
          {t(RETRY_KEY[reset.retry])}
        </p>
      ) : null}
      <div>
        <label htmlFor={`${ids}-otp`} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
          {t('chat.sdmsResetOtp')}
        </label>
        <input
          id={`${ids}-otp`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor={`${ids}-new`} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
          {t('chat.sdmsResetNew')}
        </label>
        <div className="relative">
          <input
            id={`${ids}-new`}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={15}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(INPUT_CLASS, 'pr-11')}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? t('chat.portalHidePassword') : t('chat.portalShowPassword')}
            aria-pressed={show}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-wa-meta active:bg-black/10"
          >
            {show ? <EyeOff width={18} strokeWidth={1.75} aria-hidden /> : <Eye width={18} strokeWidth={1.75} aria-hidden />}
          </button>
        </div>
      </div>
      <div>
        <label htmlFor={`${ids}-repeat`} className="mb-0.5 block text-[12px] leading-tight text-wa-meta">
          {t('chat.sdmsResetRepeat')}
        </label>
        <input
          id={`${ids}-repeat`}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={15}
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      <p className="text-[12px] leading-snug text-wa-meta">{t('chat.sdmsResetRule')}</p>
      {shown ? (
        <p role="alert" className={NOTICE_CLASS}>
          {t(shown)}
        </p>
      ) : null}
      <button type="submit" disabled={pending} aria-busy={pending} className={PRIMARY_BUTTON}>
        {pending ? <Spinner size={16} /> : <Lock width={16} strokeWidth={2} className="shrink-0" aria-hidden />}
        {t('chat.sdmsResetSubmit')}
      </button>
      <p className="text-[12px] leading-snug text-wa-meta">{t('chat.portalKeptSafe')}</p>
    </form>
  );
}

/**
 * SDMS "Forgot password?", inside the login box: "Send OTP", then the OTP and a
 * new password, then done — followed live while the reset is going.
 *
 * `initial` is a reset already going when the box appeared (this owner left and
 * came back, or another owner started it): it is followed, never started again.
 * The server keeps one reset per outlet, so a second owner who taps "Send OTP"
 * is handed the first one's reset, and the box says who started it.
 */
export function SdmsResetFlow({
  initial,
  onClose,
  onDone,
}: {
  initial: SdmsResetView | null;
  onClose: () => void;
  /** The reset set and saved the new password. */
  onDone?: () => void;
}) {
  const t = useT();
  const myName = useAuthStore((s) => s.user?.name ?? null);
  const lang = useLang();
  const qc = useQueryClient();
  const [resetId, setResetId] = React.useState<string | null>(initial?.id ?? null);
  const [startError, setStartError] = React.useState<MessageKey | null>(null);
  const [answerError, setAnswerError] = React.useState<MessageKey | null>(null);
  const start = useStartSdmsReset();
  const resetQuery = useSdmsReset(resetId, initial);
  const answer = useAnswerSdmsReset(resetId);
  const reset = resetQuery.data ?? null;
  const { refetch } = resetQuery;

  // A finished reset has saved a new password: the box's own view is out of date.
  const finished = React.useRef(false);
  React.useEffect(() => {
    if (reset?.state === 'done' && !finished.current) {
      finished.current = true;
      invalidatePortalLogins(qc);
      onDone?.();
    }
  }, [reset?.state, qc, onDone]);

  const sendOtp = async () => {
    setStartError(null);
    try {
      const view = await start.mutateAsync();
      if (view.sdmsReset) {
        finished.current = false;
        setAnswerError(null);
        setResetId(view.sdmsReset.id);
      } else {
        setStartError('chat.sdmsResetSendFailed');
      }
    } catch (err) {
      setStartError(sdmsResetErrorKey(err, 'start'));
    } finally {
      start.reset();
    }
  };

  const submitAnswer = async (vars: { otp: string; password: string }): Promise<boolean> => {
    setAnswerError(null);
    try {
      await answer.mutateAsync(vars);
      return true;
    } catch (err) {
      setAnswerError(sdmsResetErrorKey(err, 'answer'));
      if (err instanceof ApiError && err.status === 409) void refetch();
      return false;
    } finally {
      answer.reset();
    }
  };

  // "Ramesh started this", for the owner who did not.
  const startedByOther =
    reset?.startedByName && reset.startedByName !== myName
      ? t('chat.sdmsResetStartedBy', { name: reset.startedByName })
      : null;

  if (!resetId) {
    return (
      <div className="mt-2 flex flex-col gap-2" data-no-swipe onPointerDown={(e) => e.stopPropagation()}>
        <p className="text-[13px] leading-snug text-wa-bubble-text">{t('chat.sdmsResetIntro')}</p>
        {startError ? (
          <p role="alert" className={NOTICE_CLASS}>
            {t(startError)}
          </p>
        ) : null}
        <button type="button" onClick={() => void sendOtp()} disabled={start.isPending} className={PRIMARY_BUTTON}>
          {start.isPending ? <Spinner size={16} /> : null}
          {t('chat.sdmsResetSend')}
        </button>
        <button type="button" onClick={onClose} className={TEXT_BUTTON}>
          {t('common.cancel')}
        </button>
      </div>
    );
  }

  if (!reset) {
    if (resetQuery.isError) {
      return (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[13px] leading-snug text-wa-meta">{t('chat.askStateFailed')}</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-11 shrink-0 rounded-md px-2 text-[13px] font-medium text-wa-accent-strong active:bg-black/10"
          >
            {t('common.retry')}
          </button>
        </div>
      );
    }
    return <BusyLine text={t('chat.sdmsResetOpening')} />;
  }

  const ended = (words: string) => (
    <div className="mt-2 flex flex-col gap-2">
      <p role="alert" className={NOTICE_CLASS}>
        {words}
      </p>
      <button
        type="button"
        onClick={() => {
          setResetId(null);
          void sendOtp();
        }}
        disabled={start.isPending}
        className={PRIMARY_BUTTON}
      >
        {t('chat.sdmsResetSend')}
      </button>
      <button type="button" onClick={onClose} className={TEXT_BUTTON}>
        {t('common.cancel')}
      </button>
    </div>
  );

  switch (reset.state) {
    case 'starting':
      return (
        <>
          <BusyLine text={t('chat.sdmsResetOpening')} />
          {startedByOther ? <p className="mt-1 text-[12px] text-wa-meta">{startedByOther}</p> : null}
        </>
      );
    case 'otp_sent':
      return (
        <>
          {startedByOther ? <p className="mt-2 text-[12px] text-wa-meta">{startedByOther}</p> : null}
          <OtpAndPasswordForm reset={reset} pending={answer.isPending} error={answerError} onSubmit={submitAnswer} />
        </>
      );
    case 'checking':
      return (
        <BusyLine
          text={
            reset.answeredByName
              ? t('chat.sdmsResetCheckingBy', { name: reset.answeredByName })
              : t('chat.sdmsResetChecking')
          }
        />
      );
    case 'done':
      return (
        <p role="status" className="mt-2 flex items-start gap-2 text-[14px] font-medium leading-snug">
          <Check width={16} strokeWidth={2.5} className="mt-0.5 shrink-0 text-success" aria-hidden />
          <span className="min-w-0 break-words">{t('chat.sdmsResetDone')}</span>
        </p>
      );
    case 'failed':
    case 'expired':
    case 'cancelled':
      return ended(reset.message?.[lang] ?? t('chat.sdmsResetFailed'));
    default:
      return null;
  }
}
