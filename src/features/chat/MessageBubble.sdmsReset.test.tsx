import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import {
  SDMS_RESET_ALREADY_ANSWERED,
  type PortalLoginState,
  type PortalLoginsView,
  type SdmsResetView,
} from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// SDMS "Forgot password?" inside the login box MDG posts when IndianOil expires
// the password. The server is a double; ApiError stays the real one.
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

const REFUSED: PortalLoginState = {
  portal: 'sdms',
  needed: true,
  status: 'refused',
  savedAt: new Date().toISOString(),
  refusedAt: new Date().toISOString(),
  resetPossible: true,
};

function reset(over: Partial<SdmsResetView> = {}): SdmsResetView {
  return {
    id: 'r1',
    state: 'otp_sent',
    sentTo: 'OTP has been sent to your registered mobile no XXXXXX4321',
    expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
    retry: null,
    message: null,
    startedByName: 'Suresh',
    answeredByName: null,
    ...over,
  };
}

function box(view: PortalLoginsView, resets: SdmsResetView[] = []) {
  h.get.mockImplementation(async (path: string) => {
    if (path === '/v1/me/portal-logins') return view;
    if (path.startsWith('/v1/me/portal-logins/sdms/reset/')) return resets.shift() ?? reset();
    throw new Error(`unexpected GET ${path}`);
  });
  const message = makeMessage({
    id: 'box-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body: 'IndianOil has expired your SDMS password.',
    portalLogin: { portals: ['sdms'] },
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

const sdmsRow = () => document.querySelector<HTMLElement>('[data-portal="sdms"]')!;

describe('SDMS "Forgot password?"', () => {
  it('sits under the password form when the outlet has a SAP code on record', async () => {
    box({ portals: [REFUSED], canEdit: true });
    expect(await screen.findByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
  });

  it('is not offered without a SAP code, nor to a manager', async () => {
    box({ portals: [{ ...REFUSED, resetPossible: false }], canEdit: true });
    await screen.findByText('Old password not working');
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull();
    cleanup();
    box({ portals: [REFUSED], canEdit: false });
    await screen.findByText('Old password not working');
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull();
  });

  it('sends the OTP, then takes the OTP and the new password together', async () => {
    box({ portals: [REFUSED], canEdit: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Forgot password?' }));
    h.post.mockResolvedValue({ portals: [REFUSED], canEdit: true, sdmsReset: reset() });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/v1/me/portal-logins/sdms/reset', {}));

    const row = sdmsRow();
    expect(await within(row).findByText(/XXXXXX4321/)).toBeInTheDocument();
    h.put.mockResolvedValue(reset({ state: 'checking', answeredByName: 'Owner' }));
    fireEvent.change(within(row).getByLabelText('OTP'), { target: { value: '482913' } });
    fireEvent.change(within(row).getByLabelText('New password'), { target: { value: 'NewPass2026' } });
    fireEvent.change(within(row).getByLabelText('New password again'), { target: { value: 'NewPass2026' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Set new password' }));
    await waitFor(() =>
      expect(h.put).toHaveBeenCalledWith('/v1/me/portal-logins/sdms/reset/r1', { otp: '482913', password: 'NewPass2026' }),
    );
  });

  it('refuses, before sending, a password IndianOil would refuse or that does not match', async () => {
    box({ portals: [REFUSED], canEdit: true, sdmsReset: reset() });
    const row = sdmsRow();
    await within(row).findByLabelText('OTP');
    fireEvent.change(within(row).getByLabelText('OTP'), { target: { value: '482913' } });
    fireEvent.change(within(row).getByLabelText('New password'), { target: { value: 'alllowercase1' } });
    fireEvent.change(within(row).getByLabelText('New password again'), { target: { value: 'alllowercase1' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Set new password' }));
    expect(await within(row).findByText("The new password doesn't follow the rule below")).toBeInTheDocument();
    fireEvent.change(within(row).getByLabelText('New password'), { target: { value: 'NewPass2026' } });
    fireEvent.change(within(row).getByLabelText('New password again'), { target: { value: 'NewPass2027' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Set new password' }));
    expect(await within(row).findByText("The two passwords don't match")).toBeInTheDocument();
    expect(h.put).not.toHaveBeenCalled();
  });

  it('shows another owner’s reset already going, and who started it (not to the owner who did)', async () => {
    box({ portals: [REFUSED], canEdit: true, sdmsReset: reset() });
    expect(await screen.findByText('Suresh started this')).toBeInTheDocument();
    expect(screen.getByLabelText('OTP')).toBeInTheDocument();
    cleanup();
    // The signed-in owner here is "Ramesh".
    box({ portals: [REFUSED], canEdit: true, sdmsReset: reset({ startedByName: 'Ramesh' }) });
    await screen.findByLabelText('OTP');
    expect(screen.queryByText('Ramesh started this')).toBeNull();
  });

  it('says so when another owner typed the OTP first', async () => {
    box({ portals: [REFUSED], canEdit: true, sdmsReset: reset() });
    const row = sdmsRow();
    await within(row).findByLabelText('OTP');
    h.put.mockRejectedValue(new ApiError(409, SDMS_RESET_ALREADY_ANSWERED, 'Suresh has already typed the OTP.'));
    fireEvent.change(within(row).getByLabelText('OTP'), { target: { value: '482913' } });
    fireEvent.change(within(row).getByLabelText('New password'), { target: { value: 'NewPass2026' } });
    fireEvent.change(within(row).getByLabelText('New password again'), { target: { value: 'NewPass2026' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Set new password' }));
    expect(await within(row).findByText('Another owner has already typed the OTP. Wait a moment.')).toBeInTheDocument();
  });

  it('asks again, saying why, when IndianOil refused the OTP', async () => {
    box({ portals: [REFUSED], canEdit: true, sdmsReset: reset({ retry: 'wrong_otp' }) });
    expect(await screen.findByText("IndianOil says that OTP isn't right. Check the SMS and type it again.")).toBeInTheDocument();
  });

  it('shows how it ended, with a way to start again', async () => {
    box({
      portals: [REFUSED],
      canEdit: true,
      sdmsReset: reset({ state: 'expired', message: { en: 'The time for this OTP ran out.', hi: 'समय खत्म।' } }),
    });
    expect(await screen.findByText('The time for this OTP ran out.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
  });
});
