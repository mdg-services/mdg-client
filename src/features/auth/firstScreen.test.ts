import { afterEach, describe, expect, it, vi } from 'vitest';

import { firstScreen, markAccountHere } from './firstScreen';

/**
 * The first screen for someone who is not signed in (ADR 0058 §3.1): the choice
 * screen on a new phone, Sign in on a phone that has had an account, and the outlet
 * sign-up alone when New Pump Guide's sign-up is switched off.
 */
describe('firstScreen', () => {
  afterEach(() => localStorage.clear());

  it('opens a phone nobody has signed in on at the choice screen', () => {
    expect(firstScreen()).toBe('/welcome');
  });

  it('opens on Sign in once an account has been here', () => {
    markAccountHere();
    expect(firstScreen()).toBe('/login');
  });

  it('opens on Register when Kavach Shuruaat sign-up is switched off', () => {
    vi.stubEnv('VITE_PLANNER_ENABLED', 'false');
    expect(firstScreen()).toBe('/register');
    markAccountHere();
    expect(firstScreen()).toBe('/login');
  });

  it('opens on Sign in when the phone storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(firstScreen()).toBe('/login');
  });
});
