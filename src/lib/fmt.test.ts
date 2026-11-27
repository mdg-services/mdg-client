import { describe, expect, it } from 'vitest';

import {
  daysUntil,
  fmtDate,
  fmtDay,
  fmtDays,
  fmtInt,
  fmtLitres,
  fmtMoney,
  fmtTime,
  fmtWeekday,
  indiaDay,
  weekdayLetter,
} from './fmt';

// 27 Nov 2026, 10:00 on the India clock.
const NOW = new Date('2026-11-27T04:30:00.000Z');

describe('fmtInt', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1,000'],
    [24330, '24,330'],
    [100000, '1,00,000'],
    [118000, '1,18,000'],
    [12345678, '1,23,45,678'],
    [-118000, '-1,18,000'],
  ])('writes %d as %s', (n, out) => {
    expect(fmtInt(n)).toBe(out);
  });

  it('rounds to a whole number and never prints a "-0"', () => {
    expect(fmtInt(24330.6)).toBe('24,331');
    expect(fmtInt(-0.4)).toBe('0');
  });

  it('is the same in all three languages', () => {
    expect(fmtInt(118000, 'hi')).toBe('1,18,000');
    expect(fmtInt(118000, 'hl')).toBe('1,18,000');
    expect(fmtInt(118000, 'en')).toBe('1,18,000');
  });

  it('prints a dash, not "NaN", for something that is not a number', () => {
    expect(fmtInt(Number.NaN)).toBe('–');
    expect(fmtInt(Number.POSITIVE_INFINITY)).toBe('–');
  });
});

describe('fmtLitres', () => {
  it('says L in English and Hinglish, लीटर in Hindi', () => {
    expect(fmtLitres(24330, 'en')).toBe('24,330 L');
    expect(fmtLitres(24330, 'hl')).toBe('24,330 L');
    expect(fmtLitres(24330, 'hi')).toBe('24,330 लीटर');
  });

  it('drops decimals', () => {
    expect(fmtLitres(24329.7, 'en')).toBe('24,330 L');
  });
});

describe('fmtDays', () => {
  it('keeps one decimal for cover days and none for a whole count', () => {
    expect(fmtDays(4.2)).toBe('4.2');
    expect(fmtDays(4.24)).toBe('4.2');
    expect(fmtDays(5)).toBe('5');
    expect(fmtDays(4.96)).toBe('5');
    expect(fmtDays(0)).toBe('0');
  });
});

describe('fmtMoney', () => {
  it('takes paise: Rs 1,18,000 in English and Hinglish, ₹1,18,000 in Hindi', () => {
    expect(fmtMoney(11800000, 'en')).toBe('Rs 1,18,000');
    expect(fmtMoney(11800000, 'hl')).toBe('Rs 1,18,000');
    expect(fmtMoney(11800000, 'hi')).toBe('₹1,18,000');
  });

  it('shows paise only when there are some', () => {
    expect(fmtMoney(354000, 'en')).toBe('Rs 3,540');
    expect(fmtMoney(354050, 'en')).toBe('Rs 3,540.50');
    expect(fmtMoney(5, 'hi')).toBe('₹0.05');
  });
});

describe('the India clock', () => {
  it('reads the day on the India clock, not the machine clock', () => {
    // 18:29 UTC is 23:59 in India; two minutes later it is already the next day there.
    expect(indiaDay(new Date('2026-11-26T18:29:00.000Z'))).toBe('2026-11-26');
    expect(indiaDay(new Date('2026-11-26T18:31:00.000Z'))).toBe('2026-11-27');
  });
});

describe('daysUntil', () => {
  it('counts whole days from today in India time', () => {
    expect(daysUntil('2026-11-27', NOW)).toBe(0);
    expect(daysUntil('2026-11-30', NOW)).toBe(3);
    expect(daysUntil('2026-11-25', NOW)).toBe(-2);
    expect(daysUntil('2026-12-27', NOW)).toBe(30);
    expect(daysUntil('2027-01-01', NOW)).toBe(35);
  });

  it('re-counts across midnight in India: the same date is one day nearer a minute later', () => {
    const before = new Date('2026-11-26T18:29:00.000Z'); // 23:59, 26 Nov
    const after = new Date('2026-11-26T18:31:00.000Z'); // 00:01, 27 Nov
    expect(daysUntil('2026-11-30', before)).toBe(4);
    expect(daysUntil('2026-11-30', after)).toBe(3);
  });

  it('turns a "3 days left" frozen two days ago into "1 day left" today', () => {
    const then = new Date('2026-11-25T05:00:00.000Z');
    expect(daysUntil('2026-11-28', then)).toBe(3);
    expect(daysUntil('2026-11-28', NOW)).toBe(1);
  });

  it('takes a full timestamp and uses the India day it falls on', () => {
    expect(daysUntil('2026-11-29T20:00:00.000Z', NOW)).toBe(3); // 01:30 on 30 Nov in India
    expect(daysUntil(new Date('2026-11-27T10:00:00.000Z'), NOW)).toBe(0);
  });

  it('says null for a date it cannot read, so nobody compares it as a number', () => {
    expect(daysUntil('not a day', NOW)).toBeNull();
  });
});

describe('fmtDay', () => {
  it('says today and yesterday in the reader\'s words', () => {
    expect(fmtDay('2026-11-27', 'en', NOW)).toBe('today');
    expect(fmtDay('2026-11-27', 'hi', NOW)).toBe('आज');
    expect(fmtDay('2026-11-27', 'hl', NOW)).toBe('Aaj');
    expect(fmtDay('2026-11-26', 'en', NOW)).toBe('yesterday');
    expect(fmtDay('2026-11-26', 'hi', NOW)).toBe('कल');
    expect(fmtDay('2026-11-26', 'hl', NOW)).toBe('Kal');
  });

  it('writes any other day as weekday, day and month, the same on every phone', () => {
    expect(fmtDay('2026-11-24', 'en', NOW)).toBe('Tue 24 Nov');
    expect(fmtDay('2026-11-24', 'hi', NOW)).toBe('मंगल 24 नवंबर');
    expect(fmtDay('2026-11-24', 'hl', NOW)).toBe('Mangalwar 24 Nov');
    expect(fmtDay('2026-03-02', 'en', NOW)).toBe('Mon 2 Mar');
  });

  it('decides today by the India clock', () => {
    const lateEveningInIndiaStillTheSameDay = new Date('2026-11-26T18:29:00.000Z');
    expect(fmtDay('2026-11-26', 'en', lateEveningInIndiaStillTheSameDay)).toBe('today');
    const justAfterMidnight = new Date('2026-11-26T18:31:00.000Z');
    expect(fmtDay('2026-11-26', 'en', justAfterMidnight)).toBe('yesterday');
  });

  it('prints a dash for a day it cannot read', () => {
    expect(fmtDay('garbage', 'en', NOW)).toBe('–');
  });
});

describe('weekdays', () => {
  it('names the weekday in full, for "last Monday"', () => {
    expect(fmtWeekday('2026-11-23', 'en')).toBe('Monday');
    expect(fmtWeekday('2026-11-23', 'hi')).toBe('सोमवार');
    expect(fmtWeekday('2026-11-23', 'hl')).toBe('Somwar');
  });

  it('gives one short mark per day for a strip', () => {
    expect(weekdayLetter('2026-11-23', 'en')).toBe('M');
    expect(weekdayLetter('2026-11-24', 'hi')).toBe('मं');
    expect(weekdayLetter('2026-11-29', 'hl')).toBe('R');
  });
});

describe('fmtTime', () => {
  it('writes a 12-hour time, on the India clock', () => {
    expect(fmtTime(new Date('2026-11-27T04:10:00.000Z'), 'en')).toBe('9:40 am');
    expect(fmtTime(new Date('2026-11-27T08:35:00.000Z'), 'en')).toBe('2:05 pm');
    expect(fmtTime(new Date('2026-11-27T06:30:00.000Z'), 'en')).toBe('12:00 pm');
    expect(fmtTime(new Date('2026-11-26T18:30:00.000Z'), 'en')).toBe('12:00 am');
  });

  it('says सुबह / subah for the morning, and the other parts of the day too', () => {
    const morning = new Date('2026-11-27T04:10:00.000Z');
    expect(fmtTime(morning, 'hi')).toBe('सुबह 9:40');
    expect(fmtTime(morning, 'hl')).toBe('subah 9:40');
    expect(fmtTime(new Date('2026-11-27T08:35:00.000Z'), 'hi')).toBe('दोपहर 2:05');
    expect(fmtTime(new Date('2026-11-27T11:30:00.000Z'), 'hi')).toBe('शाम 5:00');
    expect(fmtTime(new Date('2026-11-27T16:30:00.000Z'), 'hl')).toBe('raat 10:00');
  });

  // "Now" is 5:57 in the morning of 27 Nov, India time. Every row is a time on that same date.
  const EARLY = new Date('2026-11-27T00:27:00.000Z');
  const AT = {
    '00:11': new Date('2026-11-26T18:41:00.000Z'),
    '04:35': new Date('2026-11-26T23:05:00.000Z'),
    '12:20': new Date('2026-11-27T06:50:00.000Z'),
    '19:35': new Date('2026-11-27T14:05:00.000Z'),
  };

  it.each([
    ['00:11', 'hi', 'बीती रात 12:11'],
    ['04:35', 'hi', 'सुबह 4:35'],
    ['12:20', 'hi', 'दोपहर 12:20'],
    ['19:35', 'hi', 'शाम 7:35'],
    ['00:11', 'hl', 'beeti raat 12:11'],
    ['04:35', 'hl', 'subah 4:35'],
    ['12:20', 'hl', 'dopahar 12:20'],
    ['19:35', 'hl', 'shaam 7:35'],
    ['00:11', 'en', '12:11 am'],
    ['04:35', 'en', '4:35 am'],
    ['12:20', 'en', '12:20 pm'],
    ['19:35', 'en', '7:35 pm'],
  ] as const)('reads %s in %s as "%s" at 5:57 in the morning', (at, lang, want) => {
    expect(fmtTime(AT[at], lang, EARLY)).toBe(want);
  });

  it('says plain रात for a night time while it is still night, and for another day', () => {
    expect(fmtTime(AT['00:11'], 'hi', new Date('2026-11-26T19:30:00.000Z'))).toBe('रात 12:11'); // 1:00 am now
    expect(fmtTime('2026-11-25T18:41:00.000Z', 'hi', EARLY)).toBe('रात 12:11'); // 26 Nov, not today
    expect(fmtTime(new Date('2026-11-27T20:30:00.000Z'), 'hi', EARLY)).toBe('रात 2:00'); // tonight, after midnight
  });

  it('takes an ISO string too, and prints a dash for nonsense', () => {
    expect(fmtTime('2026-11-27T04:10:00.000Z', 'en')).toBe('9:40 am');
    expect(fmtTime('nope', 'en')).toBe('–');
  });
});

describe('fmtDate', () => {
  it('spells the month in full in Hindi and never uses an abbreviation from the phone', () => {
    expect(fmtDate('2026-11-26', 'hi')).toBe('26 नवंबर');
    expect(fmtDate('2026-11-26', 'en')).toBe('26 Nov');
    expect(fmtDate('2026-11-26', 'hl')).toBe('26 Nov');
    expect(fmtDate('nope', 'hi')).toBe('–');
    expect(fmtDate('2026-11-26', 'hi')).not.toContain('॰');
  });
});
