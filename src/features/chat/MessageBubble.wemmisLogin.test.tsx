import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { wemmisLoginKey } from '@/hooks/api/useWemmisLogin';
import type { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import type { DealerWemmisLoginView, WemmisResetView } from '@dk/shared/types';

import { MessageBubble } from './MessageBubble';

// The server is a double; the hooks and the box are the real ones.
const h = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, put: h.put, post: h.post },
}));

const USER = 'test-user-01';
const SECRET = 'Pa55word!x';
const MOBILE = '9876543210';

function view(over: Partial<DealerWemmisLoginView> = {}): DealerWemmisLoginView {
  return { status: 'missing', username: null, canEdit: true, reset: null, ...over };
}
function reset(over: Partial<WemmisResetView> = {}): WemmisResetView {
  return {
    id: 'r1',
    state: 'otp_sent',
    mobileMasked: 'XXXXXX1234',
    expiresAt: new Date(Date.now() + 112_000).toISOString(),
    usernames: [],
    captchaImageUrl: null,
    message: null,
    ...over,
  };
}

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: false });
  signIn({ role: 'dealer-owner' });
  h.get.mockReset();
  h.put.mockReset();
  h.post.mockReset();
});
afterEach(() => cleanup());

function box(body = 'To fetch your calibration papers we need your eMaaptaul login.') {
  const message = makeMessage({
    id: 'wemmis-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body,
    wemmisLogin: { claimId: 'claim-1' },
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

describe('MessageBubble — an eMaaptaul login box MDG posted', () => {
  it('asks for the login only when a box is on screen', async () => {
    renderWithProviders(<MessageBubble message={makeMessage({ body: 'hello' })} mine={false} />);
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
  });

  it("reads the owner's own view, and draws the words first and the box under them", async () => {
    h.get.mockResolvedValue(view());
    const { container } = box();
    await screen.findByText('Needed');
    expect(h.get).toHaveBeenCalledWith('/v1/me/wemmis-login');
    const words = screen.getByText(/we need your eMaaptaul login/);
    const inner = container.querySelector('[data-wemmis-login]')!;
    expect(words.compareDocumentPosition(inner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is as wide as a request, with its time on its own line', async () => {
    h.get.mockResolvedValue(view());
    const { container } = box();
    await screen.findByText('Needed');
    expect(container.innerHTML).toContain('w-[min(80%,330px)]');
    // No spacer reserving room in the last line of words: the time is in the flow.
    expect(container.querySelector('span[aria-hidden].inline-block')).toBeNull();
    expect(container.querySelector('.absolute.bottom-\\[5px\\]')).toBeNull();
  });

  it('is its own box: the SDMS and IRAS login box is not drawn with it', async () => {
    h.get.mockResolvedValue(view());
    const { container } = box();
    await screen.findByText('Needed');
    expect(container.querySelector('[data-portal-login]')).toBeNull();
    expect(h.get).not.toHaveBeenCalledWith('/v1/me/portal-logins');
  });

  it('a saved login shows as saved with the user ID', async () => {
    h.get.mockResolvedValue(view({ status: 'saved', username: USER }));
    box();
    expect(await screen.findByText(`Saved ✓ ${USER}`)).toBeInTheDocument();
  });

  it('saving puts the user ID and password to the login route, and the box flips to saved at once', async () => {
    h.get.mockResolvedValue(view());
    h.put.mockResolvedValue(view({ status: 'saved', username: USER }));
    box();
    await screen.findByText('Needed');
    fireEvent.change(screen.getByLabelText('User ID'), { target: { value: USER } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(`Saved ✓ ${USER}`)).toBeInTheDocument();
    expect(h.put).toHaveBeenCalledWith('/v1/me/wemmis-login', { username: USER, password: SECRET });
    // The password is nowhere on screen or in a field any more.
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('a manager is told the owner fills it', async () => {
    signIn({ role: 'dealer-manager' });
    h.get.mockResolvedValue(view({ canEdit: false }));
    box();
    expect(await screen.findByText('The owner fills this')).toBeInTheDocument();
    expect(screen.queryByLabelText('User ID')).toBeNull();
  });

  it('asks again when the cache is told the login moved (a box arrived, a reconnect)', async () => {
    h.get.mockResolvedValueOnce(view());
    const { queryClient } = box();
    await screen.findByText('Needed');
    h.get.mockResolvedValue(view({ status: 'saved', username: USER }));
    await queryClient.invalidateQueries({ queryKey: wemmisLoginKey });
    expect(await screen.findByText(`Saved ✓ ${USER}`)).toBeInTheDocument();
  });

  // The whole road once, through the real hooks: forgot → mobile → OTP boxes →
  // checking → done. The server double answers each call the way the route is
  // documented to.
  it('resets a forgotten password: Send OTP, type the four digits, and it is done', async () => {
    // What the server's reset says on each poll; the test moves it along.
    let polled: WemmisResetView = reset();
    h.get.mockImplementation(async (path: string) => {
      if (path === '/v1/me/wemmis-login') return view();
      if (path === '/v1/me/wemmis-login/reset/r1') return polled;
      throw new Error(`unexpected GET ${path}`);
    });
    h.post.mockResolvedValue(view({ reset: reset({ state: 'starting', expiresAt: null }) }));
    h.put.mockResolvedValue(reset({ state: 'checking' }));

    box();
    await screen.findByText('Needed');
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: MOBILE } });
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    // The POST carries the mobile; the box then follows the reset it was given.
    await waitFor(() =>
      expect(h.post).toHaveBeenCalledWith('/v1/me/wemmis-login/reset', { mobile: MOBILE }),
    );
    expect(await screen.findByText('OTP sent to XXXXXX1234')).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith('/v1/me/wemmis-login/reset/r1');

    // The owner types the code; the fourth digit sends it, and nothing else.
    const boxes = screen.getAllByLabelText(/^OTP digit \d of 4$/);
    [...'4821'].forEach((d, i) => fireEvent.change(boxes[i]!, { target: { value: d } }));
    await waitFor(() =>
      expect(h.put).toHaveBeenCalledWith('/v1/me/wemmis-login/reset/r1', { otp: '4821' }),
    );
    expect(await screen.findByText('Checking your OTP…')).toBeInTheDocument();

    // The next poll (1.5 s later) learns the reset is done, and the box says so.
    polled = reset({ state: 'done', expiresAt: null });
    expect(
      await screen.findByText(
        "Password reset. MDG's team will now download your certificate.",
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
  }, 10_000);
});
