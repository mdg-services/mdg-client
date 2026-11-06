import { useMutation, useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import * as React from 'react';

import { Button, Card, CardContent, Input } from '@/components/ui';
import {
  cleanCode,
  isWholeCode,
  offeredChannels,
  resetErrorKey,
  resetHasExpired,
  secondsUntilResend,
} from '@/features/auth/resetFlow';
import { requestSignIn } from '@/features/auth/signIn';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type {
  PasswordResetOptions,
  ResetConfirmInput,
  ResetRequestInput,
  ResetVerifyInput,
} from '@dk/shared/schemas';
import type { AuthLoginResponse } from '@dk/shared/types';

/** Every call here is public: no token goes with it, and a 401 is never "your session is over". */
const PUBLIC = { anonymous: true, signOutOn401: false } as const;

/**
 * The sign-up form found that this mobile already has an account — a dealer MDG
 * served before the app, whose login the team made long ago and who never had the
 * password, or somebody registering a second time.
 *
 * Before, the form thanked them, threw away the password they had just chosen and
 * sent them to "Forgot your password?". Now the code goes on WhatsApp at once, they
 * type it here, and the account opens with the password from the form:
 *
 *   form → "code sent on WhatsApp" → the 6 digits → signed in, in their chat
 *
 * The same three server steps as the forgot-password sheet (`ForgotPasswordSheet`),
 * so the same rules hold: the code goes only to the phone ON THE ACCOUNT, never to a
 * number typed here, so somebody typing another dealer's number gets nowhere. The
 * server's limits on codes and tries are the sheet's too.
 *
 * When WhatsApp codes are off, or no code comes, the fallbacks are the ones the
 * sheet offers: Sign in, or ask the team to call. The password lives only in the
 * page's memory until the account takes it, and is never shown or logged.
 */
export function WelcomeBackCard({
  mobile,
  password,
  onSignedIn,
  onSignIn,
}: {
  /** Ten plain digits, as the form sent them. */
  mobile: string;
  /** The password just chosen on the form. */
  password: string;
  /** The account is open and signed in. */
  onSignedIn: (session: AuthLoginResponse) => void;
  /** Off to the sign-in screen, with the mobile filled in. */
  onSignIn: () => void;
}) {
  const t = useT();
  const codeId = React.useId();
  const [code, setCode] = React.useState('');
  const [codeShort, setCodeShort] = React.useState(false);
  const [sentAt, setSentAt] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  // The password is set but signing in did not go through: the last word is Sign in.
  const [passwordSet, setPasswordSet] = React.useState(false);

  const options = useQuery({
    queryKey: ['auth', 'password-reset-options'],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      apiFetch<PasswordResetOptions>('/v1/auth/password-reset/options', { ...PUBLIC, signal }),
  });
  const canWhatsApp = offeredChannels(options.data).includes('whatsapp');

  const request = useMutation({
    mutationFn: (body: ResetRequestInput) =>
      apiFetch<{ sent: boolean }>('/v1/auth/password-reset/request', { method: 'POST', body, ...PUBLIC }),
    onSuccess: () => {
      setSentAt(Date.now());
      setCode('');
      setCodeShort(false);
    },
  });

  // The code, swapped for a token, then the form's password, then a sign-in: one step
  // for the dealer. `gcTime: 0`: the code and the password are in `variables`.
  const open = useMutation({
    gcTime: 0,
    mutationFn: async (typed: string) => {
      const { resetToken } = await apiFetch<{ resetToken: string }>('/v1/auth/password-reset/verify', {
        method: 'POST',
        body: { identifier: mobile, code: typed } satisfies ResetVerifyInput,
        ...PUBLIC,
      });
      await apiFetch<{ ok: boolean }>('/v1/auth/password-reset/confirm', {
        method: 'POST',
        body: { resetToken, newPassword: password } satisfies ResetConfirmInput,
        ...PUBLIC,
      });
      // The password is theirs now; a sign-in that does not go through is not a failure.
      return requestSignIn(mobile, password).catch(() => null);
    },
    onSuccess: (session) => {
      if (session) onSignedIn(session);
      else setPasswordSet(true);
    },
    onError: (err) => {
      if (resetErrorKey(err) === 'auth.resetCodeInvalid') setCode('');
    },
  });

  const ask = useMutation({
    mutationFn: () =>
      apiFetch<unknown>('/v1/auth/forgot-password', { method: 'POST', body: { identifier: mobile }, ...PUBLIC }),
  });

  // The code goes the moment we know WhatsApp can carry it: no tap, no second form.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (asked.current || !canWhatsApp) return;
    asked.current = true;
    request.mutate({ identifier: mobile, channel: 'whatsapp' });
  }, [canWhatsApp, mobile, request]);

  // "Send again in N s" needs a clock only while a code is waiting.
  React.useEffect(() => {
    if (!sentAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sentAt]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (open.isPending) return;
    if (!isWholeCode(code)) {
      setCodeShort(true);
      return;
    }
    setCodeShort(false);
    open.mutate(code);
  };

  const secondsLeft = secondsUntilResend(sentAt, now);
  const noWhatsApp = !options.isPending && !canWhatsApp;
  // A reset that ran out means a fresh code: the next "Send again" starts it.
  const expired = open.isError && resetHasExpired(open.error);

  return (
    <Card className="mt-4">
      <CardContent role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-success">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-success text-white">
            <Check width={16} strokeWidth={2.4} />
          </span>
          <span className="text-sm font-semibold">{t('register.welcomeBackBadge')}</span>
        </div>
        <p className="mt-4 text-lg font-semibold leading-snug text-text">{t('register.welcomeBackTitle')}</p>

        {passwordSet ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{t('register.welcomeBackSignIn')}</p>
            <Button size="lg" fullWidth className="mt-6" onClick={onSignIn}>
              {t('auth.signIn')}
            </Button>
          </>
        ) : noWhatsApp ? (
          // No WhatsApp codes on the server: what the screen said before.
          <>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{t('register.existingBody')}</p>
            <Button size="lg" fullWidth className="mt-6" onClick={onSignIn}>
              {t('auth.signIn')}
            </Button>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="mt-2 flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-text-muted">
              {sentAt ? t('register.welcomeBackBody', { mobile }) : t('register.welcomeBackSending')}
            </p>
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
                  if (open.isError) open.reset();
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={14}
                invalid={codeShort || (open.isError && !expired)}
                className="tracking-[0.3em]"
                disabled={!sentAt}
              />
              {codeShort ? <p className="text-xs text-danger">{t('auth.resetCodeShort')}</p> : null}
            </div>
            {open.isError ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                {t(resetErrorKey(open.error))}
              </p>
            ) : request.isError ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                {t(resetErrorKey(request.error))}
              </p>
            ) : null}
            <Button type="submit" size="lg" fullWidth loading={open.isPending} disabled={!sentAt}>
              {t('register.welcomeBackOpen')}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TextLink
                disabled={secondsLeft > 0 || request.isPending}
                onClick={() => {
                  open.reset();
                  request.mutate({ identifier: mobile, channel: 'whatsapp' });
                }}
              >
                {secondsLeft > 0 ? t('auth.resetSendAgainIn', { n: secondsLeft }) : t('auth.resetSendAgain')}
              </TextLink>
              {ask.isSuccess ? (
                <span className="text-sm text-text-muted">{t('auth.forgotDone')}</span>
              ) : (
                <TextLink disabled={ask.isPending} onClick={() => ask.mutate()}>
                  {t('auth.resetNoCode')}
                </TextLink>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

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
