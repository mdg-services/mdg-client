import { describe, expect, it } from 'vitest';

import {
  MINUS,
  clockWords,
  dayAndTime,
  dayWords,
  daysBetween,
  daysFromToday,
  fuelColor,
  fuelName,
  indian,
  istDay,
  joinList,
  lastWeekday,
  litres,
  pct,
  signed,
  signedLitres,
  tanksWords,
  timeWords,
  weekdayAndDate,
} from './fmt';

describe('fmt: numbers', () => {
  it('groups digits the Indian way', () => {
    expect(indian(0)).toBe('0');
    expect(indian(999)).toBe('999');
    expect(indian(1000)).toBe('1,000');
    expect(indian(10430)).toBe('10,430');
    expect(indian(124000)).toBe('1,24,000');
    expect(indian(12345678)).toBe('1,23,45,678');
  });

  it('keeps one decimal only when it is not zero', () => {
    expect(indian(0.4, 1)).toBe('0.4');
    expect(indian(6.0, 1)).toBe('6');
    expect(indian(123.45, 1)).toBe('123.5');
  });

  it('writes a true minus, never a dash, and never "-0"', () => {
    expect(signed(-310)).toBe(`${MINUS}310`);
    expect(MINUS).toBe('−');
    expect(signed(120)).toBe('+120');
    expect(signed(0)).toBe('0');
    expect(signed(-0.4)).toBe('0');
    expect(signedLitres(-1240)).toBe(`${MINUS}1,240 L`);
    expect(indian(-0.0001, 1)).toBe('0');
  });

  it('rounds litres to whole numbers', () => {
    expect(litres(10429.6)).toBe('10,430 L');
  });

  it('keeps the two decimals of the allowance rates (0.25, 0.75, 0.2), never rounding them to one', () => {
    expect(pct(0.25)).toBe('0.25%');
    expect(pct(0.75)).toBe('0.75%');
    expect(pct(0.2)).toBe('0.2%');
    expect(pct(0.6)).toBe('0.6%');
  });

  it('trims a percentage', () => {
    expect(pct(4)).toBe('4%');
    expect(pct(0.5)).toBe('0.5%');
    expect(pct(2.004)).toBe('2%');
    expect(pct(2.04)).toBe('2.04%');
  });
});

describe('fmt: days and clocks', () => {
  it('names days in words in each language', () => {
    expect(dayWords('2026-11-23', 'en')).toBe('23 Nov');
    expect(dayWords('2026-11-23', 'hl')).toBe('23 Nov');
    expect(dayWords('2026-11-23', 'hi')).toBe('23 नवंबर');
    expect(dayWords('not a day', 'en')).toBe('not a day');
  });

  it('knows the weekday of a day', () => {
    expect(weekdayAndDate('2026-11-23', 'en')).toBe('Mon 23');
    expect(lastWeekday('2026-11-16', 'en')).toBe('last Monday');
    expect(lastWeekday('2026-11-16', 'hl')).toBe('pichhle Monday');
    expect(lastWeekday('2026-11-16', 'hi')).toBe('पिछले सोमवार');
  });

  it('reads an instant on the IST clock whatever the phone zone is', () => {
    // 13:35 UTC is 19:05 in India.
    expect(timeWords('2026-11-24T13:35:00.000Z', 'en')).toBe('7:05 pm');
    expect(timeWords('2026-11-24T13:35:00.000Z', 'hi')).toBe('रात 7:05');
    expect(timeWords('2026-11-24T04:44:00.000Z', 'en')).toBe('10:14 am');
    // 19:00 UTC is already the next IST day.
    expect(istDay('2026-11-24T19:00:00.000Z')).toBe('2026-11-25');
    expect(dayAndTime('2026-11-24T04:44:00.000Z', 'en')).toBe('24 Nov, 10:14 am');
    expect(timeWords('garbage', 'en')).toBe('');
  });

  it('reads a clock string and midnight and noon', () => {
    expect(clockWords('16:00', 'en')).toBe('4:00 pm');
    expect(clockWords('00:05', 'en')).toBe('12:05 am');
    expect(clockWords('12:00', 'en')).toBe('12:00 pm');
  });

  it('counts days between two days', () => {
    expect(daysBetween('2026-11-22', '2026-11-24')).toBe(2);
    expect(daysBetween('2026-11-30', '2026-12-02')).toBe(2);
    expect(daysBetween('2026-11-24', '2026-11-22')).toBe(-2);
  });
});

describe('fmt: lists and fuels', () => {
  it('joins a list in the reader’s language', () => {
    expect(joinList(['A'], 'en')).toBe('A');
    expect(joinList(['A', 'B'], 'en')).toBe('A and B');
    expect(joinList(['A', 'B', 'C'], 'hl')).toBe('A, B aur C');
    expect(joinList(['A', 'B'], 'hi')).toBe('A और B');
  });

  it('names the known fuels and passes an unknown one through', () => {
    expect(fuelName('HSD', 'en')).toBe('Diesel');
    expect(fuelName('MS', 'hi')).toBe('पेट्रोल');
    expect(fuelName('xp', 'hl')).toBe('XP95 petrol');
    expect(fuelName('SPEED97', 'en')).toBe('SPEED97');
    expect(fuelColor('HSD')).toBe('var(--fuel-diesel)');
    expect(fuelColor('MS')).toBe('var(--fuel-petrol)');
    expect(fuelColor('ZZ')).toBe('var(--fuel-other)');
  });

  it('writes tank numbers', () => {
    expect(tanksWords([4, 6, 8], 'en')).toBe('tanks 4, 6, 8');
    expect(tanksWords([1], 'en')).toBe('tank 1');
    expect(tanksWords([], 'en')).toBe('');
  });
});

describe('fmt: days from today', () => {
  // 24 Nov 2026, 9 am in India (03:30 UTC).
  const now = Date.parse('2026-11-24T03:30:00.000Z');

  it('counts whole Indian calendar days from today: tomorrow 1, today 0, before today negative', () => {
    expect(daysFromToday('2026-11-25', now)).toBe(1);
    expect(daysFromToday('2026-11-24', now)).toBe(0);
    expect(daysFromToday('2026-11-22', now)).toBe(-2);
    expect(daysFromToday('2026-12-24', now)).toBe(30);
  });

  it('goes by the day in India, not in UTC: 11:30 pm UTC is already tomorrow there', () => {
    const lateUtc = Date.parse('2026-11-24T20:00:00.000Z'); // 1:30 am on the 25th in India
    expect(daysFromToday('2026-11-25', lateUtc)).toBe(0);
  });

  it('is null for a missing or unreadable day', () => {
    expect(daysFromToday(null, now)).toBeNull();
    expect(daysFromToday(undefined, now)).toBeNull();
    expect(daysFromToday('soon', now)).toBeNull();
  });
});
