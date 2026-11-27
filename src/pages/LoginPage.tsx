import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';


import { BrandMark } from '@/components/BrandMark';
import { PrivacyLink } from '@/components/PrivacyLink';
import { Button, Card, CardContent, Input, useToast } from '@/components/ui';
import { ForgotPasswordSheet } from '@/features/auth/ForgotPasswordSheet';
import { parseIdentifier } from '@/features/auth/identifier';
import { fromOf, landingPath } from '@/features/auth/landing';
import { FirstLanguageGate, LanguageSwitch } from '@/features/auth/LanguageSwitch';
import { PasswordInput } from '@/features/auth/PasswordInput';
import { requestSignIn, startSession } from '@/features/auth/signIn';
import { WhichPump } from '@/features/auth/WhichPump';
import { plannerSignUpEnabled } from '@/features/planner/enabled';
import { ApiError } from '@/lib/api';
import { HELPLINE } from '@/lib/helpline';
import { useT, type MessageKey } from '@/lib/i18n';
import {
  ACCOUNT_DELETED_KEY,
  PASSWORD_CHANGE_REQUIRED,
  SESSION_EXPIRED_KEY,
  useAuthStore,
} from '@/store/auth';

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

/**
 * Sign in. On a phone nobody has used yet, "which language?" comes first (spec 4.9, once); after that
 * the language switch is on this screen. Signing in carries on to where the person was going
 * (`state.from`), and asks "which pump?" when the account has more than one.
 */
export function LoginPage() {
  return (
    <FirstLanguageGate>
      <LoginScreen />
    </FirstLanguageGate>
  );
}

function LoginScreen() {
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
  const token = useAuthStore((s) => s.token);
  // Sent here from Register ("this number already has an account"), with the mobile.
  const location = useLocation();
  const handedIdentifier = (location.state as { identifier?: unknown } | null)?.identifier;
  const [forgotOpen, setForgotOpen] = React.useState(false);
  // Where the sign-in was for: a push, report or chat link opened while signed out (`?c=` kept).
  const from = fromOf(location.state);
  const destination = landingPath(from);
  // More than one pump on this login: the session is open, and the person says which to enter.
  const [choosingPump, setChoosingPump] = React.useState(false);
  const choosingRef = React.useRef(false);
  // The keyboard of the one box: numbers for a mobile (what nearly everybody types), letters for an
  // email. A number pad has no "@", so the switch under the box is how an email is typed.
  const [emailKeys, setEmailKeys] = React.useState(
    () => typeof handedIdentifier === 'string' && handedIdentifier.includes('@'),
  );

  React.useEffect(() => {
    if (token && !choosingRef.current && !choosingPump) navigate(destination, { replace: true });
  }, [token, choosingPump, navigate, destination]);

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
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      identifier: typeof handedIdentifier === 'string' ? handedIdentifier : '',
      password: '',
    },
  });

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
      requestSignIn(
        // Ten plain digits for a mobile, lower-case for an email.
        parseIdentifier(values.identifier)?.value ?? values.identifier.trim(),
        values.password,
      ),
    onSuccess: (data) => {
      if (data.outlets && data.outlets.length > 0) {
        // Held before the session opens, so the effect above does not carry on to the app.
        choosingRef.current = true;
        setChoosingPump(true);
        startSession(data);
        return;
      }
      startSession(data);
      navigate(destination, { replace: true });
    },
    onError: (err) => {
      // Never leak a raw server/network string — always one warm sentence.
      toast.error(t(loginErrorKey(err)));
      // The number is on more than one account: only an email tells them apart, so open its keyboard.
      if (err instanceof ApiError && err.status === 409) setEmailKeys(true);
    },
  });

  // A refused sign-in has already said so (the toast); drop the mutation's own
  // copy of what was typed, the password included, rather than keep it for the
  // life of the screen.
  const { isError: loginFailed, reset: resetLogin } = loginMutation;
  React.useEffect(() => {
    if (loginFailed) resetLogin();
  }, [loginFailed, resetLogin]);

  if (choosingPump) {
    return (
      <WhichPump
        destination={destination}
        onStay={() => navigate(destination, { replace: true })}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center bg-bg px-4 pb-12 pt-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end">
          <LanguageSwitch />
        </div>
        <div className="mb-8 mt-4 flex flex-col items-center gap-1 text-center">
          <BrandMark size={48} className="text-text" />
          <h1 className="mt-3 text-title text-text">{t('first.login.title')}</h1>
          <p className="text-body text-text-muted">{t('first.login.subtitle')}</p>
        </div>
        {deleted ? (
          // Straight after Settings → Account → Delete my account.
          <p className="mb-4 rounded-xl bg-info-soft px-3 py-2 text-center text-body text-info">
            {t('account.deleted')}
          </p>
        ) : expired ? (
          // Why they are looking at this screen at all. A dealer session lasts
          // a year and refreshes itself, so this is now almost always the
          // single-active-session rule: somebody signed in on another phone.
          <p className="mb-4 rounded-xl bg-info-soft px-3 py-2 text-center text-body text-info">
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
                <label className="text-balance text-subheading text-text" htmlFor="identifier">
                  {t('auth.identifier')}
                </label>
                <Input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  inputMode={emailKeys ? 'email' : 'tel'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={200}
                  invalid={!!errors.identifier}
                  placeholder={t('first.login.identifierPlaceholder')}
                  {...register('identifier')}
                />
                {errors.identifier ? (
                  <p className="text-body text-danger">{errors.identifier.message}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setEmailKeys((v) => !v)}
                  className="block min-h-11 max-w-full break-words rounded-md px-1 py-2 text-left text-cta text-brand underline underline-offset-4"
                >
                  {emailKeys ? t('first.login.useMobile') : t('first.login.useEmail')}
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-subheading text-text" htmlFor="password">
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
                  <p className="text-body text-danger">
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
                className="-mt-1 min-h-11 max-w-full break-words rounded-md px-3 py-2 text-center text-cta text-brand underline underline-offset-4"
              >
                {t('auth.forgot')}
              </button>
            </form>
          </CardContent>
        </Card>
        {/* A dealer makes their own login: they register and choose a password.
            Someone who installed the app from the Play Store with nothing to
            sign in with is sent to the enrolment form, in the app (a new phone
            opens there by itself: features/auth/firstScreen.ts). */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-center text-body leading-relaxed text-text-muted">
            {t('auth.noLogin')}
          </p>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => navigate('/register', from ? { state: { from } } : undefined)}
          >
            {t('auth.register')}
          </Button>
          {/* Someone who has no pump yet (ADR 0058): signed out, this is their way
              back to the Kavach Shuruaat sign-up. */}
          {plannerSignUpEnabled() ? (
            <Button variant="ghost" size="lg" fullWidth onClick={() => navigate('/register/new-pump')}>
              {t('welcome.openPump')}
            </Button>
          ) : null}
          {/* The way to a person for whoever cannot get in: a forgotten
              mobile number, a switched-off login, or no code arriving. */}
          <a
            href={HELPLINE.href}
            className="flex min-h-11 flex-col items-center rounded-md px-3 py-1 text-center text-meta leading-relaxed text-text-muted"
          >
            <span>{t('auth.helpTitle')}</span>
            <span className="text-subheading tabular-nums text-brand">
              {HELPLINE.display}
            </span>
            <span>{t('auth.helpHours')}</span>
          </a>
          {/* Reachable before anyone has signed in: the privacy policy must be
              readable from inside the app, and a dealer weighing whether to
              register is who wants it. */}
          <PrivacyLink className="-mt-1 inline-flex min-h-11 items-center rounded-md px-3 text-meta text-text-muted underline underline-offset-4" />
        </div>
      </div>
      {forgotOpen ? (
        <ForgotPasswordSheet onClose={() => setForgotOpen(false)} onReset={passwordReset} />
      ) : null}
    </div>
  );
}
