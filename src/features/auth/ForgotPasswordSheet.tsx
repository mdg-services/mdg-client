import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button, Input } from '@/components/ui';
import { parseIdentifier } from '@/features/auth/identifier';
import { apiFetch } from '@/lib/api';
import { useT, type MessageKey } from '@/lib/i18n';
import { useDialog } from '@/lib/useDialog';
import type {
  PasswordResetChannel,
  PasswordResetOptions,
  ResetConfirmInput,
  ResetRequestInput,
  ResetVerifyInput,
} from '@dk/shared/schemas';

import { PasswordInput } from './PasswordInput';
import {
  cleanCode,
  isWholeCode,
  offeredChannels,
  resetErrorKey,
  resetHasExpired,
  secondsUntilResend,
} from './resetFlow';

/**
 * "Forgot your password?" from the sign-in screen.
 *
 * A code on WhatsApp or by email, then a new password:
 *
 *   mobile or email → where to send the code → the 6 digits → a new password → sign in
 *
 * Only the channels the SERVER says it can send on are offered
 * (`GET /auth/password-reset/options`). While neither is on — or the answer could
 * not be had — the sheet is what it was before: "the MDG team will call you", which
 * raises a request on the Onboarding page. That stays as a small link under every
 * step, because a dealer whose number is not on WhatsApp, or who has no email, or
 * whose code never came, has nothing else.
 *
 * THE SCREEN NEVER SAYS WHETHER AN ACCOUNT MATCHED. Asking for a code always
 * answers "sent", the sheet says "if this account exists", and a wrong code, a
 * code for no account and a code that ran out all read the same. A stranger typing
 * numbers learns nothing about who has an account.
 *
 * The code, the one-time token it is swapped for and the new password live in this
 * sheet's own state and in the one request each, and are never logged; the
 * mutations that carry them drop their copy the moment the call settles.
 *
 * When the password is set the dealer is NOT signed in: they go back to the sign-in
 * screen with the mobile or email already filled in (`onReset`), and sign in the
 * ordinary way, so the sign-in brake and the audit stay in one place.
 */
type Stage = 'identifier' | 'channel' | 'code' | 'password' | 'reset-done' | 'call-done';

const CHANNEL_LABEL: Record<PasswordResetChannel, MessageKey> = {
  whatsapp: 'auth.resetByWhatsapp',
  email: 'auth.resetByEmail',
};

/** Every call here is public: no token goes with it, and a 401 is never "your session is over". */
const PUBLIC = { anonymous: true, signOutOn401: false } as const;

export function ForgotPasswordSheet({
  onClose,
  onReset,
}: {
  onClose: () => void;
  /** The password is set: leave the sheet and sign in again, with this mobile or email filled in. */
  onReset?: (identifier: string) => void;
}) {
  const t = useT();
  const titleId = React.useId();
  const fieldId = React.useId();
  const codeId = React.useId();

  const [stage, setStage] = React.useState<Stage>('identifier');
  const [typed, setTyped] = React.useState('');
  const [invalid, setInvalid] = React.useState(false);
  // The mobile or email as the server wants it, once the dealer has gone on with it.
  const [identifier, setIdentifier] = React.useState('');
  // Where the code went, so "Send again" goes the same way.
  const [channel, setChannel] = React.useState<PasswordResetChannel | null>(null);
  const [code, setCode] = React.useState('');
  const [codeShort, setCodeShort] = React.useState(false);
  const [resetToken, setResetToken] = React.useState('');
  // A line above the first step: why the dealer is back at the start.
  const [notice, setNotice] = React.useState<MessageKey | null>(null);
  // When a code last went out, and the clock "Send again" counts down against.
  const [sentAt, setSentAt] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());

  // Which channels can send at all. A failed or slow answer is "none": the sheet is
  // then the team's call, which always works.
  const options = useQuery({
    queryKey: ['auth', 'password-reset-options'],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      apiFetch<PasswordResetOptions>('/v1/auth/password-reset/options', { ...PUBLIC, signal }),
  });
  const channels = offeredChannels(options.data);
  const canSendCode = channels.length > 0;

  // The fallback: today's request, which the team answers by calling.
  const ask = useMutation({
    mutationFn: (who: string) =>
      apiFetch<unknown>('/v1/auth/forgot-password', {
        method: 'POST',
        body: { identifier: who },
        ...PUBLIC,
      }),
    onSuccess: () => setStage('call-done'),
  });

  // Step 1: a code to the phone or email ON THE ACCOUNT. Always answers "sent".
  const request = useMutation({
    mutationFn: (body: ResetRequestInput) =>
      apiFetch<{ sent: boolean }>('/v1/auth/password-reset/request', {
        method: 'POST',
        body,
        ...PUBLIC,
      }),
  });

  // Step 2: the code for a one-time token. `gcTime: 0`: the code is in `variables`.
  const verify = useMutation({
    gcTime: 0,
    mutationFn: (body: ResetVerifyInput) =>
      apiFetch<{ resetToken: string }>('/v1/auth/password-reset/verify', {
        method: 'POST',
        body,
        ...PUBLIC,
      }),
  });

  // Step 3: the new password. `gcTime: 0`: the password and the token are in `variables`.
  const confirm = useMutation({
    gcTime: 0,
    mutationFn: (body: ResetConfirmInput) =>
      apiFetch<{ ok: boolean }>('/v1/auth/password-reset/confirm', {
        method: 'POST',
        body,
        ...PUBLIC,
      }),
  });

  // Once the password is set, closing the sheet in ANY way (the button, ✕, Escape,
  // Back) goes back to sign-in with the identifier filled in — the work is done.
  const leave = () => {
    if (stage === 'reset-done' && onReset) onReset(identifier);
    else onClose();
  };
  const panelRef = useDialog(leave);

  // A step's own button goes with the step. Without this, focus is left on a button that
  // no longer exists, and the next Tab leaves the sheet for the page behind it. A step
  // with a box to type in (the code, the new password) focuses it itself.
  const stageSeen = React.useRef(stage);
  React.useEffect(() => {
    if (stageSeen.current === stage) return;
    stageSeen.current = stage;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, [stage, panelRef]);

  // "Send again in N s" needs a clock only while a code is waiting to be typed.
  React.useEffect(() => {
    if (stage !== 'code') return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [stage, sentAt]);

  /** Back to the first step, keeping what was typed, with nothing half-done left behind. */
  const startAgain = (why: MessageKey | null) => {
    setStage('identifier');
    setChannel(null);
    setCode('');
    setCodeShort(false);
    setResetToken('');
    setNotice(why);
    request.reset();
    verify.reset();
    confirm.reset();
  };

  const submitIdentifier = (e: React.FormEvent) => {
    e.preventDefault();
    // Which words and which button this step has depends on the answer.
    if (options.isPending) return;
    const id = parseIdentifier(typed);
    if (!id) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setNotice(null);
    if (canSendCode) {
      setIdentifier(id.value);
      request.reset();
      setStage('channel');
    } else {
      ask.mutate(id.value);
    }
  };

  /** "No code? Ask the team to call you": the identifier typed so far, or the one already accepted. */
  const askTeam = () => {
    const id = parseIdentifier(typed) ?? (identifier ? { value: identifier } : null);
    if (!id) {
      setStage('identifier');
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setNotice(null);
    ask.mutate(id.value);
  };

  /** Ask for a code on `via`: the first time from the channel step, again from the code step. */
  const sendCode = (via: PasswordResetChannel) => {
    request.mutate(
      { identifier, channel: via },
      {
        onSuccess: () => {
          setChannel(via);
          setCode('');
          setCodeShort(false);
          verify.reset();
          setSentAt(Date.now());
          setStage('code');
        },
      },
    );
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (verify.isPending) return;
    if (!isWholeCode(code)) {
      setCodeShort(true);
      return;
    }
    setCodeShort(false);
    verify.mutate(
      { identifier, code },
      {
        onSuccess: (data) => {
          setResetToken(data.resetToken);
          setCode('');
          setStage('password');
        },
        onError: (err) => {
          // A wrong code is no use again: clear it so the next one is typed fresh.
          if (resetErrorKey(err) === 'auth.resetCodeInvalid') setCode('');
        },
      },
    );
  };

  const savePassword = (newPassword: string) => {
    if (confirm.isPending) return;
    confirm.mutate(
      { resetToken, newPassword },
      {
        onSuccess: () => {
          setResetToken('');
          setStage('reset-done');
        },
        // The reset ran out (or was used): nothing to retry, so start over.
        onError: (err) => {
          if (resetHasExpired(err)) startAgain('auth.resetExpired');
        },
      },
    );
  };

  const secondsLeft = secondsUntilResend(sentAt, now);
  const showFallback = stage === 'identifier' || stage === 'channel' || stage === 'code';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6">
      <button
        type="button"
        aria-label={t('common.dismiss')}
        tabIndex={-1}
        onClick={leave}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative mx-auto flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border border-border bg-surface pb-4 shadow-lg outline-none safe-bottom sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <h2 id={titleId} className="text-lg font-semibold text-text">
            {t('auth.forgotTitle')}
          </h2>
          <button
            type="button"
            onClick={leave}
            aria-label={t('common.dismiss')}
            className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-muted active:bg-surface-2"
          >
            <X width={20} strokeWidth={1.75} />
          </button>
        </div>

        {stage === 'call-done' ? (
          <Done message={t('auth.forgotDone')} action={t('auth.forgotOk')} onAction={onClose} />
        ) : stage === 'reset-done' ? (
          <Done message={t('auth.resetDone')} action={t('auth.signIn')} onAction={leave} />
        ) : stage === 'password' ? (
          <NewPasswordForm
            busy={confirm.isPending}
            errorKey={confirm.isError ? resetErrorKey(confirm.error) : null}
            onSave={savePassword}
          />
        ) : stage === 'code' ? (
          <form onSubmit={submitCode} noValidate className="flex flex-col gap-3 px-5 pt-1">
            <div role="status" aria-live="polite" className="flex flex-col gap-0.5">
              <p className="text-sm leading-relaxed text-text-muted">{t('auth.resetSent')}</p>
              <p className="break-all text-sm font-medium text-text">{identifier}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={codeId} className="text-sm font-medium text-text">
                {t('auth.resetCode')}
              </label>
              <Input
                id={codeId}
                value={code}
                onChange={(e) => {
                  setCode(cleanCode(e.target.value));
                  setCodeShort(false);
                  // Typing again is a new try: the last refusal's red goes.
                  if (verify.isError) verify.reset();
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                // Room for "123 456": the box keeps the six digits, not the space.
                maxLength={14}
                invalid={codeShort || verify.isError}
                className="tracking-[0.3em]"
                autoFocus
              />
              {codeShort ? <p className="text-xs text-danger">{t('auth.resetCodeShort')}</p> : null}
            </div>
            {verify.isError ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                {t(resetErrorKey(verify.error))}
              </p>
            ) : request.isError ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                {t(resetErrorKey(request.error))}
              </p>
            ) : null}
            <Button type="submit" size="lg" fullWidth loading={verify.isPending}>
              {t('auth.forgotContinue')}
            </Button>
            <div className="flex items-center justify-between gap-2">
              <TextLink onClick={() => startAgain(null)}>{t('common.back')}</TextLink>
              <TextLink
                disabled={secondsLeft > 0 || request.isPending}
                onClick={() => channel && sendCode(channel)}
              >
                {secondsLeft > 0
                  ? t('auth.resetSendAgainIn', { n: secondsLeft })
                  : t('auth.resetSendAgain')}
              </TextLink>
            </div>
          </form>
        ) : stage === 'channel' ? (
          <div className="flex flex-col gap-3 px-5 pt-1">
            <p className="text-sm leading-relaxed text-text-muted">{t('auth.resetWhere')}</p>
            <p className="-mt-2 break-all text-sm font-medium text-text">{identifier}</p>
            {channels.map((via) => (
              <Button
                key={via}
                variant="secondary"
                size="lg"
                fullWidth
                disabled={request.isPending}
                loading={request.isPending && request.variables?.channel === via}
                onClick={() => sendCode(via)}
              >
                {t(CHANNEL_LABEL[via])}
              </Button>
            ))}
            {request.isError ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                {t(resetErrorKey(request.error))}
              </p>
            ) : null}
            <div className="flex">
              <TextLink onClick={() => startAgain(null)}>{t('common.back')}</TextLink>
            </div>
          </div>
        ) : (
          <form onSubmit={submitIdentifier} noValidate className="flex flex-col gap-3 px-5 pt-1">
            {notice ? (
              <p role="status" className="rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
                {t(notice)}
              </p>
            ) : null}
            {/* Nothing until the server has said which channels it has: the words differ,
                and a line that changes under the dealer's eyes is worse than a short wait. */}
            {!options.isPending ? (
              <p className="text-sm leading-relaxed text-text-muted">
                {t(canSendCode ? 'auth.forgotIntroCode' : 'auth.forgotIntro')}
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fieldId} className="text-sm font-medium text-text">
                {t('auth.identifier')}
              </label>
              <Input
                id={fieldId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={200}
                invalid={invalid}
                placeholder={t('auth.identifierPlaceholder')}
              />
              {invalid ? (
                <p className="text-xs text-danger">{t('auth.identifierInvalid')}</p>
              ) : null}
            </div>
            {ask.isError ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                {t('common.networkError')}
              </p>
            ) : null}
            <Button type="submit" size="lg" fullWidth loading={ask.isPending || options.isPending}>
              {t(canSendCode || options.isPending ? 'auth.forgotContinue' : 'auth.forgotSend')}
            </Button>
          </form>
        )}

        {/* Under every step before the password: the way out for a dealer who cannot
            be sent a code, or whose code never came. Not offered once the sheet IS that
            request (neither channel is on): its own button is the same thing. */}
        {showFallback && (canSendCode || options.isPending || stage !== 'identifier') ? (
          <div className="flex flex-col items-center px-5 pt-1">
            {ask.isError && stage !== 'identifier' ? (
              <p role="alert" className="mb-1 text-center text-sm text-danger">
                {t('common.networkError')}
              </p>
            ) : null}
            <TextLink onClick={askTeam} disabled={ask.isPending}>
              {t('auth.resetNoCode')}
            </TextLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The quiet text button under a step: Back, Send again, "No code?". */
function TextLink({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 rounded-lg px-2 text-sm font-medium text-brand underline underline-offset-4 disabled:cursor-not-allowed disabled:text-text-subtle disabled:no-underline"
    >
      {children}
    </button>
  );
}

/** A finished step: a tick, one sentence, one button. */
function Done({
  message,
  action,
  onAction,
}: {
  message: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="px-5 pt-1" role="status" aria-live="polite">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-white">
          <Check width={14} strokeWidth={2.4} />
        </span>
        <p className="text-base font-medium leading-snug text-text">{message}</p>
      </div>
      <Button size="lg" fullWidth className="mt-5" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

type PasswordValues = { newPassword: string; confirmPassword: string };

/**
 * The last step: a new password and the same again. The rule is the change-password
 * card's own (at least 8, the two must match); the server's is 8 to 200.
 */
function NewPasswordForm({
  busy,
  errorKey,
  onSave,
}: {
  busy: boolean;
  errorKey: MessageKey | null;
  onSave: (newPassword: string) => void;
}) {
  const t = useT();
  const ids = React.useId();
  const schema = React.useMemo(
    () =>
      z
        .object({
          newPassword: z.string().min(8, t('profile.min8')),
          confirmPassword: z.string().min(1, t('common.required')),
        })
        .refine((v) => v.newPassword === v.confirmPassword, {
          path: ['confirmPassword'],
          message: t('profile.passwordsDontMatch'),
        }),
    [t],
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(schema) });

  return (
    <form
      onSubmit={handleSubmit((v) => onSave(v.newPassword))}
      noValidate
      className="flex flex-col gap-3 px-5 pt-1"
    >
      <p className="text-sm leading-relaxed text-text-muted">{t('auth.resetNewIntro')}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-new`} className="text-sm font-medium text-text">
          {t('profile.newPassword')}
        </label>
        <PasswordInput
          id={`${ids}-new`}
          autoComplete="new-password"
          maxLength={200}
          invalid={!!errors.newPassword}
          autoFocus
          {...register('newPassword')}
        />
        {errors.newPassword ? (
          <p className="text-xs text-danger">{errors.newPassword.message}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-confirm`} className="text-sm font-medium text-text">
          {t('auth.forcedConfirm')}
        </label>
        <PasswordInput
          id={`${ids}-confirm`}
          autoComplete="new-password"
          maxLength={200}
          invalid={!!errors.confirmPassword}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword ? (
          <p className="text-xs text-danger">{errors.confirmPassword.message}</p>
        ) : null}
      </div>
      {errorKey ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(errorKey)}
        </p>
      ) : null}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        {t('auth.resetSave')}
      </Button>
    </form>
  );
}
