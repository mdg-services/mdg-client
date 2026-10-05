import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button, Card, CardContent, Input } from '@/components/ui';
import {
  LIMITS,
  MOBILE_PATTERN,
  SITE_TYPES,
  submitEnrollment,
  type SiteType,
} from '@/features/register/enroll';
import { TermsSheet } from '@/features/register/TermsSheet';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

interface FormValues {
  name: string;
  mobile: string;
  email: string;
  siteType: SiteType | '';
  pumpName: string;
  sapCode: string;
  agree: boolean;
}

/**
 * Sign-up for someone who has downloaded the app and has no login.
 *
 * MDG creates every dealer's ID and password, so this does not create an
 * account. It is the website's enrolment form — the same six details and the
 * same Terms & Conditions — filled in without leaving the app, and sent to the
 * same place the website sends it, which emails the MDG inbox. The team calls,
 * sets the dealer up, and sends the login.
 */
export function RegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<{ email: string } | null>(null);

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
        mobile: z.string().trim().regex(MOBILE_PATTERN, t('register.mobileInvalid')),
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
      email: '',
      siteType: '',
      pumpName: '',
      sapCode: '',
      agree: false,
    },
  });
  const siteType = watch('siteType');

  const enroll = useMutation({
    mutationFn: (v: FormValues) =>
      submitEnrollment({
        name: v.name,
        mobile: v.mobile,
        email: v.email,
        siteType: v.siteType as SiteType,
        pumpName: v.pumpName,
        sapCode: v.sapCode,
        agree: true,
        source: 'app',
      }),
    onSuccess: (_data, v) => {
      setSentTo({ email: v.email });
      window.scrollTo({ top: 0 });
    },
  });

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
                <span className="text-sm font-semibold">{t('register.successBadge')}</span>
              </div>
              <p className="mt-4 text-lg font-semibold leading-snug text-text">
                {t('register.successTitle')}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {t('register.successBody')}
              </p>
              {sentTo.email ? (
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  {t('register.successEmail', { email: sentTo.email })}
                </p>
              ) : null}
              <Button size="lg" fullWidth className="mt-6" onClick={goBack}>
                {t('register.back')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{t('register.intro')}</p>

            <Card className="mt-5">
              <CardContent>
                <form
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
                      maxLength={15}
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

            <p className="mt-4 text-center text-xs text-text-subtle">{t('register.privacy')}</p>
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
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: string;
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
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
