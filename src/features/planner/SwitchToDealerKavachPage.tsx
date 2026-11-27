import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';

import { AppBar } from '@/components/AppBar';
import { Button, Input } from '@/components/ui';
import { canPayHere } from '@/features/payments/policy';
import { Field } from '@/features/register/Field';
import { ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useGoBack } from '@/lib/useGoBack';

import { useIsPlanner } from './isPlanner';
import { RadioCards } from './RadioCards';
import {
  SWITCH_COMPANIES,
  SWITCH_SITE_TYPES,
  startingCompany,
  switchFormSchema,
  toConvertInput,
  type SwitchFormValues,
} from './switchForm';
import { useConvertPlanner, usePlannerView } from './usePlanner';

const COMPANY_WORDS = {
  iocl: 'newPump.company.iocl',
  bpcl: 'newPump.company.bpcl',
  hpcl: 'newPump.company.hpcl',
} as const;

/**
 * "My pump is open" (ADR 0058 §7): first what changes, in plain words, then the four
 * things the normal Dealer Kavach setup needs to begin. On success the app reads the
 * profile again and lands on the normal home, where setup is under way in the chat.
 * Only a planner gets here; anyone else (or someone who has just switched and
 * pressed Back) goes home.
 */
export function SwitchToDealerKavachPage() {
  const t = useT();
  const navigate = useNavigate();
  const goBack = useGoBack('/');
  const planner = useIsPlanner();
  const view = usePlannerView();
  const convert = useConvertPlanner();
  const schema = React.useMemo(() => switchFormSchema(t), [t]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<SwitchFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sapCode: '', pumpName: '', siteType: '', oilCompany: '' },
  });
  const siteType = watch('siteType');
  const oilCompany = watch('oilCompany');

  // Start the company on the one they named at sign-up, once the plan has answered,
  // unless they have already picked one here.
  const said = startingCompany(view.data?.oilCompany);
  React.useEffect(() => {
    if (said && !getValues('oilCompany')) setValue('oilCompany', said);
  }, [said, getValues, setValue]);

  if (!planner && !convert.isSuccess) return <Navigate to="/" replace />;

  // Only ALREADY_CLIENT means the SAP code is taken. The server's other refusals: the
  // account moved already (another 409), or billing stopped but the switch write did not
  // finish (SWITCH_NOT_FINISHED, finished by pressing again). Anything else changed nothing.
  const errorCode = convert.error instanceof ApiError ? convert.error.code : null;
  const errorText = convert.isError
    ? errorCode === 'ALREADY_CLIENT'
      ? t('switch.sapTaken')
      : errorCode === 'SWITCH_NOT_FINISHED'
        ? t('switch.notFinished')
        : convert.error instanceof ApiError && convert.error.status === 409
          ? t('switch.alreadySwitched')
          : t('switch.failed')
    : null;

  // Inside the phone apps no amount sits just above "Switch now", which leads to a bill
  // (ADR 0022 §1); the plan's terms in the app state it in full.
  const changes = [
    t('switch.sameLogin'),
    t('switch.guideStops'),
    t(canPayHere() ? 'switch.dkPrice' : 'switch.dkPriceApp'),
    t('switch.billedInSetup'),
  ];

  return (
    <>
      <AppBar title={t('switch.title')} onBack={goBack} />
      <div className="flex flex-1 flex-col gap-6 bg-bg px-4 pb-12 pt-4">
        <section aria-labelledby="switch-lead" className="rounded-xl border border-border bg-surface p-4">
          <h2 id="switch-lead" className="text-subheading text-text">
            {t('switch.lead')}
          </h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {changes.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-body leading-relaxed text-text">
                <Check className="mt-1 size-4 shrink-0 text-brand" strokeWidth={2.2} aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="switch-form" className="rounded-xl border border-border bg-surface p-4">
          <h2 id="switch-form" className="text-subheading text-text">
            {t('switch.formTitle')}
          </h2>
          <form
            method="post"
            noValidate
            className="mt-3 flex flex-col gap-4"
            onSubmit={handleSubmit((v) =>
              convert.mutate(toConvertInput(v), {
                onSuccess: () => navigate('/', { replace: true }),
              }),
            )}
          >
            <Field id="switch-sap" label={t('switch.sapCode')} error={errors.sapCode?.message}>
              <Input
                id="switch-sap"
                className="h-12"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={60}
                invalid={!!errors.sapCode}
                aria-describedby={errors.sapCode ? 'switch-sap-error' : undefined}
                placeholder={t('switch.sapCodePlaceholder')}
                {...register('sapCode')}
              />
            </Field>
            <Field id="switch-pump" label={t('switch.pumpName')} error={errors.pumpName?.message}>
              <Input
                id="switch-pump"
                className="h-12"
                maxLength={160}
                invalid={!!errors.pumpName}
                aria-describedby={errors.pumpName ? 'switch-pump-error' : undefined}
                placeholder={t('switch.pumpNamePlaceholder')}
                {...register('pumpName')}
              />
            </Field>
            <RadioCards
              legend={t('switch.siteType')}
              options={SWITCH_SITE_TYPES.map((v) => ({ value: v, label: t(v === 'A' ? 'switch.siteA' : 'switch.siteB') }))}
              value={siteType}
              error={errors.siteType?.message}
              register={register('siteType')}
            />
            <RadioCards
              legend={t('switch.company')}
              options={SWITCH_COMPANIES.map((v) => ({ value: v, label: t(COMPANY_WORDS[v]) }))}
              value={oilCompany}
              error={errors.oilCompany?.message}
              register={register('oilCompany')}
            />

            {errorText ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-meta text-danger">
                {errorText}
              </p>
            ) : null}

            <Button type="submit" size="lg" fullWidth loading={convert.isPending}>
              {t('switch.confirm')}
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
