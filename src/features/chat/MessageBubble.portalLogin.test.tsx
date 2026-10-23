import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import {
  PORTAL_LOGIN_SAME_AS_REFUSED,
  type PortalLoginState,
  type PortalLoginsView,
} from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// The server is a double; ApiError stays the real one, so the box tells a 409
// from a 429 the way it does in the app.
const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, put: h.put },
}));

const SECRET = 'S3cret-pass-9!';
const USER = 'dealer-15e';

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner' });
  h.get.mockReset();
  h.put.mockReset();
});
afterEach(() => cleanup());

const JAN = new Date(new Date().getFullYear(), 0, 15, 12).toISOString();

function state(over: Partial<PortalLoginState> & Pick<PortalLoginState, 'portal'>): PortalLoginState {
  return { needed: true, status: 'missing', ...over };
}
function view(portals: PortalLoginState[], canEdit = true): PortalLoginsView {
  return { portals, canEdit };
}

const MISSING = view([state({ portal: 'sdms' }), state({ portal: 'iras' })]);

function box(
  v: PortalLoginsView | Error,
  portals: Array<'sdms' | 'iras'> = ['sdms', 'iras'],
  body = 'To run your services we need your SDMS and IRAS login.',
) {
  if (v instanceof Error) h.get.mockRejectedValue(v);
  else h.get.mockResolvedValue(v);
  const message = makeMessage({
    id: 'box-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body,
    portalLogin: { portals },
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

function row(portal: 'sdms' | 'iras'): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-portal="${portal}"]`);
  if (!el) throw new Error(`no ${portal} row`);
  return el;
}

describe('MessageBubble — a login box MDG posted', () => {
  it('asks for the logins only when a box is on screen', async () => {
    renderWithProviders(<MessageBubble message={makeMessage({ body: 'hello' })} mine={false} />);
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
  });

  it('draws the words first, then one block per portal, in the order asked', async () => {
    const { container } = box(MISSING, ['iras', 'sdms']);
    await screen.findAllByText('Needed');
    expect(h.get).toHaveBeenCalledWith('/v1/me/portal-logins');
    const blocks = [...container.querySelectorAll('[data-portal]')].map((e) =>
      e.getAttribute('data-portal'),
    );
    expect(blocks).toEqual(['iras', 'sdms']);
    const words = screen.getByText(/we need your SDMS and IRAS login/);
    const first = container.querySelector('[data-portal]')!;
    expect(words.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is as wide as a request, with its time on its own line', async () => {
    const { container } = box(MISSING);
    await screen.findAllByText('Needed');
    expect(container.innerHTML).toContain('w-[min(80%,330px)]');
    // No spacer reserving room in the last line of words: the time is in the flow.
    expect(container.querySelector('span[aria-hidden].inline-block')).toBeNull();
  });

  describe('missing', () => {
    it('shows the name, a grey "Needed" chip, both fields and a 44px black Save', async () => {
      box(MISSING);
      await screen.findAllByText('Needed');
      const sdms = row('sdms');
      expect(within(sdms).getByText('SDMS login')).toBeInTheDocument();
      expect(within(sdms).getByText('Needed')).toBeInTheDocument();

      const user = within(sdms).getByLabelText('User ID');
      expect(user).toHaveAttribute('autocomplete', 'off');
      expect(user).toHaveAttribute('autocapitalize', 'none');
      expect(user).toHaveAttribute('spellcheck', 'false');
      expect(user.className).toContain('h-11');

      const pass = within(sdms).getByLabelText('Password');
      expect(pass).toHaveAttribute('type', 'password');
      expect(pass).toHaveAttribute('autocomplete', 'new-password');

      const save = within(sdms).getByRole('button', { name: 'Save' });
      expect(save.className).toContain('h-11');
      expect(save.className).toContain('w-full');
      expect(save.className).toContain('bg-wa-accent');
      expect(save.querySelector('.lucide-lock')).toBeTruthy();
      expect(within(sdms).getByText('Kept safe — never shown in the chat')).toBeInTheDocument();
    });

    it('keeps Save off until both fields have something', async () => {
      box(MISSING, ['sdms']);
      await screen.findByText('Needed');
      const save = screen.getByRole('button', { name: 'Save' });
      expect(save).toBeDisabled();
      fireEvent.change(screen.getByLabelText('User ID'), { target: { value: USER } });
      expect(save).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: SECRET } });
      expect(save).toBeEnabled();
    });

    it('the eye shows and hides the password, and says which it will do', async () => {
      box(MISSING, ['sdms']);
      await screen.findByText('Needed');
      const pass = screen.getByLabelText('Password');
      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(pass).toHaveAttribute('type', 'text');
      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(pass).toHaveAttribute('type', 'password');
    });

    it('draws in Hindi when the app is in Hindi', async () => {
      useLangStore.setState({ lang: 'hi', explicit: false });
      box(MISSING, ['sdms']);
      await screen.findByText('बाकी');
      const sdms = row('sdms');
      expect(within(sdms).getByText('SDMS लॉगिन')).toBeInTheDocument();
      expect(within(sdms).getByLabelText('यूज़र आईडी')).toBeInTheDocument();
      expect(within(sdms).getByLabelText('पासवर्ड')).toBeInTheDocument();
      expect(within(sdms).getByRole('button', { name: 'सेव करें' })).toBeInTheDocument();
      expect(within(sdms).getByText('सुरक्षित रखा जाएगा, चैट में नहीं दिखेगा')).toBeInTheDocument();
    });
  });

  describe('saved', () => {
    const SAVED = view([
      state({ portal: 'sdms', status: 'saved', savedAt: JAN, savedBy: 'dealer' }),
      state({ portal: 'iras', status: 'missing' }),
    ]);

    it('says "Saved", the day, and offers Change — no form', async () => {
      box(SAVED);
      await screen.findByText('Saved');
      const sdms = row('sdms');
      expect(within(sdms).getByText('Saved · 15 Jan')).toBeInTheDocument();
      expect(within(sdms).getByRole('button', { name: 'Change' })).toBeInTheDocument();
      expect(within(sdms).queryByLabelText('User ID')).toBeNull();
      // The other portal, still missing, keeps its form.
      expect(within(row('iras')).getByLabelText('User ID')).toBeInTheDocument();
    });

    it('Change reopens an empty form, and Cancel goes back', async () => {
      box(SAVED);
      await screen.findByText('Saved');
      const sdms = row('sdms');
      fireEvent.click(within(sdms).getByRole('button', { name: 'Change' }));
      expect(within(sdms).getByLabelText('User ID')).toHaveValue('');
      expect(within(sdms).getByLabelText('Password')).toHaveValue('');
      fireEvent.click(within(sdms).getByRole('button', { name: 'Cancel' }));
      expect(within(sdms).queryByLabelText('User ID')).toBeNull();
      expect(within(sdms).getByRole('button', { name: 'Change' })).toBeInTheDocument();
    });

    it('in Hindi the date is in Hindi', async () => {
      useLangStore.setState({ lang: 'hi', explicit: false });
      box(SAVED, ['sdms']);
      await screen.findByText('मिल गया');
      expect(within(row('sdms')).getByText(/^मिल गया · 15 /)).toBeInTheDocument();
      expect(within(row('sdms')).getByRole('button', { name: 'बदलें' })).toBeInTheDocument();
    });
  });

  describe('refused', () => {
    it('shows the amber chip and the form, ready for the new password', async () => {
      box(
        view([state({ portal: 'sdms', status: 'refused', savedAt: JAN, refusedAt: JAN })]),
        ['sdms'],
      );
      await screen.findByText('Old password not working');
      const sdms = row('sdms');
      expect(sdms.getAttribute('data-status')).toBe('refused');
      const chip = within(sdms).getByText('Old password not working');
      expect(chip.className).toContain('bg-wa-notice');
      expect(within(sdms).getByLabelText('Password')).toBeInTheDocument();
      expect(within(sdms).getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(within(sdms).queryByRole('button', { name: 'Change' })).toBeNull();
    });
  });

  describe('a manager (cannot edit)', () => {
    it('says the owner fills it, with no form', async () => {
      box(view([state({ portal: 'sdms' }), state({ portal: 'iras', status: 'refused' })], false));
      await screen.findAllByText('The owner fills this');
      expect(screen.getAllByText('The owner fills this')).toHaveLength(2);
      expect(screen.queryByLabelText('User ID')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });

    it('a saved login shows without Change', async () => {
      box(view([state({ portal: 'sdms', status: 'saved', savedAt: JAN })], false), ['sdms']);
      await screen.findByText('Saved');
      expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    });
  });

  describe('when the state cannot be had', () => {
    it('says so and offers a retry', async () => {
      box(new ApiError(500, 'INTERNAL', 'boom'), ['sdms']);
      await screen.findByText("Couldn't check this just now");
      expect(screen.queryByLabelText('User ID')).toBeNull();
      h.get.mockResolvedValue(MISSING);
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByLabelText('User ID')).toBeInTheDocument();
    });
  });

  describe('saving', () => {
    async function fill(portal: 'sdms' | 'iras' = 'sdms') {
      const r = row(portal);
      fireEvent.change(within(r).getByLabelText('User ID'), { target: { value: `  ${USER}  ` } });
      fireEvent.change(within(r).getByLabelText('Password'), { target: { value: SECRET } });
      return r;
    }

    it('sends the pair to the outlet route, then shows Saved in every box and wipes the fields', async () => {
      const { queryClient } = box(MISSING);
      await screen.findAllByText('Needed');
      const r = await fill('sdms');
      h.put.mockResolvedValue(
        view([
          state({ portal: 'sdms', status: 'saved', savedAt: JAN, savedBy: 'dealer' }),
          state({ portal: 'iras' }),
        ]),
      );
      fireEvent.click(within(r).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(within(row('sdms')).getByText('Saved · 15 Jan')).toBeInTheDocument());
      // The user ID is trimmed, the password is sent as typed, to the right portal.
      expect(h.put).toHaveBeenCalledTimes(1);
      expect(h.put).toHaveBeenCalledWith('/v1/me/portal-logins/sdms', {
        username: USER,
        password: SECRET,
      });
      // The returned view went into the cache — no second GET was needed.
      expect(h.get).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(['portal-logins', 'me'])).toMatchObject({ canEdit: true });
      // Nothing of it is left in the page, in the form after a reopen…
      expect(document.body.innerHTML).not.toContain(SECRET);
      fireEvent.click(within(row('sdms')).getByRole('button', { name: 'Change' }));
      expect(within(row('sdms')).getByLabelText('Password')).toHaveValue('');
      expect(within(row('sdms')).getByLabelText('User ID')).toHaveValue('');
      // …or in the mutation's own record of the call.
      await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0));
    });

    it('never puts the password in a log or a console line', async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
        vi.spyOn(console, k).mockImplementation(() => {}),
      );
      box(MISSING, ['sdms']);
      await screen.findByText('Needed');
      const r = await fill();
      h.put.mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));
      fireEvent.click(within(r).getByRole('button', { name: 'Save' }));
      await screen.findByRole('alert');
      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain(SECRET);
        }
      }
    });

    it('409 on the very password that was refused: says so, clears the password, keeps the user ID', async () => {
      box(view([state({ portal: 'sdms', status: 'refused', savedAt: JAN })]), ['sdms']);
      await screen.findByText('Old password not working');
      const r = await fill();
      h.put.mockRejectedValue(
        new ApiError(409, PORTAL_LOGIN_SAME_AS_REFUSED, 'same as the refused one'),
      );
      fireEvent.click(within(r).getByRole('button', { name: 'Save' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'This is the password that stopped working. Enter the new one.',
      );
      expect(within(r).getByLabelText('Password')).toHaveValue('');
      expect(within(r).getByLabelText('User ID')).toHaveValue(`  ${USER}  `);
      // Still refused: the form stays.
      expect(r.getAttribute('data-status')).toBe('refused');
    });

    it('409 in Hindi', async () => {
      useLangStore.setState({ lang: 'hi', explicit: false });
      box(view([state({ portal: 'sdms', status: 'refused', savedAt: JAN })]), ['sdms']);
      await screen.findByText('पुराना पासवर्ड नहीं चल रहा');
      const r = row('sdms');
      fireEvent.change(within(r).getByLabelText('यूज़र आईडी'), { target: { value: USER } });
      fireEvent.change(within(r).getByLabelText('पासवर्ड'), { target: { value: SECRET } });
      h.put.mockRejectedValue(new ApiError(409, PORTAL_LOGIN_SAME_AS_REFUSED, 'x'));
      fireEvent.click(within(r).getByRole('button', { name: 'सेव करें' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'यही पासवर्ड नहीं चल रहा था। नया पासवर्ड भरिए।',
      );
    });

    it('429: asks to wait, and keeps what was typed for the retry', async () => {
      box(MISSING, ['sdms']);
      await screen.findByText('Needed');
      const r = await fill();
      h.put.mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'slow down'));
      fireEvent.click(within(r).getByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Try again in a little while');
      expect(within(r).getByLabelText('Password')).toHaveValue(SECRET);
    });

    it('any other failure: "Couldn\'t save", and one tap tries again', async () => {
      box(MISSING, ['sdms']);
      await screen.findByText('Needed');
      const r = await fill();
      h.put.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'));
      fireEvent.click(within(r).getByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save — try again");

      h.put.mockResolvedValue(
        view([state({ portal: 'sdms', status: 'saved', savedAt: JAN, savedBy: 'dealer' })]),
      );
      fireEvent.click(within(r).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(within(row('sdms')).getByText('Saved · 15 Jan')).toBeInTheDocument());
      expect(h.put).toHaveBeenCalledTimes(2);
    });

    it('does not send twice while a save is in flight', async () => {
      box(MISSING, ['sdms']);
      await screen.findByText('Needed');
      const r = await fill();
      let release!: (v: PortalLoginsView) => void;
      h.put.mockReturnValue(new Promise<PortalLoginsView>((res) => (release = res)));
      const save = within(r).getByRole('button', { name: 'Save' });
      fireEvent.click(save);
      await waitFor(() => expect(save).toBeDisabled());
      expect(save).toHaveAttribute('aria-busy', 'true');
      fireEvent.click(save);
      expect(h.put).toHaveBeenCalledTimes(1);
      release(view([state({ portal: 'sdms', status: 'saved', savedAt: JAN })]));
      await waitFor(() => expect(row('sdms').getAttribute('data-status')).toBe('saved'));
    });

    it('touches nothing outside the box: no message is sent', async () => {
      box(MISSING, ['sdms']);
      await screen.findByText('Needed');
      const r = await fill();
      h.put.mockResolvedValue(view([state({ portal: 'sdms', status: 'saved', savedAt: JAN })]));
      fireEvent.click(within(r).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(row('sdms').getAttribute('data-status')).toBe('saved'));
      // The one and only write is the login route.
      expect(h.put.mock.calls.map((c) => c[0])).toEqual(['/v1/me/portal-logins/sdms']);
    });
  });
});
