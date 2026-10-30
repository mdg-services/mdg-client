import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firstScreen } from '@/features/auth/firstScreen';
import { TERMS_EN, TERMS_HI } from '@/features/register/terms';
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
      <Route path="/chat" element={<div>chat-list</div>} />
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

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your name'), '  Ramesh Kumar ');
  await user.type(screen.getByLabelText('Your mobile'), '98765 43210');
  await user.type(screen.getByLabelText('Choose a password'), PASSWORD);
  await user.type(screen.getByLabelText('Password again'), PASSWORD);
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

  it('is reached from the sign-in footer, which says you choose your own password', async () => {
    const user = userEvent.setup();
    renderAt('/login');

    expect(screen.getByText(/Register your pump and choose your own password/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Register your pump' }));

    expect(await screen.findByRole('heading', { name: 'Register your pump' })).toBeInTheDocument();
    expect(screen.getByLabelText('SAP code')).toBeInTheDocument();
  });

  it('sends nothing until the required details and the terms are in', async () => {
    const user = userEvent.setup();
    renderAt('/register');

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Enter your name')).toBeInTheDocument();
    expect(
      screen.getByText('Enter a 10-digit mobile number that starts with 6, 7, 8 or 9'),
    ).toBeInTheDocument();
    expect(screen.getByText('Choose Type A or Type B')).toBeInTheDocument();
    expect(screen.getByText('Enter your SAP code')).toBeInTheDocument();
    // The password is not optional: a registration is how the dealer gets their login.
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
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

    expect(await screen.findByText('You are registered.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The MDG team will check it, and a WhatsApp message will tell you when your account is ready. Then sign in with your mobile number and this same password.',
      ),
    ).toBeInTheDocument();
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
    await user.type(screen.getByLabelText('पासवर्ड चुनिए'), PASSWORD);
    await user.type(screen.getByLabelText('पासवर्ड दोबारा'), PASSWORD);
    await user.click(screen.getByLabelText('Type A'));
    await user.type(screen.getByLabelText('SAP कोड'), '41001234');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'भेजिए' }));

    expect(await screen.findByText('रजिस्ट्रेशन हो गया।')).toBeInTheDocument();
    expect(
      screen.getByText(
        'MDG टीम इसे देखेगी, और खाता तैयार होते ही WhatsApp पर संदेश आएगा। फिर अपने मोबाइल नंबर और इसी पासवर्ड से साइन इन करें।',
      ),
    ).toBeInTheDocument();
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

      expect(await screen.findByText('chat-list')).toBeInTheDocument();
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

    it('a number that already has an account: no second sign-in, and Sign in has the number in', async () => {
      fetchMock.mockResolvedValueOnce(okResponse('existing'));
      const user = userEvent.setup();
      renderAt('/register');
      await send(user);

      expect(await screen.findByText('This mobile number already has an account.')).toBeInTheDocument();
      expect(screen.getByText(/If this is another pump of yours/)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByLabelText('Mobile number or email')).toHaveValue('9876543210');
    });

    it.each(['waiting', 'existing'])(
      'a registration that went through (%s) sends this phone to Sign in next time, not to a second form',
      async (account) => {
        fetchMock.mockResolvedValueOnce(okResponse(account));
        expect(firstScreen()).toBe('/register');
        const user = userEvent.setup();
        renderAt('/register');
        await send(user);
        await screen.findByRole('status');
        expect(firstScreen()).toBe('/login');
      },
    );

    it('a registration that did not go through leaves this phone on Register', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const user = userEvent.setup();
      renderAt('/register');
      await send(user);
      await screen.findByRole('alert');
      expect(firstScreen()).toBe('/register');
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

  it('the one tick says it covers WhatsApp messages about the account', () => {
    renderAt('/register');
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
    // Corrected: a different form.
    const sap = screen.getByLabelText('SAP code');
    await user.clear(sap);
    await user.type(sap, '41009999');
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
    const mobile = screen.getByLabelText('Your mobile');

    await user.clear(mobile);
    await user.type(mobile, '1234567890');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByText('Enter a 10-digit mobile number that starts with 6, 7, 8 or 9'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(mobile);
    await user.type(mobile, '+९१ ९४६७४ ६६९६३');
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
    // Reading it does not tick the box or send the form.
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('says it in Hindi', () => {
    renderAt('/register', 'hi');
    expect(screen.getByRole('link', { name: 'प्राइवेसी पॉलिसी' })).toBeInTheDocument();
  });
});
