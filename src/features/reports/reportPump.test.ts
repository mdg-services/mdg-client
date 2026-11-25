import { describe, expect, it } from 'vitest';

import type { OutletsView, ReportDetail } from '@dk/shared/types';

import { headerPumpCode, hasSeveralPumps, normalizePumpCode, otherPumpOf, pumpFactsOf } from './reportPump';

const view: OutletsView = {
  current: { userId: 'u12', dealerId: 'd12', code: '12E', role: 'dealer-owner' },
  outlets: [{ userId: 'u15', dealerId: 'd15', code: '15E', role: 'dealer-owner' }],
};
const onePump: OutletsView = { current: view.current, outlets: [] };

describe('who a report is about, for a person with several pumps', () => {
  it('compares codes the way a person reads them', () => {
    expect(normalizePumpCode(' 12 e ')).toBe('12E');
    expect(normalizePumpCode(null)).toBe('');
  });

  it('only a person with another pump is asked about pumps at all', () => {
    expect(hasSeveralPumps(view)).toBe(true);
    expect(hasSeveralPumps(onePump)).toBe(false);
    expect(hasSeveralPumps(undefined)).toBe(false);
    expect(otherPumpOf(onePump, { code: '15E' })).toBeNull();
    expect(headerPumpCode(onePump, { code: '12E' })).toBeNull();
  });

  it('finds the other pump by the report\'s dealer id first, and returns the login to switch to', () => {
    expect(otherPumpOf(view, { dealerId: 'd15' })).toEqual({ code: '15E', choice: view.outlets[0] });
  });

  it('finds it by the code on the snapshot or the link, whatever the case', () => {
    expect(otherPumpOf(view, { code: '15e' })).toEqual({ code: '15E', choice: view.outlets[0] });
  });

  it('is null for this very pump, by id or by code', () => {
    expect(otherPumpOf(view, { dealerId: 'd12', code: '12E' })).toBeNull();
    expect(otherPumpOf(view, { code: '12e' })).toBeNull();
    expect(otherPumpOf(view, {})).toBeNull();
  });

  it('still names a pump the person has no login for, without a switch', () => {
    expect(otherPumpOf(view, { code: '99E' })).toEqual({ code: '99E' });
  });

  it('prints the report\'s own code in the header, else the pump signed in', () => {
    expect(headerPumpCode(view, { code: '15E' })).toBe('15E');
    expect(headerPumpCode(view, {})).toBe('12E');
  });

  it('reads the pump facts: the server\'s detail, then the snapshot, then the link', () => {
    const detail = { dealerId: 'd15', outletCode: '15E' } as unknown as ReportDetail;
    expect(pumpFactsOf(detail, undefined, '99E')).toEqual({ dealerId: 'd15', code: '15E' });
    expect(pumpFactsOf(undefined, { kind: 'stock_check', outletCode: '16E' } as never, '99E')).toEqual({ code: '16E' });
    expect(pumpFactsOf(undefined, undefined, '99E')).toEqual({ code: '99E' });
    expect(pumpFactsOf(undefined, undefined)).toEqual({});
    // A snapshot with no code (a declaration may have none) falls through to the link.
    expect(pumpFactsOf(undefined, { kind: 'du_otp', outletCode: null } as never, '99E')).toEqual({ code: '99E' });
  });
});
