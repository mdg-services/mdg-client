import { z } from 'zod';

import type { TFunction } from '@/lib/i18n';
import type { PlannerConvertInput } from '@dk/shared/schemas';
import type { PlannerOilCompany } from '@dk/shared/types';

/** The oil companies a running pump can be with (the switch refuses "other" and "not decided"). */
export const SWITCH_COMPANIES = ['iocl', 'bpcl', 'hpcl'] as const;
export const SWITCH_SITE_TYPES = ['A', 'B'] as const;

export interface SwitchFormValues {
  sapCode: string;
  pumpName: string;
  siteType: '' | (typeof SWITCH_SITE_TYPES)[number];
  oilCompany: '' | (typeof SWITCH_COMPANIES)[number];
}

/**
 * The switch form's rules, in the reader's words. They are the shared
 * `plannerConvertSchema`'s (SAP code 1–60, pump name 1–160, site type A/B, one of the
 * three oil companies), so the screen never sends what the server would refuse.
 */
export function switchFormSchema(t: TFunction) {
  return z.object({
    sapCode: z.string().trim().min(1, t('switch.sapCodeRequired')).max(60),
    pumpName: z.string().trim().min(1, t('switch.pumpNameRequired')).max(160),
    siteType: z.enum(SWITCH_SITE_TYPES, { errorMap: () => ({ message: t('switch.siteTypeRequired') }) }),
    oilCompany: z.enum(SWITCH_COMPANIES, { errorMap: () => ({ message: t('switch.companyRequired') }) }),
  });
}

/** What goes to `POST /v1/me/planner/convert`, trimmed. */
export function toConvertInput(v: SwitchFormValues): PlannerConvertInput {
  return {
    sapCode: v.sapCode.trim(),
    pumpName: v.pumpName.trim(),
    siteType: v.siteType as 'A' | 'B',
    oilCompany: v.oilCompany as PlannerConvertInput['oilCompany'],
  };
}

/** The company said at sign-up, when it is one a running pump can be with: the form starts on it. */
export function startingCompany(c: PlannerOilCompany | undefined): SwitchFormValues['oilCompany'] {
  return c === 'iocl' || c === 'bpcl' || c === 'hpcl' ? c : '';
}
