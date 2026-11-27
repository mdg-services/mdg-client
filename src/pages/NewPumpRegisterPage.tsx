import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check, Globe } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { LANGUAGE_NAMES, LanguageSheet } from '@/components/LanguageSheet';
import { PrivacyLink } from '@/components/PrivacyLink';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { markAccountHere } from '@/features/auth/firstScreen';
import { PasswordInput } from '@/features/auth/PasswordInput';
import { requestSignIn, startSession } from '@/features/auth/signIn';
import { canPayHere } from '@/features/payments/policy';
import { plannerSignUpEnabled } from '@/features/planner/enabled';
import {
  DISTRICT_MAX,
  EMPTY_PLANNER_FORM,
  plannerFormSchema,
  toPlannerPayload,
  type PlannerFormValues,
} from '@/features/planner/plannerForm';
import { RadioCards } from '@/features/planner/RadioCards';
import {
  EnrollError,
  fromFromSearch,
  LIMITS,
  PASSWORD_LIMITS,
  refFromSearch,
  submitEnrollment,
  toMobile,
  type EnrollAccount,
} from '@/features/register/enroll';
import { Field } from '@/features/register/Field';
import { useSubmissionId } from '@/features/register/submissionId';
import { TermsSheet } from '@/features/register/TermsSheet';
import { WelcomeBackCard } from '@/features/register/WelcomeBackCard';
import { stateOptions } from '@/features/setup/cardView';
import { cn } from '@/lib/cn';
import { useLang, useT, type MessageKey } from '@/lib/i18n';
import { useGoBack } from '@/lib/useGoBack';
import { PLANNER_OIL_COMPANIES, PLANNER_STAGES } from '@dk/shared/types';

/** The card after sending, in each case: the outlet form's words, which fit here too. */
const SUCCESS_WORDS: Record<EnrollAccount, { badge: MessageKey; title: MessageKey; body: MessageKey }> = {
  ready: { badge: 'register.readyBadge', title: 'register.readyTitle', body: 'register.readyBody' },
  existing: { badge: 'register.existingBadge', title: 'register.existingTitle', body: 'register.existingBody' },
  waiting: { badge: 'register.successBadge', title: 'register.successTitle', body: 'register.successBody' },
};

/**
 * Did the link come from the petrol-pump guide (`pump:<page>`) or its questions
 * (`qa:<id>`, `new-pump-questions`)? Those readers are told so; anyone from another
 * page (home, pricing, the site's chat) hears "our website" instead.
 */
function isGuideSource(from: string): boolean {
  return from.startsWith('pump:') || from.startsWith('qa:') || from === 'new-pump-questions';
}

/** A select drawn like the app's inputs, 48px tall. */
const SELECT_CLASS =
  'h-12 w-full rounded-xl border bg-surface px-4 text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';

/**
 * New Pump Guide sign-up (ADR 0058 §3.2), for someone who wants to open a petrol
 * pump: one column, labels above the boxes, errors in words under each, Hindi
 * unless the reader chose otherwise. No SAP code and no site type: there is no
 * pump yet.
 *
 * It goes down the same road as the outlet form (`submitEnrollment` → the website's
 * `/api/enroll` → our API) with `kind: 'planner'`. The API opens a planner's
 * account at once and sends the first bill to WhatsApp and SMS, so the usual answer
 * is `ready`, and this screen signs them in and lands them on their home. The other
 * two answers are handled exactly as the outlet form handles them: `existing` (the
 * mobile already has an account: a WhatsApp code opens it with the password just
 * chosen) and `waiting` (MDG's team looks first).
 */
export function NewPumpRegisterPage() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const submissionIdFor = useSubmissionId();
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<{ email: string; mobile: string; account: EnrollAccount } | null>(null);
  // `existing` only: the password just chosen, held in memory for the WhatsApp code
  // step to give the account, and dropped when this screen goes.
  const chosenPassword = React.useRef<string | null>(null);
  React.useEffect(
    () => () => {
      chosenPassword.current = null;
    },
    [],
  );

  // Back to the choice screen; opened cold (a link straight here), there too.
  const goBack = useGoBack('/welcome');
  const toSignIn = (mobile?: string) => navigate('/login', mobile ? { state: { identifier: mobile } } : undefined);

  const schema = React.useMemo(() => plannerFormSchema(t), [t]);
  const states = React.useMemo(() => stateOptions(lang), [lang]);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PlannerFormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_PLANNER_FORM });
  const oilCompany = watch('oilCompany');
  const stage = watch('stage');
  // Inside the phone apps (Android and iPhone) the outlet sign-up shows no price and
  // says nothing about paying, so this form does not either (ADR 0022 §1, ADR 0058
  // §13.4): no "₹199 + GST" and no "the payment link comes on WhatsApp". The terms
  // sheet still states the price in full, as the outlet's terms do.
  const payHere = canPayHere();

  // The film link's share code, when this screen was opened from one.
  const ref = React.useMemo(() => refFromSearch(location.search), [location.search]);
  // The website page that sent them (ADR 0059 §5), when the funnel link brought them.
  const from = React.useMemo(() => fromFromSearch(location.search), [location.search]);
  // What the query carries on to the choice screen: everything but `for`, so a share
  // code or the page tag survives a change of mind.
  const choiceHref = React.useMemo(() => {
    const next = new URLSearchParams(location.search);
    next.delete('for');
    const q = next.toString();
    return q ? `/welcome?${q}` : '/welcome';
  }, [location.search]);

  const enroll = useMutation({
    // The password is in `variables` while the call lives; the mutation's own
    // record of it goes as soon as it settles.
    gcTime: 0,
    mutationFn: async (v: PlannerFormValues) => {
      const fields = toPlannerPayload(v, lang, ref, from);
      const account = await submitEnrollment({ ...fields, submissionId: submissionIdFor(fields) });
      // The account is open: sign in with what was just typed, straight to the home.
      // A sign-in that does not go through is not a failed registration: the card
      // below offers Sign in.
      const session =
        account === 'ready' ? await requestSignIn(fields.mobile, v.password).catch(() => null) : null;
      return { account, session };
    },
    onSuccess: ({ account, session }, v) => {
      // From now on this phone opens on Sign in, whatever the answer (`firstScreen.ts`).
      markAccountHere();
      if (session) {
        startSession(session);
        navigate('/', { replace: true });
        return;
      }
      chosenPassword.current = account === 'existing' ? v.password : null;
      setSentTo({ email: v.email.trim(), mobile: toMobile(v.mobile) ?? v.mobile, account });
      window.scrollTo({ top: 0 });
    },
  });

  // Once it has gone through, drop the mutation's own copy of what was sent
  // (the password is in it). The confirmation is drawn from `sentTo`.
  const { isSuccess, reset: resetEnroll } = enroll;
  React.useEffect(() => {
    if (isSuccess) resetEnroll();
  }, [isSuccess, resetEnroll]);

  if (!plannerSignUpEnabled()) return <Navigate to="/register" replace />;

  return (
    <div className="min-h-full bg-bg px-4 pb-12 pt-4">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goBack}
            aria-label={t('common.back')}
            className="-ml-2 grid h-12 w-12 shrink-0 place-items-center rounded-full text-text active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <ArrowLeft width={22} strokeWidth={1.75} />
          </button>
          <h1 className="min-w-0 flex-1 text-title text-text">{t('newPump.title')}</h1>
          <button
            type="button"
            onClick={() => setLanguageOpen(true)}
            aria-label={t('profile.language')}
            className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-3 text-meta font-medium text-text active:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Globe width={18} strokeWidth={1.75} aria-hidden />
            {LANGUAGE_NAMES[lang]}
          </button>
        </div>

        {sentTo?.account === 'existing' && chosenPassword.current ? (
          <WelcomeBackCard
            mobile={sentTo.mobile}
            password={chosenPassword.current}
            onSignedIn={(session) => {
              chosenPassword.current = null;
              startSession(session);
              navigate('/', { replace: true });
            }}
            onSignIn={() => {
              chosenPassword.current = null;
              toSignIn(sentTo.mobile);
            }}
          />
        ) : sentTo ? (
          <Card className="mt-4">
            <CardContent role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-success">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-success text-white">
                  <Check width={16} strokeWidth={2.4} aria-hidden />
                </span>
                <span className="text-meta font-semibold">{t(SUCCESS_WORDS[sentTo.account].badge)}</span>
              </div>
              <p className="mt-4 text-subheading leading-snug text-text">{t(SUCCESS_WORDS[sentTo.account].title)}</p>
              <p className="mt-2 text-meta leading-relaxed text-text-muted">{t(SUCCESS_WORDS[sentTo.account].body)}</p>
              {sentTo.email ? (
                <p className="mt-2 text-meta leading-relaxed text-text-muted">
                  {t('register.successEmail', { email: sentTo.email })}
                </p>
              ) : null}
              {sentTo.account === 'waiting' ? (
                <Button size="lg" fullWidth className="mt-6" onClick={goBack}>
                  {t('common.back')}
                </Button>
              ) : (
                <Button size="lg" fullWidth className="mt-6" onClick={() => toSignIn(sentTo.mobile)}>
                  {t('auth.signIn')}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {from ? (
              <div className="mt-2 rounded-xl bg-brand-soft px-4 py-3">
                <p className="text-body leading-relaxed text-text">
                  {t(isGuideSource(from) ? 'newPump.fromGuide' : 'newPump.fromSite')}
                </p>
                {/* Someone who runs a pump and followed the link by mistake: the choice is one tap away. */}
                <button
                  type="button"
                  onClick={() => navigate(choiceHref)}
                  className="mt-1 min-h-12 rounded-lg text-left text-meta font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {t('newPump.runningPump')}
                </button>
              </div>
            ) : null}
            <p className="mt-2 text-body leading-relaxed text-text-muted">{t(payHere ? 'newPump.intro' : 'newPump.introApp')}</p>
            <p className="mt-3 text-meta text-text-muted">
              {t('welcome.haveAccount')}{' '}
              <button
                type="button"
                onClick={() => toSignIn()}
                className="min-h-12 rounded-lg px-1 font-medium text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {t('auth.signIn')}
              </button>
            </p>

            <Card className="mt-5">
              <CardContent>
                <form
                  // Never the default GET: a password must not reach a URL.
                  method="post"
                  onSubmit={handleSubmit((v) => enroll.mutate(v))}
                  className="flex flex-col gap-5"
                  noValidate
                >
                  <Field id="np-name" label={t('register.name')} error={errors.name?.message}>
                    <Input
                      id="np-name"
                      className="h-12"
                      autoComplete="name"
                      maxLength={LIMITS.name}
                      invalid={!!errors.name}
                      aria-describedby={errors.name ? 'np-name-error' : undefined}
                      {...register('name')}
                    />
                  </Field>

                  <Field id="np-mobile" label={t('register.mobile')} error={errors.mobile?.message}>
                    <Input
                      id="np-mobile"
                      className="h-12"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={20}
                      invalid={!!errors.mobile}
                      aria-describedby={errors.mobile ? 'np-mobile-error' : undefined}
                      {...register('mobile')}
                    />
                  </Field>

                  <Field
                    id="np-password"
                    label={t('register.password')}
                    hint={t('register.passwordHint')}
                    error={errors.password?.message}
                  >
                    <PasswordInput
                      id="np-password"
                      className="h-12"
                      autoComplete="new-password"
                      maxLength={PASSWORD_LIMITS.max}
                      invalid={!!errors.password}
                      aria-describedby={errors.password ? 'np-password-error' : 'np-password-hint'}
                      {...register('password')}
                    />
                  </Field>

                  <Field id="np-confirm" label={t('register.confirmPassword')} error={errors.confirmPassword?.message}>
                    <PasswordInput
                      id="np-confirm"
                      className="h-12"
                      autoComplete="new-password"
                      maxLength={PASSWORD_LIMITS.max}
                      invalid={!!errors.confirmPassword}
                      aria-describedby={errors.confirmPassword ? 'np-confirm-error' : undefined}
                      {...register('confirmPassword')}
                    />
                  </Field>

                  <Field
                    id="np-state"
                    label={t('newPump.state')}
                    hint={t('newPump.stateHint')}
                    error={errors.stateCode?.message}
                  >
                    <select
                      id="np-state"
                      autoComplete="address-level1"
                      aria-invalid={errors.stateCode ? true : undefined}
                      aria-describedby={errors.stateCode ? 'np-state-error' : 'np-state-hint'}
                      className={cn(SELECT_CLASS, errors.stateCode ? 'border-danger' : 'border-border-strong')}
                      {...register('stateCode')}
                    >
                      <option value="">{t('newPump.statePick')}</option>
                      {states.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    id="np-district"
                    label={t('newPump.district')}
                    optional={t('register.optional')}
                    error={errors.district?.message}
                  >
                    <Input
                      id="np-district"
                      className="h-12"
                      autoComplete="address-level2"
                      maxLength={DISTRICT_MAX}
                      invalid={!!errors.district}
                      placeholder={t('newPump.districtPlaceholder')}
                      {...register('district')}
                    />
                  </Field>

                  <RadioCards
                    legend={t('newPump.company')}
                    options={PLANNER_OIL_COMPANIES.map((v) => ({ value: v, label: t(`newPump.company.${v}`) }))}
                    value={oilCompany}
                    error={errors.oilCompany?.message}
                    register={register('oilCompany')}
                  />

                  <RadioCards
                    legend={t('newPump.stage')}
                    options={PLANNER_STAGES.map((v) => ({ value: v, label: t(`newPump.stage.${v}`) }))}
                    value={stage}
                    error={errors.stage?.message}
                    register={register('stage')}
                    columns={1}
                  />

                  <Field
                    id="np-email"
                    label={t('register.email')}
                    optional={t('register.optional')}
                    error={errors.email?.message}
                  >
                    <Input
                      id="np-email"
                      className="h-12"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={LIMITS.email}
                      invalid={!!errors.email}
                      aria-describedby={errors.email ? 'np-email-error' : undefined}
                      {...register('email')}
                    />
                  </Field>

                  {/* The link opens the terms; it does not tick the box. "I agree &
                      continue" inside the terms does both. */}
                  <div className="flex flex-col gap-1.5">
                    <div
                      className={cn(
                        'flex items-start gap-3 rounded-xl border p-3',
                        errors.agree ? 'border-danger' : 'border-border-strong',
                      )}
                    >
                      {/* No aria-label: the <label> below names the box, so a screen reader
                          speaks the same words the reader sees (the terms button's words
                          are part of the label's text). */}
                      <input
                        id="np-agree"
                        type="checkbox"
                        aria-describedby={errors.agree ? 'np-agree-error' : undefined}
                        className="mt-0.5 h-6 w-6 shrink-0 accent-brand"
                        {...register('agree')}
                      />
                      <label htmlFor="np-agree" className="text-body leading-relaxed text-text">
                        {t('newPump.agreeLead')}{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            // Inside the label, a tap would also toggle the box.
                            e.preventDefault();
                            setTermsOpen(true);
                          }}
                          className="font-semibold text-brand underline underline-offset-2"
                        >
                          {t('newPump.termsLink')}
                        </button>
                        {t('newPump.agreeTail')}
                      </label>
                    </div>
                    {errors.agree ? (
                      <p id="np-agree-error" className="text-meta text-danger">
                        {errors.agree.message}
                      </p>
                    ) : null}
                  </div>

                  {enroll.isError ? (
                    <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-meta text-danger">
                      {/* 503: New Pump Guide is switched off on the server (the site relays it). */}
                      {enroll.error instanceof EnrollError && enroll.error.status === 503
                        ? t('newPump.closed')
                        : t('register.failed')}
                    </p>
                  ) : null}

                  <p className="text-meta leading-relaxed text-text-muted">{t(payHere ? 'newPump.afterSubmit' : 'newPump.afterSubmitApp')}</p>

                  <Button type="submit" size="lg" fullWidth loading={enroll.isPending}>
                    {t('newPump.submit')}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <p className="mt-4 text-center text-meta text-text-subtle">
              {t('register.privacy')} <PrivacyLink className="font-medium underline underline-offset-2" />
            </p>
          </>
        )}
      </div>

      {languageOpen ? <LanguageSheet onClose={() => setLanguageOpen(false)} /> : null}

      {termsOpen ? (
        <TermsSheet
          terms="newPump"
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
