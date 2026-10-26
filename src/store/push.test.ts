import { afterEach, describe, expect, it, vi } from 'vitest';

import { PUSH_SNOOZE_DAYS, isPushNoticeSnoozed, snoozePushNotice } from './push';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 9, 26, 10, 0).getTime();

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('push reminders — snoozing', () => {
  it('is not snoozed until it has been put away', () => {
    expect(isPushNoticeSnoozed('ask', T0)).toBe(false);
    expect(isPushNoticeSnoozed('off', T0)).toBe(false);
  });

  it('"Not now" on the card stays quiet for three days, then comes back', () => {
    snoozePushNotice('ask', T0);
    expect(PUSH_SNOOZE_DAYS.ask).toBe(3);
    expect(isPushNoticeSnoozed('ask', T0 + 3 * DAY - 1)).toBe(true);
    expect(isPushNoticeSnoozed('ask', T0 + 3 * DAY)).toBe(false);
  });

  it('dismissing the "off" line stays quiet for seven days', () => {
    snoozePushNotice('off', T0);
    expect(PUSH_SNOOZE_DAYS.off).toBe(7);
    expect(isPushNoticeSnoozed('off', T0 + 7 * DAY - 1)).toBe(true);
    expect(isPushNoticeSnoozed('off', T0 + 7 * DAY)).toBe(false);
  });

  it('keeps the two reminders on separate clocks', () => {
    snoozePushNotice('ask', T0);
    expect(isPushNoticeSnoozed('off', T0)).toBe(false);
  });

  it('treats a mangled stored value as not snoozed', () => {
    localStorage.setItem('mdg.client.pushNotice.ask.until', 'soon');
    expect(isPushNoticeSnoozed('ask', T0)).toBe(false);
  });

  // A WebView with storage switched off throws on access, not only on write.
  it('survives storage that throws: never snoozed, and saving does not break the app', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(isPushNoticeSnoozed('ask', T0)).toBe(false);
    expect(() => snoozePushNotice('ask', T0)).not.toThrow();
  });
});
