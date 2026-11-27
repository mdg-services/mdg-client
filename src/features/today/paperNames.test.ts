import { describe, expect, it } from 'vitest';

import { paperData } from '@/features/glance/glanceFixtures';
import type { PaperExpiryData } from '@dk/shared/types';

import { PAPER_ATTENTION_DAYS, paperNameOf, paperStatusOf, soonestPaperDays } from './paperNames';

describe('paperStatusOf: the one rule', () => {
  it.each([
    [-1, 'problem'],
    [0, 'attention'],
    [9, 'attention'],
    [PAPER_ATTENTION_DAYS - 1, 'attention'],
    [PAPER_ATTENTION_DAYS, 'ok'],
    [90, 'ok'],
  ] as const)('%i days left is %s', (days, status) => {
    expect(paperStatusOf(days)).toBe(status);
  });
});

describe('paperNameOf', () => {
  it('names Fire NOC in every language whichever way the portal spelled it', () => {
    for (const docType of ['fire_noc', 'fire-noc', 'Fire NOC']) {
      expect(paperNameOf({ docType, docLabel: 'Fire NOC' }, 'hi')).toBe('फ़ायर एनओसी');
      expect(paperNameOf({ docType, docLabel: 'Fire NOC' }, 'hl')).toBe('Fire NOC');
      expect(paperNameOf({ docType, docLabel: 'Fire NOC' }, 'en')).toBe('Fire NOC');
    }
  });
  it('names the Weights & Measures licence from its label when the code is unknown', () => {
    expect(paperNameOf({ docType: 'other', docLabel: 'Weights & Measures licence' }, 'hi')).toBe('वज़न-माप का लाइसेंस');
    expect(paperNameOf({ docType: 'wm_licence', docLabel: '' }, 'hl')).toBe('Wazan-maap ka licence');
  });
  it('falls back to the paper view\'s names, then the portal\'s label', () => {
    expect(paperNameOf({ docType: 'road-permit', docLabel: 'Road permit' }, 'hi')).toBe('रोड परमिट');
    expect(paperNameOf({ docType: 'mystery', docLabel: 'Mystery paper' }, 'hi')).toBe('Mystery paper');
  });
});

describe('soonestPaperDays', () => {
  it('counts again from the date, and takes the stored count when there is no date', () => {
    const now = new Date('2026-11-27T04:10:00.000Z');
    const data = paperData([
      { daysLeft: 20, validUntil: '2026-12-06' },
      { daysLeft: 50, validUntil: '2027-01-20' },
    ]) as unknown as PaperExpiryData;
    expect(soonestPaperDays(data, now)).toBe(9);
    const undated = paperData([{ daysLeft: 12 }]) as unknown as PaperExpiryData;
    expect(soonestPaperDays(undated, now)).toBe(12);
    expect(soonestPaperDays({ ...data, items: [] }, now)).toBeNull();
  });
});
