import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import {
  XTRAPOWER_RESET_URL,
  type PortalId,
  type PortalLoginState,
  type PortalLoginsView,
} from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// The server is a double; ApiError stays the real one.
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.ReactNativeWebView;
  delete window.__DK_NATIVE_FEATURES__;
});

const IOCL: PortalLoginState[] = [
  { portal: 'sdms', needed: true, status: 'saved', savedAt: new Date().toISOString(), savedBy: 'dealer' },
  { portal: 'iras', needed: true, status: 'saved', savedAt: new Date().toISOString(), savedBy: 'dealer' },
];
const XP_MISSING: PortalLoginState = { portal: 'xtrapower', needed: true, status: 'missing' };
const XP_SAVED: PortalLoginState = {
  portal: 'xtrapower',
  needed: true,
  status: 'saved',
  savedAt: new Date().toISOString(),
  savedBy: 'dealer',
};

function view(portals: PortalLoginState[], canEdit = true): PortalLoginsView {
  return { portals, canEdit, tanker: { asked: true, owns: null, answeredBy: null } };
}

function box(v: PortalLoginsView, portals: PortalId[] = ['xtrapower']) {
  h.get.mockResolvedValue(v);
  const message = makeMessage({
    id: 'xp-box',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body: 'To run your services we need your IOC XtraPower login.',
    portalLogin: { portals },
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

function row(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-portal="xtrapower"]');
  if (!el) throw new Error('no xtrapower row');
  return el;
}

/** The row once the server's view has landed (it draws a spinner until then). */
async function loadedRow(): Promise<HTMLElement> {
  return waitFor(() => {
    const el = row();
    if (el.dataset.status === 'loading') throw new Error('still loading');
    return el;
  });
}

describe('MessageBubble — the IOC XtraPower login, asked on demand', () => {
  it('draws one XtraPower row, with no SDMS/IRAS rows and no tanker question', async () => {
    box(view([...IOCL, XP_MISSING]));
    const xp = await loadedRow();
    expect(within(xp).getByText('IOC XtraPower login')).toBeInTheDocument();
    expect(within(xp).getByLabelText('User ID')).toBeInTheDocument();
    expect(document.querySelector('[data-portal="sdms"]')).toBeNull();
    expect(document.querySelector('[data-tanker-question]')).toBeNull();
  });

  it('"Forgot password?" shows the steps and opens XtraPower’s own reset page in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    box(view([...IOCL, XP_SAVED]));
    const xp = await loadedRow();
    // No user ID needed first: the owner types it on XtraPower's page.
    fireEvent.click(within(xp).getByRole('button', { name: 'Forgot password?' }));
    const guide = xp.querySelector<HTMLElement>('[data-reset-guide]')!;
    expect(within(guide).getByText(/tap Generate OTP/)).toBeInTheDocument();
    expect(within(guide).getByText(/6-digit code/)).toBeInTheDocument();

    fireEvent.click(within(guide).getByRole('button', { name: 'Open XtraPower' }));
    expect(open).toHaveBeenCalledWith(XTRAPOWER_RESET_URL, '_blank', 'noopener,noreferrer');
    // Nothing is asked of MDG's server: the reset is the owner's own.
    expect(h.post).not.toHaveBeenCalled();

    // Back from XtraPower: the new password goes into the row like any login.
    expect(within(xp).getByText('Done? Enter your User ID and the new password below.')).toBeInTheDocument();
    h.put.mockResolvedValue(view([...IOCL, XP_SAVED]));
    fireEvent.change(within(xp).getByLabelText('User ID'), { target: { value: '3212000103' } });
    fireEvent.change(within(xp).getByLabelText('Password'), { target: { value: 'New@pass1' } });
    fireEvent.click(within(xp).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(h.put).toHaveBeenCalledWith('/v1/me/portal-logins/xtrapower', {
        username: '3212000103',
        password: 'New@pass1',
      }),
    );
    await waitFor(() => expect(row().querySelector('[data-reset-guide]')).toBeNull());
  });

  it('inside a phone app that can, opens the page in the app’s own screen with the steps', async () => {
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    window.__DK_NATIVE_FEATURES__ = ['portal'];
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    box(view([...IOCL, XP_MISSING]));
    const xp = await loadedRow();
    fireEvent.click(within(xp).getByRole('button', { name: 'Forgot password?' }));
    fireEvent.click(within(xp).getByRole('button', { name: 'Open XtraPower' }));

    const sent = postMessage.mock.calls
      .map(([m]) => JSON.parse(m as string) as { type: string; url?: string; steps?: string[]; title?: string })
      .find((m) => m.type === 'portal:open');
    expect(sent?.url).toBe(XTRAPOWER_RESET_URL);
    expect(sent?.title).toBe('XtraPower password reset');
    expect(sent?.steps).toHaveLength(4);
    expect(open).not.toHaveBeenCalled();
  });

  it('a manager reads the row but gets no form and no reset', async () => {
    box(view([...IOCL, XP_MISSING], false));
    const xp = await loadedRow();
    await screen.findByText('The owner fills this');
    expect(within(xp).queryByRole('button', { name: 'Forgot password?' })).toBeNull();
  });
});
