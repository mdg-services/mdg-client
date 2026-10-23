import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_EXPIRED_KEY, useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores } from '@/test/utils';
import type { User } from '@dk/shared/types';

import { LoginPage } from './LoginPage';

const PASSWORD = 'Sai-pump-2026';

function renderLogin(lang: 'en' | 'hi' = 'en') {
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<div>register-page</div>} />
      <Route path="/chat" element={<div>chat-page</div>} />
    </Routes>,
    { route: '/login' },
  );
}

const envelope = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const ok = (data: unknown) => envelope({ ok: true, data });
const refused = (status: number, code: string, message: string) =>
  envelope({ ok: false, error: { code, message } }, status);

const OWNER: User = {
  id: 'u1',
  email: '',
  name: 'Ramesh',
  role: 'dealer-owner',
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
};

describe('LoginPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      sessionStorage.clear();
    } catch {
      /* jsdom always has it */
    }
  });
  afterEach(() => resetStores());

  const sentBody = (call = 0) =>
    JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string);

  describe('the form', () => {
    it('has one box for the mobile number or email, the password, and the way to register', () => {
      renderLogin();
      expect(screen.getByLabelText('Mobile number or email')).toBeInTheDocument();
      const password = screen.getByLabelText('Password');
      expect(password).toHaveAttribute('type', 'password');
      expect(password).toHaveAttribute('autocomplete', 'current-password');
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Forgot your password?' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Register your pump' })).toBeInTheDocument();
      // No second, email-only box.
      expect(screen.queryByLabelText(/^Email$/)).toBeNull();
    });

    it('is in Hindi when the app is', () => {
      renderLogin('hi');
      expect(screen.getByLabelText('मोबाइल नंबर या ईमेल')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'पासवर्ड भूल गए?' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'अपना पंप रजिस्टर करें' })).toBeInTheDocument();
    });

    it('the eye shows and hides the password', async () => {
      const user = userEvent.setup();
      renderLogin();
      const password = screen.getByLabelText('Password');
      await user.click(screen.getByRole('button', { name: 'Show password' }));
      expect(password).toHaveAttribute('type', 'text');
      await user.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(password).toHaveAttribute('type', 'password');
    });

    it('Register your pump goes to the registration screen', async () => {
      const user = userEvent.setup();
      renderLogin();
      await user.click(screen.getByRole('button', { name: 'Register your pump' }));
      expect(await screen.findByText('register-page')).toBeInTheDocument();
    });

    it('says a dealer chooses their own password, and when to sign in', () => {
      renderLogin();
      expect(
        screen.getByText(/Register your pump and choose a password. Once the MDG team approves it/),
      ).toBeInTheDocument();
    });
  });

  describe('signing in', () => {
    it('sends a mobile number as ten plain digits, however it was typed', async () => {
      fetchMock.mockResolvedValue(ok({ token: 'tok', user: OWNER }));
      const user = userEvent.setup();
      renderLogin();
      await user.type(screen.getByLabelText('Mobile number or email'), ' +91 98765 43210 ');
      await user.type(screen.getByLabelText('Password'), PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(await screen.findByText('chat-page')).toBeInTheDocument();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/v1\/auth\/login$/);
      expect(init.method).toBe('POST');
      expect(sentBody()).toEqual({ identifier: '9876543210', password: PASSWORD });
      expect(useAuthStore.getState().token).toBe('tok');
      expect(useAuthStore.getState().user?.id).toBe('u1');
    });

    it('sends an email trimmed and in lower case', async () => {
      fetchMock.mockResolvedValue(ok({ token: 'tok', user: OWNER }));
      const user = userEvent.setup();
      renderLogin();
      await user.type(screen.getByLabelText('Mobile number or email'), '  Ramesh@Example.COM ');
      await user.type(screen.getByLabelText('Password'), PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      await screen.findByText('chat-page');
      expect(sentBody()).toEqual({ identifier: 'ramesh@example.com', password: PASSWORD });
    });

    it('takes a number typed in Hindi digits', async () => {
      fetchMock.mockResolvedValue(ok({ token: 'tok', user: OWNER }));
      const user = userEvent.setup();
      renderLogin();
      await user.type(screen.getByLabelText('Mobile number or email'), '९८७६५ ४३२१०');
      await user.type(screen.getByLabelText('Password'), PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      await screen.findByText('chat-page');
      expect(sentBody().identifier).toBe('9876543210');
    });

    it('a temporary password still signs in: the flag rides on the user, for the app to act on', async () => {
      fetchMock.mockResolvedValue(
        ok({ token: 'tok', user: { ...OWNER, mustChangePassword: true } }),
      );
      const user = userEvent.setup();
      renderLogin();
      await user.type(screen.getByLabelText('Mobile number or email'), '9876543210');
      await user.type(screen.getByLabelText('Password'), 'given-by-mdg');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      await screen.findByText('chat-page');
      expect(useAuthStore.getState().user?.mustChangePassword).toBe(true);
    });

    it('sends nothing until both are filled, and says what is wrong', async () => {
      const user = userEvent.setup();
      renderLogin();
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByText('Enter your mobile number or email')).toBeInTheDocument();
      expect(screen.getByText('Enter your password')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Mobile number or email'), '12345');
      await user.type(screen.getByLabelText('Password'), PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(
        await screen.findByText('Enter a 10-digit mobile number or a valid email'),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is never left in the mutation cache or a console line', async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
        vi.spyOn(console, k).mockImplementation(() => {}),
      );
      fetchMock.mockResolvedValue(refused(401, 'UNAUTHORIZED', 'Invalid credentials'));
      const user = userEvent.setup();
      const { queryClient } = renderLogin();
      await user.type(screen.getByLabelText('Mobile number or email'), '9876543210');
      await user.type(screen.getByLabelText('Password'), PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      await screen.findByText(/didn't work/);
      await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0));
      for (const spy of spies) {
        for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(PASSWORD);
      }
    });
  });

  describe('when it does not go through', () => {
    async function attempt(response: Response | Error) {
      if (response instanceof Error) fetchMock.mockRejectedValue(response);
      else fetchMock.mockResolvedValue(response);
      const user = userEvent.setup();
      renderLogin();
      await user.type(screen.getByLabelText('Mobile number or email'), '9876543210');
      await user.type(screen.getByLabelText('Password'), PASSWORD);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
    }

    it('401: one warm sentence, never the server\'s words — and no "signed in elsewhere" note', async () => {
      await attempt(refused(401, 'UNAUTHORIZED', 'Invalid credentials'));
      expect(
        await screen.findByText(
          'That mobile number, email or password didn\'t work. Try again, or tap "Forgot your password?".',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('Invalid credentials')).toBeNull();
      // A wrong password is an answer, not an ended session.
      expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
      expect(screen.queryByText(/another phone/i)).toBeNull();
    });

    it('409: a number on more than one account says to use the email, plainly', async () => {
      await attempt(
        refused(409, 'CONFLICT', 'This number has more than one account. Sign in with your email.'),
      );
      expect(
        await screen.findByText('This number has more than one account. Sign in with your email.'),
      ).toBeInTheDocument();
    });

    it('409 in Hindi', async () => {
      fetchMock.mockResolvedValue(refused(409, 'CONFLICT', 'x'));
      const user = userEvent.setup();
      renderLogin('hi');
      await user.type(screen.getByLabelText('मोबाइल नंबर या ईमेल'), '9876543210');
      await user.type(screen.getByLabelText('पासवर्ड'), PASSWORD);
      await user.click(screen.getByRole('button', { name: 'साइन इन करें' }));
      expect(
        await screen.findByText('इस नंबर पर एक से ज़्यादा खाते हैं। अपने ईमेल से साइन इन कीजिए।'),
      ).toBeInTheDocument();
    });

    it('429: asks to wait', async () => {
      await attempt(refused(429, 'RATE_LIMITED', 'slow down'));
      expect(
        await screen.findByText('Too many tries. Please wait a little and try again.'),
      ).toBeInTheDocument();
    });

    it('403: a suspended or archived account says to contact MDG', async () => {
      await attempt(refused(403, 'FORBIDDEN', 'This account is no longer active. Contact MDG support.'));
      expect(
        await screen.findByText('This account is not active right now. Please contact the MDG team.'),
      ).toBeInTheDocument();
    });

    it('a dropped connection says to check the network', async () => {
      await attempt(new TypeError('Failed to fetch'));
      expect(
        await screen.findByText('Something went wrong. Please check your network and try again.'),
      ).toBeInTheDocument();
    });

    it('stays on the form with what was typed', async () => {
      await attempt(refused(401, 'UNAUTHORIZED', 'Invalid credentials'));
      await screen.findByText(/didn't work/);
      expect(screen.getByLabelText('Mobile number or email')).toHaveValue('9876543210');
      expect(useAuthStore.getState().token).toBeNull();
    });
  });

  describe('Forgot your password?', () => {
    async function openSheet(user: ReturnType<typeof userEvent.setup>, lang: 'en' | 'hi' = 'en') {
      renderLogin(lang);
      await user.click(
        screen.getByRole('button', { name: lang === 'en' ? 'Forgot your password?' : 'पासवर्ड भूल गए?' }),
      );
      return screen.findByRole('dialog');
    }

    it('opens a small sheet that asks for the mobile number or email', async () => {
      const user = userEvent.setup();
      const sheet = await openSheet(user);
      expect(within(sheet).getByRole('heading', { name: 'Forgot your password?' })).toBeInTheDocument();
      expect(within(sheet).getByLabelText('Mobile number or email')).toBeInTheDocument();
      expect(
        within(sheet).getByText(/The MDG team will call you on your registered number/),
      ).toBeInTheDocument();
    });

    it('sends the number as ten digits and says the team will call', async () => {
      fetchMock.mockResolvedValue(ok({ received: true }));
      const user = userEvent.setup();
      const sheet = await openSheet(user);
      await user.type(within(sheet).getByLabelText('Mobile number or email'), '98765 43210');
      await user.click(within(sheet).getByRole('button', { name: 'Send' }));

      expect(await within(sheet).findByText('The MDG team will call you.')).toBeInTheDocument();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/v1\/auth\/forgot-password$/);
      expect(init.method).toBe('POST');
      expect(sentBody()).toEqual({ identifier: '9876543210' });
      // No password reset is promised or attempted: only a call.
      expect(within(sheet).queryByLabelText('Password')).toBeNull();
    });

    it('sends an email in lower case', async () => {
      fetchMock.mockResolvedValue(ok({ received: true }));
      const user = userEvent.setup();
      const sheet = await openSheet(user);
      await user.type(within(sheet).getByLabelText('Mobile number or email'), 'Ramesh@Example.com');
      await user.click(within(sheet).getByRole('button', { name: 'Send' }));
      await within(sheet).findByText('The MDG team will call you.');
      expect(sentBody()).toEqual({ identifier: 'ramesh@example.com' });
    });

    it('says the same thing in Hindi', async () => {
      fetchMock.mockResolvedValue(ok({ received: true }));
      const user = userEvent.setup();
      const sheet = await openSheet(user, 'hi');
      await user.type(within(sheet).getByLabelText('मोबाइल नंबर या ईमेल'), '9876543210');
      await user.click(within(sheet).getByRole('button', { name: 'भेजिए' }));
      expect(await within(sheet).findByText('MDG की टीम आपको कॉल करेगी।')).toBeInTheDocument();
    });

    it('catches something that is neither a number nor an email, without asking the server', async () => {
      const user = userEvent.setup();
      const sheet = await openSheet(user);
      await user.type(within(sheet).getByLabelText('Mobile number or email'), 'ramesh');
      await user.click(within(sheet).getByRole('button', { name: 'Send' }));
      expect(
        await within(sheet).findByText('Enter a 10-digit mobile number or a valid email'),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never says whether an account matched: the answer is the same either way', async () => {
      const said: string[] = [];
      for (const answer of [ok({ received: true }), ok({})]) {
        fetchMock.mockResolvedValue(answer);
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        await user.type(within(sheet).getByLabelText('Mobile number or email'), '9876543210');
        await user.click(within(sheet).getByRole('button', { name: 'Send' }));
        await within(sheet).findByText('The MDG team will call you.');
        said.push(sheet.textContent ?? '');
        document.body.innerHTML = '';
      }
      expect(said[0]).toBe(said[1]);
    });

    it('a failed send says so and keeps the form for another go', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const user = userEvent.setup();
      const sheet = await openSheet(user);
      await user.type(within(sheet).getByLabelText('Mobile number or email'), '9876543210');
      await user.click(within(sheet).getByRole('button', { name: 'Send' }));
      expect(await within(sheet).findByRole('alert')).toHaveTextContent('check your network');
      expect(within(sheet).getByLabelText('Mobile number or email')).toHaveValue('9876543210');
      expect(within(sheet).queryByText('The MDG team will call you.')).toBeNull();
    });

    it('OK closes it, and so do the ✕ and Escape', async () => {
      fetchMock.mockResolvedValue(ok({ received: true }));
      const user = userEvent.setup();
      let sheet = await openSheet(user);
      await user.type(within(sheet).getByLabelText('Mobile number or email'), '9876543210');
      await user.click(within(sheet).getByRole('button', { name: 'Send' }));
      await user.click(await within(sheet).findByRole('button', { name: 'OK' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
      sheet = await screen.findByRole('dialog');
      await user.click(within(sheet).getByRole('button', { name: 'Dismiss' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
      await screen.findByRole('dialog');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });
});
