import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { enterNativeShell, leaveNativeShell } from '@/test/payments';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

import { PlannerChatBanner } from './PlannerChatBanner';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  api: { get: h.get, post: h.post },
}));

const base = {
  paidThrough: null,
  resendInApp: false,
  priceBeforeGstPaise: 19900,
  priceTotalPaise: 23482,
  stateCode: '06',
  district: null,
  oilCompany: 'undecided',
  stage: 'exploring',
  questionsToday: 0,
  convertedAt: null,
};

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
  signIn({ role: 'dealer-owner', dealerStatus: 'PLANNING' });
});
afterEach(() => {
  leaveNativeShell();
  resetStores();
});

describe('PlannerChatBanner', () => {
  it('while the first payment is waiting: says why, and sends the details again', async () => {
    h.get.mockResolvedValue({ ...base, active: false, bill: { state: 'sent', amountPaise: 23482, autopay: true } });
    h.post.mockResolvedValue({ whatsapp: true, sms: false });
    const user = userEvent.setup();
    renderWithProviders(<PlannerChatBanner />);
    expect(await screen.findByText(/plan starts once the payment is done/)).toBeInTheDocument();
    // The card's button words, which the chat's own lines quote.
    await user.click(screen.getByRole('button', { name: 'Send the payment details again' }));
    expect(h.post).toHaveBeenCalledWith('/v1/me/planner/bill/resend');
    expect(await screen.findByText('Sent on WhatsApp.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Sent on WhatsApp.');
    expect(screen.queryByText(/link/i)).toBeNull();
  });

  it('a failed send is one alert, outside any other live region', async () => {
    h.get.mockResolvedValue({ ...base, active: false, bill: { state: 'sent', amountPaise: 23482, autopay: true } });
    h.post.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    renderWithProviders(<PlannerChatBanner />);
    await user.click(await screen.findByRole('button', { name: 'Send the payment details again' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't send. Please try again.");
    expect(alert.parentElement?.closest('[role="status"], [role="alert"], [aria-live]') ?? null).toBeNull();
    expect(document.querySelector('[data-planner-banner]')?.getAttribute('role')).toBeNull();
  });

  it('names the same button as the card and the chat, in Hindi and Hinglish', async () => {
    h.get.mockResolvedValue({ ...base, active: false, bill: { state: 'closed', amountPaise: 23482, autopay: false } });
    useLangStore.setState({ lang: 'hi', explicit: true });
    const { unmount } = renderWithProviders(<PlannerChatBanner />);
    expect(await screen.findByRole('button', { name: 'पेमेंट की जानकारी फिर से भेजें' })).toBeInTheDocument();
    unmount();
    useLangStore.setState({ lang: 'hl', explicit: true });
    renderWithProviders(<PlannerChatBanner />);
    expect(await screen.findByRole('button', { name: 'Payment ki jaankari phir se bhejein' })).toBeInTheDocument();
  });

  it('a bill closed unpaid: paused, and the details can be sent again', async () => {
    h.get.mockResolvedValue({ ...base, active: false, bill: { state: 'closed', amountPaise: 23482, autopay: false } });
    h.post.mockResolvedValue({ whatsapp: true, sms: true });
    const user = userEvent.setup();
    renderWithProviders(<PlannerChatBanner />);
    expect(await screen.findByText(/Your plan is paused\. We can send the payment details again/)).toBeInTheDocument();
    expect(document.querySelector('[data-planner-banner="paused"]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Get the payment details again' }));
    expect(h.post).toHaveBeenCalledWith('/v1/me/planner/restart');
  });

  it('inside the phone apps with the resend switch off: the state only, no button', async () => {
    enterNativeShell();
    h.get.mockResolvedValue({ ...base, active: false, bill: { state: 'closed', amountPaise: 23482, autopay: false } });
    renderWithProviders(<PlannerChatBanner />);
    expect(await screen.findByText('Your plan is paused.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('inside the phone apps, waiting, switch off: no word about the link', async () => {
    enterNativeShell();
    h.get.mockResolvedValue({ ...base, active: false, bill: { state: 'sent', amountPaise: 23482, autopay: true } });
    renderWithProviders(<PlannerChatBanner />);
    expect(await screen.findByText('Your plan starts once the payment is done.')).toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp|SMS|link|₹/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('inside the phone apps with the resend switch on: the button shows', async () => {
    enterNativeShell();
    h.get.mockResolvedValue({
      ...base,
      resendInApp: true,
      active: false,
      bill: { state: 'closed', amountPaise: 23482, autopay: false },
    });
    renderWithProviders(<PlannerChatBanner />);
    expect(await screen.findByRole('button', { name: 'Get the payment details again' })).toBeInTheDocument();
  });

  it('is not there while the plan is active', async () => {
    h.get.mockResolvedValue({ ...base, active: true, paidThrough: '2026-12-25', bill: { state: 'paid', amountPaise: 23482, autopay: true } });
    renderWithProviders(<PlannerChatBanner />);
    await vi.waitFor(() => expect(h.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector('[data-planner-banner]')).toBeNull();
  });

  it('is not there for an outlet, which never asks', async () => {
    signIn({ role: 'dealer-owner', dealerStatus: 'ACTIVE' });
    renderWithProviders(<PlannerChatBanner />);
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector('[data-planner-banner]')).toBeNull();
    expect(h.get).not.toHaveBeenCalled();
  });
});
