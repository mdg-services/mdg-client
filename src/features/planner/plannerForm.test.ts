import { describe, expect, it } from 'vitest';

import { translate } from '@/lib/i18n';
import { plannerRegisterSchema } from '@dk/shared/schemas';

import { EMPTY_PLANNER_FORM, plannerFormSchema, toPlannerPayload, type PlannerFormValues } from './plannerForm';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('en', key, vars);
const schema = plannerFormSchema(t);

const VALID: PlannerFormValues = {
  ...EMPTY_PLANNER_FORM,
  name: '  Sunita Devi ',
  mobile: '98765 43210',
  password: 'pump-plan-2026',
  confirmPassword: 'pump-plan-2026',
  stateCode: '06',
  district: ' Karnal ',
  oilCompany: 'iocl',
  stage: 'applied',
  email: '',
  agree: true,
};

/** The error message for one field, or undefined when it passed. */
function errorOf(values: PlannerFormValues, field: keyof PlannerFormValues): string | undefined {
  const r = schema.safeParse(values);
  if (r.success) return undefined;
  return r.error.issues.find((i) => i.path[0] === field)?.message;
}

describe('the Kavach Shuruaat form (ADR 0058 §3.2)', () => {
  it('takes a complete form', () => {
    expect(schema.safeParse(VALID).success).toBe(true);
  });

  it('district and email are optional', () => {
    expect(schema.safeParse({ ...VALID, district: '', email: '' }).success).toBe(true);
  });

  it('says what is missing, in words, for each required field', () => {
    const r = schema.safeParse(EMPTY_PLANNER_FORM);
    expect(r.success).toBe(false);
    const errors = r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
    expect(errors.name).toBe(t('register.nameRequired'));
    expect(errors.mobile).toBe(t('register.mobileInvalid'));
    expect(errors.password).toBe(t('profile.min8'));
    expect(errors.stateCode).toBe('Choose your state');
    expect(errors.oilCompany).toBe('Choose one');
    expect(errors.stage).toBe('Choose one');
    expect(errors.agree).toBe(t('register.agreeRequired'));
  });

  it('refuses a state that is not a GST state', () => {
    expect(errorOf({ ...VALID, stateCode: 'ZZ' }, 'stateCode')).toBe('Choose your state');
  });

  it('refuses a mobile the sign-in would not accept', () => {
    expect(errorOf({ ...VALID, mobile: '12345' }, 'mobile')).toBe(t('register.mobileInvalid'));
  });

  it('wants the password twice the same', () => {
    expect(errorOf({ ...VALID, confirmPassword: 'pump-plan-2027' }, 'confirmPassword')).toBe(
      t('profile.passwordsDontMatch'),
    );
  });

  it('refuses a bad email but not an empty one', () => {
    expect(errorOf({ ...VALID, email: 'sunita@' }, 'email')).toBe(t('auth.emailInvalid'));
    expect(errorOf({ ...VALID, email: '' }, 'email')).toBeUndefined();
  });

  it('refuses a district longer than the server keeps', () => {
    expect(errorOf({ ...VALID, district: 'x'.repeat(121) }, 'district')).toBeDefined();
  });

  it('sends the planner kind, the ten digits, trimmed words and the app language', () => {
    const payload = toPlannerPayload(VALID, 'hl', 'film42');
    expect(payload).toEqual({
      kind: 'planner',
      name: 'Sunita Devi',
      mobile: '9876543210',
      password: 'pump-plan-2026',
      stateCode: '06',
      district: 'Karnal',
      oilCompany: 'iocl',
      stage: 'applied',
      email: '',
      agree: true,
      source: 'app',
      consentWhatsApp: true,
      lang: 'hl',
      ref: 'film42',
    });
  });

  it('what it sends is what the API accepts', () => {
    const wire = { ...toPlannerPayload(VALID, 'hi'), submissionId: 'abcdef123456' };
    const r = plannerRegisterSchema.safeParse(wire);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.mobile).toBe('9876543210');
      expect(r.data.email).toBeUndefined();
    }
  });
});
