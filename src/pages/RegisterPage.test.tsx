import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TERMS_EN, TERMS_HI } from '@/features/register/terms';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores } from '@/test/utils';

import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

function renderAt(route: '/login' | '/register', lang: 'en' | 'hi' = 'en') {
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Routes>,
    { route },
  );
}

function okResponse() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your name'), '  Ramesh Kumar ');
  await user.type(screen.getByLabelText('Your mobile'), '98765 43210');
  await user.type(screen.getByLabelText(/Your email/), 'ramesh@example.com');
  await user.click(screen.getByLabelText('Type B'));
  await user.type(screen.getByLabelText(/Pump name/), 'Sai Petroleums');
  await user.type(screen.getByLabelText('SAP code'), '41001234');
}

describe('RegisterPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => resetStores());

  it('is reached from the sign-in footer, which says MDG makes the login', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    expect(screen.getByText(/MDG team will send you your ID and password/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Register your pump' }));

    expect(await screen.findByRole('heading', { name: 'Register your pump' })).toBeInTheDocument();
    expect(screen.getByLabelText('SAP code')).toBeInTheDocument();
  });

  it('sends nothing until the required details and the terms are in', async () => {
    const user = userEvent.setup();
    renderAt('/register');

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid mobile number')).toBeInTheDocument();
    expect(screen.getByText('Choose Type A or Type B')).toBeInTheDocument();
    expect(screen.getByText('Enter your SAP code')).toBeInTheDocument();
    expect(
      screen.getByText('Read and accept the Terms & Conditions to continue'),
    ).toBeInTheDocument();
    // Email and pump name are optional, as on the website.
    expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens the terms in the app; the link does not tick the box, agreeing does', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    const box = screen.getByRole('checkbox');

    await user.click(screen.getByRole('button', { name: 'Terms & Conditions' }));
    const sheet = await screen.findByRole('dialog', { name: 'Terms & Conditions' });
    expect(box).not.toBeChecked();
    // All ten clauses of the agreement, in English on the English screen.
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(10);
    expect(within(sheet).getByText(TERMS_EN[9]!)).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'I agree & continue' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(box).toBeChecked();
  });

  it('on the Hindi screen, says the English terms are binding and shows them on request', async () => {
    const user = userEvent.setup();
    renderAt('/register', 'hi');

    await user.click(screen.getByRole('button', { name: 'नियम व शर्तें' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(TERMS_HI[0]!)).toBeInTheDocument();
    expect(within(sheet).getByText(/अंग्रेज़ी वाली शर्तें ही मान्य होंगी/)).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'अंग्रेज़ी मूल पढ़िए' }));
    expect(within(sheet).getByText(TERMS_EN[0]!)).toBeInTheDocument();
    expect(within(sheet).queryByText(TERMS_HI[0]!)).not.toBeInTheDocument();
  });

  it("posts the website's enrolment form, marked as from the app, and confirms", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const user = userEvent.setup();
    renderAt('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Thank you. Your details are with us.')).toBeInTheDocument();
    expect(
      screen.getByText('A welcome email is on its way to ramesh@example.com.'),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mdgservices.in/api/enroll');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Ramesh Kumar',
      mobile: '98765 43210',
      email: 'ramesh@example.com',
      siteType: 'Type B',
      pumpName: 'Sai Petroleums',
      sapCode: '41001234',
      agree: true,
      source: 'app',
    });
  });

  it('keeps the form and says so when the send fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderAt('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't send your details. Check your network and try again.",
    );
    expect(screen.getByLabelText('SAP code')).toHaveValue('41001234');
    expect(screen.queryByText('Thank you. Your details are with us.')).not.toBeInTheDocument();
  });

  it('treats an answer without ok:true as a failure', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'Some details look off.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const user = userEvent.setup();
    renderAt('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
