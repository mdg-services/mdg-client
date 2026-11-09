import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import {
  PORTAL_RESET_TOO_MANY,
  type PortalId,
  type PortalLoginState,
  type PortalLoginsView,
  type PortalTankerView,
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
afterEach(() => cleanup());

const SAVED_AT = new Date().toISOString();

function state(over: Partial<PortalLoginState> & Pick<PortalLoginState, 'portal'>): PortalLoginState {
  return { needed: true, status: 'saved', savedAt: SAVED_AT, savedBy: 'dealer', ...over };
}
const ASKED: PortalTankerView = { asked: true, owns: null, answeredBy: null };
function view(portals: PortalLoginState[], tanker: PortalTankerView = ASKED, canEdit = true): PortalLoginsView {
  return { portals, canEdit, tanker };
}
const IOCL = [state({ portal: 'sdms' }), state({ portal: 'iras' })];
const PARTNERS_MISSING = state({ portal: 'partners', status: 'missing', savedAt: undefined, savedBy: undefined });

function box(v: PortalLoginsView, portals: PortalId[] = ['sdms', 'iras']) {
  h.get.mockResolvedValue(v);
  const message = makeMessage({
    id: 'box-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body: 'To run your services we need your SDMS and IRAS login.',
    portalLogin: { portals },
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

const question = () => document.querySelector<HTMLElement>('[data-tanker-question]');
function row(portal: PortalId): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-portal="${portal}"]`);
  if (!el) throw new Error(`no ${portal} row`);
  return el;
}

describe('MessageBubble — the tanker question in an Indian Oil box', () => {
  it('asks it under SDMS and IRAS, and a Yes brings the IndianOil Partners row', async () => {
    box(view(IOCL));
    await screen.findByText('Do you also own a tanker?');
    expect(screen.getByText('If yes, MDG also needs your IndianOil Partners login.')).toBeInTheDocument();
    expect(document.querySelector('[data-portal="partners"]')).toBeNull();

    h.put.mockResolvedValue(view([...IOCL, PARTNERS_MISSING], { asked: true, owns: true, answeredBy: 'dealer' }));
    fireEvent.click(within(question()!).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(h.put).toHaveBeenCalledWith('/v1/me/portal-logins/tanker', { owns: true }));

    const partners = await waitFor(() => row('partners'));
    expect(within(partners).getByText('IndianOil Partners login')).toBeInTheDocument();
    expect(within(partners).getByText('Your user ID is your vendor SAP code')).toBeInTheDocument();
    expect(within(question()!).getByText('Tanker: yes')).toBeInTheDocument();
  });

  it('a manager reads the question but cannot answer it', async () => {
    box(view(IOCL, ASKED, false));
    await screen.findByText('Do you also own a tanker?');
    expect(within(question()!).queryByRole('button', { name: 'Yes' })).toBeNull();
    expect(screen.getByText('The owner answers this')).toBeInTheDocument();
  });

  it('is not shown in a box where the server does not ask it (a live outlet, an older server)', async () => {
    box({ portals: IOCL, canEdit: true });
    await screen.findAllByText(/^Saved/);
    expect(question()).toBeNull();
  });
});

describe('MessageBubble — "Forgot password?" on IndianOil Partners', () => {
  const SAVED_PARTNERS = state({ portal: 'partners' });
  const OWNS: PortalTankerView = { asked: true, owns: true, answeredBy: 'dealer' };

  it('explains what happens, starts the reset, and shows it running', async () => {
    box(view([...IOCL, SAVED_PARTNERS], OWNS));
    const partners = await waitFor(() => row('partners'));
    fireEvent.click(within(partners).getByRole('button', { name: 'Forgot password?' }));
    expect(within(partners).getByText(/IndianOil sends it to the mobile or email registered with them/)).toBeInTheDocument();

    h.post.mockResolvedValue(
      view([...IOCL, { ...SAVED_PARTNERS, reset: { state: 'running', at: new Date().toISOString() } }], OWNS),
    );
    fireEvent.click(within(partners).getByRole('button', { name: 'Get a new password' }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/v1/me/portal-logins/partners/reset', {}));
    expect(await within(row('partners')).findByText(/Asking IndianOil for a new password/)).toBeInTheDocument();
    expect(within(row('partners')).queryByRole('button', { name: 'Forgot password?' })).toBeNull();
  });

  it('once IndianOil has sent it, opens the form for the new password with IndianOil\'s words', async () => {
    const at = new Date().toISOString();
    box(
      view(
        [
          ...IOCL,
          {
            ...SAVED_PARTNERS,
            reset: { state: 'sent', at, doneAt: at, portalWords: 'Password has been sent to your registered email id.' },
          },
        ],
        OWNS,
      ),
    );
    const partners = await waitFor(() => row('partners'));
    expect(
      await within(partners).findByText(
        'IndianOil has sent a new password to your registered mobile or email. Enter it below.',
      ),
    ).toBeInTheDocument();
    expect(within(partners).getByText(/IndianOil said: “Password has been sent/)).toBeInTheDocument();
    expect(within(partners).getByLabelText('Password')).toBeInTheDocument();
  });

  it('asks for the user ID when none is saved, and says why a reset was turned down', async () => {
    box(view([...IOCL, PARTNERS_MISSING], OWNS));
    const partners = await waitFor(() => row('partners'));
    fireEvent.click(within(partners).getByRole('button', { name: 'Forgot password?' }));
    const go = within(partners).getByRole('button', { name: 'Get a new password' });
    expect(go).toBeDisabled();
    const ids = within(partners).getAllByLabelText('User ID');
    fireEvent.change(ids[ids.length - 1]!, { target: { value: '11031871' } });
    expect(go).toBeEnabled();

    h.post.mockRejectedValue(new ApiError(409, PORTAL_RESET_TOO_MANY, 'too many'));
    fireEvent.click(go);
    await waitFor(() =>
      expect(h.post).toHaveBeenCalledWith('/v1/me/portal-logins/partners/reset', { username: '11031871' }),
    );
    expect(
      await within(partners).findByText('The password has been reset too many times today. Try again tomorrow.'),
    ).toBeInTheDocument();
  });

  it('never offers a reset on SDMS or IRAS', async () => {
    box(view([...IOCL, SAVED_PARTNERS], OWNS));
    await waitFor(() => row('partners'));
    expect(within(row('sdms')).queryByRole('button', { name: 'Forgot password?' })).toBeNull();
    expect(within(row('iras')).queryByRole('button', { name: 'Forgot password?' })).toBeNull();
  });
});
