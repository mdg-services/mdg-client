import { cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import {
  IRAS_RESET_NO_USER_ID,
  type PortalId,
  type PortalLoginState,
  type PortalLoginsView,
  type SdmsResetView,
} from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// The IRAS row in the login box, and its "Forgot password?": IRAS's own reset box done for the
// owner — the SDMS reset's steps on IRAS's page, by the user ID typed in the row. The server is
// a double; ApiError stays the real one.
const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, put: h.put, post: h.post },
}));

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner' });
  h.get.mockReset();
  h.put.mockReset();
  h.post.mockReset();
});
afterEach(() => cleanup());

const SAVED_AT = new Date().toISOString();

const MISSING: PortalLoginState = { portal: 'iras', needed: true, status: 'missing' };
const SAVED: PortalLoginState = {
  portal: 'iras',
  needed: true,
  status: 'saved',
  savedAt: SAVED_AT,
  savedBy: 'dealer',
};
const REFUSED: PortalLoginState = {
  portal: 'iras',
  needed: true,
  status: 'refused',
  savedAt: SAVED_AT,
  refusedAt: SAVED_AT,
  resetPossible: true,
};

function reset(over: Partial<SdmsResetView> = {}): SdmsResetView {
  return {
    id: 'r1',
    portal: 'iras',
    state: 'otp_sent',
    sentTo: null,
    expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
    retry: null,
    message: null,
    startedByName: 'Suresh',
    answeredByName: null,
    ...over,
  };
}

function box(v: PortalLoginsView, portals: PortalId[] = ['iras'], resets: SdmsResetView[] = []) {
  h.get.mockImplementation(async (path: string) => {
    if (path === '/v1/me/portal-logins') return v;
    if (path.startsWith('/v1/me/portal-logins/sdms/reset/')) return (resets.length > 1 ? resets.shift() : resets[0]) ?? reset();
    throw new Error(`unexpected GET ${path}`);
  });
  const message = makeMessage({
    id: 'box-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body: 'We need your IRAS login.',
    portalLogin: { portals },
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

function row(portal: PortalId): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-portal="${portal}"]`);
  if (!el) throw new Error(`no ${portal} row`);
  return el;
}

const ready = (portal: PortalId) =>
  waitFor(() => {
    const el = row(portal);
    expect(el.getAttribute('data-status')).not.toBe('loading');
    return el;
  });

const START = '/v1/me/portal-logins/iras/reset';
const VALID_PASSWORD = 'Tiger#Moon42';

describe('MessageBubble — the IRAS row', () => {
  it('says to type the ID, and starts nothing, when none is typed or on record', async () => {
    box({ portals: [{ ...MISSING, resetPossible: false }], canEdit: true });
    const iras = await ready('iras');
    expect(within(iras).getByText('The ID you use to log in to IRAS')).toBeInTheDocument();
    fireEvent.click(within(iras).getByRole('button', { name: 'Forgot password?' }));
    expect(
      await within(iras).findByText('Type your IRAS user ID above, then tap Forgot password? again.'),
    ).toBeInTheDocument();
    expect(within(iras).queryByRole('button', { name: 'Send OTP' })).toBeNull();
    expect(h.post).not.toHaveBeenCalled();
  });

  it('opens the IRAS intro when an ID is on record, and "Send OTP" posts nothing but {}', async () => {
    box({ portals: [{ ...MISSING, resetPossible: true }], canEdit: true });
    const iras = await ready('iras');
    fireEvent.click(within(iras).getByRole('button', { name: 'Forgot password?' }));
    expect(
      within(iras).getByText(/MDG will ask IndianOil to send an OTP to the mobile registered with your IRAS login/),
    ).toBeInTheDocument();
    h.post.mockResolvedValue({
      portals: [{ ...MISSING, resetPossible: true }],
      canEdit: true,
      irasReset: reset(),
    });
    fireEvent.click(within(iras).getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith(START, {}));
    expect(await within(row('iras')).findByLabelText('OTP')).toBeInTheDocument();
  });

  it('sends the user ID typed above, once, so the owner never types it twice', async () => {
    box({ portals: [MISSING], canEdit: true });
    const iras = await ready('iras');
    fireEvent.change(within(iras).getByLabelText('User ID'), { target: { value: ' 198889 ' } });
    fireEvent.click(within(iras).getByRole('button', { name: 'Forgot password?' }));
    h.post.mockResolvedValue({ portals: [MISSING], canEdit: true, irasReset: reset() });
    fireEvent.click(within(iras).getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith(START, { username: '198889' }));
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it('shows "Forgot password?" under a saved login, and not to a manager', async () => {
    box({ portals: [SAVED], canEdit: true });
    const iras = await ready('iras');
    fireEvent.click(within(iras).getByRole('button', { name: 'Forgot password?' }));
    expect(within(iras).getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
    cleanup();

    box({ portals: [SAVED], canEdit: false });
    const seen = await ready('iras');
    await within(seen).findByText(/Saved · /);
    expect(within(seen).queryByRole('button', { name: 'Forgot password?' })).toBeNull();
  });

  it('offers the reset on a refused login, where it matters most', async () => {
    box({ portals: [REFUSED], canEdit: true });
    const iras = await ready('iras');
    fireEvent.click(within(iras).getByRole('button', { name: 'Forgot password?' }));
    expect(within(iras).getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
  });

  it('follows a reset already going, with IRAS’s wording and rule', async () => {
    const going = reset();
    box({ portals: [SAVED], canEdit: true, irasReset: going }, ['iras'], [going]);
    const iras = await ready('iras');
    expect(await within(iras).findByText('Suresh started this')).toBeInTheDocument();
    expect(within(iras).getByText('OTP sent to the mobile registered with your IRAS login')).toBeInTheDocument();
    expect(within(iras).getByText(/8 to 15 characters, with at least one capital letter.*one symbol such as @/)).toBeInTheDocument();
  });

  it('asks for the ID when the server has none and none was typed', async () => {
    box({ portals: [{ ...SAVED, resetPossible: true }], canEdit: true });
    const iras = await ready('iras');
    fireEvent.click(within(iras).getByRole('button', { name: 'Forgot password?' }));
    h.post.mockRejectedValue(new ApiError(409, IRAS_RESET_NO_USER_ID, 'Type your IRAS user ID.'));
    fireEvent.click(within(iras).getByRole('button', { name: 'Send OTP' }));
    expect(
      await within(iras).findByText('Type your IRAS user ID above, then tap Forgot password? again.'),
    ).toBeInTheDocument();
  });
});

describe('MessageBubble — the IRAS reset form', () => {
  async function startReset() {
    box({ portals: [{ ...MISSING, resetPossible: true }], canEdit: true });
    const iras = await ready('iras');
    fireEvent.click(within(iras).getByRole('button', { name: 'Forgot password?' }));
    h.post.mockResolvedValue({ portals: [{ ...MISSING, resetPossible: true }], canEdit: true, irasReset: reset() });
    fireEvent.click(within(iras).getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith(START, {}));
    return await ready('iras');
  }
  const fill = (iras: HTMLElement, password: string) => {
    fireEvent.change(within(iras).getByLabelText('OTP'), { target: { value: '482913' } });
    fireEvent.change(within(iras).getByLabelText('New password'), { target: { value: password } });
    fireEvent.change(within(iras).getByLabelText('New password again'), { target: { value: password } });
    fireEvent.click(within(iras).getByRole('button', { name: 'Set new password' }));
  };

  it('holds a password with no symbol back, and sends one that has it', async () => {
    const iras = await startReset();
    fill(iras, 'Abcdefg1');
    expect(await within(iras).findByText("The new password doesn't follow the rule below")).toBeInTheDocument();
    expect(h.put).not.toHaveBeenCalled();

    h.put.mockResolvedValue(reset({ state: 'checking', answeredByName: 'Owner' }));
    fill(iras, VALID_PASSWORD);
    await waitFor(() =>
      expect(h.put).toHaveBeenCalledWith('/v1/me/portal-logins/sdms/reset/r1', {
        otp: '482913',
        password: VALID_PASSWORD,
      }),
    );
    expect(h.put).toHaveBeenCalledTimes(1);
  });

  it('shows IRAS’s own words when it refused a try, and says the new password is set when done', async () => {
    const refused = reset({ retry: 'password_rule', retryWords: 'Password must contain a special character' });
    box({ portals: [SAVED], canEdit: true, irasReset: refused }, ['iras'], [refused]);
    await waitFor(() =>
      expect(within(row('iras')).getByText('IndianOil said: “Password must contain a special character”')).toBeInTheDocument(),
    );
    cleanup();

    const done = reset({ state: 'done' });
    box({ portals: [SAVED], canEdit: true, irasReset: done }, ['iras'], [done]);
    await waitFor(() =>
      expect(
        within(row('iras')).getByText('New IRAS password set on IndianOil and saved ✓ Your reports will start coming in again shortly.'),
      ).toBeInTheDocument(),
    );
  });
});
