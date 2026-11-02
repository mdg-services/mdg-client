import { useQueryClient } from '@tanstack/react-query';
import { Check, Eye, EyeOff, Lock, Smartphone } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import {
  invalidateWemmisLogin,
  resetIsLive,
  useAnswerWemmisReset,
  useSaveWemmisLogin,
  useStartWemmisReset,
  useWemmisLogin,
  useWemmisReset,
  type AnswerWemmisResetVars,
} from '@/hooks/api/useWemmisLogin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import type { WemmisResetView } from '@dk/shared/types';

import {
  OTP_LENGTH,
  emptyOtp,
  fillOtp,
  formatCountdown,
  isValidMobile,
  normalizeMobile,
  otpIsComplete,
  resetMessage,
  wemmisResetErrorKey,
  wemmisSaveErrorKey,
} from './wemmisLoginView';

const INPUT_CLASS =
  'h-11 w-full rounded-md border border-wa-divider bg-wa-in px-2.5 text-[16px] text-wa-bubble-text placeholder:text-wa-meta focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
const LABEL_CLASS = 'mb-0.5 block text-[12px] leading-tight text-wa-meta';
const PRIMARY_BUTTON =
  'flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-wa-accent px-3 text-[15px] font-medium text-white active:opacity-90 disabled:opacity-60';
const TEXT_BUTTON =
  'flex min-h-11 w-full items-center justify-center rounded-lg text-[14px] font-medium text-wa-accent-strong active:bg-black/10';
const NOTICE_CLASS =
  'rounded-md bg-wa-notice px-2.5 py-1.5 text-[13px] leading-snug text-wa-bubble-text';

/**
 * Bring a field to the middle of the screen once the keyboard has risen over the
 * lower half of a phone, so what is being typed is visible.
 */
function useBringIntoView() {
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return React.useCallback((e: React.FocusEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, 300);
  }, []);
}

/** A line with a spinner: the robot is working and the owner has nothing to do. */
function BusyLine({ text }: { text: string }) {
  return (
    <p role="status" className="mt-2 flex items-center gap-2 text-[14px] leading-snug">
      <Spinner size={16} />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}

/**
 * The form for the login: user ID, password, Save — and, under it, "Forgot
 * password?".
 *
 * What is typed goes to the outlet's record over its own route and nowhere else.
 * It is never a chat message, never put into the composer, never logged, and the
 * password leaves this component's state the moment the save has gone through.
 * A password the site had already refused is cleared too, so the owner types the
 * new one instead of resending the old.
 */
function LoginForm({
  refused,
  onSaved,
  onForgot,
  onCancel,
}: {
  /** The site refused the saved password: say so above the fields. */
  refused: boolean;
  onSaved: () => void;
  onForgot: () => void;
  /** Present when the form was reopened over a saved login: a way back out. */
  onCancel?: () => void;
}) {
  const t = useT();
  const save = useSaveWemmisLogin();
  const ids = React.useId();
  const userId = `${ids}-user`;
  const passId = `${ids}-pass`;
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<MessageKey | null>(null);
  const bringIntoView = useBringIntoView();

  const busy = save.isPending;
  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setErrorKey(null);
    try {
      await save.mutateAsync({ username: username.trim(), password });
      // In: drop what was typed, and the mutation's own copy of it.
      setPassword('');
      setUsername('');
      setShow(false);
      onSaved();
    } catch (err) {
      const key = wemmisSaveErrorKey(err);
      setErrorKey(key);
      // The refused password is no use again; any other failure keeps what was
      // typed so a retry on a bad link is one tap.
      if (key === 'chat.portalSameAsRefused') setPassword('');
    } finally {
      save.reset();
    }
  };

  return (
    <form
      // Holding a finger on a field (to paste, to select) must not select the
      // message or start a reply swipe: neither gesture may see a touch here.
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => void submit(e)}
      autoComplete="off"
      noValidate
      className="mt-2 flex flex-col gap-2"
    >
      {refused ? <p className={NOTICE_CLASS}>{t('chat.wemmisRefusedNote')}</p> : null}
      <div>
        <label htmlFor={userId} className={LABEL_CLASS}>
          {t('chat.portalUserId')}
        </label>
        <input
          id={userId}
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onFocus={bringIntoView}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          enterKeyHint="next"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor={passId} className={LABEL_CLASS}>
          {t('chat.portalPassword')}
        </label>
        <div className="relative">
          <input
            id={passId}
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={bringIntoView}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={500}
            enterKeyHint="done"
            className={cn(INPUT_CLASS, 'pr-11')}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? t('chat.portalHidePassword') : t('chat.portalShowPassword')}
            aria-pressed={show}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-wa-meta active:bg-black/10"
          >
            {show ? (
              <EyeOff width={18} strokeWidth={1.75} aria-hidden />
            ) : (
              <Eye width={18} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {errorKey ? (
        <p role="alert" className={NOTICE_CLASS}>
          {t(errorKey)}
        </p>
      ) : null}

      <button type="submit" disabled={!canSubmit} aria-busy={busy} className={PRIMARY_BUTTON}>
        {busy ? (
          <Spinner size={16} />
        ) : (
          <Lock width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        )}
        {t('chat.portalSave')}
      </button>
      <button type="button" onClick={onForgot} className={TEXT_BUTTON}>
        {t('chat.wemmisForgot')}
      </button>
      {onCancel ? (
        <button type="button" onClick={onCancel} className={TEXT_BUTTON}>
          {t('common.cancel')}
        </button>
      ) : null}
      <p className="text-[12px] leading-snug text-wa-meta">{t('chat.portalKeptSafe')}</p>
    </form>
  );
}

/** The registered mobile, and "Send OTP". */
function MobileForm({
  mobile,
  onMobile,
  pending,
  error,
  onSend,
  onBack,
}: {
  mobile: string;
  onMobile: (value: string) => void;
  pending: boolean;
  error: MessageKey | null;
  onSend: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const ids = React.useId();
  const bringIntoView = useBringIntoView();
  const canSend = isValidMobile(mobile) && !pending;
  return (
    <form
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
      noValidate
      className="mt-2 flex flex-col gap-2"
    >
      <div>
        <label htmlFor={`${ids}-mobile`} className={LABEL_CLASS}>
          {t('chat.wemmisMobile')}
        </label>
        <input
          id={`${ids}-mobile`}
          type="tel"
          inputMode="numeric"
          value={mobile}
          onChange={(e) => onMobile(normalizeMobile(e.target.value))}
          onFocus={bringIntoView}
          autoComplete="tel-national"
          maxLength={14}
          enterKeyHint="send"
          aria-describedby={`${ids}-mobile-help`}
          className={cn(INPUT_CLASS, 'tabular-nums tracking-wide')}
        />
        <p id={`${ids}-mobile-help`} className="mt-0.5 text-[12px] leading-snug text-wa-meta">
          {t('chat.wemmisMobileHelp')}
        </p>
      </div>
      {error ? (
        <p role="alert" className={NOTICE_CLASS}>
          {t(error)}
        </p>
      ) : null}
      <button type="submit" disabled={!canSend} aria-busy={pending} className={PRIMARY_BUTTON}>
        {pending ? (
          <Spinner size={16} />
        ) : (
          <Smartphone width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        )}
        {t('chat.wemmisSendOtp')}
      </button>
      <button type="button" onClick={onBack} className={TEXT_BUTTON}>
        {t('common.back')}
      </button>
    </form>
  );
}

/** "Time left 1:52", counting down once a second to the moment the OTP stops working. */
function Countdown({ expiresAt }: { expiresAt: string }) {
  const t = useT();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return null;
  return (
    <p role="timer" className="text-[13px] tabular-nums leading-snug text-wa-meta">
      {t('chat.wemmisTimeLeft', { time: formatCountdown(end - now) })}
    </p>
  );
}

/**
 * Four one-digit boxes for the OTP, and — when the site wants it too — the
 * letters of its picture.
 *
 * The first box carries `autocomplete="one-time-code"`, so a phone can offer the
 * code from the SMS; a paste (or that offer) into any box fills all four. The
 * fourth digit sends the code at once, unless the picture's letters are still
 * missing: then "Check" (or Enter) sends both together.
 *
 * Kept mounted while the state moves between waiting for the OTP and asking for
 * the picture too, so what the owner has typed is not lost on the way.
 */
function OtpForm({
  reset,
  pending,
  error,
  onSubmit,
}: {
  reset: WemmisResetView;
  pending: boolean;
  error: MessageKey | null;
  onSubmit: (vars: { otp: string; captcha?: string }) => void;
}) {
  const t = useT();
  const ids = React.useId();
  const [digits, setDigits] = React.useState<string[]>(emptyOtp);
  const [captcha, setCaptcha] = React.useState('');
  const boxes = React.useRef<Array<HTMLInputElement | null>>([]);
  const bringIntoView = useBringIntoView();
  const needCaptcha = reset.state === 'need_captcha';
  const letters = captcha.trim();
  const lettersReady = !needCaptcha || letters.length > 0;

  const focusBox = (i: number) => {
    boxes.current[i]?.focus();
  };

  const send = (next: readonly string[]) => {
    onSubmit({ otp: next.join(''), ...(needCaptcha ? { captcha: letters } : {}) });
  };

  const apply = (next: string[], focus: number) => {
    setDigits(next);
    focusBox(focus);
    // The fourth digit sends it, as long as nothing else is still wanted.
    if (otpIsComplete(next) && lettersReady && !pending) send(next);
  };

  // The code did not match: start the boxes over, whatever state they came from.
  const prevState = React.useRef(reset.state);
  React.useEffect(() => {
    if (reset.state === 'wrong_otp' && prevState.current !== 'wrong_otp') {
      setDigits(emptyOtp());
      setCaptcha('');
      boxes.current[0]?.focus();
    }
    prevState.current = reset.state;
  }, [reset.state]);

  // The owner has to type this within two minutes: put the cursor in the first box.
  React.useEffect(() => {
    boxes.current[0]?.focus();
  }, []);

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && digits[i] === '' && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = '';
      setDigits(next);
      focusBox(i - 1);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === 'ArrowRight' && i < OTP_LENGTH - 1) {
      e.preventDefault();
      focusBox(i + 1);
    }
  };

  const canSubmit = otpIsComplete(digits) && lettersReady && !pending;
  const mobileLine = reset.mobileMasked
    ? t('chat.wemmisOtpSentTo', { mobile: reset.mobileMasked })
    : t('chat.wemmisOtpSent');

  return (
    <form
      data-no-swipe
      data-wemmis-otp
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) send(digits);
      }}
      autoComplete="off"
      noValidate
      className="mt-2 flex flex-col gap-2"
    >
      <p className="text-[14px] font-medium leading-snug">{mobileLine}</p>
      {reset.state === 'wrong_otp' ? (
        <p role="alert" className={NOTICE_CLASS}>
          {t('chat.wemmisWrongOtp')}
        </p>
      ) : null}

      <div role="group" aria-label={t('chat.wemmisOtpGroup')} className="flex gap-2">
        {digits.map((digit, i) => (
          <input
            // The boxes never reorder: the position is their identity.
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={t('chat.wemmisOtpDigit', { n: i + 1, total: OTP_LENGTH })}
            value={digit}
            disabled={pending}
            onChange={(e) => {
              const { digits: next, focus } = fillOtp(digits, i, e.target.value);
              apply(next, focus);
            }}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => {
              e.preventDefault();
              const { digits: next, focus } = fillOtp(
                digits,
                i,
                e.clipboardData.getData('text'),
                'paste',
              );
              apply(next, focus);
            }}
            onFocus={(e) => {
              // So the next digit typed replaces this one instead of joining it.
              e.currentTarget.select();
              bringIntoView(e);
            }}
            className="h-12 min-w-0 flex-1 rounded-md border border-wa-divider bg-wa-in text-center text-[22px] font-medium tabular-nums text-wa-bubble-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60"
          />
        ))}
      </div>

      {needCaptcha ? (
        <div className="flex flex-col gap-1.5">
          {reset.captchaImageUrl ? (
            <img
              src={reset.captchaImageUrl}
              alt={t('chat.wemmisCaptchaAlt')}
              draggable={false}
              className="h-14 w-full rounded-md border border-wa-divider bg-white object-contain"
            />
          ) : null}
          <div>
            <label htmlFor={`${ids}-letters`} className={LABEL_CLASS}>
              {t('chat.wemmisCaptchaLabel')}
            </label>
            <input
              id={`${ids}-letters`}
              type="text"
              value={captcha}
              onChange={(e) => setCaptcha(e.target.value)}
              onFocus={bringIntoView}
              disabled={pending}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={12}
              enterKeyHint="done"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      ) : null}

      {reset.expiresAt ? <Countdown expiresAt={reset.expiresAt} /> : null}

      {error ? (
        <p role="alert" className={NOTICE_CLASS}>
          {t(error)}
        </p>
      ) : null}

      <button type="submit" disabled={!canSubmit} aria-busy={pending} className={PRIMARY_BUTTON}>
        {pending ? (
          <Spinner size={16} />
        ) : (
          <Check width={16} strokeWidth={2.5} className="shrink-0" aria-hidden />
        )}
        {t('chat.wemmisCheck')}
      </button>
    </form>
  );
}

/** "Several logins use this mobile": one button per user ID, the owner picks the pump's. */
function UserChoice({
  usernames,
  pending,
  error,
  onPick,
}: {
  usernames: readonly string[];
  pending: boolean;
  error: MessageKey | null;
  onPick: (username: string) => void;
}) {
  const t = useT();
  return (
    <div
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-2 flex flex-col gap-2"
    >
      <p className="text-[14px] font-medium leading-snug">{t('chat.wemmisChooseUser')}</p>
      {usernames.map((name) => (
        <button
          key={name}
          type="button"
          disabled={pending}
          onClick={() => onPick(name)}
          className="flex min-h-11 w-full items-center justify-center break-all rounded-lg border border-wa-divider bg-wa-chip px-3 py-2 text-[15px] font-medium text-wa-bubble-text active:bg-wa-row-active disabled:opacity-60"
        >
          {name}
        </button>
      ))}
      {error ? (
        <p role="alert" className={NOTICE_CLASS}>
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}

/** The OTP's time ran out: say so, and offer a new one. */
function ExpiredPanel({
  onSend,
  pending = false,
  error = null,
}: {
  onSend: () => void;
  pending?: boolean;
  error?: MessageKey | null;
}) {
  const t = useT();
  return (
    <div
      data-no-swipe
      onPointerDown={(e) => e.stopPropagation()}
      className="mt-2 flex flex-col gap-2"
    >
      <p role="status" className="text-[14px] leading-snug">
        {t('chat.wemmisExpired')}
      </p>
      {error ? (
        <p role="alert" className={NOTICE_CLASS}>
          {t(error)}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onSend}
        disabled={pending}
        aria-busy={pending}
        className={PRIMARY_BUTTON}
      >
        {pending ? (
          <Spinner size={16} />
        ) : (
          <Smartphone width={16} strokeWidth={2} className="shrink-0" aria-hidden />
        )}
        {t('chat.wemmisSendOtp')}
      </button>
    </div>
  );
}

/**
 * The owner's side of "Forgot password?": the registered mobile, then whatever
 * the robot on the eMaaptaul site needs next — followed live, every 1.5 seconds,
 * until the reset ends.
 *
 * `initial` is a reset that was already going when the box appeared (the owner
 * left the chat and came back, or started it on another phone): it is followed
 * rather than started again.
 */
function ResetFlow({ initial, onClose }: { initial: WemmisResetView | null; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const [mobile, setMobile] = React.useState('');
  const [resetId, setResetId] = React.useState<string | null>(initial?.id ?? null);
  const [startError, setStartError] = React.useState<MessageKey | null>(null);
  const [answerError, setAnswerError] = React.useState<MessageKey | null>(null);
  const start = useStartWemmisReset();
  const resetQuery = useWemmisReset(resetId, initial);
  const answer = useAnswerWemmisReset(resetId);
  const reset = resetQuery.data ?? null;
  const { refetch } = resetQuery;

  // A finished reset has saved a new password: the box's own view of the login
  // is out of date from this moment.
  const finished = React.useRef(false);
  React.useEffect(() => {
    if (reset?.state === 'done' && !finished.current) {
      finished.current = true;
      invalidateWemmisLogin(qc);
    }
  }, [reset?.state, qc]);

  const sendOtp = async (number: string) => {
    setStartError(null);
    try {
      const view = await start.mutateAsync({ mobile: number });
      if (view.reset) {
        finished.current = false;
        setAnswerError(null);
        setResetId(view.reset.id);
      } else {
        setStartError('chat.wemmisSendFailed');
      }
    } catch (err) {
      setStartError(wemmisResetErrorKey(err, 'start'));
    } finally {
      start.reset();
    }
  };

  const submitAnswer = async (vars: AnswerWemmisResetVars) => {
    setAnswerError(null);
    try {
      await answer.mutateAsync(vars);
    } catch (err) {
      setAnswerError(wemmisResetErrorKey(err, 'answer'));
      // The step has moved on without us: look at where it stands now.
      if (err instanceof ApiError && err.status === 409) void refetch();
    } finally {
      answer.reset();
    }
  };

  const backToMobile = () => {
    setStartError(null);
    setResetId(null);
  };

  if (!resetId) {
    return (
      <MobileForm
        mobile={mobile}
        onMobile={setMobile}
        pending={start.isPending}
        error={startError}
        onSend={() => void sendOtp(mobile)}
        onBack={onClose}
      />
    );
  }

  if (!reset) {
    // A reset the server no longer holds ran out its time and was swept away.
    const gone = resetQuery.error instanceof ApiError && resetQuery.error.status === 404;
    if (gone) {
      return <ExpiredPanel onSend={backToMobile} />;
    }
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
    return <BusyLine text={t('chat.wemmisOpening')} />;
  }

  switch (reset.state) {
    case 'starting':
      return <BusyLine text={t('chat.wemmisOpening')} />;
    case 'checking':
      return <BusyLine text={t('chat.wemmisChecking')} />;
    case 'resetting':
      return <BusyLine text={t('chat.wemmisResetting')} />;
    case 'otp_sent':
    case 'wrong_otp':
    case 'need_captcha':
      return (
        <OtpForm
          reset={reset}
          pending={answer.isPending}
          error={answerError}
          onSubmit={(vars) => void submitAnswer(vars)}
        />
      );
    case 'choose_user':
      return (
        <UserChoice
          usernames={reset.usernames}
          pending={answer.isPending}
          error={answerError}
          onPick={(username) => void submitAnswer({ username })}
        />
      );
    case 'done':
      return (
        <p
          role="status"
          className="mt-2 flex items-start gap-2 text-[14px] font-medium leading-snug"
        >
          <Check
            width={16}
            strokeWidth={2.5}
            className="mt-0.5 shrink-0 text-success"
            aria-hidden
          />
          <span className="min-w-0 break-words">{t('chat.wemmisDone')}</span>
        </p>
      );
    case 'failed':
      return (
        <div className="mt-2 flex flex-col gap-2">
          <p role="alert" className={NOTICE_CLASS}>
            {resetMessage(reset, lang) ?? t('chat.wemmisFailed')}
          </p>
          <button type="button" onClick={backToMobile} className={TEXT_BUTTON}>
            {t('common.retry')}
          </button>
        </div>
      );
    case 'expired':
      return (
        <ExpiredPanel
          onSend={() => (isValidMobile(mobile) ? void sendOtp(mobile) : backToMobile())}
          pending={start.isPending}
          error={startError}
        />
      );
    default:
      return null;
  }
}

/**
 * The eMaaptaul login box inside an MDG message (`message.wemmisLogin`, ADR 0029):
 * the user ID and password for the Bihar weights-and-measures site, where the
 * calibration certificate and the fee receipt are downloaded — or, for an owner
 * who forgot the password, "Forgot password?", which resets it with an OTP.
 *
 * It looks and behaves like the SDMS and IRAS login box but is its own: that
 * box's list drives onboarding and the setup checklist, and a login needed once a
 * year for one service must not join it. It is the only thing in the chat that
 * asks for this view, so a chat with no box in it never makes the call.
 *
 * Only an owner can fill it; anyone else sees "The owner fills this".
 */
export function WemmisLoginBox() {
  const t = useT();
  const q = useWemmisLogin();
  const view = q.data;
  const failed = q.isError && !view;
  const { refetch } = q;
  const [changing, setChanging] = React.useState(false);
  const [forgot, setForgot] = React.useState(false);
  // A reset that was already going when the box appeared is picked up once and
  // then held: it ends with a message ("Password reset…") that must stay on
  // screen even after the view of the login is asked again and no longer lists
  // the reset as going.
  const [resumed, setResumed] = React.useState<WemmisResetView | null>(null);
  // The owner backed out of that reset.
  const [leftReset, setLeftReset] = React.useState(false);

  const canEdit = view?.canEdit ?? false;
  const status = view?.status;
  const live = view?.reset && resetIsLive(view.reset.state) ? view.reset : null;
  if (live && !resumed) setResumed(live);
  const resetOpen = canEdit && (forgot || (!!resumed && !leftReset));
  const formOpen = !!view && canEdit && !resetOpen && (status !== 'saved' || changing);
  const savedRow = !!view && status === 'saved' && !formOpen && !resetOpen;

  return (
    <div data-wemmis-login data-status={status ?? (failed ? 'failed' : 'loading')} className="mt-1">
      <div className="rounded-md bg-wa-row-active px-2.5 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="flex min-w-0 items-center gap-1.5 break-words text-[14px] font-medium leading-snug">
            <Lock width={14} strokeWidth={2} className="shrink-0 text-wa-meta" aria-hidden />
            {t('chat.wemmisTitle')}
          </p>
          {/* Read out when it changes: a save that goes through turns "Needed" into
              nothing at all, and the "Saved" line is the answer to the button. */}
          <span aria-live="polite">
            {status === 'refused' ? (
              <span className="rounded-full bg-wa-notice px-2 py-0.5 text-[12px] font-medium leading-tight text-wa-bubble-text">
                {t('chat.portalRefused')}
              </span>
            ) : status === 'missing' ? (
              <span className="rounded-full bg-black/[0.08] px-2 py-0.5 text-[12px] font-medium leading-tight text-wa-meta">
                {t('chat.portalNeeded')}
              </span>
            ) : !view && q.isPending ? (
              <Spinner size={14} />
            ) : null}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-wa-meta">{t('chat.wemmisWhy')}</p>

        {failed ? (
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[13px] leading-snug text-wa-meta">
              {t('chat.askStateFailed')}
            </span>
            <button
              type="button"
              onClick={() => void refetch()}
              className="min-h-11 shrink-0 rounded-md px-2 text-[13px] font-medium text-wa-accent-strong active:bg-black/10"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : null}

        {view && !canEdit && status !== 'saved' ? (
          <p className="mt-1 text-[13px] leading-snug text-wa-meta">{t('chat.portalOwnerFills')}</p>
        ) : null}

        {savedRow ? (
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="min-w-0 break-all text-[14px] leading-snug">
              {view.username
                ? t('chat.wemmisSavedAs', { username: view.username })
                : t('chat.portalSaved')}
            </span>
            {canEdit ? (
              <button
                type="button"
                data-no-swipe
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setChanging(true)}
                className="min-h-11 shrink-0 rounded-md px-2 text-[14px] font-medium text-wa-accent-strong active:bg-black/10"
              >
                {t('chat.portalChange')}
              </button>
            ) : null}
          </div>
        ) : null}

        {formOpen ? (
          <LoginForm
            refused={status === 'refused'}
            onSaved={() => setChanging(false)}
            onForgot={() => {
              setLeftReset(false);
              setForgot(true);
            }}
            onCancel={status === 'saved' ? () => setChanging(false) : undefined}
          />
        ) : null}

        {resetOpen ? (
          <ResetFlow
            initial={forgot ? null : resumed}
            onClose={() => {
              setForgot(false);
              setLeftReset(true);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
