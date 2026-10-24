import { describe, expect, it } from 'vitest';

import { makeSetupView, makeStrip } from '@/test/setupFixtures';

import {
  DEALER_STEPS,
  STRIP_LABEL_KEYS,
  currentStep,
  stripCaptionKey,
  stripVisible,
} from './stripView';

describe('the strip', () => {
  it('is drawn only for an active outlet that is not live or lost', () => {
    expect(stripVisible(undefined)).toBe(false);
    expect(stripVisible(makeSetupView({ active: false }))).toBe(false);
    expect(stripVisible(makeSetupView({ stage: 'live' }))).toBe(false);
    expect(stripVisible(makeSetupView({ stage: 'lost' }))).toBe(false);
    for (const stage of ['sign_in', 'billing', 'payment', 'logins', 'setup', 'watch'] as const) {
      expect(stripVisible(makeSetupView({ stage })), stage).toBe(true);
    }
  });

  it('finds the current step', () => {
    expect(currentStep(makeSetupView())).toBe('billing');
    expect(currentStep(makeSetupView({ strip: makeStrip(['done', 'current', 'todo', 'todo']) }))).toBe(
      'payment',
    );
    expect(currentStep(makeSetupView({ strip: makeStrip(['done', 'done', 'done', 'done']) }))).toBeNull();
  });

  it('says what is happening now, and never anything about paying', () => {
    const key = (v: Parameters<typeof makeSetupView>[0]) => stripCaptionKey(makeSetupView(v));
    expect(key({ stage: 'billing' })).toBe('setup.nowBilling');
    expect(key({ stage: 'payment' })).toBe('setup.nowBillPrep');
    expect(
      key({
        stage: 'payment',
        payment: { state: 'sent', amountPaise: 354000, dueOn: '2026-11-02', paidOn: null, paymentId: null },
      }),
    ).toBe('setup.nowBillSent');
    expect(key({ stage: 'logins' })).toBe('setup.nowLogins');
    expect(key({ stage: 'setup' })).toBe('setup.nowSetup');
    expect(key({ stage: 'watch' })).toBe('setup.nowWatch');
    expect(key({ stage: 'sign_in' })).toBeNull();
  });

  it('has four steps, and none of them is a choice of services', () => {
    expect(Object.keys(STRIP_LABEL_KEYS)).toEqual(['billing', 'payment', 'logins', 'start']);
    expect(DEALER_STEPS).toEqual(['billing', 'payment', 'logins']);
    // A view from a server that still has the old stage is drawn without a caption, not a blank one.
    expect(stripCaptionKey({ ...makeSetupView(), stage: 'services' as never })).toBeNull();
  });
});
