import { z } from 'zod';

import { LIMITS, PASSWORD_LIMITS, toMobile, type PlannerEnrollmentPayload } from '@/features/register/enroll';
import type { TFunction } from '@/lib/i18n';
import { GST_STATES } from '@dk/shared';
import { PLANNER_OIL_COMPANIES, PLANNER_STAGES, type DealerLang } from '@dk/shared/types';

/** The district box's limit: the shared `plannerRegisterSchema`'s. */
export const DISTRICT_MAX = 120;

export interface PlannerFormValues {
  name: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  stateCode: string;
  district: string;
  oilCompany: '' | (typeof PLANNER_OIL_COMPANIES)[number];
  stage: '' | (typeof PLANNER_STAGES)[number];
  email: string;
  agree: boolean;
}

export const EMPTY_PLANNER_FORM: PlannerFormValues = {
  name: '',
  mobile: '',
  password: '',
  confirmPassword: '',
  stateCode: '',
  district: '',
  oilCompany: '',
  stage: '',
  email: '',
  agree: false,
};

/**
 * The New Pump Guide form's rules (ADR 0058 §3.2), each error in the reader's words.
 * They mirror the shared `plannerRegisterSchema` the API reads, so the screen never
 * sends a form the API would refuse: the name 1–120, a mobile the sign-in accepts,
 * a password of 8–200 typed twice the same, a real GST state, an optional district,
 * one oil company and one stage, an optional email, and the terms ticked.
 */
export function plannerFormSchema(t: TFunction) {
  return z
    .object({
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
      stateCode: z.string().refine((c) => Boolean(GST_STATES[c]), t('newPump.stateRequired')),
      district: z.string().trim().max(DISTRICT_MAX),
      oilCompany: z.enum(PLANNER_OIL_COMPANIES, {
        errorMap: () => ({ message: t('newPump.companyRequired') }),
      }),
      stage: z.enum(PLANNER_STAGES, { errorMap: () => ({ message: t('newPump.stageRequired') }) }),
      email: z
        .string()
        .trim()
        .max(LIMITS.email, t('auth.emailInvalid'))
        .refine((v) => v === '' || z.string().email().safeParse(v).success, t('auth.emailInvalid')),
      agree: z.literal(true, { errorMap: () => ({ message: t('register.agreeRequired') }) }),
    })
    .refine((v) => v.password === v.confirmPassword, {
      path: ['confirmPassword'],
      message: t('profile.passwordsDontMatch'),
    });
}

/**
 * What goes on the wire, minus the `submissionId` (which is made from this, so a
 * second press of the same form is one registration). The mobile is the plain ten
 * digits, the texts trimmed, and the language is the app's own (hi, hl or en): it
 * becomes the account's language.
 */
export function toPlannerPayload(
  v: PlannerFormValues,
  lang: DealerLang,
  ref?: string,
): Omit<PlannerEnrollmentPayload, 'submissionId'> {
  return {
    kind: 'planner',
    name: v.name.trim(),
    mobile: toMobile(v.mobile) ?? v.mobile.trim(),
    password: v.password,
    stateCode: v.stateCode,
    district: v.district.trim(),
    oilCompany: v.oilCompany as PlannerEnrollmentPayload['oilCompany'],
    stage: v.stage as PlannerEnrollmentPayload['stage'],
    email: v.email.trim(),
    agree: true,
    source: 'app',
    consentWhatsApp: true,
    lang,
    ...(ref ? { ref } : {}),
  };
}
