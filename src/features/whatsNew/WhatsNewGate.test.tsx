import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as NativeBridge from '@/lib/nativeBridge';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

const h = vi.hoisted(() => ({
  platform: 'android' as 'android' | 'ios' | 'web',
  embedded: false,
  play: vi.fn<() => Promise<unknown>>(),
  post: vi.fn<(path: string) => Promise<unknown>>(),
  fetchPlay: vi.fn<(id: string) => Promise<unknown>>(),
  // What this app open's own /me answer says. 'store' = the answer equals the signed-in user.
  me: { fresh: true, data: 'store' as 'store' | Record<string, unknown> },
}));
vi.mock('@/hooks/api/useMe', async () => {
  const { useAuthStore: store } = await import('@/store/auth');
  return {
    useMe: () => {
      const user = store.getState().user;
      return {
        isSuccess: h.me.fresh,
        isFetchedAfterMount: h.me.fresh,
        data: h.me.data === 'store' ? user : h.me.data,
      };
    },
  };
});

vi.mock('@/lib/nativeBridge', async (orig) => {
  const actual = await orig<typeof NativeBridge>();
  return { ...actual, detectPlatform: () => h.platform };
});
vi.mock('@/lib/embedMode', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return { ...actual, isEmbedded: () => h.embedded };
});
vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return { ...actual, api: { ...(actual.api as object), post: (p: string) => h.post(p) } };
});
vi.mock('@/features/help/useGuideVideos', () => ({
  fetchGuideVideoPlay: (id: string) => h.fetchPlay(id),
}));
vi.mock('@/features/yourVideos/useYourVideos', () => ({
  useWatchReport: () => ({
    onTimeUpdate: () => undefined,
    onSeeking: () => undefined,
    onPause: () => undefined,
    onEnded: () => undefined,
    flush: () => undefined,
  }),
}));

const { WhatsNewGate } = await import('./WhatsNewGate');

const PLAY = { url: 'https://cdn.test/whats_new_today.mp4', startSec: 0, durationMs: 60_000 };

function Harness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/')}>
        to-today
      </button>
      <WhatsNewGate />
    </>
  );
}

const open = (route = '/') => renderWithProviders(<Harness />, { route });
const dialog = () => screen.queryByRole('dialog', { name: 'ऐप में नया क्या है' });
const video = () => screen.getByTestId('whats-new-player') as HTMLVideoElement;

beforeEach(() => {
  resetStores();
  useLangStore.setState({ lang: 'hi', explicit: false });
  h.platform = 'android';
  h.embedded = false;
  h.me.fresh = true;
  h.me.data = 'store';
  h.play.mockReset().mockResolvedValue(undefined);
  h.post.mockReset().mockResolvedValue({ ok: true });
  h.fetchPlay.mockReset().mockResolvedValue(PLAY);
  window.HTMLMediaElement.prototype.play = h.play as unknown as () => Promise<void>;
  window.HTMLMediaElement.prototype.pause = () => undefined;
  window.scrollTo = () => undefined;
  signIn({ whatsNewVideo: 'whats_new_today', langChosenAt: '2026-11-01T00:00:00Z' });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('when it opens', () => {
  it('opens by itself on Today in the phone app for a dealer who is owed it', async () => {
    open();
    expect(await screen.findByRole('dialog', { name: 'ऐप में नया क्या है' })).toBeInTheDocument();
    expect(h.fetchPlay).toHaveBeenCalledWith('whats_new_today');
    await waitFor(() => expect(video()).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'बंद करें' })).toBeInTheDocument();
  });

  it('works on an iPhone too, and for a manager', async () => {
    h.platform = 'ios';
    signIn({ role: 'dealer-staff', whatsNewVideo: 'whats_new_today' });
    open();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('opens in a phone-sized touch browser', async () => {
    h.platform = 'web';
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('pointer: coarse') || q.includes('max-width: 767px'),
    }));
    open();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('never on a desktop browser', async () => {
    h.platform = 'web';
    open();
    await act(async () => undefined);
    expect(dialog()).toBeNull();
    expect(h.fetchPlay).not.toHaveBeenCalled();
  });

  it('never in the extension side panel', async () => {
    h.embedded = true;
    open();
    await act(async () => undefined);
    expect(dialog()).toBeNull();
  });

  it('never when the server says nothing is owed', async () => {
    signIn({ whatsNewVideo: null });
    open();
    await act(async () => undefined);
    expect(dialog()).toBeNull();
  });

  it('never on the strength of a stale saved profile: it waits for this open\'s /me', async () => {
    h.me.fresh = false;
    open();
    await new Promise((r) => setTimeout(r, 50));
    expect(dialog()).toBeNull();
    expect(h.fetchPlay).not.toHaveBeenCalled();
  });

  it('never when the fresh /me says it was already shown, whatever the saved profile says', async () => {
    h.me.data = { ...useAuthStore.getState().user, whatsNewVideo: null };
    open();
    await new Promise((r) => setTimeout(r, 50));
    expect(dialog()).toBeNull();
    expect(h.fetchPlay).not.toHaveBeenCalled();
  });

  it('draws the word Close next to the X', async () => {
    open();
    expect(await screen.findByRole('button', { name: 'बंद करें' })).toHaveTextContent('बंद करें');
  });

  it('never over the language choice', async () => {
    signIn({ whatsNewVideo: 'whats_new_today', langChosenAt: null });
    open();
    await act(async () => undefined);
    expect(dialog()).toBeNull();
  });

  it('never over the forced password change', async () => {
    signIn({ whatsNewVideo: 'whats_new_today', mustChangePassword: true });
    open();
    await act(async () => undefined);
    expect(dialog()).toBeNull();
  });

  it('never off the Today page', async () => {
    open('/chat');
    await act(async () => undefined);
    expect(dialog()).toBeNull();
  });

  it('never over an open report, and opens once they are back on Today', async () => {
    open('/report/c1/m1');
    await act(async () => undefined);
    expect(dialog()).toBeNull();
    await userEvent.click(screen.getByText('to-today'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('playing', () => {
  it('marks it shown on the first playing only, and clears the user at once', async () => {
    open();
    await waitFor(() => expect(video()).toBeInTheDocument());
    expect(h.post).not.toHaveBeenCalled();
    fireEvent.playing(video());
    fireEvent.playing(video());
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.post).toHaveBeenCalledWith('/v1/me/whats-new/whats_new_today/seen');
    expect(useAuthStore.getState().user?.whatsNewVideo).toBeNull();
    // The video stays up: clearing the field does not close it.
    expect(dialog()).toBeInTheDocument();
  });

  it('a refused sound plays muted with a big button that unmutes', async () => {
    h.play.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError')).mockResolvedValue(undefined);
    open();
    const button = await screen.findByRole('button', { name: 'आवाज़ चालू करें' });
    expect(video().muted).toBe(true);
    await userEvent.click(button);
    expect(video().muted).toBe(false);
    expect(screen.queryByRole('button', { name: 'आवाज़ चालू करें' })).toBeNull();
  });

  it('plays with sound when the browser allows it: no sound button', async () => {
    open();
    await waitFor(() => expect(video()).toBeInTheDocument());
    expect(video().muted).toBe(false);
    expect(screen.queryByRole('button', { name: 'आवाज़ चालू करें' })).toBeNull();
  });

  it('at the end shows Go to Today and Watch again; Watch again restarts', async () => {
    open();
    await waitFor(() => expect(video()).toBeInTheDocument());
    fireEvent.playing(video());
    fireEvent.ended(video());
    const today = screen.getByRole('button', { name: 'आज का पेज देखें' });
    expect(today).toHaveFocus();
    expect(video()).toHaveAttribute('aria-hidden', 'true');
    h.play.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'फिर से देखें' }));
    expect(video().currentTime).toBe(0);
    expect(h.play).toHaveBeenCalled();
    expect(screen.queryByTestId('whats-new-end')).toBeNull();
    expect(video()).not.toHaveAttribute('aria-hidden');
    expect(video()).toHaveFocus();
  });

  it('Go to Today closes it', async () => {
    open();
    await waitFor(() => expect(video()).toBeInTheDocument());
    fireEvent.ended(video());
    await userEvent.click(screen.getByRole('button', { name: 'आज का पेज देखें' }));
    expect(dialog()).toBeNull();
  });
});

describe('closing', () => {
  it('Close closes it, and it does not come back in this session', async () => {
    open();
    await waitFor(() => expect(video()).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'बंद करें' }));
    expect(dialog()).toBeNull();
    await act(async () => undefined);
    expect(dialog()).toBeNull();
    // Closed before it played: not marked shown.
    expect(h.post).not.toHaveBeenCalled();
  });

  it('Escape closes it', async () => {
    open();
    await waitFor(() => expect(video()).toBeInTheDocument());
    await userEvent.keyboard('{Escape}');
    expect(dialog()).toBeNull();
  });

  it('the phone Back button closes it', async () => {
    open();
    await waitFor(() => expect(video()).toBeInTheDocument());
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('a video that cannot load closes quietly and is not marked shown', async () => {
    h.fetchPlay.mockRejectedValue(new Error('offline'));
    open();
    await waitFor(() => expect(h.fetchPlay).toHaveBeenCalled());
    await waitFor(() => expect(dialog()).toBeNull());
    expect(h.post).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.whatsNewVideo).toBe('whats_new_today');
  });

  it('a file that fails twice closes quietly, after one fresh link', async () => {
    open();
    await waitFor(() => expect(video()).toBeInTheDocument());
    fireEvent.error(video());
    await waitFor(() => expect(h.fetchPlay).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(video()).toBeInTheDocument());
    fireEvent.error(video());
    await waitFor(() => expect(dialog()).toBeNull());
    expect(h.post).not.toHaveBeenCalled();
  });
});
