import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firstScreen } from '@/features/auth/firstScreen';
import { TERMS_NEW_PUMP_EN } from '@/features/register/terms';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { enterNativeShell, leaveNativeShell } from '@/test/payments';
import { makeUser, renderWithProviders, resetStores } from '@/test/utils';

import { NewPumpRegisterPage } from './NewPumpRegisterPage';

function renderAt(lang: 'en' | 'hi' | 'hl' = 'en') {
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/register/new-pump" element={<NewPumpRegisterPage />} />
      <Route path="/welcome" element={<div>welcome-page</div>} />
      <Route path="/login" element={<div>login-page</div>} />
      <Route path="/" element={<div>home-page</div>} />
    </Routes>,
    { route: '/register/new-pump' },
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PASSWORD = 'pump-plan-2026';

const EN = {
  name: 'Your name',
  mobile: 'Your mobile',
  password: 'Choose a password',
  confirm: 'Password again',
  state: 'Your state',
  district: /District or town/,
  stage: 'Applied',
};
const HL = {
  name: 'Aapka naam',
  mobile: 'Aapka mobile',
  password: 'Password chuniye',
  confirm: 'Password dobara',
  state: 'Aapka rajya',
  district: /Zila ya shehar/,
  stage: 'Aavedan kar diya hai',
};

async function fill(user: ReturnType<typeof userEvent.setup>, words: typeof EN = EN) {
  await user.type(screen.getByLabelText(words.name), 'Sunita Devi');
  await user.type(screen.getByLabelText(words.mobile), '98765 43210');
  await user.type(screen.getByLabelText(words.password), PASSWORD);
  await user.type(screen.getByLabelText(words.confirm), PASSWORD);
  await user.selectOptions(screen.getByLabelText(words.state), '06');
  await user.type(screen.getByLabelText(words.district), 'Karnal');
  await user.click(screen.getByLabelText('IndianOil'));
  await user.click(screen.getByLabelText(words.stage));
}

describe('NewPumpRegisterPage (ADR 0058 §3.2)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // jsdom draws no page to scroll.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });
  afterEach(() => resetStores());

  it('says what is missing under each field, and sends nothing', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    // The error is said under the box and read with it.
    expect(await screen.findByLabelText('Your state')).toHaveAccessibleDescription('Choose your state');
    expect(screen.getAllByText('Choose one')).toHaveLength(2);
    expect(screen.getByText('Enter your name')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the Kavach Shuruaat terms, and "I agree" ticks the box', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Kavach Shuruaat terms' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText(TERMS_NEW_PUMP_EN[0]!)).toBeInTheDocument();
    expect(within(sheet).getByText(/does not promise, sell, allot or arrange a dealership/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /agree/i }));
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('names the terms box with the words it shows (no fixed, gendered name over them)', () => {
    renderAt();
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(
      /^I have read and agree to the Kavach Shuruaat terms ?, and to messages about my plan on WhatsApp\.$/,
    );
  });

  it('sends a planner registration and, when the account is ready, signs in and goes home', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, account: 'ready' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, data: { token: 'new-token', user: makeUser({ id: 'u-new', dealerStatus: 'PLANNING' }) } }),
      );
    const user = userEvent.setup();
    renderAt('hl');
    await fill(user, HL);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Mera account banaiye' }));

    expect(await screen.findByText('home-page')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      kind: 'planner',
      name: 'Sunita Devi',
      mobile: '9876543210',
      password: PASSWORD,
      stateCode: '06',
      district: 'Karnal',
      oilCompany: 'iocl',
      stage: 'applied',
      lang: 'hl',
      source: 'app',
    });
    expect(body).not.toHaveProperty('sapCode');
    expect(body).not.toHaveProperty('siteType');
    expect(typeof body.submissionId).toBe('string');
    expect(useAuthStore.getState().token).toBe('new-token');
    expect(firstScreen()).toBe('/login');
  });

  it('a send that fails says so and keeps the form', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderAt();
    await fill(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sunita Devi')).toBeInTheDocument();
  });

  it('the back arrow, opened cold, goes to the choice screen', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('welcome-page')).toBeInTheDocument();
  });

  /**
   * ADR 0022 §1 / ADR 0058 §13.4: inside the phone apps (Android and iPhone) the
   * outlet sign-up shows no price and nothing about paying, so this form does not
   * either. In a browser the price and where the link comes stay.
   */
  describe('inside the phone apps', () => {
    afterEach(() => leaveNativeShell());

    it('shows no amount and no word about the payment link', () => {
      enterNativeShell();
      renderAt();
      expect(screen.queryByText(/₹/)).toBeNull();
      expect(screen.queryByText(/payment link/i)).toBeNull();
      expect(screen.getByText('Answers start once your plan is active.')).toBeInTheDocument();
    });

    it('in Hindi too', () => {
      enterNativeShell();
      renderAt('hi');
      expect(screen.queryByText(/₹/)).toBeNull();
      expect(screen.queryByText(/पेमेंट लिंक/)).toBeNull();
      expect(screen.getByText('प्लान चालू होते ही जवाब मिलने लगेंगे।')).toBeInTheDocument();
    });

    it('a browser keeps the price and where the link comes', () => {
      renderAt();
      expect(screen.getByText(/₹199 \+ GST a month\./)).toBeInTheDocument();
      expect(screen.getByText(/payment link for ₹199 \+ GST comes on your WhatsApp and SMS/)).toBeInTheDocument();
    });
  });
});
