import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ReportData, TodayFeed, TodayReport, TodayTask } from '@dk/shared/types';

import {
  doneReports,
  greetingName,
  isPhotoTask,
  newReportsFor,
  salesSheetOf,
  taskActionLabel,
  taskCoversReport,
  usableData,
} from './todayView';

/** A snapshot with only the envelope: the page never reads past it, the kind's own view does. */
const snap = (kind: string, extra: Record<string, unknown> = {}): ReportData =>
  ({ kind, v: 1, ...extra }) as unknown as ReportData;

function report(over: Partial<TodayReport> = {}): TodayReport {
  return {
    id: 'r',
    kind: 'dsr_sales',
    status: 'ok',
    day: '2026-11-24',
    sentAt: '2026-11-24T06:00:00.000Z',
    headline: 'Sales report',
    attachments: [],
    conversationId: 'c1',
    messageId: 'm1',
    ...over,
  };
}

function task(over: Partial<TodayTask> = {}): TodayTask {
  return {
    id: 't1',
    kind: 'ask',
    title: 'Send a photo',
    since: '2026-11-24T06:00:00.000Z',
    conversationId: 'c1',
    messageId: 'm-ask',
    ...over,
  };
}

function feed(over: Partial<TodayFeed> = {}): TodayFeed {
  return { day: '2026-11-24', role: 'owner', tasks: [], reports: [], done: [], ...over };
}

describe('usableData', () => {
  it('hands back a snapshot of the right kind and version', () => {
    const data = snap('dsr_sales');
    expect(usableData(report({ data }), true)).toBe(data);
  });

  it('treats a snapshot of a version this build does not know as none, never half a drawing', () => {
    expect(usableData(report({ data: { kind: 'dsr_sales', v: 2 } as unknown as ReportData }), true)).toBeUndefined();
  });

  it('treats a snapshot whose kind differs from the tag as none', () => {
    expect(usableData(report({ kind: 'dsr_sales', data: snap('stock_check') }), true)).toBeUndefined();
  });

  it('treats a report with no snapshot as none (an older message)', () => {
    expect(usableData(report(), true)).toBeUndefined();
  });

  it("keeps a manager away from the owner's own kinds, whatever the server sent", () => {
    const credit = report({ kind: 'credit_dod', data: snap('credit_dod') });
    expect(usableData(credit, true)).toBeDefined();
    expect(usableData(credit, false)).toBeUndefined();
  });
});

describe('what a task button does', () => {
  it('a photo ask is answered here, and says whether a PDF will do', () => {
    const photo = task({ action: { type: 'photo', askRef: 'doc:1', acceptsFile: false } });
    const paper = task({ action: { type: 'photo', askRef: 'doc:2', acceptsFile: true } });
    expect(isPhotoTask(photo)).toBe(true);
    expect(taskActionLabel(photo)).toBe('photo');
    expect(taskActionLabel(paper)).toBe('file');
  });

  it('every other box opens the chat, and a missing action reads as that (an older server)', () => {
    expect(isPhotoTask(task())).toBe(false);
    expect(isPhotoTask(task({ action: { type: 'open_chat' } }))).toBe(false);
    expect(taskActionLabel(task({ kind: 'du_otp', action: { type: 'open_chat' } }))).toBe('open');
  });

  it('a photo action with no reference is not trusted to send anywhere', () => {
    expect(isPhotoTask(task({ action: { type: 'photo', askRef: '', acceptsFile: false } }))).toBe(false);
  });

  it('names the login and order boxes by what they are', () => {
    for (const kind of ['portal_login', 'wemmis_login', 'password_pick'] as const) {
      expect(taskActionLabel(task({ kind }))).toBe('login');
    }
    expect(taskActionLabel(task({ kind: 'fuel_confirm' }))).toBe('order');
  });
});

describe('salesSheetOf', () => {
  const both = snap('dsr_variation', {
    sheets: ['variation', 'sales'],
    capturedAt: '2026-11-24T05:00:00.000Z',
    outletCode: '12E',
    businessDate: '2026-11-23',
    shiftTime: '23:59',
    revised: false,
    products: [
      { key: 'diesel', tankNos: [1], variation: { v: 1 }, sales: { total: 10430 } },
      { key: 'petrol', tankNos: [2], variation: { v: 2 } },
    ],
  });

  it('reads the sales sheet out of a message that holds both, without the variation', () => {
    const sheet = salesSheetOf(both);
    expect(sheet).toMatchObject({ kind: 'dsr_sales', v: 1, outletCode: '12E', businessDate: '2026-11-23' });
    // Only the products that have a sales block; none carries a variation.
    expect(sheet?.products).toEqual([{ key: 'diesel', tankNos: [1], sales: { total: 10430 } }]);
  });

  it('is nothing for a message that holds only the variation, or for another kind', () => {
    expect(salesSheetOf(snap('dsr_variation', { sheets: ['variation'], products: [] }))).toBeUndefined();
    expect(salesSheetOf(snap('stock_check'))).toBeUndefined();
    expect(salesSheetOf(undefined)).toBeUndefined();
  });

  it('does not throw on a snapshot that has the envelope but not the parts (only the envelope is checked on the way in)', () => {
    expect(salesSheetOf(snap('dsr_variation'))).toBeUndefined();
    expect(salesSheetOf(snap('dsr_variation', { sheets: ['sales'] }))).toBeUndefined();
    expect(salesSheetOf(snap('dsr_variation', { sheets: ['sales'], products: [{ key: 'diesel', variation: {} }] }))).toBeUndefined();
  });
});

describe('newReportsFor / doneReports', () => {
  it('lists the newest reports first, and none a Needs-you row already opens', () => {
    const f = feed({
      reports: [
        report({ messageId: 'old', sentAt: '2026-11-22T06:00:00.000Z' }),
        report({ messageId: 'new', sentAt: '2026-11-24T06:00:00.000Z' }),
        report({ messageId: 'withData', kind: 'stock_check', data: snap('stock_check'), sentAt: '2026-11-23T08:00:00.000Z' }),
        report({ messageId: 'shown', sentAt: '2026-11-23T06:00:00.000Z' }),
      ],
    });
    expect(newReportsFor(f, true, new Set(['shown'])).map((r) => r.messageId)).toEqual(['new', 'withData', 'old']);
  });

  it("never lists an owner's own report to a manager", () => {
    const f = feed({ reports: [report({ messageId: 'c', kind: 'credit_dod' }), report({ messageId: 'd' })] });
    expect(newReportsFor(f, false, new Set()).map((r) => r.messageId)).toEqual(['d']);
    expect(newReportsFor(f, true, new Set()).map((r) => r.messageId).sort()).toEqual(['c', 'd']);
  });

  it('lists receipts newest first', () => {
    const f = feed({
      done: [
        report({ messageId: 'a', sentAt: '2026-11-24T01:00:00.000Z' }),
        report({ messageId: 'b', sentAt: '2026-11-24T09:00:00.000Z' }),
      ],
    });
    expect(doneReports(f).map((r) => r.messageId)).toEqual(['b', 'a']);
  });
});

describe('taskCoversReport', () => {
  it('says an open box already asks for what the DU OTP, declarations and mock drill alerts would', () => {
    expect(taskCoversReport([task({ kind: 'du_otp' })], 'du_otp')).toBe(true);
    expect(taskCoversReport([task({ kind: 'declarations' })], 'declaration_filed')).toBe(true);
    expect(taskCoversReport([task({ kind: 'mock_drill' })], 'mock_drill')).toBe(true);
  });

  it('leaves every other kind alone, whatever tasks are open', () => {
    expect(taskCoversReport([task({ kind: 'du_otp' })], 'dsr_variation')).toBe(false);
    expect(taskCoversReport([], 'du_otp')).toBe(false);
  });
});

describe('greetingName', () => {
  it('greets by first name', () => {
    expect(greetingName('Ramesh Kumar')).toBe('Ramesh');
    expect(greetingName('  रमेश कुमार ')).toBe('रमेश');
  });

  it('says nothing rather than a wrong name: empty, a phone, an email, a role word, or "Sir"', () => {
    for (const bad of [undefined, null, '', '   ', '9876543210', 'ramesh@example.com', 'Owner', 'Sir', 'manager']) {
      expect(greetingName(bad)).toBeNull();
    }
  });

  it('skips a title in front of the name, and says nothing for a firm or for initials', () => {
    expect(greetingName('Dr Ramesh Kumar')).toBe('Ramesh');
    expect(greetingName('Shri Anil Sharma')).toBe('Anil');
    expect(greetingName('Mr. Gupta')).toBe('Gupta');
    expect(greetingName('श्री अनिल शर्मा')).toBe('अनिल');
    expect(greetingName('M/S Sharma Fuels')).toBeNull();
    expect(greetingName('R K Sharma')).toBeNull();
    expect(greetingName('R.K. Sharma')).toBeNull();
    expect(greetingName('Dr')).toBeNull();
  });

  it('does not print a very long first word as a name', () => {
    expect(greetingName('A'.repeat(40))).toBeNull();
  });
});

describe('the grey words on the Today page', () => {
  // The tokens are read from the stylesheet, so a change to a grey cannot slip under the bar.
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const token = (name: string) => new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1]!;
  const luminance = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  it.each(['text-muted', 'text-subtle'])('reads at 4.5:1 or better: %s on the page and on a card (the date line, the as-of words, the small print)', (name) => {
    expect(ratio(token(name), token('bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(name), token('surface'))).toBeGreaterThanOrEqual(4.5);
  });
});
