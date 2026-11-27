import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { enterNativeShell, leaveNativeShell } from '@/test/payments';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { PlannerView } from '@dk/shared/types';

import { PlanStateCard, PlanStateCardView } from './PlanStateCard';
import { planLines, planSendable, planSummary } from './planView';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  api: { get: h.get, post: h.post },
}));

function view(over: Partial<PlannerView> = {}): PlannerView {
  return {
    active: false,
    paidThrough: null,
    bill: { state: 'sent', amountPaise: 23482, autopay: true },
    resendInApp: false,
    priceBeforeGstPaise: 19900,
    priceTotalPaise: 23482,
    stateCode: '06',
    district: 'Karnal',
    oilCompany: 'iocl',
    stage: 'applied',
    questionsToday: 0,
    convertedAt: null,
    ...over,
  };
}

const ACTIVE = view({ active: true, paidThrough: '2026-12-25', bill: { state: 'paid', amountPaise: 23482, autopay: true } });
const WAITING = view();
const STOPPED = view({ paidThrough: '2026-11-20', bill: { state: 'stopped', amountPaise: 23482, autopay: false } });
const CLOSED = view({ bill: { state: 'closed', amountPaise: 23482, autopay: false } });
const NEVER = view({ bill: { state: 'none', amountPaise: 23482, autopay: false } });

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
  signIn({ role: 'dealer-owner', dealerStatus: 'PLANNING' });
});
afterEach(() => {
  leaveNativeShell();
  resetStores();
});

describe('planSummary', () => {
  it('active: nothing to do; says autopay renews it', () => {
    expect(planSummary(ACTIVE)).toMatchObject({ state: 'active', action: null, autopay: true, ending: false });
  });
  it('active with autopay stopped: ends at the paid-through day', () => {
    const s = planSummary(view({ active: true, paidThrough: '2026-12-25', bill: { state: 'stopped', amountPaise: 23482, autopay: false } }));
    expect(s).toMatchObject({ state: 'active', action: null, ending: true });
  });
  it('a bill out and not paid: waiting, send the link again', () => {
    expect(planSummary(WAITING)).toMatchObject({ state: 'waiting', action: 'resend' });
  });
  it('stopped, a lapsed paid month, or no bill at all: start again', () => {
    expect(planSummary(STOPPED)).toMatchObject({ state: 'stopped', action: 'restart' });
    expect(planSummary(view({ paidThrough: '2026-11-20', bill: { state: 'paid', amountPaise: 23482, autopay: true } })).state).toBe('stopped');
    expect(planSummary(view({ bill: { state: 'none', amountPaise: 23482, autopay: false } })).action).toBe('restart');
  });
  it('a bill closed unpaid after 7 days: paused, and the restart road sends the details again', () => {
    expect(planSummary(CLOSED)).toMatchObject({ state: 'paused', action: 'restart' });
    // A renewal bill closed after a paid month is paused too, not "ended".
    expect(planSummary(view({ paidThrough: '2026-11-20', bill: { state: 'closed', amountPaise: 23482, autopay: false } })).state).toBe('paused');
  });
});

describe('planSendable (ADR 0022 §1, the outlet strip\'s rule)', () => {
  it('a browser always offers the button the state has', () => {
    expect(planSendable(planSummary(WAITING), WAITING, true)).toBe(true);
    expect(planSendable(planSummary(CLOSED), CLOSED, true)).toBe(true);
  });
  it('the phone apps follow the server switch', () => {
    expect(planSendable(planSummary(CLOSED), CLOSED, false)).toBe(false);
    expect(planSendable(planSummary(CLOSED), { ...CLOSED, resendInApp: true }, false)).toBe(true);
  });
  it('an older server that does not say is read as "not in the app"', () => {
    const old = { ...WAITING } as Partial<PlannerView>;
    delete old.resendInApp;
    expect(planSendable(planSummary(WAITING), old as PlannerView, false)).toBe(false);
  });
  it('an active plan has no button anywhere', () => {
    expect(planSendable(planSummary(ACTIVE), { ...ACTIVE, resendInApp: true }, true)).toBe(false);
  });
});

describe('planLines', () => {
  it('without the button, says the state only', () => {
    expect(planLines(planSummary(WAITING), null, false)).toEqual([{ key: 'planner.waitingBodyApp' }]);
    expect(planLines(planSummary(CLOSED), null, false)).toEqual([{ key: 'planner.pausedBodyApp' }]);
    expect(planLines(planSummary(STOPPED), '20 Nov', false)).toEqual([{ key: 'planner.endedBodyApp', date: '20 Nov' }]);
    expect(planLines(planSummary(NEVER), null, false)).toEqual([{ key: 'planner.stoppedBodyApp' }]);
  });
});

describe('PlanStateCardView', () => {
  it('active: the state in words, the paid-through day, and no button', () => {
    renderWithProviders(<PlanStateCardView view={ACTIVE} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/Paid till 25 December/)).toBeInTheDocument();
    expect(screen.getByText(/renews by itself/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('waiting: says where the link is, and sends it again on WhatsApp and SMS', async () => {
    h.post.mockResolvedValue({ whatsapp: true, sms: true, email: false });
    const user = userEvent.setup();
    renderWithProviders(<PlanStateCardView view={WAITING} />);
    expect(screen.getByText('Waiting for payment')).toBeInTheDocument();
    expect(screen.getByText(/payment details are on your WhatsApp and SMS/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send the payment details again' }));
    expect(h.post).toHaveBeenCalledWith('/v1/me/planner/bill/resend');
    expect(await screen.findByText('Sent on WhatsApp and SMS.')).toBeInTheDocument();
  });

  it('waiting: a second press too soon is told it was sent just now', async () => {
    h.post.mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'Too many'));
    const user = userEvent.setup();
    renderWithProviders(<PlanStateCardView view={WAITING} />);
    await user.click(screen.getByRole('button', { name: 'Send the payment details again' }));
    expect(await screen.findByText(/Sent just now/)).toBeInTheDocument();
  });

  it('stopped: offers Start again, which asks for a fresh approval', async () => {
    h.post.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<PlanStateCardView view={STOPPED} />);
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(screen.getByText(/Your plan ended on 20 November/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start again' }));
    expect(h.post).toHaveBeenCalledWith('/v1/me/planner/restart');
    expect(await screen.findByText(/Look in your WhatsApp and SMS/)).toBeInTheDocument();
  });

  it('a failed send says so', async () => {
    h.post.mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));
    const user = userEvent.setup();
    renderWithProviders(<PlanStateCardView view={STOPPED} />);
    await user.click(screen.getByRole('button', { name: 'Start again' }));
    expect(await screen.findByText("Couldn't send. Please try again.")).toBeInTheDocument();
  });

  it('paused: says so kindly, and sends the payment details again', async () => {
    h.post.mockResolvedValue({ whatsapp: true, sms: true });
    const user = userEvent.setup();
    renderWithProviders(<PlanStateCardView view={CLOSED} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(
      screen.getByText('Your plan is paused. Tap below and we will send the payment details again on WhatsApp and SMS.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get the payment details again' }));
    expect(h.post).toHaveBeenCalledWith('/v1/me/planner/restart');
    expect(await screen.findByText('Sent on WhatsApp and SMS.')).toBeInTheDocument();
  });

  it('paused, in Hindi', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(<PlanStateCardView view={CLOSED} />);
    expect(screen.getByText('रुका हुआ है')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'पेमेंट की जानकारी फिर से भेजें' })).toBeInTheDocument();
  });

  it('paused, in Hinglish', () => {
    useLangStore.setState({ lang: 'hl', explicit: true });
    renderWithProviders(<PlanStateCardView view={CLOSED} />);
    expect(screen.getByRole('button', { name: 'Payment ki jaankari phir se bhejein' })).toBeInTheDocument();
  });

  it('never offers a way to pay inside the app', () => {
    for (const v of [ACTIVE, WAITING, STOPPED, CLOSED]) {
      const { unmount } = renderWithProviders(<PlanStateCardView view={v} />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^pay\b/i })).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('PlanStateCardView inside the phone apps (ADR 0022 §1, ADR 0058 §13.4)', () => {
  it('with the resend switch off: the state only, no button, no amount, no word about paying', () => {
    enterNativeShell();
    for (const v of [WAITING, CLOSED, STOPPED, NEVER]) {
      const { unmount, container } = renderWithProviders(<PlanStateCardView view={v} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(container.textContent).not.toMatch(/₹/);
      expect(container.textContent).not.toMatch(/payment link|payment details|WhatsApp|SMS|pay on/i);
      unmount();
    }
  });

  it('the same in Hindi', () => {
    enterNativeShell();
    useLangStore.setState({ lang: 'hi', explicit: true });
    for (const v of [WAITING, CLOSED, STOPPED]) {
      const { unmount, container } = renderWithProviders(<PlanStateCardView view={v} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(container.textContent).not.toMatch(/₹|लिंक|WhatsApp|SMS/);
      unmount();
    }
  });

  it('paused, switch off: says the plan is paused', () => {
    enterNativeShell();
    renderWithProviders(<PlanStateCardView view={CLOSED} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText(/Your plan is paused\./)).toBeInTheDocument();
  });

  it('with the resend switch on: the button shows, still with no amount beside it', async () => {
    enterNativeShell();
    h.post.mockResolvedValue({ whatsapp: true, sms: true });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PlanStateCardView view={{ ...CLOSED, resendInApp: true }} />);
    expect(container.textContent).not.toMatch(/₹/);
    await user.click(screen.getByRole('button', { name: 'Get the payment details again' }));
    expect(h.post).toHaveBeenCalledWith('/v1/me/planner/restart');
  });

  it('with the resend switch on, waiting or stopped: "payment details", never a link, in every language', () => {
    enterNativeShell();
    for (const lang of ['en', 'hi', 'hl'] as const) {
      useLangStore.setState({ lang, explicit: true });
      for (const v of [WAITING, STOPPED]) {
        const { unmount, container } = renderWithProviders(<PlanStateCardView view={{ ...v, resendInApp: true }} />);
        expect(screen.getByRole('button')).toBeInTheDocument();
        expect(container.textContent).not.toMatch(/₹|link|लिंक/i);
        unmount();
      }
    }
  });

  it('an active plan may show what is paid for', () => {
    enterNativeShell();
    renderWithProviders(<PlanStateCardView view={ACTIVE} />);
    expect(screen.getByText(/Paid till 25 December/)).toBeInTheDocument();
    expect(screen.getByText('₹199 + GST a month (₹234.82)')).toBeInTheDocument();
  });

  it('works the same in the iPhone app', () => {
    enterNativeShell();
    (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__ = 'ios';
    try {
      const { container } = renderWithProviders(<PlanStateCardView view={WAITING} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(container.textContent).not.toMatch(/₹|payment link/);
    } finally {
      delete (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__;
    }
  });
});

describe('PlanStateCard', () => {
  it('reads the plan from the server', async () => {
    h.get.mockResolvedValue(WAITING);
    renderWithProviders(<PlanStateCard />);
    expect(await screen.findByText('Waiting for payment')).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith('/v1/me/planner');
  });

  it('says so when the plan cannot be read, with Try again', async () => {
    h.get.mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));
    renderWithProviders(<PlanStateCard />);
    await waitFor(() => expect(screen.getByText(/Couldn't check your plan/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('an outlet never asks for a plan', async () => {
    signIn({ role: 'dealer-owner', dealerStatus: 'ACTIVE' });
    renderWithProviders(<PlanStateCard />);
    await new Promise((r) => setTimeout(r, 20));
    expect(h.get).not.toHaveBeenCalled();
  });
});
