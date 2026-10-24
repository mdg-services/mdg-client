import { gstinCheckChar } from '@dk/shared';
import type { OutletSetupView, SetupStripState, SetupStripStep } from '@dk/shared/types';

const STEPS: SetupStripStep[] = ['billing', 'payment', 'logins', 'start'];

/** A strip from four states, in order: billing, payment, logins, start. */
export function makeStrip(states: SetupStripState[]): OutletSetupView['strip'] {
  return STEPS.map((step, i) => ({ step, state: states[i] ?? 'todo' }));
}

/** An outlet at the billing step: nothing saved yet, the owner looking. */
export function makeSetupView(over: Partial<OutletSetupView> = {}): OutletSetupView {
  return {
    active: true,
    stage: 'billing',
    waitingOn: 'dealer',
    strip: makeStrip(['current', 'todo', 'todo', 'todo']),
    billing: null,
    billingSavedBy: null,
    billingPrefill: { name: 'Sai Petroleums', stateCode: null, gstin: null },
    payment: { state: 'not_sent', amountPaise: null, dueOn: null, paidOn: null, paymentId: null },
    loginsNeeded: ['sdms', 'iras'],
    canEdit: true,
    ...over,
  };
}

/** A GSTIN with the right check character, for a state code. */
export function gstinFor(stateCode: string): string {
  const first14 = `${stateCode}ABCDE1234F1Z`;
  return first14 + gstinCheckChar(first14);
}

/** The one the tests mostly use: Haryana. */
export const GSTIN_HARYANA = gstinFor('06');
export const GSTIN_MAHARASHTRA = gstinFor('27');
