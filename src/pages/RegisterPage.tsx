import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { PrivacyLink } from '@/components/PrivacyLink';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { markAccountHere } from '@/features/auth/firstScreen';
import { fromOf, landingPath } from '@/features/auth/landing';
import { FirstLanguageGate, LanguageSwitch } from '@/features/auth/LanguageSwitch';
import { PasswordInput } from '@/features/auth/PasswordInput';
import { requestSignIn, startSession } from '@/features/auth/signIn';
import {
  LIMITS,
  PASSWORD_LIMITS,
  SITE_TYPES,
  refFromSearch,
  submitEnrollment,
  toMobile,
  type EnrollAccount,
  type SiteType,
} from '@/features/register/enroll';
import { useSubmissionId } from '@/features/register/submissionId';
import { TermsSheet } from '@/features/register/TermsSheet';
import { WaitingCard } from '@/features/register/WaitingCard';
import { WelcomeBackCard } from '@/features/register/WelcomeBackCard';
import { cn } from '@/lib/cn';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import { useGoBack } from '@/lib/useGoBack';
import { baseLangOf } from '@dk/shared/types';

/** The card after sending, in each case (`register.success*` for a person's look first). */
const SUCCESS_WORDS: Record<EnrollAccount, { badge: MessageKey; title: MessageKey; body: MessageKey }> = {
  ready: { badge: 'register.readyBadge', title: 'register.readyTitle', body: 'register.readyBody' },
  existing: { badge: 'register.existingBadge', title: 'register.existingTitle', body: 'register.existingBody' },
  waiting: { badge: 'register.successBadge', title: 'register.successTitle', body: 'register.successBody' },
};

interface FormValues {
  name: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  email: string;
  siteType: SiteType | '';
  pumpName: string;
  sapCode: string;
  agree: boolean;
}

type Step = 1 | 2 | 3;

/** The fields each step asks for; a step is checked before the next opens (spec 4.9). */
const STEP_FIELDS: Record<Step, (keyof FormValues)[]> = {
  1: ['name', 'mobile', 'email'],
  2: ['siteType', 'pumpName', 'sapCode'],
  3: ['password', 'confirmPassword', 'agree'],
};

const STEP_WORDS: Record<Step, MessageKey> = {
  1: 'first.reg.step1',
  2: 'first.reg.step2',
  3: 'first.reg.step3',
};

const STEP_INTRO: Record<Step, MessageKey> = {
  1: 'first.reg.intro1',
  2: 'first.reg.intro2',
  3: 'first.reg.intro3',
};

/**
 * Sign-up for someone who has downloaded the app and has no login — the first
 * screen on a phone nobody has signed in on (`features/auth/firstScreen.ts`).
 *
 * It is the website's enrolment form — the same details, the same Terms &
 * Conditions, and a password the dealer chooses — filled in without leaving the
 * app and sent to the same place the website sends it. That emails the MDG inbox
 * and hands the registration to our API, which answers where the dealer stands:
 *  - `ready`: the account is open, and this screen signs them in with the mobile
 *    and password just typed, straight into their chat. If that sign-in does not
 *    go through, it says the account is ready and offers Sign in;
 *  - `existing`: this mobile already signs in to an account — a dealer MDG served
 *    before the app, or a second try. A code goes on WhatsApp at once and the
 *    account opens with the password just typed (`WelcomeBackCard`); a second
 *    pump is still the team's to add;
 *  - `waiting`: MDG's team looks first; a WhatsApp message says when it is ready.
 *
 * The form is three short steps (you, your pump, password and terms) with a step line, each checked
 * before the next opens, all one form so nothing typed is lost going back. On a phone nobody has used,
 * "which language?" is asked first, once (`FirstLanguageGate`).
 */
export function RegisterPage() {
  return (
    <FirstLanguageGate>
      <RegisterScreen />
    </FirstLanguageGate>
  );
}

function RegisterScreen() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const submissionIdFor = useSubmissionId();
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<{
    email: string;
    mobile: string;
    account: EnrollAccount;
    receivedAt: Date;
  } | null>(null);
  const [step, setStep] = React.useState<Step>(1);
  const stepHeading = React.useRef<HTMLHeadingElement>(null);
  const stepMoved = React.useRef(false);
  // Where Sign in was meant to lead (`state.from`), kept while the person registers instead.
  const from = fromOf(location.state);
  const destination = landingPath(from);
  // `existing` only: the password just chosen, held in memory for the WhatsApp code
  // step to give the account, and dropped when this screen goes.
  const chosenPassword = React.useRef<string | null>(null);
  React.useEffect(
    () => () => {
      chosenPassword.current = null;
    },
    [],
  );

  // To the sign-in screen with the mobile number already in its box.
  const toSignIn = (mobile?: string) => {
    const state = { ...(mobile ? { identifier: mobile } : {}), ...(from ? { from } : {}) };
    navigate('/login', Object.keys(state).length > 0 ? { state } : undefined);
  };

  // Back to the sign-in screen. Opened cold (the first launch), there is no
  // earlier entry of ours to step back to, so it goes to sign-in directly.
  const goBack = useGoBack('/login');

  const schema = React.useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('register.nameRequired')).max(LIMITS.name),
        mobile: z
          .string()
          .trim()
          .refine((v) => toMobile(v) !== null, t('register.mobileInvalid')),
        // Taken as typed, spaces included: trimming a password changes it.
        password: z
          .string()
          .min(PASSWORD_LIMITS.min, t('profile.min8'))
          .max(PASSWORD_LIMITS.max, t('register.passwordTooLong')),
        confirmPassword: z.string().min(1, t('common.required')),
        email: z
          .string()
          .trim()
          .max(LIMITS.email, t('auth.emailInvalid'))
          .refine(
            (v) => v === '' || z.string().email().safeParse(v).success,
            t('auth.emailInvalid'),
          ),
        siteType: z.enum(SITE_TYPES, {
          errorMap: () => ({ message: t('register.siteTypeRequired') }),
        }),
        pumpName: z.string().trim().max(LIMITS.pumpName),
        sapCode: z.string().trim().min(1, t('register.sapCodeRequired')).max(LIMITS.sapCode),
        agree: z.literal(true, {
          errorMap: () => ({ message: t('register.agreeRequired') }),
        }),
      })
      .refine((v) => v.password === v.confirmPassword, {
        path: ['confirmPassword'],
        message: t('profile.passwordsDontMatch'),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      mobile: '',
      password: '',
      confirmPassword: '',
      email: '',
      siteType: '',
      pumpName: '',
      sapCode: '',
      agree: false,
    },
  });
  const siteType = watch('siteType');

  // The film link's share code, when this screen was opened from one.
  const ref = React.useMemo(() => refFromSearch(location.search), [location.search]);

  const enroll = useMutation({
    // The password is in `variables` while the call lives; the mutation's own
    // record of it goes as soon as it settles.
    gcTime: 0,
    mutationFn: async (v: FormValues) => {
      const fields = {
        name: v.name,
        // As ten plain digits, however it was typed (the check above passed it).
        mobile: toMobile(v.mobile) ?? v.mobile,
        email: v.email,
        siteType: v.siteType as SiteType,
        pumpName: v.pumpName,
        sapCode: v.sapCode,
        agree: true as const,
        source: 'app' as const,
        password: v.password,
        // The one tick covers WhatsApp messages about the account (the label says so).
        consentWhatsApp: true as const,
        // The Terms exist in Hindi and English: a third language ticks the one it reads.
        lang: baseLangOf(lang),
        ...(ref ? { ref } : {}),
      };
      const account = await submitEnrollment({ ...fields, submissionId: submissionIdFor(fields) });
      // The account is open: sign them in with what they just typed, so they land
      // in their chat instead of on a second form. A sign-in that does not go
      // through is not a failed registration — the card below offers Sign in.
      const session =
        account === 'ready'
          ? await requestSignIn(fields.mobile, v.password).catch(() => null)
          : null;
      return { account, session };
    },
    onSuccess: ({ account, session }, v) => {
      // From now on this phone opens on Sign in, whatever the answer (`firstScreen.ts`).
      markAccountHere();
      if (session) {
        startSession(session);
        navigate(destination, { replace: true });
        return;
      }
      chosenPassword.current = account === 'existing' ? v.password : null;
      setSentTo({
        email: v.email,
        mobile: toMobile(v.mobile) ?? v.mobile,
        account,
        receivedAt: new Date(),
      });
      window.scrollTo({ top: 0 });
    },
  });

  // Once it has gone through, drop the mutation's own copy of what was sent
  // (the password is in it). The confirmation is drawn from `sentTo`.
  const { isSuccess, reset: resetEnroll } = enroll;
  React.useEffect(() => {
    if (isSuccess) resetEnroll();
  }, [isSuccess, resetEnroll]);

  // A new step: back to the top, and the screen reader is told which step it is on.
  React.useEffect(() => {
    if (!stepMoved.current) return;
    window.scrollTo({ top: 0 });
    stepHeading.current?.focus();
  }, [step]);

  const goToStep = (next: Step) => {
    stepMoved.current = true;
    setStep(next);
  };
  /** Check this step's fields; only a clean step opens the next. */
  const nextStep = async () => {
    if (!(await trigger(STEP_FIELDS[step]))) return;
    if (step < 3) goToStep((step + 1) as Step);
  };
  const submitStep = (e: React.FormEvent<HTMLFormElement>) => {
    if (step < 3) {
      // Enter in a box moves on a step instead of checking the steps still to come.
      e.preventDefault();
      void nextStep();
      return;
    }
    // A field of an earlier step still wrong (only possible if the form was changed behind the steps):
    // open that step instead of leaving an error nobody can see.
    void handleSubmit(
      (v) => enroll.mutate(v),
      (bad) => {
        const first = ([1, 2, 3] as const).find((n) => STEP_FIELDS[n].some((f) => bad[f]));
        if (first && first < 3) goToStep(first);
      },
    )(e);
  };

  return (
    <div className="min-h-full bg-bg px-4 pb-12 pt-4">
      <div className="mx-auto w-full max-w-sm">
        {/* Two rows, so the title always has the full width: the back arrow and the language switch
            share the first, and at large text a title beside them was crushed into a thin column. */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => (step > 1 && !sentTo ? goToStep((step - 1) as Step) : goBack())}
            aria-label={step > 1 && !sentTo ? t('first.reg.prevStep') : t('register.back')}
            className="-ml-2 grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-text active:bg-surface-2"
          >
            <ArrowLeft width={22} strokeWidth={1.75} />
          </button>
          {/* The language is changeable here too: a dealer who opens the app for
              the first time lands on this screen with no Settings to find it in. */}
          <LanguageSwitch />
        </div>
        <h1 className="mt-2 text-title text-text">{t('register.title')}</h1>

        {sentTo?.account === 'existing' && chosenPassword.current ? (
          <WelcomeBackCard
            mobile={sentTo.mobile}
            password={chosenPassword.current}
            onSignedIn={(session) => {
              chosenPassword.current = null;
              startSession(session);
              navigate(destination, { replace: true });
            }}
            onSignIn={() => {
              chosenPassword.current = null;
              toSignIn(sentTo.mobile);
            }}
          />
        ) : sentTo?.account === 'waiting' ? (
          <WaitingCard receivedAt={sentTo.receivedAt} email={sentTo.email} onBack={goBack} />
        ) : sentTo ? (
          <Card className="mt-4">
            <CardContent role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-status-ok-ink">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-status-ok text-white">
                  <Check width={16} strokeWidth={2.4} />
                </span>
                <span className="text-cta">{t(SUCCESS_WORDS[sentTo.account].badge)}</span>
              </div>
              <p className="mt-4 text-subheading leading-snug text-text">
                {t(SUCCESS_WORDS[sentTo.account].title)}
              </p>
              <p className="mt-2 text-body leading-relaxed text-text-muted">
                {t(SUCCESS_WORDS[sentTo.account].body)}
              </p>
              {sentTo.email ? (
                <p className="mt-2 text-body leading-relaxed text-text-muted">
                  {t('register.successEmail', { email: sentTo.email })}
                </p>
              ) : null}
              <Button size="lg" fullWidth className="mt-6" onClick={() => toSignIn(sentTo.mobile)}>
                {t('auth.signIn')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* The step line: its words carry the numbers ("2 of 3: your pump"), the bar is the shape. */}
            <div className="mt-3">
              <h2
                ref={stepHeading}
                tabIndex={-1}
                data-testid="register-step"
                className="text-heading text-text outline-none"
              >
                {t(STEP_WORDS[step])}
              </h2>
              <div aria-hidden className="mt-2 grid grid-cols-3 gap-1.5">
                {([1, 2, 3] as const).map((n) => (
                  <span key={n} className={cn('min-h-2 rounded-full', n <= step ? 'bg-brand' : 'bg-border-strong')} />
                ))}
              </div>
            </div>
            <p className="mt-3 text-body leading-relaxed text-text-muted">{t(STEP_INTRO[step])}</p>
            {step === 1 ? (
              <>
                {/* First, because this is the first screen on a new phone: anybody who
                    already has an account is one tap from signing in. */}
                <p className="mt-2 text-body text-text-muted">
                  {t('register.alreadyRegistered')}{' '}
                  <button
                    type="button"
                    onClick={() => toSignIn()}
                    className="inline-flex min-h-11 items-center rounded-md px-1 text-cta text-brand underline underline-offset-4"
                  >
                    {t('auth.signIn')}
                  </button>
                </p>
              </>
            ) : null}

            <Card className="mt-4">
              <CardContent>
                <form
                  // Never the default GET: a password must not reach a URL.
                  method="post"
                  onSubmit={submitStep}
                  className="flex flex-col gap-4"
                  noValidate
                >
                  {step === 1 ? (
                    <>
                      <Field id="reg-name" label={t('register.name')} error={errors.name?.message}>
                        <Input
                          id="reg-name"
                          autoComplete="name"
                          maxLength={LIMITS.name}
                          invalid={!!errors.name}
                          placeholder={t('register.namePlaceholder')}
                          {...register('name')}
                        />
                      </Field>

                      <Field id="reg-mobile" label={t('register.mobile')} error={errors.mobile?.message}>
                        <Input
                          id="reg-mobile"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          maxLength={20}
                          invalid={!!errors.mobile}
                          placeholder={t('register.mobilePlaceholder')}
                          {...register('mobile')}
                        />
                      </Field>

                      <Field
                        id="reg-email"
                        label={t('register.email')}
                        optional={t('register.optional')}
                        error={errors.email?.message}
                      >
                        <Input
                          id="reg-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          maxLength={LIMITS.email}
                          invalid={!!errors.email}
                          placeholder={t('register.emailPlaceholder')}
                          {...register('email')}
                        />
                      </Field>
                    </>
                  ) : null}

                  {step === 2 ? (
                    <>
                      <fieldset className="flex flex-col gap-1.5">
                        <legend className="mb-1.5 text-subheading text-text">
                          {t('register.siteType')}
                        </legend>
                        <div className="grid grid-cols-2 gap-2">
                          {SITE_TYPES.map((value) => (
                            <label
                              key={value}
                              className={cn(
                                'flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-1 transition-colors',
                                siteType === value
                                  ? 'border-brand bg-brand-soft'
                                  : errors.siteType
                                    ? 'border-danger bg-surface'
                                    : 'border-border-strong bg-surface',
                              )}
                            >
                              <input
                                type="radio"
                                value={value}
                                className="h-4 w-4 accent-brand"
                                {...register('siteType')}
                              />
                              <span className="text-body font-medium text-text">{value}</span>
                            </label>
                          ))}
                        </div>
                        {errors.siteType ? (
                          <p className="text-body text-danger">{errors.siteType.message}</p>
                        ) : null}
                      </fieldset>

                      <Field
                        id="reg-pump"
                        label={t('register.pumpName')}
                        optional={t('register.optional')}
                        error={errors.pumpName?.message}
                      >
                        <Input
                          id="reg-pump"
                          maxLength={LIMITS.pumpName}
                          invalid={!!errors.pumpName}
                          placeholder={t('register.pumpNamePlaceholder')}
                          {...register('pumpName')}
                        />
                      </Field>

                      <Field
                        id="reg-sap"
                        label={t('register.sapCode')}
                        hint={t('first.reg.sapHint')}
                        error={errors.sapCode?.message}
                      >
                        <Input
                          id="reg-sap"
                          autoCapitalize="characters"
                          autoCorrect="off"
                          spellCheck={false}
                          maxLength={LIMITS.sapCode}
                          invalid={!!errors.sapCode}
                          placeholder={t('register.sapCodePlaceholder')}
                          {...register('sapCode')}
                        />
                      </Field>
                    </>
                  ) : null}

                  {step === 3 ? (
                    <>
                      <Field
                        id="reg-password"
                        label={t('register.password')}
                        hint={t('register.passwordHint')}
                        error={errors.password?.message}
                      >
                        <PasswordInput
                          id="reg-password"
                          autoComplete="new-password"
                          maxLength={PASSWORD_LIMITS.max}
                          invalid={!!errors.password}
                          {...register('password')}
                        />
                      </Field>

                      <Field
                        id="reg-confirm"
                        label={t('register.confirmPassword')}
                        error={errors.confirmPassword?.message}
                      >
                        <PasswordInput
                          id="reg-confirm"
                          autoComplete="new-password"
                          maxLength={PASSWORD_LIMITS.max}
                          invalid={!!errors.confirmPassword}
                          {...register('confirmPassword')}
                        />
                      </Field>

                      {/* The link opens the terms; it does not tick the box. "I agree
                          & continue" inside the terms does both. */}
                      <div className="flex flex-col gap-1.5">
                        <div
                          className={cn(
                            'flex items-start gap-3 rounded-lg border p-3',
                            errors.agree ? 'border-danger' : 'border-border-strong',
                          )}
                        >
                          <input
                            id="reg-agree"
                            type="checkbox"
                            aria-label={t('register.agreeAria')}
                            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                            {...register('agree')}
                          />
                          <label htmlFor="reg-agree" className="text-body leading-relaxed text-text">
                            {t('register.agreeLead')}{' '}
                            <button
                              type="button"
                              onClick={(e) => {
                                // Inside the label, a tap would also toggle the box.
                                e.preventDefault();
                                setTermsOpen(true);
                              }}
                              className="inline-flex min-h-11 items-center text-cta text-brand underline underline-offset-2"
                            >
                              {t('register.termsLink')}
                            </button>
                            {t('register.agreeTail')}
                          </label>
                        </div>
                        {errors.agree ? (
                          <p className="text-body text-danger">{errors.agree.message}</p>
                        ) : null}
                      </div>

                      {enroll.isError ? (
                        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-body text-danger">
                          {t('register.failed')}
                        </p>
                      ) : null}
                    </>
                  ) : null}

                  {step < 3 ? (
                    <Button type="submit" size="lg" fullWidth>
                      {t('first.reg.next')}
                    </Button>
                  ) : (
                    <Button type="submit" size="lg" fullWidth loading={enroll.isPending}>
                      {t('register.submit')}
                    </Button>
                  )}
                  {step > 1 ? (
                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      disabled={enroll.isPending}
                      onClick={() => goToStep((step - 1) as Step)}
                    >
                      {t('first.reg.prev')}
                    </Button>
                  ) : null}
                </form>
              </CardContent>
            </Card>

            <p className="mt-4 text-center text-meta text-text-muted">
              {t('register.privacy')}{' '}
              {/* Where the dealer is deciding what to hand over: the policy that
                  says what is done with it, one tap away. */}
              <PrivacyLink className="inline-flex min-h-11 items-center font-medium underline underline-offset-2" />
            </p>
          </>
        )}
      </div>

      {termsOpen ? (
        <TermsSheet
          onClose={() => setTermsOpen(false)}
          onAgree={() => {
            setValue('agree', true, { shouldValidate: true, shouldDirty: true });
            setTermsOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: string;
  /** A line under the box, shown while there is no error to show instead. */
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-subheading text-text" htmlFor={id}>
        {label}
        {optional ? <span className="ml-1 font-normal text-text-muted">{optional}</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-body text-danger">{error}</p>
      ) : hint ? (
        <p className="text-meta text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
