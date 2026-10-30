import { cleanup, screen, waitFor, within } from '@testing-library/react';
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
        screen.getByText(/Register your pump and choose your own password. Then sign in with your mobile number/),
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
    const TOKEN = 'k3Jx9Qw2Lm8Vb4Nz7Hp1Rt5Yc6Ud0Fs-GaEoIiXyWqM';
    const CODE = '482913';
    const NEW_PASSWORD = 'my-own-pump-2026';

    /** What the server says to each call. A function, so every call gets a fresh Response. */
    type Answer = () => Response | Error;
    interface Routes {
      options: Answer;
      request: Answer;
      verify: Answer;
      confirm: Answer;
      forgot: Answer;
    }
    function serve(over: Partial<Routes> = {}): Routes {
      const routes: Routes = {
        options: () => ok({ whatsapp: true, email: true }),
        request: () => ok({ sent: true }),
        verify: () => ok({ resetToken: TOKEN }),
        confirm: () => ok({ ok: true }),
        forgot: () => ok({ received: true }),
        ...over,
      };
      const answer = (a: Answer) => {
        const r = a();
        return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
      };
      fetchMock.mockImplementation((url: string) => {
        if (/\/v1\/auth\/password-reset\/options$/.test(url)) return answer(routes.options);
        if (/\/v1\/auth\/password-reset\/request$/.test(url)) return answer(routes.request);
        if (/\/v1\/auth\/password-reset\/verify$/.test(url)) return answer(routes.verify);
        if (/\/v1\/auth\/password-reset\/confirm$/.test(url)) return answer(routes.confirm);
        if (/\/v1\/auth\/forgot-password$/.test(url)) return answer(routes.forgot);
        return Promise.reject(new Error(`unexpected ${url}`));
      });
      return routes;
    }
    const callsTo = (re: RegExp) =>
      fetchMock.mock.calls.filter((c) => re.test(c[0] as string)) as Array<[string, RequestInit]>;
    const bodyTo = (re: RegExp, n = 0) => JSON.parse(callsTo(re)[n]![1].body as string);

    const REQUEST = /\/password-reset\/request$/;
    const VERIFY = /\/password-reset\/verify$/;
    const CONFIRM = /\/password-reset\/confirm$/;
    const FORGOT = /\/forgot-password$/;

    async function openSheet(user: ReturnType<typeof userEvent.setup>, lang: 'en' | 'hi' = 'en') {
      renderLogin(lang);
      await user.click(
        screen.getByRole('button', { name: lang === 'en' ? 'Forgot your password?' : 'पासवर्ड भूल गए?' }),
      );
      return screen.findByRole('dialog');
    }

    /** Open the sheet and type a mobile number, then Continue: the channel step. */
    async function toChannelStep(user: ReturnType<typeof userEvent.setup>, typed = '98765 43210') {
      const sheet = await openSheet(user);
      await within(sheet).findByText(/We will send you a code/);
      await user.type(within(sheet).getByLabelText('Mobile number or email'), typed);
      await user.click(within(sheet).getByRole('button', { name: 'Continue' }));
      await within(sheet).findByText('Where should we send the code?');
      return sheet;
    }

    /** …then pick WhatsApp: the code step. */
    async function toCodeStep(user: ReturnType<typeof userEvent.setup>) {
      const sheet = await toChannelStep(user);
      await user.click(within(sheet).getByRole('button', { name: 'On WhatsApp' }));
      await within(sheet).findByText('If this account exists, a code has been sent.');
      return sheet;
    }

    /** …then the right code: the new-password step. */
    async function toPasswordStep(user: ReturnType<typeof userEvent.setup>) {
      const sheet = await toCodeStep(user);
      await user.type(within(sheet).getByLabelText('The 6-digit code'), CODE);
      await user.click(within(sheet).getByRole('button', { name: 'Continue' }));
      await within(sheet).findByText('Now choose your new password.');
      return sheet;
    }

    describe('the first step', () => {
      it('opens a small sheet that asks for the mobile number or email, and says a code is coming', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        expect(within(sheet).getByRole('heading', { name: 'Forgot your password?' })).toBeInTheDocument();
        expect(within(sheet).getByLabelText('Mobile number or email')).toBeInTheDocument();
        expect(await within(sheet).findByText(/We will send you a code/)).toBeInTheDocument();
        expect(within(sheet).getByRole('button', { name: 'Continue' })).toBeInTheDocument();
        // Asked once, with no token: the call is public.
        const [url, init] = callsTo(/password-reset\/options$/)[0]!;
        expect(url).toMatch(/\/v1\/auth\/password-reset\/options$/);
        expect(init.method).toBe('GET');
        expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
      });

      it('the way to the team is a small link under it', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        await within(sheet).findByText(/We will send you a code/);
        expect(
          within(sheet).getByRole('button', { name: 'No code? Ask the team to call you' }),
        ).toBeInTheDocument();
      });

      it('catches something that is neither a number nor an email, without asking the server', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        await within(sheet).findByText(/We will send you a code/);
        await user.type(within(sheet).getByLabelText('Mobile number or email'), 'ramesh');
        await user.click(within(sheet).getByRole('button', { name: 'Continue' }));
        expect(
          await within(sheet).findByText('Enter a 10-digit mobile number or a valid email'),
        ).toBeInTheDocument();
        expect(callsTo(REQUEST)).toHaveLength(0);
        expect(callsTo(FORGOT)).toHaveLength(0);
      });

      it('says all of it in Hindi', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await openSheet(user, 'hi');
        expect(await within(sheet).findByText(/नया पासवर्ड बनाने के लिए हम आपको एक कोड भेजेंगे/)).toBeInTheDocument();
        await user.type(within(sheet).getByLabelText('मोबाइल नंबर या ईमेल'), '9876543210');
        await user.click(within(sheet).getByRole('button', { name: 'आगे बढ़िए' }));
        expect(await within(sheet).findByText('कोड कहाँ भेजें?')).toBeInTheDocument();
        expect(within(sheet).getByRole('button', { name: 'WhatsApp पर' })).toBeInTheDocument();
        expect(within(sheet).getByRole('button', { name: 'ईमेल पर' })).toBeInTheDocument();
      });
    });

    describe('where to send the code', () => {
      it('offers WhatsApp and email when the server can send on both', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toChannelStep(user);
        expect(within(sheet).getByRole('button', { name: 'On WhatsApp' })).toBeInTheDocument();
        expect(within(sheet).getByRole('button', { name: 'By email' })).toBeInTheDocument();
        // What was typed is shown, so a slipped digit is seen before a code is sent for it.
        expect(within(sheet).getByText('9876543210')).toBeInTheDocument();
        // Nothing was sent by getting here.
        expect(callsTo(REQUEST)).toHaveLength(0);
      });

      it('offers only the channels the server says are on', async () => {
        serve({ options: () => ok({ whatsapp: true, email: false }) });
        const user = userEvent.setup();
        let sheet = await toChannelStep(user);
        expect(within(sheet).getByRole('button', { name: 'On WhatsApp' })).toBeInTheDocument();
        expect(within(sheet).queryByRole('button', { name: 'By email' })).toBeNull();
        cleanup();

        serve({ options: () => ok({ whatsapp: false, email: true }) });
        sheet = await toChannelStep(user);
        expect(within(sheet).queryByRole('button', { name: 'On WhatsApp' })).toBeNull();
        expect(within(sheet).getByRole('button', { name: 'By email' })).toBeInTheDocument();
      });

      it('asks for a code on the channel chosen, with nothing but who and where', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toChannelStep(user);
        await user.click(within(sheet).getByRole('button', { name: 'By email' }));
        await within(sheet).findByText('If this account exists, a code has been sent.');
        const [url, init] = callsTo(REQUEST)[0]!;
        expect(url).toMatch(/\/v1\/auth\/password-reset\/request$/);
        expect(init.method).toBe('POST');
        expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
        // The mobile as ten digits, the channel — never a number or address to send to.
        expect(bodyTo(REQUEST)).toEqual({ identifier: '9876543210', channel: 'email' });
      });

      it('sends an email identifier trimmed and in lower case', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toChannelStep(user, '  Ramesh@Example.COM ');
        await user.click(within(sheet).getByRole('button', { name: 'On WhatsApp' }));
        await within(sheet).findByText('If this account exists, a code has been sent.');
        expect(bodyTo(REQUEST)).toEqual({ identifier: 'ramesh@example.com', channel: 'whatsapp' });
      });

      it('keeps the cursor inside the sheet from step to step, so Tab never leaves it', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toChannelStep(user);
        // The button that was pressed went with its step: focus is on the sheet, not the page.
        expect(sheet).toContainElement(document.activeElement as HTMLElement);
        await user.click(within(sheet).getByRole('button', { name: 'On WhatsApp' }));
        await within(sheet).findByText('If this account exists, a code has been sent.');
        // The code box takes it, so the code can be typed at once.
        expect(within(sheet).getByLabelText('The 6-digit code')).toHaveFocus();
        await user.type(within(sheet).getByLabelText('The 6-digit code'), CODE);
        await user.click(within(sheet).getByRole('button', { name: 'Continue' }));
        await within(sheet).findByText('Now choose your new password.');
        expect(within(sheet).getByLabelText('New password')).toHaveFocus();
      });

      it('Back returns to the first step with what was typed', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toChannelStep(user);
        await user.click(within(sheet).getByRole('button', { name: 'Back' }));
        expect(await within(sheet).findByLabelText('Mobile number or email')).toHaveValue('98765 43210');
      });

      it('a failed ask says so and keeps the choice for another go', async () => {
        serve({ request: () => new TypeError('Failed to fetch') });
        const user = userEvent.setup();
        const sheet = await toChannelStep(user);
        await user.click(within(sheet).getByRole('button', { name: 'On WhatsApp' }));
        expect(await within(sheet).findByRole('alert')).toHaveTextContent('check your network');
        expect(within(sheet).getByRole('button', { name: 'On WhatsApp' })).toBeEnabled();
      });

      it('too many asks says to wait', async () => {
        serve({ request: () => refused(429, 'RATE_LIMITED', 'Too many tries.') });
        const user = userEvent.setup();
        const sheet = await toChannelStep(user);
        await user.click(within(sheet).getByRole('button', { name: 'On WhatsApp' }));
        expect(await within(sheet).findByRole('alert')).toHaveTextContent(
          'Too many tries. Please wait a little and try again.',
        );
      });
    });

    describe('the code', () => {
      it('says only that a code is sent IF the account exists, and asks for six digits', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toCodeStep(user);
        expect(within(sheet).getByLabelText('The 6-digit code')).toHaveAttribute('inputmode', 'numeric');
        expect(within(sheet).getByLabelText('The 6-digit code')).toHaveAttribute(
          'autocomplete',
          'one-time-code',
        );
        // The same words whether or not there is an account: nothing here says which.
        expect(within(sheet).queryByText(/no account|not found|does not exist/i)).toBeNull();
      });

      it('sends the code with the identifier it was asked for, as six plain digits', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toCodeStep(user);
        // Pasted with a space (the box keeps only the digits) and in Hindi digits.
        await user.type(within(sheet).getByLabelText('The 6-digit code'), '४८२ 913');
        expect(within(sheet).getByLabelText('The 6-digit code')).toHaveValue(CODE);
        await user.click(within(sheet).getByRole('button', { name: 'Continue' }));
        await within(sheet).findByText('Now choose your new password.');
        const [url, init] = callsTo(VERIFY)[0]!;
        expect(url).toMatch(/\/v1\/auth\/password-reset\/verify$/);
        expect(init.method).toBe('POST');
        expect(bodyTo(VERIFY)).toEqual({ identifier: '9876543210', code: CODE });
      });

      it('wants all six digits before it asks the server', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toCodeStep(user);
        await user.type(within(sheet).getByLabelText('The 6-digit code'), '4829');
        await user.click(within(sheet).getByRole('button', { name: 'Continue' }));
        expect(await within(sheet).findByText('Enter all 6 digits')).toBeInTheDocument();
        expect(callsTo(VERIFY)).toHaveLength(0);
      });

      it('a wrong, old or used code says so in one sentence, clears the box, and stays here', async () => {
        serve({
          verify: () => refused(400, 'RESET_CODE_INVALID', 'That code is wrong or has expired.'),
        });
        const user = userEvent.setup();
        const sheet = await toCodeStep(user);
        await user.type(within(sheet).getByLabelText('The 6-digit code'), '111111');
        await user.click(within(sheet).getByRole('button', { name: 'Continue' }));
        expect(await within(sheet).findByRole('alert')).toHaveTextContent(
          'That code is wrong or has expired.',
        );
        expect(within(sheet).getByLabelText('The 6-digit code')).toHaveValue('');
        expect(within(sheet).queryByLabelText('New password')).toBeNull();
        // Typing again is a new try: the refusal's red goes.
        await user.type(within(sheet).getByLabelText('The 6-digit code'), '2');
        expect(within(sheet).queryByRole('alert')).toBeNull();
      });

      it('too many tries says to wait, and keeps what was typed', async () => {
        serve({ verify: () => refused(429, 'RATE_LIMITED', 'Too many tries.') });
        const user = userEvent.setup();
        const sheet = await toCodeStep(user);
        await user.type(within(sheet).getByLabelText('The 6-digit code'), CODE);
        await user.click(within(sheet).getByRole('button', { name: 'Continue' }));
        expect(await within(sheet).findByRole('alert')).toHaveTextContent(
          'Too many tries. Please wait a little and try again.',
        );
        expect(within(sheet).getByLabelText('The 6-digit code')).toHaveValue(CODE);
      });

      describe('Send again', () => {
        afterEach(() => vi.restoreAllMocks());

        it('waits 30 seconds, counting down, and then asks the same way again', async () => {
          serve();
          const user = userEvent.setup();
          const sheet = await toCodeStep(user);
          const wait = within(sheet).getByRole('button', { name: /Send again in \d+ s/ });
          expect(wait).toBeDisabled();
          expect(within(sheet).getByRole('button', { name: 'Send again in 30 s' })).toBeInTheDocument();
          expect(callsTo(REQUEST)).toHaveLength(1);

          // Thirty-one seconds on (the clock jumps; the box ticks once a second).
          const real = Date.now();
          vi.spyOn(Date, 'now').mockImplementation(() => real + 31_000);
          const again = await within(sheet).findByRole(
            'button',
            { name: 'Send again' },
            { timeout: 3000 },
          );
          expect(again).toBeEnabled();
          await user.click(again);

          await waitFor(() => expect(callsTo(REQUEST)).toHaveLength(2));
          expect(bodyTo(REQUEST, 1)).toEqual({ identifier: '9876543210', channel: 'whatsapp' });
          // …and the wait starts over.
          await within(sheet).findByRole('button', { name: /Send again in \d+ s/ });
        });
      });

      it('has the way to the team under it', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toCodeStep(user);
        await user.click(within(sheet).getByRole('button', { name: 'No code? Ask the team to call you' }));
        expect(await within(sheet).findByText('The MDG team will call you.')).toBeInTheDocument();
        expect(bodyTo(FORGOT)).toEqual({ identifier: '9876543210' });
      });
    });

    describe('the new password', () => {
      it('wants 8 characters and the same twice, without asking the server', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toPasswordStep(user);
        await user.type(within(sheet).getByLabelText('New password'), 'short');
        await user.type(within(sheet).getByLabelText('New password again'), 'short');
        await user.click(within(sheet).getByRole('button', { name: 'Save new password' }));
        expect(await within(sheet).findByText('At least 8 characters')).toBeInTheDocument();

        await user.clear(within(sheet).getByLabelText('New password'));
        await user.type(within(sheet).getByLabelText('New password'), NEW_PASSWORD);
        await user.click(within(sheet).getByRole('button', { name: 'Save new password' }));
        expect(await within(sheet).findByText('Passwords do not match')).toBeInTheDocument();
        expect(callsTo(CONFIRM)).toHaveLength(0);
      });

      it('sets it with the token from the code, then says so', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toPasswordStep(user);
        await user.type(within(sheet).getByLabelText('New password'), NEW_PASSWORD);
        await user.type(within(sheet).getByLabelText('New password again'), NEW_PASSWORD);
        await user.click(within(sheet).getByRole('button', { name: 'Save new password' }));
        expect(
          await within(sheet).findByText('Your new password is set. Sign in now.'),
        ).toBeInTheDocument();
        const [url, init] = callsTo(CONFIRM)[0]!;
        expect(url).toMatch(/\/v1\/auth\/password-reset\/confirm$/);
        expect(init.method).toBe('POST');
        expect(bodyTo(CONFIRM)).toEqual({ resetToken: TOKEN, newPassword: NEW_PASSWORD });
        // Not signed in: the dealer signs in the ordinary way.
        expect(useAuthStore.getState().token).toBeNull();
        expect(fetchMock.mock.calls.some((c) => /\/auth\/login$/.test(c[0] as string))).toBe(false);
      });

      it('then goes back to sign-in with the mobile filled in and the cursor on the password', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toPasswordStep(user);
        await user.type(within(sheet).getByLabelText('New password'), NEW_PASSWORD);
        await user.type(within(sheet).getByLabelText('New password again'), NEW_PASSWORD);
        await user.click(within(sheet).getByRole('button', { name: 'Save new password' }));
        await user.click(await within(sheet).findByRole('button', { name: 'Sign in' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByLabelText('Mobile number or email')).toHaveValue('9876543210');
        expect(screen.getByLabelText('Password')).toHaveValue('');
        await waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus());
      });

      it('closing the done screen any other way does the same', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await toPasswordStep(user);
        await user.type(within(sheet).getByLabelText('New password'), NEW_PASSWORD);
        await user.type(within(sheet).getByLabelText('New password again'), NEW_PASSWORD);
        await user.click(within(sheet).getByRole('button', { name: 'Save new password' }));
        await within(sheet).findByText('Your new password is set. Sign in now.');
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByLabelText('Mobile number or email')).toHaveValue('9876543210');
      });

      it('a reset that ran out starts the whole thing again, with the mobile kept', async () => {
        serve({
          confirm: () =>
            refused(400, 'RESET_TOKEN_INVALID', 'This reset has expired. Please start again.'),
        });
        const user = userEvent.setup();
        const sheet = await toPasswordStep(user);
        await user.type(within(sheet).getByLabelText('New password'), NEW_PASSWORD);
        await user.type(within(sheet).getByLabelText('New password again'), NEW_PASSWORD);
        await user.click(within(sheet).getByRole('button', { name: 'Save new password' }));
        expect(
          await within(sheet).findByText('This reset has expired. Please start again.'),
        ).toBeInTheDocument();
        expect(within(sheet).getByLabelText('Mobile number or email')).toHaveValue('98765 43210');
        expect(within(sheet).queryByLabelText('New password')).toBeNull();
      });

      it('a failed save says so and keeps the box for another go', async () => {
        serve({ confirm: () => new TypeError('Failed to fetch') });
        const user = userEvent.setup();
        const sheet = await toPasswordStep(user);
        await user.type(within(sheet).getByLabelText('New password'), NEW_PASSWORD);
        await user.type(within(sheet).getByLabelText('New password again'), NEW_PASSWORD);
        await user.click(within(sheet).getByRole('button', { name: 'Save new password' }));
        expect(await within(sheet).findByRole('alert')).toHaveTextContent('check your network');
        expect(within(sheet).getByLabelText('New password')).toHaveValue(NEW_PASSWORD);
      });

      it('the code, the token and the password are never left in the mutation cache or a console line', async () => {
        const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
          vi.spyOn(console, k).mockImplementation(() => {}),
        );
        serve();
        const user = userEvent.setup();
        // `renderLogin` is called inside `openSheet`: take its client from the cache after.
        const sheet = await toPasswordStep(user);
        await user.type(within(sheet).getByLabelText('New password'), NEW_PASSWORD);
        await user.type(within(sheet).getByLabelText('New password again'), NEW_PASSWORD);
        await user.click(within(sheet).getByRole('button', { name: 'Save new password' }));
        await within(sheet).findByText('Your new password is set. Sign in now.');
        for (const spy of spies) {
          for (const call of spy.mock.calls) {
            const text = JSON.stringify(call);
            for (const secret of [NEW_PASSWORD, TOKEN, CODE]) expect(text).not.toContain(secret);
          }
          spy.mockRestore();
        }
      });
    });

    describe('while no code can be sent: the team calls instead', () => {
      it('is the sheet it always was when neither channel is on', async () => {
        serve({ options: () => ok({ whatsapp: false, email: false }) });
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        expect(
          await within(sheet).findByText(/The MDG team will call you on your registered number/),
        ).toBeInTheDocument();
        expect(within(sheet).getByRole('button', { name: 'Send' })).toBeInTheDocument();
        expect(within(sheet).queryByRole('button', { name: 'Continue' })).toBeNull();
        // Its own button is the request: no second link for the same thing.
        expect(within(sheet).queryByRole('button', { name: /No code\?/ })).toBeNull();
      });

      it('and when the answer could not be had at all', async () => {
        serve({ options: () => new TypeError('Failed to fetch') });
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        expect(
          await within(sheet).findByText(/The MDG team will call you on your registered number/),
        ).toBeInTheDocument();
        expect(within(sheet).getByRole('button', { name: 'Send' })).toBeInTheDocument();
      });

      it('sends the number as ten digits and says the team will call', async () => {
        serve({ options: () => ok({ whatsapp: false, email: false }) });
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        await within(sheet).findByText(/The MDG team will call you/);
        await user.type(within(sheet).getByLabelText('Mobile number or email'), '98765 43210');
        await user.click(within(sheet).getByRole('button', { name: 'Send' }));

        expect(await within(sheet).findByText('The MDG team will call you.')).toBeInTheDocument();
        const [url, init] = callsTo(FORGOT)[0]!;
        expect(url).toMatch(/\/v1\/auth\/forgot-password$/);
        expect(init.method).toBe('POST');
        expect(bodyTo(FORGOT)).toEqual({ identifier: '9876543210' });
        // No password reset is promised or attempted: only a call.
        expect(within(sheet).queryByLabelText('Password')).toBeNull();
        expect(callsTo(REQUEST)).toHaveLength(0);
      });

      it('sends an email in lower case', async () => {
        serve({ options: () => ok({ whatsapp: false, email: false }) });
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        await within(sheet).findByText(/The MDG team will call you/);
        await user.type(within(sheet).getByLabelText('Mobile number or email'), 'Ramesh@Example.com');
        await user.click(within(sheet).getByRole('button', { name: 'Send' }));
        await within(sheet).findByText('The MDG team will call you.');
        expect(bodyTo(FORGOT)).toEqual({ identifier: 'ramesh@example.com' });
      });

      it('says the same thing in Hindi', async () => {
        serve({ options: () => ok({ whatsapp: false, email: false }) });
        const user = userEvent.setup();
        const sheet = await openSheet(user, 'hi');
        await within(sheet).findByText(/MDG की टीम आपके रजिस्टर्ड नंबर पर कॉल करेगी/);
        await user.type(within(sheet).getByLabelText('मोबाइल नंबर या ईमेल'), '9876543210');
        await user.click(within(sheet).getByRole('button', { name: 'भेजिए' }));
        expect(await within(sheet).findByText('MDG की टीम आपको कॉल करेगी।')).toBeInTheDocument();
      });

      it('catches something that is neither a number nor an email, without asking the server', async () => {
        serve({ options: () => ok({ whatsapp: false, email: false }) });
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        await within(sheet).findByText(/The MDG team will call you/);
        await user.type(within(sheet).getByLabelText('Mobile number or email'), 'ramesh');
        await user.click(within(sheet).getByRole('button', { name: 'Send' }));
        expect(
          await within(sheet).findByText('Enter a 10-digit mobile number or a valid email'),
        ).toBeInTheDocument();
        expect(callsTo(FORGOT)).toHaveLength(0);
      });

      it('never says whether an account matched: the answer is the same either way', async () => {
        const said: string[] = [];
        for (const answer of [() => ok({ received: true }), () => ok({})]) {
          serve({ options: () => ok({ whatsapp: false, email: false }), forgot: answer });
          const user = userEvent.setup();
          const sheet = await openSheet(user);
          await within(sheet).findByText(/The MDG team will call you/);
          await user.type(within(sheet).getByLabelText('Mobile number or email'), '9876543210');
          await user.click(within(sheet).getByRole('button', { name: 'Send' }));
          await within(sheet).findByText('The MDG team will call you.');
          said.push(sheet.textContent ?? '');
          cleanup();
        }
        expect(said[0]).toBe(said[1]);
      });

      it('a failed send says so and keeps the form for another go', async () => {
        serve({
          options: () => ok({ whatsapp: false, email: false }),
          forgot: () => new TypeError('Failed to fetch'),
        });
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        await within(sheet).findByText(/The MDG team will call you/);
        await user.type(within(sheet).getByLabelText('Mobile number or email'), '9876543210');
        await user.click(within(sheet).getByRole('button', { name: 'Send' }));
        expect(await within(sheet).findByRole('alert')).toHaveTextContent('check your network');
        expect(within(sheet).getByLabelText('Mobile number or email')).toHaveValue('9876543210');
        expect(within(sheet).queryByText('The MDG team will call you.')).toBeNull();
      });
    });

    describe('the link to the team, when codes can be sent', () => {
      it('from the first step: asks for the call with the number typed', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        await within(sheet).findByText(/We will send you a code/);
        await user.type(within(sheet).getByLabelText('Mobile number or email'), '9876543210');
        await user.click(within(sheet).getByRole('button', { name: 'No code? Ask the team to call you' }));
        expect(await within(sheet).findByText('The MDG team will call you.')).toBeInTheDocument();
        expect(bodyTo(FORGOT)).toEqual({ identifier: '9876543210' });
        expect(callsTo(REQUEST)).toHaveLength(0);
      });

      it('from the first step with nothing typed: asks for the number first', async () => {
        serve();
        const user = userEvent.setup();
        const sheet = await openSheet(user);
        await within(sheet).findByText(/We will send you a code/);
        await user.click(within(sheet).getByRole('button', { name: 'No code? Ask the team to call you' }));
        expect(
          await within(sheet).findByText('Enter a 10-digit mobile number or a valid email'),
        ).toBeInTheDocument();
        expect(callsTo(FORGOT)).toHaveLength(0);
      });
    });

    it('OK closes the call-back screen, and so do the ✕ and Escape', async () => {
      serve({ options: () => ok({ whatsapp: false, email: false }) });
      const user = userEvent.setup();
      let sheet = await openSheet(user);
      await within(sheet).findByText(/The MDG team will call you/);
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

describe('LoginPage — the privacy policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetStores();
  });

  // Apple will not take an app whose policy cannot be read from inside it, and
  // a dealer weighing whether to register is who wants it — before any sign-in.
  it('is one tap from the sign-in screen, opened in the phone\'s browser', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    renderLogin();

    const link = screen.getByRole('link', { name: 'Privacy policy' });
    expect(link).toHaveAttribute('href', 'https://mdgservices.in/privacy');
    await user.click(link);
    expect(open).toHaveBeenCalledWith('https://mdgservices.in/privacy', '_blank', 'noopener');
    // The app stays where it is.
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('says it in Hindi', () => {
    renderLogin('hi');
    expect(screen.getByRole('link', { name: 'प्राइवेसी पॉलिसी' })).toBeInTheDocument();
  });
});
