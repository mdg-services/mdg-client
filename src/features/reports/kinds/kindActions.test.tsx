import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Lang } from '@/store/lang';

import { ReportActionsProvider } from '../reportActions';
import type { ReportAction, ReportActionContext } from '../types';

import { duOtp, supply, announcement } from './_supplyTestKit';
import { densityData } from './_tankerMoney.fixtures';
import { view as announcementView } from './announcement';
import { fakeReport, loadPlanData, stockData } from './dsr_sales/fixtures';
import { view as duOtpView } from './du_otp';
import { orderSentence, view as loadPlanView } from './load_plan';
import { view as mockDrillView } from './mock_drill';
import { boxOfCond, view as roSupplyView } from './ro_supply';
import { STOCK_ASK_LOCK_MS, stockAskableAt, view as stockView } from './stock_check';
import { view as densityView } from './tanker_density';

/** "Now" is 24 Nov 2026, 10:20 am IST, six minutes after the reading in the stock fixture (10:14). */
const NOW = Date.parse('2026-11-24T04:50:00.000Z');

function ctxOf(over: Partial<ReportActionContext> = {}, lang: Lang = 'en'): ReportActionContext {
  return {
    lang,
    isOwner: true,
    now: () => NOW,
    navigate: vi.fn(),
    openChatAt: vi.fn(),
    openChatAtAsk: vi.fn(),
    openChatAtTask: vi.fn(),
    draftInChat: vi.fn(),
    copy: vi.fn().mockResolvedValue(true),
    toast: { success: vi.fn(), error: vi.fn() },
    sendChat: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}
const label = (a: ReportAction, lang: Lang) => a.label[lang];
const report = (kind: Parameters<typeof fakeReport>[0]) => fakeReport(kind);

afterEach(cleanup);

describe('tanker_density: Copy density copies EVERY fuel as plain text', () => {
  const two = densityData({
    lines: [
      { family: 'DIESEL', productKey: 'HSD', density15Raw: '820.500', quantity: 6, unit: 'KL', tankNo: 'T018' },
      { family: 'PETROL', productKey: 'MS', density15Raw: '745.200', quantity: 4.5, unit: 'KL', tankNo: 'T021' },
    ],
  });

  it('offers one button, "Copy density" for one fuel and "Copy all" for several, in all three languages', () => {
    const one = densityView.actions!(densityData(), report('tanker_density'), ctxOf());
    expect(one).toHaveLength(1);
    expect(one.map((a) => [label(a, 'en'), label(a, 'hl'), label(a, 'hi')])).toEqual([['Copy density', 'Density copy karein', 'डेंसिटी कॉपी करें']]);
    const many = densityView.actions!(two, report('tanker_density'), ctxOf());
    expect(many[0]!.label.en).toBe('Copy all');
  });

  it('puts the digits exactly as printed on the clipboard, one fuel to a line, and says it copied', async () => {
    const ctx = ctxOf();
    await densityView.actions!(two, report('tanker_density'), ctx)[0]!.run(ctx);
    const text = vi.mocked(ctx.copy).mock.calls[0]![0];
    expect(text.split('\n')).toHaveLength(2);
    expect(text).toContain('820.500');
    expect(text).toContain('745.200');
    expect(text).not.toMatch(/kg|g\/cc/i);
    expect(ctx.toast.success).toHaveBeenCalledWith('Copied');
  });

  it('says plainly what to do when the phone refuses the copy', async () => {
    const ctx = ctxOf({ copy: vi.fn().mockResolvedValue(false) });
    await densityView.actions!(densityData(), report('tanker_density'), ctx)[0]!.run(ctx);
    expect(ctx.toast.error).toHaveBeenCalledWith('Could not copy. Press and hold the number to copy it.');
    expect(ctx.toast.success).not.toHaveBeenCalled();
  });

  it('offers nothing when no density could be read', () => {
    expect(densityView.actions!(densityData({ lines: [] }), report('tanker_density'), ctxOf())).toEqual([]);
  });
});

describe('stock_check: Ask again, locked for 30 minutes from the reading', () => {
  it('is locked until the reading plus 30 minutes, and says when the newest reading is possible', () => {
    expect(STOCK_ASK_LOCK_MS).toBe(30 * 60_000);
    expect(stockAskableAt(stockData())).toBe(Date.parse('2026-11-24T05:14:00.000Z'));
    const [a] = stockView.actions!(stockData(), report('stock_check'), ctxOf());
    expect(label(a!, 'en')).toBe('Ask again');
    expect(a!.disabled?.note).toBe('Newest reading possible at 10:44 am');
    expect(a!.once).toBe(true);
  });

  it('writes the lock in Hindi and Hinglish too', () => {
    expect(stockView.actions!(stockData(), report('stock_check'), ctxOf({}, 'hl'))[0]!.disabled?.note).toContain('Nayi reading 10:44');
    expect(stockView.actions!(stockData(), report('stock_check'), ctxOf({}, 'hi'))[0]!.disabled?.note).toContain('नई रीडिंग');
  });

  it('opens at exactly 30 minutes, and stays open after', () => {
    const at = Date.parse('2026-11-24T05:14:00.000Z');
    expect(stockView.actions!(stockData(), report('stock_check'), ctxOf({ now: () => at - 1 }))[0]!.disabled).toBeDefined();
    expect(stockView.actions!(stockData(), report('stock_check'), ctxOf({ now: () => at }))[0]!.disabled).toBeUndefined();
    expect(stockView.actions!(stockData(), report('stock_check'), ctxOf({ now: () => at + 3_600_000 }))[0]!.disabled).toBeUndefined();
  });

  it('has no lock when the reading time is unknown, or not a date', () => {
    expect(stockAskableAt(stockData({ readingAt: null }))).toBeNull();
    expect(stockAskableAt(stockData({ readingAt: 'soon' }))).toBeNull();
    expect(stockView.actions!(stockData({ readingAt: null }), report('stock_check'), ctxOf())[0]!.disabled).toBeUndefined();
  });

  it('sends the sentence the stock check understands into the chat, in the reader\'s language, and says it asked', async () => {
    for (const [lang, sentence] of [
      ['hl', 'Stock kitna hai'],
      ['hi', 'स्टॉक कितना है'],
      ['en', 'How much stock is there now?'],
    ] as const) {
      const ctx = ctxOf({ now: () => NOW + 3_600_000 }, lang);
      await stockView.actions!(stockData(), report('stock_check'), ctx)[0]!.run(ctx);
      expect(ctx.sendChat).toHaveBeenCalledWith(sentence);
      expect(ctx.toast.success).toHaveBeenCalledTimes(1);
    }
  });

  it('does not say "asked" when the send fails: the failure goes up for the overlay to report', async () => {
    const ctx = ctxOf({ now: () => NOW + 3_600_000, sendChat: vi.fn().mockRejectedValue(new Error('offline')) });
    await expect(stockView.actions!(stockData(), report('stock_check'), ctx)[0]!.run(ctx)).rejects.toThrow('offline');
    expect(ctx.toast.success).not.toHaveBeenCalled();
  });
});

describe('announcement: no "Got it" until the server can take one', () => {
  it('offers no button and invents no route', () => {
    expect(announcementView.actions).toBeUndefined();
    expect(announcementView.alert(announcement({ tone: 'important', ackable: true }), 'en')?.line).not.toMatch(/Got it/);
  });
});

describe('mock_drill: Send photos again, only when IndianOil sent it back', () => {
  const returned = {
    kind: 'mock_drill',
    v: 1,
    outletCode: '1E',
    stage: 'filed',
    submissionId: 's1',
    mode: 'new',
    scenario: { id: 'sc1', family: 'fire', label: 'Fire' },
    drillDay: '2026-11-22',
    startTime: '11:00',
    durationMinutes: 30,
    level: '1',
    photos: [],
    portalState: 'returned',
  } as never;

  it('opens the chat at the mock drill\'s own box', () => {
    const ctx = ctxOf();
    const actions = mockDrillView.actions!(returned, report('mock_drill'), ctx);
    expect(actions.map((a) => label(a, 'en'))).toEqual(['Send photos again']);
    void actions[0]!.run(ctx);
    expect(ctx.openChatAtTask).toHaveBeenCalledWith('mock_drill');
  });

  it('offers nothing while it waits or after it is approved', () => {
    for (const portalState of ['pending_approval', 'none', 'unknown']) {
      expect(mockDrillView.actions!({ ...(returned as object), portalState } as never, report('mock_drill'), ctxOf())).toEqual([]);
    }
  });
});

describe('du_otp: the button opens the DU OTP steps while the paper is owed', () => {
  it('opens the box, not the report', () => {
    const ctx = ctxOf();
    const actions = duOtpView.actions!(duOtp(), report('du_otp'), ctx);
    expect(actions.map((a) => label(a, 'hl'))).toEqual(['DU OTP ka kaam kholein']);
    void actions[0]!.run(ctx);
    expect(ctx.openChatAtTask).toHaveBeenCalledWith('du_otp');
  });

  it('offers nothing once it is submitted', () => {
    expect(duOtpView.actions!(duOtp({ phase: 'submitted' }), report('du_otp'), ctxOf())).toEqual([]);
  });
});

describe('load_plan: Order now types the order in the chat and never sends it', () => {
  it('types what the plan says to order, in the reader\'s language', () => {
    const ctx = ctxOf();
    const actions = loadPlanView.actions!(loadPlanData(), report('load_plan'), ctx);
    expect(actions.map((a) => label(a, 'en'))).toEqual(['Order now']);
    void actions[0]!.run(ctx);
    expect(ctx.draftInChat).toHaveBeenCalledTimes(1);
    const typed = vi.mocked(ctx.draftInChat).mock.calls[0]![0];
    expect(typed).toMatch(/^Please place an order for /);
    expect(typed).toContain('Diesel 8,000 L');
    expect(typed).toContain('Petrol 2,000 L');
    expect(ctx.sendChat).not.toHaveBeenCalled();
  });

  it('words the sentence for each language', () => {
    const load = { trucks: 1, byProduct: [{ product: 'HSD', litres: 8000 }] };
    expect(orderSentence(load, 'hl')).toBe('Diesel 8,000 L ka order laga dijiye');
    expect(orderSentence(load, 'hi')).toMatch(/8,000 L का ऑर्डर लगा दीजिए$/);
    expect(orderSentence(load, 'en')).toBe('Please place an order for Diesel 8,000 L');
  });

  it('is offered when it is urgent, too', () => {
    const urgent = loadPlanData({ severity: 'urgent' });
    expect(loadPlanView.actions!(urgent, report('load_plan'), ctxOf())).toHaveLength(1);
  });

  it('is never offered on a calm day, with no order, to a manager, or from an old plan', () => {
    expect(loadPlanView.actions!(loadPlanData({ severity: 'calm' }), report('load_plan'), ctxOf())).toEqual([]);
    expect(loadPlanView.actions!(loadPlanData({ order: null }), report('load_plan'), ctxOf())).toEqual([]);
    expect(loadPlanView.actions!(loadPlanData(), report('load_plan'), ctxOf({ isOwner: false }))).toEqual([]);
    // Plan of 24 Nov, read on 28 Nov: more than two days old.
    const later = Date.parse('2026-11-28T06:00:00.000Z');
    expect(loadPlanView.actions!(loadPlanData(), report('load_plan'), ctxOf({ now: () => later }))).toEqual([]);
  });
});

describe('ro_supply: a row\'s button goes to the box that answers it', () => {
  it('maps a pending OTP to the DU OTP steps, a missed drill to the mock drill job, and the rest to the report', () => {
    expect(boxOfCond('pending_otp')).toEqual({ box: 'du_otp' });
    expect(boxOfCond('mock_drill')).toEqual({ box: 'mock_drill' });
    expect(boxOfCond('electrical_audit')).toEqual({});
    expect(boxOfCond('other')).toEqual({});
  });

  function drawn(rows: Array<{ cond: string; mark: string }>, ctx: ReportActionContext | null) {
    const data = supply({ blocked: true, rows: rows.map((r) => ({ ...r, portalText: '' })) as never });
    const Overlay = roSupplyView.Overlay;
    const ui = <Overlay data={data} report={report('ro_supply')} lang="en" />;
    return render(ctx ? <ReportActionsProvider value={ctx}>{ui}</ReportActionsProvider> : ui);
  }

  it('opens the DU OTP steps from the pending-OTP row, even where no router is around', () => {
    const ctx = ctxOf();
    drawn([{ cond: 'pending_otp', mark: 'NO' }], ctx);
    fireEvent.click(screen.getByTestId('supply-go-pending_otp'));
    expect(ctx.openChatAtTask).toHaveBeenCalledWith('du_otp');
    expect(ctx.openChatAt).not.toHaveBeenCalled();
  });

  it('opens the mock drill job from the mock-drill row', () => {
    const ctx = ctxOf();
    drawn([{ cond: 'mock_drill', mark: 'NO' }], ctx);
    fireEvent.click(screen.getByTestId('supply-go-mock_drill'));
    expect(ctx.openChatAtTask).toHaveBeenCalledWith('mock_drill');
  });

  it('opens the chat at the report for a row with no box of its own', () => {
    const ctx = ctxOf();
    drawn([{ cond: 'electrical_audit', mark: 'NO' }], ctx);
    fireEvent.click(screen.getByTestId('supply-go-electrical_audit'));
    expect(ctx.openChatAt).toHaveBeenCalledWith('m1');
  });
});

