import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firstScreen } from '@/features/auth/firstScreen';
import { TERMS_EN, TERMS_HI } from '@/features/register/terms';
import { HELPLINE } from '@/lib/helpline';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { makeUser, renderWithProviders, resetStores } from '@/test/utils';

import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

function renderAt(route: string, lang: 'en' | 'hi' = 'en') {
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<div>today-page</div>} />
    </Routes>,
    { route },
  );
}

/** The endpoint's answer; with no `account`, as one from before the answer existed (`waiting`). */
function okResponse(account?: string) {
  return new Response(JSON.stringify({ ok: true, ...(account ? { account } : {}) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PASSWORD = 'Sai-pump-2026';

type User = ReturnType<typeof userEvent.setup>;

/** The step line's words: "1 of 3: you" and so on. */
const stepLine = () => screen.getByTestId('register-step');

async function fillStep1(user: User) {
  await user.type(screen.getByLabelText('Your name'), '  Ramesh Kumar ');
  await user.type(screen.getByLabelText('Your mobile'), '98765 43210');
  await user.type(screen.getByLabelText(/Your email/), 'ramesh@example.com');
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

/** Step 1's boxes only, with no tap on Next. */
async function fillStep1Fields(user: User) {
  await user.type(screen.getByLabelText('Your name'), 'Ramesh Kumar');
  await user.type(screen.getByLabelText('Your mobile'), '9876543210');
}

async function fillStep2(user: User) {
  await user.click(screen.getByLabelText('Type B'));
  await user.type(screen.getByLabelText(/Pump name/), 'Sai Petroleums');
  await user.type(screen.getByLabelText('SAP code'), '41001234');
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

/** All three steps: leaves the form on step 3 with the password in and the terms NOT yet ticked. */
async function fillValidForm(user: User) {
  await fillStep1(user);
  await fillStep2(user);
  await user.type(screen.getByLabelText('Choose a password'), PASSWORD);
  await user.type(screen.getByLabelText('Password again'), PASSWORD);
}

describe('RegisterPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => resetStores());

  it('opened cold (first launch), the back arrow goes to sign-in', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(await screen.findByRole('button', { name: 'Register your pump' })).toBeInTheDocument();
    expect(screen.queryByLabelText('SAP code')).not.toBeInTheDocument();
  });

  it('opened from sign-in, the back arrow returns to it', async () => {
    const user = userEvent.setup();
    renderAt('/login');
    await user.click(screen.getByRole('button', { name: 'Register your pump' }));
    await user.click(await screen.findByRole('button', { name: 'Back to sign in' }));
    expect(await screen.findByRole('button', { name: 'Register your pump' })).toBeInTheDocument();
    expect(screen.queryByLabelText('SAP code')).not.toBeInTheDocument();
  });

  it('has a language switch, which flips the page without losing the form', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await user.type(screen.getByLabelText('Your name'), 'Ramesh');

    await user.click(screen.getByRole('button', { name: /^Language: / }));
    await user.click(screen.getByRole('radio', { name: 'हिंदी' }));

    expect(await screen.findByRole('heading', { name: 'अपना पंप रजिस्टर करें' })).toBeInTheDocument();
    expect(useLangStore.getState().lang).toBe('hi');
    expect(screen.getByDisplayValue('Ramesh')).toBeInTheDocument();
  });

  it('is reached from the sign-in footer, which says you choose your own password', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    expect(screen.getByText(/Register your pump and choose your own password/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Register your pump' }));

    expect(await screen.findByRole('heading', { name: 'Register your pump' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(stepLine()).toHaveTextContent('1 of 3: you');
  });

  it('sends nothing until the required details and the terms are in', async () => {
    const user = userEvent.setup();
    renderAt('/register');

    // Step 1: each step is checked before the next opens, so the errors are next to the button.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Enter your name')).toBeInTheDocument();
    expect(
      screen.getByText('Enter a 10-digit mobile number that starts with 6, 7, 8 or 9'),
    ).toBeInTheDocument();
    // Email is optional, as on the website; and still on step 1.
    expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument();
    expect(stepLine()).toHaveTextContent('1 of 3: you');

    await fillStep1Fields(user);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(stepLine()).toHaveTextContent('2 of 3: your pump');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Choose Type A or Type B')).toBeInTheDocument();
    expect(screen.getByText('Enter your SAP code')).toBeInTheDocument();
    expect(stepLine()).toHaveTextContent('2 of 3: your pump');

    await user.click(screen.getByLabelText('Type A'));
    await user.type(screen.getByLabelText('SAP code'), '41001234');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(stepLine()).toHaveTextContent('3 of 3: password and terms');

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    // The password is not optional: a registration is how the dealer gets their login.
    expect(await screen.findByText('At least 8 characters')).toBeInTheDocument();
    expect(
      screen.getByText('Read and accept the Terms & Conditions to continue'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens the terms in the app; the link does not tick the box, agreeing does', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await fillValidForm(user);
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
    await user.type(screen.getByLabelText('आपका नाम'), 'रमेश कुमार');
    await user.type(screen.getByLabelText('आपका मोबाइल'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'आगे बढ़ें' }));
    await user.click(screen.getByLabelText('Type A'));
    await user.type(screen.getByLabelText('SAP कोड'), '41001234');
    await user.click(screen.getByRole('button', { name: 'आगे बढ़ें' }));

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

    expect(await screen.findByText('You are registered.')).toBeInTheDocument();
    // What happens next, in three plain steps, and a way to a person.
    expect(screen.getByText('What happens next')).toBeInTheDocument();
    expect(screen.getByText('A person at MDG checks your details.')).toBeInTheDocument();
    expect(
      screen.getByText('We send you a WhatsApp message when your account is ready.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Received at /)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Call MDG/ })).toHaveAttribute('href', 'tel:18008913496');
    expect(
      screen.getByText('A welcome email is on its way to ramesh@example.com.'),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mdgservices.in/api/enroll');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Ramesh Kumar',
      // Sent as ten plain digits, as typed with a space.
      mobile: '9876543210',
      email: 'ramesh@example.com',
      siteType: 'Type B',
      pumpName: 'Sai Petroleums',
      sapCode: '41001234',
      agree: true,
      source: 'app',
      // The password goes to the endpoint as typed, the tick covers WhatsApp,
      // and the screen's language says which Terms text was ticked.
      password: PASSWORD,
      consentWhatsApp: true,
      lang: 'en',
      submissionId: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/),
    });
  });

  it('sends the film link\'s share code, and the Hindi screen\'s language', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const user = userEvent.setup();
    renderAt('/register?r=Ab3_x-9', 'hi');

    await user.type(screen.getByLabelText('आपका नाम'), 'रमेश कुमार');
    await user.type(screen.getByLabelText('आपका मोबाइल'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'आगे बढ़ें' }));
    await user.click(screen.getByLabelText('Type A'));
    await user.type(screen.getByLabelText('SAP कोड'), '41001234');
    await user.click(screen.getByRole('button', { name: 'आगे बढ़ें' }));
    await user.type(screen.getByLabelText('पासवर्ड चुनिए'), PASSWORD);
    await user.type(screen.getByLabelText('पासवर्ड दोबारा'), PASSWORD);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'भेजिए' }));

    expect(await screen.findByText('रजिस्ट्रेशन हो गया।')).toBeInTheDocument();
    expect(screen.getByText('आगे क्या होगा')).toBeInTheDocument();
    expect(screen.getByText('MDG का एक व्यक्ति आपकी जानकारी जाँचेगा।')).toBeInTheDocument();
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ ref: 'Ab3_x-9', lang: 'hi', consentWhatsApp: true });
  });

  it('leaves out a share code the endpoint would refuse', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const user = userEvent.setup();
    renderAt('/register?r=not%20a%20code!');

    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByText('You are registered.');
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty('ref');
  });

  describe('where the dealer stands once it is in', () => {
    async function send(user: ReturnType<typeof userEvent.setup>) {
      await fillValidForm(user);
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'Submit' }));
    }

    it('starts with a way to sign in, for anybody who already has an account', async () => {
      const user = userEvent.setup();
      renderAt('/register');
      expect(screen.getByText('Already registered?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByText(/Register your pump and choose your own password/)).toBeInTheDocument();
    });

    it('an account that is ready: signs in with what was just typed and opens the chat', async () => {
      fetchMock
        .mockResolvedValueOnce(okResponse('ready'))
        .mockResolvedValueOnce(
          jsonResponse(200, { ok: true, data: { token: 'new-token', user: makeUser({ id: 'u-new' }) } }),
        );
      const user = userEvent.setup();
      renderAt('/register');
      await send(user);

      expect(await screen.findByText('today-page')).toBeInTheDocument();
      expect(useAuthStore.getState().token).toBe('new-token');
      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url).toMatch(/\/v1\/auth\/login$/);
      expect(JSON.parse(init.body as string)).toEqual({ identifier: '9876543210', password: PASSWORD });
      // this phone now opens on Sign in, not Register
      expect(firstScreen()).toBe('/login');
    });

    it('an account that is ready but the sign-in did not go through: says so, and Sign in has the number in', async () => {
      fetchMock
        .mockResolvedValueOnce(okResponse('ready'))
        .mockResolvedValueOnce(jsonResponse(401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'no' } }));
      const user = userEvent.setup();
      renderAt('/register');
      await send(user);

      expect(await screen.findByText('Your account is ready.')).toBeInTheDocument();
      expect(useAuthStore.getState().token).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByLabelText('Mobile number or email')).toHaveValue('9876543210');
    });

    /** The server for an account that already exists: each path answers as given, in order. */
    function existingAccount(answers: {
      whatsapp?: boolean;
      verify?: Array<() => Response>;
      login?: () => Response;
    }) {
      const verify = [...(answers.verify ?? [() => jsonResponse(200, { ok: true, data: { resetToken: 'tok-1' } })])];
      fetchMock.mockImplementation(async (url: string) => {
        if (/\/password-reset\/options$/.test(url))
          return jsonResponse(200, { ok: true, data: { whatsapp: answers.whatsapp ?? true, email: false } });
        if (/\/password-reset\/request$/.test(url)) return jsonResponse(200, { ok: true, data: { sent: true } });
        if (/\/password-reset\/verify$/.test(url)) return (verify.shift() ?? verify[0]!)();
        if (/\/password-reset\/confirm$/.test(url)) return jsonResponse(200, { ok: true, data: { ok: true } });
        if (/\/auth\/login$/.test(url))
          return (answers.login ?? (() => jsonResponse(200, { ok: true, data: { token: 'old-dealer', user: makeUser({ id: 'u-old' }) } })))();
        if (/\/forgot-password$/.test(url)) return jsonResponse(200, { ok: true, data: {} });
        return okResponse('existing');
      });
    }

    const callTo = (path: RegExp) =>
      (fetchMock.mock.calls as Array<[string, RequestInit]>).filter(([url]) => path.test(url));

    it('a number that already has an account: a WhatsApp code opens it with the password just chosen', async () => {
      existingAccount({});
      const user = userEvent.setup();
      renderAt('/register');
      await send(user);

      expect(await screen.findByText('Welcome! Your account is already here.')).toBeInTheDocument();
      // The code went by itself, on WhatsApp, to the number on the form.
      expect(await screen.findByText(/sent a 6-digit code on WhatsApp to 9876543210/)).toBeInTheDocument();
      const [[, request]] = callTo(/\/password-reset\/request$/);
      expect(JSON.parse(request!.body as string)).toEqual({ identifier: '9876543210', channel: 'whatsapp' });

      await user.type(screen.getByLabelText('The 6-digit code'), '123 456');
      await user.click(screen.getByRole('button', { name: 'Open my account' }));

      expect(await screen.findByText('today-page')).toBeInTheDocument();
      expect(useAuthStore.getState().token).toBe('old-dealer');
      const [[, verify]] = callTo(/\/password-reset\/verify$/);
      expect(JSON.parse(verify!.body as string)).toEqual({ identifier: '9876543210', code: '123456' });
      const [[, confirm]] = callTo(/\/password-reset\/confirm$/);
      expect(JSON.parse(confirm!.body as string)).toEqual({ resetToken: 'tok-1', newPassword: PASSWORD });
      const [[, login]] = callTo(/\/auth\/login$/);
      expect(JSON.parse(login!.body as string)).toEqual({ identifier: '9876543210', password: PASSWORD });
    });

    it('a wrong code says so, empties the box, and the right one still opens the account', async () => {
      existingAccount({
        verify: [
          () => jsonResponse(400, { ok: false, error: { code: 'RESET_CODE_INVALID', message: 'no' } }),
          () => jsonResponse(200, { ok: true, data: { resetToken: 'tok-2' } }),
        ],
      });
      const user = userEvent.setup();
      renderAt('/register');
      await send(user);
      await screen.findByText(/sent a 6-digit code on WhatsApp/);

      await user.type(screen.getByLabelText('The 6-digit code'), '000000');
      await user.click(screen.getByRole('button', { name: 'Open my account' }));
      expect(await screen.findByText('That code is wrong or has expired.')).toBeInTheDocument();
      expect(screen.getByLabelText('The 6-digit code')).toHaveValue('');
      expect(callTo(/\/password-reset\/confirm$/)).toHaveLength(0);

      await user.type(screen.getByLabelText('The 6-digit code'), '654321');
      await user.click(screen.getByRole('button', { name: 'Open my account' }));
      expect(await screen.findByText('today-page')).toBeInTheDocument();
    });

    it('the password is set but the sign-in did not go through: Sign in, with the number in', async () => {
      existingAccount({ login: () => jsonResponse(401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'no' } }) });
      const user = userEvent.setup();
      renderAt('/register');
      await send(user);
      await screen.findByText(/sent a 6-digit code on WhatsApp/);
      await user.type(screen.getByLabelText('The 6-digit code'), '123456');
      await user.click(screen.getByRole('button', { name: 'Open my account' }));

      expect(await screen.findByText(/Your password is set/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByLabelText('Mobile number or email')).toHaveValue('9876543210');
    });

    it('with WhatsApp codes off: no code is asked for, and Sign in has the number in', async () => {
      existingAccount({ whatsapp: false });
      const user = userEvent.setup();
      renderAt('/register');
      await send(user);

      expect(await screen.findByText(/If this is another pump of yours/)).toBeInTheDocument();
      expect(callTo(/\/password-reset\/request$/)).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByLabelText('Mobile number or email')).toHaveValue('9876543210');
    });

    it('no code came: the team can be asked to call', async () => {
      existingAccount({});
      const user = userEvent.setup();
      renderAt('/register');
      await send(user);
      await screen.findByText(/sent a 6-digit code on WhatsApp/);
      await user.click(screen.getByRole('button', { name: 'No code? Ask the team to call you' }));
      expect(await screen.findByText('The MDG team will call you.')).toBeInTheDocument();
      const [[, ask]] = callTo(/\/forgot-password$/);
      expect(JSON.parse(ask!.body as string)).toEqual({ identifier: '9876543210' });
    });

    it.each(['waiting', 'existing'])(
      'a registration that went through (%s) sends this phone to Sign in next time, not to a second form',
      async (account) => {
        fetchMock.mockResolvedValueOnce(okResponse(account));
        // A new phone opens on the choice screen (ADR 0058), which leads here.
        expect(firstScreen()).toBe('/welcome');
        const user = userEvent.setup();
        renderAt('/register');
        await send(user);
        await screen.findByRole('status');
        expect(firstScreen()).toBe('/login');
      },
    );

    it('a registration that did not go through leaves this phone on the first-open screen', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const user = userEvent.setup();
      renderAt('/register');
      await send(user);
      await screen.findByRole('alert');
      expect(firstScreen()).toBe('/welcome');
    });
  });

  describe('the password', () => {
    it('must be at least 8 characters, and typed twice the same', async () => {
      const user = userEvent.setup();
      renderAt('/register');
      await fillValidForm(user);
      await user.click(screen.getByRole('checkbox'));

      const first = screen.getByLabelText('Choose a password');
      const again = screen.getByLabelText('Password again');

      await user.clear(first);
      await user.clear(again);
      await user.type(first, 'short7!');
      await user.type(again, 'short7!');
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(await screen.findByText('At least 8 characters')).toBeInTheDocument();

      await user.clear(first);
      await user.clear(again);
      await user.type(first, 'long-enough-1');
      await user.type(again, 'long-enough-2');
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is hidden by default, and each box has its own eye', async () => {
      const user = userEvent.setup();
      renderAt('/register');
      await fillStep1(user);
      await fillStep2(user);
      const first = screen.getByLabelText('Choose a password');
      const again = screen.getByLabelText('Password again');
      expect(first).toHaveAttribute('type', 'password');
      expect(first).toHaveAttribute('autocomplete', 'new-password');
      expect(again).toHaveAttribute('autocomplete', 'new-password');

      const eyes = screen.getAllByRole('button', { name: 'Show password' });
      expect(eyes).toHaveLength(2);
      await user.click(eyes[0]!);
      expect(first).toHaveAttribute('type', 'text');
      expect(again).toHaveAttribute('type', 'password');
      await user.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(first).toHaveAttribute('type', 'password');
    });

    it('is never left in the mutation cache or a console line', async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
        vi.spyOn(console, k).mockImplementation(() => {}),
      );
      fetchMock.mockResolvedValue(okResponse());
      const user = userEvent.setup();
      const { queryClient } = renderAt('/register');
      await fillValidForm(user);
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      await screen.findByText('You are registered.');
      await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0));
      expect(document.body.innerHTML).not.toContain(PASSWORD);
      for (const spy of spies) {
        for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(PASSWORD);
      }
    });
  });

  it('the one tick says it covers WhatsApp messages about the account', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await fillStep1(user);
    await fillStep2(user);
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(
      'I accept the Terms and Conditions and agree to get messages about my account on WhatsApp',
    );
    expect(
      screen.getByText(/and I agree to get messages about my account on WhatsApp/),
    ).toBeInTheDocument();
  });

  it('a retry of the same form carries the same id, a corrected one a new id', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockResolvedValue(okResponse());
    const user = userEvent.setup();
    renderAt('/register');
    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByRole('alert');
    // Corrected: a different form (the SAP code is on step 2; going back loses nothing).
    await user.click(screen.getByRole('button', { name: 'Back' }));
    const sap = screen.getByLabelText('SAP code');
    expect(sap).toHaveValue('41001234');
    await user.clear(sap);
    await user.type(sap, '41009999');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Choose a password')).toHaveValue(PASSWORD);
    expect(screen.getByRole('checkbox')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText('You are registered.');

    const ids = fetchMock.mock.calls.map(
      (c) => JSON.parse((c as [string, RequestInit])[1].body as string).submissionId as string,
    );
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it('takes a number typed in Hindi digits and refuses one that is not a mobile', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const user = userEvent.setup();
    renderAt('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox'));
    // Back to step 1, where the mobile is.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    const mobile = screen.getByLabelText('Your mobile');

    await user.clear(mobile);
    await user.type(mobile, '1234567890');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByText('Enter a 10-digit mobile number that starts with 6, 7, 8 or 9'),
    ).toBeInTheDocument();
    expect(stepLine()).toHaveTextContent('1 of 3: you');
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(mobile);
    await user.type(mobile, '+९१ ९४६७४ ६६९६३');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('You are registered.')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).mobile).toBe('9467466963');
  });

  it('keeps the form and says so when the send fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderAt('/register');

    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your registration could not be completed. Check your network and try again.',
    );
    expect(screen.getByLabelText('Choose a password')).toHaveValue(PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('SAP code')).toHaveValue('41001234');
    expect(screen.queryByText('You are registered.')).not.toBeInTheDocument();
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

describe('RegisterPage — the privacy policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetStores();
  });

  it('sits beside "We will never share your details" and opens the policy', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    renderAt('/register');

    const note = screen.getByText(/We will never share your details\./);
    const link = within(note).getByRole('link', { name: 'Privacy policy' });
    expect(link).toHaveAttribute('href', 'https://mdgservices.in/privacy');
    await user.click(link);
    expect(open).toHaveBeenCalledWith('https://mdgservices.in/privacy', '_blank', 'noopener');
    // Reading it does not move the form on or send it.
    expect(stepLine()).toHaveTextContent('1 of 3: you');
  });

  it('says it in Hindi', () => {
    renderAt('/register', 'hi');
    expect(screen.getByRole('link', { name: 'प्राइवेसी पॉलिसी' })).toBeInTheDocument();
  });
});

describe('RegisterPage — first run', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => resetStores());

  it('on a phone nobody has used, asks which language first, once, before the form', async () => {
    const user = userEvent.setup();
    // Nothing explicit, nobody signed in, no mark of an account on this phone.
    useLangStore.setState({ lang: 'hi', explicit: false });
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { route: '/register' },
    );

    expect(screen.getByRole('heading', { name: 'अपनी भाषा चुनें' })).toBeInTheDocument();
    expect(screen.queryByLabelText('आपका नाम')).not.toBeInTheDocument();
    // Each language in its own script.
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      'हिंदी',
      'Hinglish',
      'English',
    ]);

    await user.click(screen.getByRole('radio', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // The form is now in English, and the choice is the phone's from here on.
    expect(await screen.findByLabelText('Your name')).toBeInTheDocument();
    expect(useLangStore.getState()).toMatchObject({ lang: 'en', explicit: true });
  });

  it('never asks again once the phone has answered', () => {
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { route: '/register' },
    );
    expect(screen.queryByRole('heading', { name: 'अपनी भाषा चुनें' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
  });

  it('shows the step line, and Back keeps what was typed', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    expect(stepLine()).toHaveTextContent('1 of 3: you');
    await fillStep1(user);
    expect(stepLine()).toHaveTextContent('2 of 3: your pump');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(stepLine()).toHaveTextContent('1 of 3: you');
    expect(screen.getByLabelText('Your name')).toHaveValue('  Ramesh Kumar ');
    expect(screen.getByLabelText('Your mobile')).toHaveValue('98765 43210');
  });

  it('step 1 asks only for name and mobile and does not mention a password; step 3 does', async () => {
    const user = userEvent.setup();
    renderAt('/register', 'hi');
    expect(screen.getByText('अपना नाम और मोबाइल नंबर बताइए।')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('पासवर्ड चुनिए');
    await user.type(screen.getByLabelText(/आपका नाम/), 'Ramesh Kumar');
    await user.type(screen.getByLabelText(/मोबाइल/), '9876543210');
    await user.click(screen.getByRole('button', { name: 'आगे बढ़ें' }));
    await user.click(screen.getByRole('radio', { name: 'Type A' }));
    await user.type(screen.getByLabelText(/SAP/), 'SAP1');
    await user.click(screen.getByRole('button', { name: 'आगे बढ़ें' }));
    expect(screen.getByText(/अपना पासवर्ड चुनिए/)).toBeInTheDocument();
  });

  it('the title has a row of its own, so it is never crushed beside the language switch', () => {
    renderAt('/register');
    const title = screen.getByRole('heading', { level: 1 });
    const switchButton = screen.getByRole('button', { name: /Language/ });
    expect(title.parentElement).not.toBe(switchButton.parentElement);
    expect(title.className).not.toMatch(/flex-1|min-w-0/);
  });

  it('the privacy link and the sign-in link are 44px tall', () => {
    renderAt('/register');
    expect(screen.getByRole('link', { name: 'Privacy policy' }).className).toMatch(/min-h-11/);
    expect(screen.getByRole('button', { name: 'Sign in' }).className).toMatch(/min-h-11/);
  });

  it('says where to find the SAP code, and gives no hint for Type A or Type B', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await fillStep1(user);
    expect(
      screen.getByText("The user ID you sign in with on your oil company's dealer portal."),
    ).toBeInTheDocument();
    // The wording for Type A / Type B is the owner's to give (open question 8): until then, nothing.
    expect(screen.getByLabelText('Type A')).toBeInTheDocument();
    expect(screen.getByLabelText('Type B')).toBeInTheDocument();
    expect(screen.queryByText(/Type A means|Type B means/i)).not.toBeInTheDocument();
  });

  it('the terms are read at body size', async () => {
    const user = userEvent.setup();
    renderAt('/register');
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Terms & Conditions' }));
    const sheet = await screen.findByRole('dialog');
    const clause = within(sheet).getByText(TERMS_EN[0]!);
    expect(clause).toHaveClass('text-body');
    expect(clause).not.toHaveClass('text-meta');
  });

  it('an account that is ready lands where the person was going, with its query kept', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse('ready'))
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, data: { token: 'new-token', user: makeUser({ id: 'u-new' }) } }),
      );
    const user = userEvent.setup();
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/chat/:id" element={<div>chat-thread</div>} />
        <Route path="/" element={<div>today-page</div>} />
      </Routes>,
      { route: { pathname: '/register', state: { from: '/chat/c1?c=m9' } } as never },
    );
    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('chat-thread')).toBeInTheDocument();
  });

  it('a waiting registration says when it came in, what happens next, and has a call button but no video (the list needs a session)', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const user = userEvent.setup();
    renderAt('/register');
    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByText('What happens next');
    const call = screen.getByRole('link', { name: /Call MDG/ });
    expect(call).toHaveAttribute('href', 'tel:18008913496');
    expect(call).toHaveTextContent(HELPLINE.display);
    expect(screen.getByText(/^Received at /)).toBeInTheDocument();
    // The guide-video list needs a signed-in session, which this card is drawn without: no video
    // chip, and the list is never even asked for.
    expect(screen.queryByRole('button', { name: /Getting started|Watch/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('guide-videos'))).toBe(false);
    // The one way on is Back to sign in.
    expect(screen.getAllByRole('button', { name: 'Back to sign in' }).length).toBeGreaterThan(0);
  });
});
