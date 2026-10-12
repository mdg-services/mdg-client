import { describe, expect, it } from 'vitest';

import { translate } from '@/lib/i18n';
import type { Lang } from '@/store/lang';

import { monthHeading, monthKey, shortDate, viewerWhen } from './mediaFormat';

const tFor = (lang: Lang) => (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate(lang, key, vars);

/** A fixed "now": Monday 12 October 2026, 11:00. */
const NOW = new Date(2026, 9, 12, 11, 0);

describe('viewerWhen', () => {
  it('says Today and Yesterday in words, with the time', () => {
    expect(viewerWhen(new Date(2026, 9, 12, 8, 5).toISOString(), 'en', tFor('en'), NOW)).toBe(
      'Today, 8:05 am',
    );
    expect(viewerWhen(new Date(2026, 9, 11, 17, 30).toISOString(), 'en', tFor('en'), NOW)).toBe(
      'Yesterday, 5:30 pm',
    );
  });

  it('gives the day and month for anything older this year, and the year beyond', () => {
    expect(viewerWhen(new Date(2026, 2, 5, 15, 40).toISOString(), 'en', tFor('en'), NOW)).toBe(
      '5 Mar, 3:40 pm',
    );
    expect(viewerWhen(new Date(2025, 11, 31, 23, 59).toISOString(), 'en', tFor('en'), NOW)).toBe(
      '31 Dec 2025, 11:59 pm',
    );
  });

  it('uses the Hindi words for Today and Yesterday', () => {
    expect(viewerWhen(new Date(2026, 9, 12, 8, 5).toISOString(), 'hi', tFor('hi'), NOW)).toMatch(/^आज, /);
    expect(viewerWhen(new Date(2026, 9, 11, 8, 5).toISOString(), 'hi', tFor('hi'), NOW)).toMatch(/^कल, /);
  });

  it('is empty for a time it cannot read, rather than "Invalid Date"', () => {
    expect(viewerWhen('', 'en', tFor('en'), NOW)).toBe('');
    expect(viewerWhen('not a date', 'en', tFor('en'), NOW)).toBe('');
  });

  it('counts yesterday across a month boundary', () => {
    const firstOfMonth = new Date(2026, 10, 1, 9, 0);
    expect(
      viewerWhen(new Date(2026, 9, 31, 20, 0).toISOString(), 'en', tFor('en'), firstOfMonth),
    ).toBe('Yesterday, 8:00 pm');
  });
});

describe('monthKey and monthHeading', () => {
  it('keys a month the same whatever the day', () => {
    expect(monthKey(new Date(2026, 9, 1).toISOString())).toBe(monthKey(new Date(2026, 9, 28).toISOString()));
    expect(monthKey(new Date(2026, 9, 1).toISOString())).not.toBe(
      monthKey(new Date(2025, 9, 1).toISOString()),
    );
    expect(monthKey('junk')).toBe('unknown');
  });

  it('calls this month "This month" and the rest by name and year', () => {
    const t = tFor('en');
    expect(monthHeading(new Date(2026, 9, 3).toISOString(), 'en', t, NOW)).toBe('This month');
    expect(monthHeading(new Date(2026, 8, 30).toISOString(), 'en', t, NOW)).toBe('September 2026');
    expect(monthHeading(new Date(2025, 9, 3).toISOString(), 'en', t, NOW)).toBe('October 2025');
  });

  it('is not fooled by the same month of another year', () => {
    expect(monthHeading(new Date(2025, 9, 12).toISOString(), 'en', tFor('en'), NOW)).not.toBe(
      'This month',
    );
  });

  it('says "इस महीने" in Hindi', () => {
    expect(monthHeading(new Date(2026, 9, 3).toISOString(), 'hi', tFor('hi'), NOW)).toBe('इस महीने');
  });
});

describe('shortDate', () => {
  it('writes day, month and year', () => {
    expect(shortDate(new Date(2024, 2, 5).toISOString(), 'en')).toBe('5 Mar 2024');
    expect(shortDate('junk', 'en')).toBe('');
  });
});
