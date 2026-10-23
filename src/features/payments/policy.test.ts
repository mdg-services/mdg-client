import { afterEach, describe, expect, it } from 'vitest';

import { enterNativeShell, leaveNativeShell } from '@/test/payments';

import { PAY_IN_APP, canPayHere } from './policy';

describe('canPayHere', () => {
  afterEach(() => leaveNativeShell());

  it('lets a dealer pay in an ordinary browser', () => {
    expect(canPayHere()).toBe(true);
  });

  /**
   * Google Play's Payments policy: inside the app there is no Pay button and no
   * way to one. This is the line the whole read-only rule hangs on.
   */
  it('does not let a dealer pay inside the Android app', () => {
    enterNativeShell();
    expect(canPayHere()).toBe(false);
  });

  /**
   * Pinned on purpose. Turning it on is a business decision (enrolling in
   * Google's alternative billing programme), not a code tidy-up; whoever flips
   * it should come here and decide what this test then says.
   */
  it('ships with paying in the app switched off', () => {
    expect(PAY_IN_APP).toBe(false);
  });
});
