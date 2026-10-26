import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';


import { BrandMark } from '@/components/BrandMark';
import { PrivacyLink } from '@/components/PrivacyLink';
import { Button, Card, CardContent, Input, useToast } from '@/components/ui';
import { ForgotPasswordSheet } from '@/features/auth/ForgotPasswordSheet';
import { parseIdentifier } from '@/features/auth/identifier';
import { PasswordInput } from '@/features/auth/PasswordInput';
import { ApiError, apiFetch } from '@/lib/api';
import { useT, type MessageKey } from '@/lib/i18n';
import { postToNative } from '@/lib/nativeBridge';
import {
  ACCOUNT_DELETED_KEY,
  PASSWORD_CHANGE_REQUIRED,
  SESSION_EXPIRED_KEY,
  useAuthStore,
} from '@/store/auth';
import type { AuthLoginResponse } from '@dk/shared/types';

type FormValues = { identifier: string; password: string };

/**
 * The one warm sentence under a sign-in that did not go through. Never a raw
 * server or network string.
 *
 *  - 401: the number, email or password is wrong (the server does not say which)
 *  - 409: that mobile number is on more than one account, so only an email can
 *    tell them apart
 *  - 403: the account is suspended or archived
 *  - 429: too many tries
 */
function loginErrorKey(err: unknown): MessageKey {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'auth.loginFailed';
    if (err.status === 409) return 'auth.multipleAccounts';
    if (err.status === 429) return 'auth.tooManyTries';
    if (err.status === 403 && err.code !== PASSWORD_CHANGE_REQUIRED) return 'auth.accountInactive';
  }
  return 'common.networkError';
}

/**
 * A one-shot note left for this screen in session storage. Read while drawing,
 * cleared only once the screen is on display (`useEffect`): this page is loaded
 * on demand, and a first drawing that is thrown away while it loads used to
 * take the note with it, so the screen that finally showed had none.
 */
function hasNote(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function clearNote(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage off: there was no note to clear.
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();
  // Read once and cleared, so a later deliberate logout does not inherit them.
  const [expired] = React.useState(() => hasNote(SESSION_EXPIRED_KEY));
  const [deleted] = React.useState(() => hasNote(ACCOUNT_DELETED_KEY));
  React.useEffect(() => {
    clearNote(SESSION_EXPIRED_KEY);
    clearNote(ACCOUNT_DELETED_KEY);
  }, []);
  const login = useAuthStore((s) => s.login);
  const token = useAuthStore((s) => s.token);
  const [forgotOpen, setForgotOpen] = React.useState(false);

  React.useEffect(() => {
    if (token) navigate('/chat', { replace: true });
  }, [token, navigate]);

  const schema = React.useMemo(
    () =>
      z.object({
        // A mobile number or an email: one box, since the mobile is the name
        // most dealers sign in with.
        identifier: z
          .string()
          .trim()
          .min(1, t('auth.identifierRequired'))
          .refine((v) => parseIdentifier(v) !== null, t('auth.identifierInvalid')),
        password: z.string().min(1, t('auth.passwordRequired')),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // A new password was set from "Forgot your password?": back to this form with the
  // mobile or email already in the box, and the cursor where the password goes. The
  // sheet's own close puts focus back on the button that opened it, so the cursor
  // moves one beat later.
  const passwordReset = (identifier: string) => {
    setValue('identifier', identifier, { shouldValidate: false });
    setForgotOpen(false);
    window.setTimeout(() => setFocus('password'), 50);
  };

  const loginMutation = useMutation({
    // `gcTime: 0`: the password is in `variables` while the call lives, so the
    // mutation's record of it goes the moment it settles.
    gcTime: 0,
    mutationFn: (values: FormValues) =>
      apiFetch<AuthLoginResponse>('/v1/auth/login', {
        method: 'POST',
        body: {
          // Ten plain digits for a mobile, lower-case for an email.
          identifier: parseIdentifier(values.identifier)?.value ?? values.identifier.trim(),
          password: values.password,
        },
        // A 401 here is "that password is wrong", not "your session ended".
        signOutOn401: false,
      }),
    onSuccess: (data) => {
      login({ token: data.token, user: data.user });
      // Tell the native shell (if any) to register for push notifications.
      // No-op in a normal browser.
      postToNative({ type: 'auth:login', token: data.token });
      navigate('/chat', { replace: true });
    },
    onError: (err) => {
      // Never leak a raw server/network string — always one warm sentence.
      toast.error(t(loginErrorKey(err)));
    },
  });

  // A refused sign-in has already said so (the toast); drop the mutation's own
  // copy of what was typed, the password included, rather than keep it for the
  // life of the screen.
  const { isError: loginFailed, reset: resetLogin } = loginMutation;
  React.useEffect(() => {
    if (loginFailed) resetLogin();
  }, [loginFailed, resetLogin]);

  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-1">
          <BrandMark size={48} className="text-text" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-text">
            {t('auth.welcome')}
          </h1>
          <p className="text-sm text-text-muted">{t('auth.subtitle')}</p>
        </div>
        {deleted ? (
          // Straight after Settings → Account → Delete my account.
          <p className="mb-4 rounded-xl bg-info-soft px-3 py-2 text-center text-sm text-info">
            {t('account.deleted')}
          </p>
        ) : expired ? (
          // Why they are looking at this screen at all. A dealer session lasts
          // a year and refreshes itself, so this is now almost always the
          // single-active-session rule: somebody signed in on another phone.
          <p className="mb-4 rounded-xl bg-info-soft px-3 py-2 text-center text-sm text-info">
            {t('chat.sessionExpired')}
          </p>
        ) : null}
        <Card>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) => loginMutation.mutate(v))}
              className="flex flex-col gap-4"
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text" htmlFor="identifier">
                  {t('auth.identifier')}
                </label>
                <Input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={200}
                  invalid={!!errors.identifier}
                  placeholder={t('auth.identifierPlaceholder')}
                  {...register('identifier')}
                />
                {errors.identifier ? (
                  <p className="text-xs text-danger">{errors.identifier.message}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text" htmlFor="password">
                  {t('auth.password')}
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  invalid={!!errors.password}
                  placeholder="••••••••"
                  {...register('password')}
                />
                {errors.password ? (
                  <p className="text-xs text-danger">
                    {errors.password.message}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={loginMutation.isPending}
              >
                {t('auth.signIn')}
              </Button>
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="-mt-1 min-h-11 self-center rounded-lg px-3 text-sm font-medium text-brand underline underline-offset-4"
              >
                {t('auth.forgot')}
              </button>
            </form>
          </CardContent>
        </Card>
        {/* A dealer makes their own login: they register, choose a password,
            and MDG's team approves. Someone who installed the app from the
            Play Store with nothing to sign in with is sent to the enrolment
            form, in the app. */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-center text-xs leading-relaxed text-text-subtle">
            {t('auth.noLogin')}
          </p>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => navigate('/register')}
          >
            {t('auth.register')}
          </Button>
          {/* Reachable before anyone has signed in: the privacy policy must be
              readable from inside the app, and a dealer weighing whether to
              register is who wants it. */}
          <PrivacyLink className="-mt-1 flex min-h-11 items-center rounded-lg px-3 text-xs text-text-subtle underline underline-offset-4" />
        </div>
      </div>
      {forgotOpen ? (
        <ForgotPasswordSheet onClose={() => setForgotOpen(false)} onReset={passwordReset} />
      ) : null}
    </div>
  );
}
