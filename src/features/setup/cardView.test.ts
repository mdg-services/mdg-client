import { describe, expect, it } from 'vitest';

import { GSTIN_HARYANA, GSTIN_MAHARASHTRA } from '@/test/setupFixtures';
import { GST_STATES } from '@dk/shared';
import { SETUP_SERVICE_OPTIONS } from '@dk/shared/types';

import {
  GST_STATE_HI,
  checkGstin,
  dependentsOf,
  formatDay,
  formatRupees,
  stateLabel,
  stateOptions,
  toggleService,
} from './cardView';

const O = SETUP_SERVICE_OPTIONS;

describe('toggleService', () => {
  it('ticking a service ticks what it needs, in card order', () => {
    expect(toggleService(O, [], 'load-planner')).toEqual(['dsr-report', 'load-planner']);
    expect(toggleService(O, [], 'ro-supply-status')).toEqual([
      'water-ingress-testing',
      'ro-supply-status',
    ]);
  });

  it('keeps what was already ticked, and card order, not tap order', () => {
    expect(toggleService(O, ['tt-density'], 'dsr-report')).toEqual(['dsr-report', 'tt-density']);
  });

  it('a service another ticked one needs cannot be unticked', () => {
    const ticked = toggleService(O, [], 'load-planner');
    expect(toggleService(O, ticked, 'dsr-report')).toEqual(ticked);
    expect(dependentsOf(O, ticked, 'dsr-report')).toEqual(['load-planner']);
  });

  it('unticking the one that needed it frees the other, which stays ticked', () => {
    const ticked = toggleService(O, [], 'load-planner');
    const after = toggleService(O, ticked, 'load-planner');
    expect(after).toEqual(['dsr-report']);
    expect(dependentsOf(O, after, 'dsr-report')).toEqual([]);
    expect(toggleService(O, after, 'dsr-report')).toEqual([]);
  });
});

describe('checkGstin', () => {
  it('nothing typed is fine: a GSTIN is optional', () => {
    expect(checkGstin('')).toEqual({ state: 'empty' });
    expect(checkGstin('  - ')).toEqual({ state: 'empty' });
  });

  it('a half-typed one is partial, with how far it has got', () => {
    expect(checkGstin('06ABCDE')).toEqual({ state: 'partial', length: 7 });
  });

  it('a right one is ok, cleaned, with its state', () => {
    expect(checkGstin(` ${GSTIN_HARYANA.toLowerCase()} `)).toEqual({
      state: 'ok',
      gstin: GSTIN_HARYANA,
      stateCode: '06',
    });
    expect(checkGstin(GSTIN_MAHARASHTRA)).toMatchObject({ state: 'ok', stateCode: '27' });
  });

  it('one mistyped character, or one too long, is bad', () => {
    const wrong = `${GSTIN_HARYANA.slice(0, 14)}${GSTIN_HARYANA[14] === '0' ? '1' : '0'}`;
    expect(checkGstin(wrong)).toMatchObject({ state: 'bad', length: 15 });
    expect(checkGstin(`${GSTIN_HARYANA}1`)).toMatchObject({ state: 'bad', length: 16 });
  });
});

describe('states', () => {
  it('names every state in Hindi', () => {
    for (const code of stateOptions('en').map((s) => s.code)) {
      expect(GST_STATE_HI[code], code).toBeTruthy();
    }
  });

  it('Hindi shows both names, English one', () => {
    expect(stateLabel('06', 'hi')).toBe('हरियाणा (Haryana)');
    expect(stateLabel('06', 'en')).toBe('Haryana');
    expect(stateLabel('99', 'en')).toBe('99');
  });

  it('lists every state the GST list has, alphabetical in English', () => {
    const en = stateOptions('en');
    expect(en).toHaveLength(Object.keys(GST_STATES).length);
    expect(en[0]!.label).toBe('Andaman and Nicobar Islands');
    expect(en.map((s) => s.label)).toEqual([...en.map((s) => s.label)].sort((a, b) => a.localeCompare(b)));
  });
});

describe('the bill', () => {
  it('formats rupees with Indian grouping, paise only when there are some', () => {
    expect(formatRupees(354000)).toBe('₹3,540');
    expect(formatRupees(12345600)).toBe('₹1,23,456');
    expect(formatRupees(354050)).toBe('₹3,540.50');
  });

  it('formats a day from its parts, in the reader\'s language', () => {
    expect(formatDay('2026-11-02', 'en')).toBe('2 November');
    expect(formatDay('2026-11-02', 'hi')).toBe('2 नवंबर');
    expect(formatDay(null, 'en')).toBe('');
    expect(formatDay('soon', 'en')).toBe('');
  });
});
