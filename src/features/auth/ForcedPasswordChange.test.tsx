import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_EXPIRED_KEY, useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { User } from '@dk/shared/types';

import { ForcedPasswordChange } from './ForcedPasswordChange';

const TEMP = 'given-by-mdg';
const CHOSEN = 'my-own-pump-2026';

const envelope = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const ok = (data: unknown) => envelope({ ok: true, data });
const refused = (status: number, code: string, message: string) =>
  envelope({ ok: false, error: { code, message } }, status);

const USER: User = {
  id: 'u1',
  email: '',
  name: 'Ramesh',
  role: 'dealer-owner',
  status: 'ACTIVE',
  mustChangePassword: true,
  createdAt: '',
  updatedAt: '',
};

describe('ForcedPasswordChange', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  /** What the server says for each call: `/me` and the change. */
  let me: Response | (() => Response);
  let change: Response | Error;

  beforeEach(() => {
    useLangStore.setState({ lang: 'en', explicit: true });
    signIn({ ...USER });
    me = () => ok({ ...USER });
    change = ok({ changed: true });
    fetchMock = vi.fn((url: string) => {
      if (/\/v1\/me$/.test(url)) return Promise.resolve(typeof me === 'function' ? me() : me);
      if (/\/v1\/auth\/change-password$/.test(url)) {
        return change instanceof Error ? Promise.reject(change) : Promise.resolve(change);
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      sessionStorage.clear();
    } catch {
      /* jsdom always has it */
    }
  });
  afterEach(() => resetStores());

  const calls = (re: RegExp) =>
    fetchMock.mock.calls.filter(([url]) => re.test(url as string)) as Array<[string, RequestInit]>;

  async function fill(
    user: ReturnType<typeof userEvent.setup>,
    { current = TEMP, next = CHOSEN, again = CHOSEN } = {},
  ) {
    await user.type(screen.getByLabelText('The password you were given'), current);
    await user.type(screen.getByLabelText('New password'), next);
    await user.type(screen.getByLabelText('New password again'), again);
  }
  const save = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Save and continue' }));

  it('is a full screen that says why, and asks for the given password and a new one twice', () => {
    renderWithProviders(<ForcedPasswordChange />);
    expect(screen.getByRole('heading', { name: 'Create a new password' })).toBeInTheDocument();
    expect(screen.getByText(/signed in with a password the MDG team gave you/)).toBeInTheDocument();
    expect(screen.getByLabelText('The password you were given')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('New password again')).toHaveAttribute('autocomplete', 'new-password');
    // Nothing else to do on it but sign out: no way into the app.
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('is in Hindi, with the title the owner asked for', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(<ForcedPasswordChange />);
    expect(screen.getByRole('heading', { name: 'नया पासवर्ड बनाइए' })).toBeInTheDocument();
    expect(screen.getByLabelText('जो पासवर्ड आपको मिला था')).toBeInTheDocument();
    expect(screen.getByLabelText('नया पासवर्ड')).toBeInTheDocument();
    expect(screen.getByLabelText('नया पासवर्ड दोबारा')).toBeInTheDocument();
  });

  it('first asks the server whether the password is still temporary (the phone may be behind)', async () => {
    renderWithProviders(<ForcedPasswordChange />);
    await waitFor(() => expect(calls(/\/v1\/me$/)).toHaveLength(1));
  });

  it('lets go of the screen if the server says it was already changed elsewhere', async () => {
    me = () => ok({ ...USER, mustChangePassword: false });
    renderWithProviders(<ForcedPasswordChange />);
    await waitFor(() => expect(useAuthStore.getState().user?.mustChangePassword).toBe(false));
  });

  describe('what it will not send', () => {
    it('anything left empty', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      await save(user);
      expect((await screen.findAllByText('Required')).length).toBe(2);
      expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
      expect(calls(/change-password/)).toHaveLength(0);
    });

    it('a new password under 8 characters', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      await fill(user, { next: 'short7!', again: 'short7!' });
      await save(user);
      expect(await screen.findByText('At least 8 characters')).toBeInTheDocument();
      expect(calls(/change-password/)).toHaveLength(0);
    });

    it('two new passwords that differ', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      await fill(user, { again: `${CHOSEN}x` });
      await save(user);
      expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
      expect(calls(/change-password/)).toHaveLength(0);
    });

    it('the same password again, which would change nothing', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      await fill(user, { current: 'same-as-given', next: 'same-as-given', again: 'same-as-given' });
      await save(user);
      expect(
        await screen.findByText('Choose a password different from the one you were given'),
      ).toBeInTheDocument();
      expect(calls(/change-password/)).toHaveLength(0);
    });
  });

  describe('changing it', () => {
    it('sends the two passwords to the change route, then refreshes who the server says they are', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      me = () => ok({ ...USER, mustChangePassword: false });
      await fill(user);
      await save(user);

      await waitFor(() => expect(useAuthStore.getState().user?.mustChangePassword).toBe(false));
      const sent = calls(/\/v1\/auth\/change-password$/);
      expect(sent).toHaveLength(1);
      expect(sent[0]![1].method).toBe('POST');
      expect(JSON.parse(sent[0]![1].body as string)).toEqual({
        currentPassword: TEMP,
        newPassword: CHOSEN,
      });
      // The profile was asked for AFTER the change went through.
      const order = fetchMock.mock.calls.map(([url]) => url as string);
      expect(order.lastIndexOf(order.find((u) => /\/v1\/me$/.test(u))!)).toBeGreaterThanOrEqual(0);
      expect(order.findIndex((u) => /change-password/.test(u))).toBeLessThan(
        order.map((u, i) => (/\/v1\/me$/.test(u) ? i : -1)).pop()!,
      );
      expect(useAuthStore.getState().token).toBe('test-token');
    });

    it('says so when the server still calls the password temporary', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      await fill(user);
      await save(user);
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't change your password/);
      expect(useAuthStore.getState().user?.mustChangePassword).toBe(true);
    });

    it('is never left in the mutation cache or a console line', async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
        vi.spyOn(console, k).mockImplementation(() => {}),
      );
      const user = userEvent.setup();
      const { queryClient } = renderWithProviders(<ForcedPasswordChange />);
      me = () => ok({ ...USER, mustChangePassword: false });
      await fill(user);
      await save(user);
      await waitFor(() => expect(useAuthStore.getState().user?.mustChangePassword).toBe(false));
      await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0));
      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          const text = JSON.stringify(call);
          expect(text).not.toContain(CHOSEN);
          expect(text).not.toContain(TEMP);
        }
      }
    });
  });

  describe('when it is refused', () => {
    it('a wrong given password says so — and does NOT sign them out', async () => {
      change = refused(401, 'UNAUTHENTICATED', 'That current password is not right.');
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      await fill(user);
      await save(user);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'That is not the password you were given. Check it and try again.',
      );
      expect(useAuthStore.getState().token).toBe('test-token');
      expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
      // What was typed stays for another go.
      expect(screen.getByLabelText('The password you were given')).toHaveValue(TEMP);
    });

    it("the server's own answer to a wrong given password (400 CURRENT_PASSWORD_WRONG) says so too", async () => {
      change = refused(400, 'CURRENT_PASSWORD_WRONG', 'That is not your current password.');
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      await fill(user);
      await save(user);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'That is not the password you were given. Check it and try again.',
      );
      expect(useAuthStore.getState().token).toBe('test-token');
    });

    it('too many tries asks to wait', async () => {
      change = refused(429, 'RATE_LIMITED', 'slow');
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      await fill(user);
      await save(user);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Too many tries. Please wait a little and try again.',
      );
    });

    it('anything else is one plain sentence, never the server\'s words', async () => {
      change = refused(500, 'INTERNAL', 'E11000 duplicate key');
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      await fill(user);
      await save(user);
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't change your password/);
      expect(screen.queryByText(/E11000/)).toBeNull();
    });

    it('a dropped connection is the same plain sentence', async () => {
      change = new TypeError('Failed to fetch');
      const user = userEvent.setup();
      renderWithProviders(<ForcedPasswordChange />);
      await fill(user);
      await save(user);
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't change your password/);
    });
  });

  it('each box has an eye', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForcedPasswordChange />);
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(3);
    await user.click(screen.getAllByRole('button', { name: 'Show password' })[1]!);
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('The password you were given')).toHaveAttribute('type', 'password');
  });

  it('Sign out signs them out', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForcedPasswordChange />);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(useAuthStore.getState().token).toBeNull();
  });
});
