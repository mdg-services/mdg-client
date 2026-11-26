import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { enterNativeShell, leaveNativeShell } from '@/test/payments';
import { makeUser, renderWithProviders, resetStores, signIn } from '@/test/utils';

import { SwitchToDealerKavachPage } from './SwitchToDealerKavachPage';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  api: { get: h.get, post: h.post },
}));

function renderPage() {
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/switch-to-dealer-kavach" element={<SwitchToDealerKavachPage />} />
      <Route path="/" element={<div>home-page</div>} />
    </Routes>,
    { route: '/switch-to-dealer-kavach' },
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('SAP code'), ' 41001234 ');
  await user.type(screen.getByLabelText('Pump name'), 'Sai Petroleums');
  await user.click(screen.getByLabelText('Type B'));
}

beforeEach(() => {
  signIn({ role: 'dealer-owner', dealerStatus: 'PLANNING' });
  // The plan said IndianOil at sign-up: the form starts on it.
  h.get.mockImplementation((path: string) =>
    path === '/v1/me/planner'
      ? Promise.resolve({ oilCompany: 'iocl', active: true, paidThrough: null, bill: { state: 'paid', amountPaise: 23482, autopay: true } })
      : Promise.resolve(makeUser({ dealerStatus: 'ONBOARDING' })),
  );
});
afterEach(() => resetStores());

describe('SwitchToDealerKavachPage (ADR 0058 §7)', () => {
  it('says what changes in plain words before the form', () => {
    renderPage();
    expect(screen.getByText('You keep the same login and the same chat.')).toBeInTheDocument();
    expect(screen.getByText(/Kavach Shuruaat stops/)).toBeInTheDocument();
    expect(screen.getByText(/₹3,000 \+ GST a month/)).toBeInTheDocument();
  });

  it('states the money-back with its conditions', () => {
    renderPage();
    expect(screen.getByText(/tell us by the end of that month[^.]*\(once per dealer\)/)).toBeInTheDocument();
  });

  it('inside the phone apps: no amount above the button that leads to a bill', () => {
    enterNativeShell();
    try {
      const { container } = renderPage();
      expect(container.textContent).not.toMatch(/₹3,000/);
      expect(screen.getByText(/Dealer Kavach is a monthly plan/)).toBeInTheDocument();
    } finally {
      leaveNativeShell();
    }
  });

  it('asks for what is missing, in words', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Switch now' }));
    expect(await screen.findByText('Enter the SAP code')).toBeInTheDocument();
    expect(screen.getByText('Enter the pump name')).toBeInTheDocument();
    expect(screen.getByText('Choose A or B')).toBeInTheDocument();
    expect(h.post).not.toHaveBeenCalled();
  });

  it('switches, reads the profile again and lands on the normal home', async () => {
    h.post.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('IndianOil')).toBeChecked());
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Switch now' }));
    expect(await screen.findByText('home-page')).toBeInTheDocument();
    expect(h.post).toHaveBeenCalledWith('/v1/me/planner/convert', {
      sapCode: '41001234',
      pumpName: 'Sai Petroleums',
      siteType: 'B',
      oilCompany: 'iocl',
    });
    expect(useAuthStore.getState().user?.dealerStatus).toBe('ONBOARDING');
  });

  it('a SAP code that is already a client gets a clear sentence, and stays', async () => {
    h.post.mockRejectedValue(new ApiError(409, 'ALREADY_CLIENT', 'already a client'));
    const user = userEvent.setup();
    renderPage();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Switch now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This SAP code is already with Dealer Kavach. Check the code, or ask us in the chat.',
    );
    expect(useAuthStore.getState().user?.dealerStatus).toBe('PLANNING');
  });

  it('an account that moved already is told so, not that the SAP code is taken', async () => {
    h.post.mockRejectedValue(new ApiError(409, 'CONFLICT', 'This account has already switched to Dealer Kavach.'));
    const user = userEvent.setup();
    renderPage();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Switch now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This account has already moved to Dealer Kavach.');
  });

  it('a switch that stopped half way says the autopay is stopped and to press again', async () => {
    h.post.mockRejectedValue(new ApiError(503, 'SWITCH_NOT_FINISHED', 'did not finish'));
    const user = userEvent.setup();
    renderPage();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Switch now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your Kavach Shuruaat autopay is already stopped.');
  });

  it('is not for an outlet', async () => {
    signIn({ role: 'dealer-owner', dealerStatus: 'ACTIVE' });
    renderPage();
    expect(await screen.findByText('home-page')).toBeInTheDocument();
  });
});
