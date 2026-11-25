import { describe, expect, it } from 'vitest';

import { translate } from '@/lib/i18n';
import type { ReportData, ReportDetail } from '@dk/shared/types';

import {
  asOfInstant,
  asOfLabel,
  blockedForRole,
  clockWords,
  dayWords,
  emptyStateFor,
  isPartial,
  istDayOf,
  pickBanner,
} from './reportView';

const detail = (over: Partial<ReportDetail> = {}, live: ReportDetail['live'] = {}): ReportDetail => ({
  id: 'm1',
  kind: 'dsr_sales',
  status: 'ok',
  sentAt: '2026-11-24T05:00:00.000Z',
  headline: 'x',
  attachments: [],
  conversationId: 'c1',
  messageId: 'm1',
  ...over,
  live,
});

describe('dates and times, in India and in words', () => {
  it('writes a business day with its weekday in each language', () => {
    expect(dayWords('2026-11-24', 'en')).toBe('Tue, 24 Nov');
    expect(dayWords('2026-11-24', 'hl')).toBe('Tue, 24 Nov');
    // Hindi reads in Devanagari.
    expect(dayWords('2026-11-24', 'hi')).toMatch(/[ऀ-ॿ]/);
    expect(dayWords('2026-11-24', 'hi')).toContain('24');
  });

  it('is empty for anything that is not a day', () => {
    expect(dayWords(undefined, 'en')).toBe('');
    expect(dayWords('24 Nov', 'en')).toBe('');
    expect(dayWords('', 'en')).toBe('');
  });

  it('reads the clock in India whatever zone the phone is in', () => {
    // 04:44 UTC is 10:14 in India.
    expect(clockWords('2026-11-24T04:44:00.000Z', 'en').toLowerCase()).toBe('10:14 am');
    expect(clockWords('nonsense', 'en')).toBe('');
  });

  it('finds the Indian calendar day of an instant, across midnight', () => {
    // 19:00 UTC on the 23rd is half past midnight on the 24th in India.
    expect(istDayOf('2026-11-23T19:00:00.000Z')).toBe('2026-11-24');
    expect(istDayOf('2026-11-23T17:00:00.000Z')).toBe('2026-11-23');
  });
});

describe('as-of', () => {
  it('prefers the snapshot\'s own stamp, then a full-instant asOf, then the time sent', () => {
    expect(asOfInstant({ kind: 'dsr_sales', capturedAt: '2026-11-24T04:44:00.000Z' } as unknown as ReportData, 'sent')).toBe(
      '2026-11-24T04:44:00.000Z',
    );
    // A credit position's asOf is a day, not an instant: it is not a time to print.
    expect(asOfInstant({ kind: 'credit_dod', asOf: '2026-11-24' } as unknown as ReportData, 'sent')).toBe('sent');
    expect(asOfInstant({ kind: 'stock_check', asOf: '2026-11-24T04:44:00.000Z' } as unknown as ReportData, 'sent')).toBe(
      '2026-11-24T04:44:00.000Z',
    );
    expect(asOfInstant(undefined, 'sent')).toBe('sent');
  });

  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars);

  it('prints only the time when it is today, and the day with it when it is not', () => {
    const now = new Date('2026-11-24T10:00:00.000Z');
    expect(asOfLabel('2026-11-24T04:44:00.000Z', now, 'en', t).toLowerCase()).toBe('as of 10:14 am');
    expect(asOfLabel('2026-11-22T04:44:00.000Z', now, 'en', t).toLowerCase()).toBe('as of 22 nov, 10:14 am');
  });

  it('says it in the reader\'s language', () => {
    const now = new Date('2026-11-24T10:00:00.000Z');
    expect(asOfLabel('2026-11-24T04:44:00.000Z', now, 'hi', (k, v) => translate('hi', k, v))).toMatch(/तक/);
    expect(asOfLabel('2026-11-24T04:44:00.000Z', now, 'hl', (k, v) => translate('hl', k, v))).toMatch(/tak/);
  });
});

describe('pickBanner — one strip, in the ADR\'s order', () => {
  const offline = { goneNow: false, offline: true };
  const none = { goneNow: false, offline: false };

  it('is nothing for a report with nothing to say', () => {
    expect(pickBanner({ detail: detail(), data: undefined, ...none })).toBeNull();
  });

  it('puts "removed" first, whether the copy says so or the server just did', () => {
    const all = detail({}, { deleted: true, newerMessageId: 'm2', corrected: true });
    expect(pickBanner({ detail: all, data: undefined, ...offline })).toEqual({ kind: 'deleted' });
    expect(pickBanner({ detail: detail({}, { newerMessageId: 'm2' }), data: undefined, goneNow: true, offline: false })).toEqual({
      kind: 'deleted',
    });
  });

  it('then "newer exists", pointing at the newer report (in its own chat when it is in another)', () => {
    const d = detail({}, { newerMessageId: 'm2', newerConversationId: 'c2', corrected: true });
    expect(pickBanner({ detail: d, data: undefined, ...offline })).toEqual({
      kind: 'newer',
      target: { conversationId: 'c2', messageId: 'm2' },
    });
    expect(pickBanner({ detail: detail({}, { newerMessageId: 'm2' }), data: undefined, ...none })).toEqual({
      kind: 'newer',
      target: { conversationId: 'c1', messageId: 'm2' },
    });
  });

  it('then "corrected", then "partly worked out", then "offline"', () => {
    const partial = { kind: 'dsr_sales', products: [{ sales: { state: 'pending' } }] } as unknown as ReportData;
    expect(pickBanner({ detail: detail({}, { corrected: true }), data: partial, ...offline })).toEqual({ kind: 'corrected' });
    expect(pickBanner({ detail: detail(), data: partial, ...offline })).toEqual({ kind: 'partial' });
    expect(pickBanner({ detail: detail(), data: undefined, ...offline })).toEqual({ kind: 'offline' });
  });
});

describe('isPartial', () => {
  it('is true while a DSR\'s sales are not worked out, in either DSR kind', () => {
    const pending = { products: [{ sales: { state: 'closed' } }, { sales: { state: 'pending' } }] };
    expect(isPartial({ kind: 'dsr_sales', ...pending } as unknown as ReportData)).toBe(true);
    expect(isPartial({ kind: 'dsr_variation', ...pending } as unknown as ReportData)).toBe(true);
    expect(isPartial({ kind: 'dsr_sales', products: [{ sales: { state: 'closed' } }] } as unknown as ReportData)).toBe(false);
  });

  it('is true for a supply status read in part, and false for everything else', () => {
    expect(isPartial({ kind: 'ro_supply', read: 'partial' } as unknown as ReportData)).toBe(true);
    expect(isPartial({ kind: 'ro_supply', read: 'ok' } as unknown as ReportData)).toBe(false);
    expect(isPartial({ kind: 'kavach' } as unknown as ReportData)).toBe(false);
    expect(isPartial(undefined)).toBe(false);
  });
});

describe('what a report that will not open says', () => {
  it('knows the owner\'s kinds', () => {
    expect(blockedForRole('credit_dod', 'dealer-staff')).toBe(true);
    expect(blockedForRole('ledger_watch', 'dealer-staff')).toBe(true);
    expect(blockedForRole('calibration_claim', 'dealer-staff')).toBe(true);
    expect(blockedForRole('credit_dod', 'dealer-owner')).toBe(false);
    expect(blockedForRole('dsr_sales', 'dealer-staff')).toBe(false);
  });

  it('gone, offline and error are what they say', () => {
    expect(emptyStateFor('gone', {})).toBe('gone');
    expect(emptyStateFor('offline', {})).toBe('offline');
    expect(emptyStateFor('other', {})).toBe('error');
  });

  it('a 404 is "owner only" to a manager only for a kind that is the owner\'s, and "not here" otherwise', () => {
    expect(emptyStateFor('not_available', { role: 'dealer-staff', kind: 'credit_dod' })).toBe('owner_only');
    // No kind to go by (a push opened cold, maybe another pump's): never a wrong reason.
    expect(emptyStateFor('not_available', { role: 'dealer-staff' })).toBe('not_here');
    expect(emptyStateFor('not_available', { role: 'dealer-staff', kind: 'dsr_sales' })).toBe('not_here');
    expect(emptyStateFor('not_available', { role: 'dealer-owner', kind: 'credit_dod' })).toBe('not_here');
    expect(emptyStateFor('not_available', { role: 'dealer-owner' })).toBe('not_here');
  });
});
