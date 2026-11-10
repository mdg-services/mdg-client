import { cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import {
  SDMS_RESET_OTHER_GOING,
  type PortalId,
  type PortalLoginState,
  type PortalLoginsView,
  type SdmsResetView,
} from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// The Old SDMS row (IndianOil's "Business Login") in the login box, and its "Forgot
// password?" — the SDMS reset's steps on their own portal. The server is a double;
// ApiError stays the real one.
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

const MISSING: PortalLoginState = { portal: 'sdmsOld', needed: true, status: 'missing' };
const SAVED: PortalLoginState = {
  portal: 'sdmsOld',
  needed: true,
  status: 'saved',
  savedAt: SAVED_AT,
  savedBy: 'dealer',
};
const SDMS_REFUSED: PortalLoginState = {
  portal: 'sdms',
  needed: true,
  status: 'refused',
  savedAt: SAVED_AT,
  refusedAt: SAVED_AT,
  resetPossible: true,
};

function reset(over: Partial<SdmsResetView> = {}): SdmsResetView {
  return {
    id: 'r1',
    portal: 'sdmsOld',
    state: 'otp_sent',
    sentTo: 'OTP sent to your registered mobile XXXXXX4321',
    expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
    retry: null,
    message: null,
    startedByName: 'Suresh',
    answeredByName: null,
    ...over,
  };
}

function box(v: PortalLoginsView, portals: PortalId[] = ['sdmsOld'], resets: SdmsResetView[] = []) {
  h.get.mockImplementation(async (path: string) => {
    if (path === '/v1/me/portal-logins') return v;
    // Following a reset is the same route for both portals.
    if (path.startsWith('/v1/me/portal-logins/sdms/reset/'))
      return (resets.length > 1 ? resets.shift() : resets[0]) ?? reset();
    throw new Error(`unexpected GET ${path}`);
  });
  const message = makeMessage({
    id: 'box-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body: 'We need your Old SDMS login.',
    portalLogin: { portals },
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

function row(portal: PortalId): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-portal="${portal}"]`);
  if (!el) throw new Error(`no ${portal} row`);
  return el;
}

/** The row once the view has come back (until then it only shows its spinner). */
const ready = (portal: PortalId) =>
  waitFor(() => {
    const el = row(portal);
    expect(el.getAttribute('data-status')).not.toBe('loading');
    return el;
  });

const START = '/v1/me/portal-logins/sdms-old/reset';
const VALID_PASSWORD = 'Tiger#Moon42';

/** Opens the reset on a missing login with a user ID on record, and starts it. */
async function startReset() {
  box({ portals: [{ ...MISSING, resetPossible: true }], canEdit: true });
  const old = await ready('sdmsOld');
  fireEvent.click(within(old).getByRole('button', { name: 'Forgot password?' }));
  h.post.mockResolvedValue({
    portals: [{ ...MISSING, resetPossible: true }],
    canEdit: true,
    sdmsOldReset: reset(),
  });
  fireEvent.click(within(old).getByRole('button', { name: 'Send OTP' }));
  await waitFor(() => expect(h.post).toHaveBeenCalledWith(START, {}));
  return await ready('sdmsOld');
}

describe('MessageBubble — the Old SDMS row', () => {
  it('draws "Old SDMS login", with the hint under its user ID', async () => {
    box({ portals: [MISSING], canEdit: true });
    const old = await ready('sdmsOld');
    expect(within(old).getByText('Old SDMS login')).toBeInTheDocument();
    expect(within(old).getByText('Usually the same as your SDMS ID')).toBeInTheDocument();
    expect(within(old).getByLabelText('User ID')).toBeInTheDocument();
  });

  it('says to type the ID, and starts nothing, when none is typed or on record', async () => {
    box({ portals: [{ ...MISSING, resetPossible: false }], canEdit: true });
    const old = await ready('sdmsOld');
    fireEvent.click(within(old).getByRole('button', { name: 'Forgot password?' }));
    expect(
      await within(old).findByText(
        'Type your Old SDMS user ID above, then tap Forgot password? again.',
      ),
    ).toBeInTheDocument();
    expect(within(old).queryByRole('button', { name: 'Send OTP' })).toBeNull();
    expect(h.post).not.toHaveBeenCalled();
  });

  it('opens the old-SDMS intro when an ID is on record, and "Send OTP" posts nothing but {}', async () => {
    box({ portals: [{ ...MISSING, resetPossible: true }], canEdit: true });
    const old = await ready('sdmsOld');
    fireEvent.click(within(old).getByRole('button', { name: 'Forgot password?' }));
    expect(
      within(old).getByText(
        /MDG will ask IndianOil to send an OTP to the mobile registered with your Old SDMS login/,
      ),
    ).toBeInTheDocument();
    expect(within(old).queryByLabelText('User ID')).toBeNull();
    h.post.mockResolvedValue({
      portals: [{ ...MISSING, resetPossible: true }],
      canEdit: true,
      sdmsOldReset: reset(),
    });
    fireEvent.click(within(old).getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith(START, {}));
    expect(await within(row('sdmsOld')).findByLabelText('OTP')).toBeInTheDocument();
  });

  it('sends the user ID typed above, once, so the owner never types it twice', async () => {
    box({ portals: [MISSING], canEdit: true });
    const old = await ready('sdmsOld');
    fireEvent.change(within(old).getByLabelText('User ID'), {
      target: { value: ' 0000123456_01 ' },
    });
    fireEvent.click(within(old).getByRole('button', { name: 'Forgot password?' }));
    h.post.mockResolvedValue({ portals: [MISSING], canEdit: true, sdmsOldReset: reset() });
    fireEvent.click(within(old).getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith(START, { username: '0000123456_01' }));
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it('shows "Forgot password?" under a saved login, and it opens the flow', async () => {
    box({ portals: [SAVED], canEdit: true });
    const old = await ready('sdmsOld');
    expect(within(old).queryByLabelText('User ID')).toBeNull();
    fireEvent.click(within(old).getByRole('button', { name: 'Forgot password?' }));
    expect(within(old).getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
    h.post.mockResolvedValue({ portals: [SAVED], canEdit: true, sdmsOldReset: reset() });
    fireEvent.click(within(old).getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith(START, {}));
  });

  it('offers no "Forgot password?" to a manager', async () => {
    box({ portals: [SAVED], canEdit: false });
    const old = await ready('sdmsOld');
    await within(old).findByText(/Saved · /);
    expect(within(old).queryByRole('button', { name: 'Forgot password?' })).toBeNull();
  });

  it('follows a reset already going, with the old-SDMS wording', async () => {
    const going = reset({ sentTo: null });
    box({ portals: [SAVED], canEdit: true, sdmsOldReset: going }, ['sdmsOld'], [going]);
    const old = await ready('sdmsOld');
    expect(await within(old).findByText('Suresh started this')).toBeInTheDocument();
    expect(
      within(old).getByText('OTP sent to the mobile registered with your Old SDMS login'),
    ).toBeInTheDocument();
    expect(
      within(old).getByText(
        /8 to 15 characters, with at least one capital letter.*one symbol such as @/,
      ),
    ).toBeInTheDocument();
  });
});

describe('MessageBubble — the Old SDMS reset form', () => {
  const fill = (old: HTMLElement, password: string) => {
    fireEvent.change(within(old).getByLabelText('OTP'), { target: { value: '482913' } });
    fireEvent.change(within(old).getByLabelText('New password'), { target: { value: password } });
    fireEvent.change(within(old).getByLabelText('New password again'), {
      target: { value: password },
    });
    fireEvent.click(within(old).getByRole('button', { name: 'Set new password' }));
  };

  it('holds a password with no symbol back, and sends one that has it', async () => {
    const old = await startReset();
    expect(within(old).getByText(/one symbol such as @/)).toBeInTheDocument();
    // Fine for the SDMS rule, not for the old one.
    fill(old, 'Abcdefg1');
    expect(
      await within(old).findByText("The new password doesn't follow the rule below"),
    ).toBeInTheDocument();
    expect(h.put).not.toHaveBeenCalled();

    h.put.mockResolvedValue(reset({ state: 'checking', answeredByName: 'Owner' }));
    fill(old, VALID_PASSWORD);
    await waitFor(() =>
      expect(h.put).toHaveBeenCalledWith('/v1/me/portal-logins/sdms/reset/r1', {
        otp: '482913',
        password: VALID_PASSWORD,
      }),
    );
    expect(h.put).toHaveBeenCalledTimes(1);
  });

  it('shows IndianOil’s own words when it refused a try', async () => {
    const refused = reset({
      retry: 'password_rule',
      retryWords: 'Password must contain a special character',
    });
    box({ portals: [SAVED], canEdit: true, sdmsOldReset: refused }, ['sdmsOld'], [refused]);
    await waitFor(() =>
      expect(
        within(row('sdmsOld')).getByText(
          'IndianOil said: “Password must contain a special character”',
        ),
      ).toBeInTheDocument(),
    );
  });

  it('says the new password is set and saved, in the old-SDMS words', async () => {
    const done = reset({ state: 'done' });
    box({ portals: [SAVED], canEdit: true, sdmsOldReset: done }, ['sdmsOld'], [done]);
    await waitFor(() =>
      expect(
        within(row('sdmsOld')).getByText('New password set on IndianOil and saved ✓'),
      ).toBeInTheDocument(),
    );
  });

  it('after IndianOil refuses the user ID, offers a way back to type a different one', async () => {
    const failed = reset({
      state: 'failed',
      message: {
        en: "IndianOil's website did not accept that user ID for a reset.",
        hi: 'IndianOil की वेबसाइट ने रीसेट के लिए ये यूज़र ID नहीं मानी।',
      },
    });
    box({ portals: [SAVED], canEdit: true, sdmsOldReset: failed }, ['sdmsOld'], [failed]);
    const old = await waitFor(() => row('sdmsOld'));
    expect(await within(old).findByText(/did not accept that user ID/)).toBeInTheDocument();
    fireEvent.click(within(old).getByRole('button', { name: 'Type a different user ID' }));
    expect(await within(row('sdmsOld')).findByLabelText('User ID')).toBeInTheDocument();
    expect(h.post).not.toHaveBeenCalled();
  });

  it('tells the owner a reset for the other SDMS login is going, when the server says so', async () => {
    box({ portals: [{ ...SAVED }], canEdit: true });
    const old = await ready('sdmsOld');
    fireEvent.click(within(old).getByRole('button', { name: 'Forgot password?' }));
    h.post.mockRejectedValue(new ApiError(409, SDMS_RESET_OTHER_GOING, 'Another reset is going.'));
    fireEvent.click(within(old).getByRole('button', { name: 'Send OTP' }));
    expect(
      await within(old).findByText(
        'A password reset for your other SDMS login is going right now. Finish it first, or try again in a few minutes.',
      ),
    ).toBeInTheDocument();
    // Still on the first step: nothing was started.
    expect(within(old).getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
  });
});

describe('MessageBubble — SDMS and the Old SDMS side by side', () => {
  it('keeps the SDMS row on view.sdmsReset only: an old-SDMS reset never shows there', async () => {
    box({ portals: [SDMS_REFUSED, SAVED], canEdit: true, sdmsOldReset: reset() }, [
      'sdms',
      'sdmsOld',
    ]);
    const old = await ready('sdmsOld');
    expect(await within(old).findByLabelText('OTP')).toBeInTheDocument();
    const sdms = row('sdms');
    expect(within(sdms).queryByLabelText('OTP')).toBeNull();
    expect(within(sdms).queryByText('Suresh started this')).toBeNull();
    // Its form and its own "Forgot password?" are still there.
    expect(within(sdms).getByLabelText('User ID')).toBeInTheDocument();
    expect(within(sdms).getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
  });

  it('keeps an SDMS reset out of the Old SDMS row', async () => {
    box(
      {
        portals: [SDMS_REFUSED, SAVED],
        canEdit: true,
        sdmsReset: reset({ portal: 'sdms', startedByName: 'Suresh' }),
      },
      ['sdms', 'sdmsOld'],
    );
    const sdms = await ready('sdms');
    expect(await within(sdms).findByLabelText('OTP')).toBeInTheDocument();
    expect(within(row('sdmsOld')).queryByLabelText('OTP')).toBeNull();
  });

  it('still starts the SDMS reset on the SDMS route, with {}', async () => {
    box({ portals: [SDMS_REFUSED, SAVED], canEdit: true }, ['sdms', 'sdmsOld']);
    const sdms = await ready('sdms');
    fireEvent.click(within(sdms).getByRole('button', { name: 'Forgot password?' }));
    h.post.mockResolvedValue({
      portals: [SDMS_REFUSED, SAVED],
      canEdit: true,
      sdmsReset: reset({ portal: 'sdms' }),
    });
    fireEvent.click(within(sdms).getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/v1/me/portal-logins/sdms/reset', {}));
    expect(h.post).not.toHaveBeenCalledWith(START, expect.anything());
  });
});
