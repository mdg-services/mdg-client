import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { PrivacyLink } from '@/components/PrivacyLink';
import { Button, Card, CardContent, Input } from '@/components/ui';
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
import { cn } from '@/lib/cn';
import { useLang, useT, type MessageKey } from '@/lib/i18n';

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
 *  - `existing`: this mobile already signs in to an account — Sign in (a second
 *    pump is the team's to add);
 *  - `waiting`: MDG's team looks first; a WhatsApp message says when it is ready.
 */
export function RegisterPage() {
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
  } | null>(null);

  // To the sign-in screen with the mobile number already in its box.
  const toSignIn = (mobile?: string) =>
    navigate('/login', mobile ? { state: { identifier: mobile } } : undefined);

  // Back to the sign-in screen the way the phone's Back button would get
  // there, so the two never leave different histories behind. Opened directly
  // (no earlier entry of ours), it replaces itself with sign-in instead.
  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate('/login', { replace: true });
  };

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
        lang,
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
      if (session) {
        startSession(session);
        navigate('/chat', { replace: true });
        return;
      }
      setSentTo({ email: v.email, mobile: toMobile(v.mobile) ?? v.mobile, account });
      window.scrollTo({ top: 0 });
    },
  });

  // Once it has gone through, drop the mutation's own copy of what was sent
  // (the password is in it). The confirmation is drawn from `sentTo`.
  const { isSuccess, reset: resetEnroll } = enroll;
  React.useEffect(() => {
    if (isSuccess) resetEnroll();
  }, [isSuccess, resetEnroll]);

  return (
    <div className="min-h-full bg-bg px-4 pb-12 pt-4">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goBack}
            aria-label={t('register.back')}
            className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-text active:bg-surface-2"
          >
            <ArrowLeft width={22} strokeWidth={1.75} />
          </button>
          <h1 className="text-xl font-semibold tracking-tight text-text">
            {t('register.title')}
          </h1>
        </div>

        {sentTo ? (
          <Card className="mt-4">
            <CardContent role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-success">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-success text-white">
                  <Check width={16} strokeWidth={2.4} />
                </span>
                <span className="text-sm font-semibold">{t(SUCCESS_WORDS[sentTo.account].badge)}</span>
              </div>
              <p className="mt-4 text-lg font-semibold leading-snug text-text">
                {t(SUCCESS_WORDS[sentTo.account].title)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {t(SUCCESS_WORDS[sentTo.account].body)}
              </p>
              {sentTo.email ? (
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  {t('register.successEmail', { email: sentTo.email })}
                </p>
              ) : null}
              {sentTo.account === 'waiting' ? (
                <Button size="lg" fullWidth className="mt-6" onClick={goBack}>
                  {t('register.back')}
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
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{t('register.intro')}</p>
            {/* First, because this is the first screen on a new phone: anybody who
                already has an account is one tap from signing in. */}
            <p className="mt-3 text-sm text-text-muted">
              {t('register.alreadyRegistered')}{' '}
              <button
                type="button"
                onClick={() => toSignIn()}
                className="min-h-11 rounded-lg px-1 font-medium text-brand underline underline-offset-4"
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
                  className="flex flex-col gap-4"
                  noValidate
                >
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

                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="mb-1.5 text-sm font-medium text-text">
                      {t('register.siteType')}
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      {SITE_TYPES.map((value) => (
                        <label
                          key={value}
                          className={cn(
                            'flex h-12 cursor-pointer items-center gap-2.5 rounded-xl border px-3 transition-colors',
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
                          <span className="text-base font-medium text-text">{value}</span>
                        </label>
                      ))}
                    </div>
                    {errors.siteType ? (
                      <p className="text-xs text-danger">{errors.siteType.message}</p>
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

                  <Field id="reg-sap" label={t('register.sapCode')} error={errors.sapCode?.message}>
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

                  {/* The link opens the terms; it does not tick the box. "I agree
                      & continue" inside the terms does both. */}
                  <div className="flex flex-col gap-1.5">
                    <div
                      className={cn(
                        'flex items-start gap-3 rounded-xl border p-3',
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
                      <label htmlFor="reg-agree" className="text-sm leading-relaxed text-text">
                        {t('register.agreeLead')}{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            // Inside the label, a tap would also toggle the box.
                            e.preventDefault();
                            setTermsOpen(true);
                          }}
                          className="font-semibold text-brand underline underline-offset-2"
                        >
                          {t('register.termsLink')}
                        </button>
                        {t('register.agreeTail')}
                      </label>
                    </div>
                    {errors.agree ? (
                      <p className="text-xs text-danger">{errors.agree.message}</p>
                    ) : null}
                  </div>

                  {enroll.isError ? (
                    <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                      {t('register.failed')}
                    </p>
                  ) : null}

                  <Button type="submit" size="lg" fullWidth loading={enroll.isPending}>
                    {t('register.submit')}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <p className="mt-4 text-center text-xs text-text-subtle">
              {t('register.privacy')}{' '}
              {/* Where the dealer is deciding what to hand over: the policy that
                  says what is done with it, one tap away. */}
              <PrivacyLink className="font-medium underline underline-offset-2" />
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
      <label className="text-sm font-medium text-text" htmlFor={id}>
        {label}
        {optional ? <span className="ml-1 font-normal text-text-subtle">{optional}</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
