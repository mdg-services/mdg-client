import { describe, expect, it, vi } from 'vitest';

import { translate } from '@/lib/i18n';
import type { TodayReport } from '@dk/shared/types';

vi.mock('./registry', () => {
  const fake = {
    Overlay: () => null,
    Glyph: () => null,
    tile: () => null,
    alert: (data: { alert?: 'problem' | 'attention' }) =>
      data.alert ? { headline: 'h', line: 'l', severity: data.alert } : null,
    headline: (data: { kind: string }) => `line:${data.kind}`,
    share: () => '',
  };
  return { viewOfData: () => fake, getKindView: () => fake, KIND_VIEWS: {} };
});

const { groupHistory, rowHeadline, rowStatus, dataOfRow } = await import('./reportsHistoryView');

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('en', k, v);
// 24 Nov 2026, 11:00 in India.
const NOW = new Date('2026-11-24T05:30:00.000Z');

let n = 0;
function row(over: Partial<TodayReport> = {}): TodayReport {
  n += 1;
  return {
    id: `m${n}`,
    kind: 'dsr_sales',
    status: 'ok',
    sentAt: '2026-11-24T04:00:00.000Z',
    headline: 'the words',
    attachments: [],
    conversationId: 'c1',
    messageId: `m${n}`,
    ...over,
  };
}

describe('groupHistory', () => {
  it('groups by the Indian day sent, newest first, headed in words', () => {
    const groups = groupHistory(
      [
        row({ sentAt: '2026-11-24T04:00:00.000Z' }),
        row({ sentAt: '2026-11-23T10:00:00.000Z' }),
        row({ sentAt: '2026-11-22T10:00:00.000Z' }),
        row({ sentAt: '2026-11-22T04:00:00.000Z' }),
      ],
      NOW,
      'en',
      t,
    );
    expect(groups.map((g) => g.heading)).toEqual(['Today', 'Yesterday', 'Sun, 22 Nov']);
    expect(groups.map((g) => g.rows.length)).toEqual([1, 1, 2]);
  });

  it('puts a message sent just after midnight India time under the new day, not the UTC one', () => {
    // 19:00 UTC on the 23rd is half past midnight on the 24th in India: still "Today".
    const [g] = groupHistory([row({ sentAt: '2026-11-23T19:00:00.000Z' })], NOW, 'en', t);
    expect(g!.heading).toBe('Today');
    expect(g!.day).toBe('2026-11-24');
  });

  it('words the headings in the reader\'s language', () => {
    const hi = groupHistory([row()], NOW, 'hi', (k, v) => translate('hi', k, v));
    expect(hi[0]!.heading).toBe('आज');
    const hl = groupHistory([row({ sentAt: '2026-11-22T04:00:00.000Z' })], NOW, 'hl', (k, v) => translate('hl', k, v));
    expect(hl[0]!.heading).toBe('Sun, 22 Nov');
  });

  it('marks the older of two reports of a once-a-day kind for the same business day as replaced', () => {
    const newer = row({ kind: 'dsr_sales', day: '2026-11-23', sentAt: '2026-11-24T05:00:00.000Z' });
    const older = row({ kind: 'dsr_sales', day: '2026-11-23', sentAt: '2026-11-24T03:00:00.000Z' });
    const otherDay = row({ kind: 'dsr_sales', day: '2026-11-22', sentAt: '2026-11-23T05:00:00.000Z' });
    const rows = groupHistory([newer, older, otherDay], NOW, 'en', t).flatMap((g) => g.rows);
    expect(rows.map((r) => r.replaced)).toEqual([false, true, false]);
  });

  it('never calls two tanker receipts, or two reports with no day, replaced: they are different reports', () => {
    const rows = groupHistory(
      [
        row({ kind: 'tt_ack', day: '2026-11-23' }),
        row({ kind: 'tt_ack', day: '2026-11-23' }),
        row({ kind: 'ledger_watch' }),
        row({ kind: 'ledger_watch' }),
      ],
      NOW,
      'en',
      t,
    ).flatMap((g) => g.rows);
    expect(rows.every((r) => !r.replaced)).toBe(true);
  });

  it('tags a revised DSR as corrected, and a message with no snapshot but a picture as a picture', () => {
    const revised = row({ kind: 'dsr_sales', data: { kind: 'dsr_sales', v: 1, revised: true } as never });
    const plain = row({ kind: 'dsr_sales', data: { kind: 'dsr_sales', v: 1, revised: false } as never });
    const old = row({
      kind: 'dsr_variation',
      attachments: [{ storageKey: 'k', filename: 'a.png', contentType: 'image/png', size: 1, kind: 'image', url: '' }],
    });
    const wordsOnly = row({ kind: 'announcement' });
    const rows = groupHistory([revised, plain, old, wordsOnly], NOW, 'en', t).flatMap((g) => g.rows);
    expect(rows.map((r) => r.corrected)).toEqual([true, false, false, false]);
    expect(rows.map((r) => r.picture)).toEqual([false, false, true, false]);
  });

  it('is empty for no reports', () => {
    expect(groupHistory([], NOW, 'en', t)).toEqual([]);
  });
});

describe('a row\'s status and line', () => {
  it('uses the kind\'s own verdict first, then the report\'s tag', () => {
    expect(rowStatus(row({ status: 'ok', data: { kind: 'dsr_sales', v: 1, alert: 'problem' } as never }), 'en')).toBe('problem');
    expect(rowStatus(row({ status: 'attention', data: { kind: 'dsr_sales', v: 1 } as never }), 'en')).toBe('attention');
    expect(rowStatus(row({ status: 'info' }), 'en')).toBe('info');
  });

  it('says the kind\'s headline for a snapshot, and the message\'s own words for an old report', () => {
    expect(rowHeadline(row({ data: { kind: 'dsr_sales', v: 1 } as never }), 'en')).toBe('line:dsr_sales');
    expect(rowHeadline(row({ headline: 'Aaj ki DSR' }), 'en')).toBe('Aaj ki DSR');
  });

  it('does not trust a snapshot of the wrong version or kind', () => {
    expect(dataOfRow(row({ data: { kind: 'dsr_sales', v: 2 } as never }))).toBeUndefined();
    expect(dataOfRow(row({ kind: 'dsr_sales', data: { kind: 'credit_dod', v: 1 } as never }))).toBeUndefined();
    expect(rowHeadline(row({ headline: 'words', data: { kind: 'dsr_sales', v: 9 } as never }), 'en')).toBe('words');
  });
});
