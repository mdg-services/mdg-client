import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageBubble } from '@/features/chat/MessageBubble';
import { ApiError } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeFakeSocket, type FakeSocket } from '@/test/fakeSocket';
import { makeMessage, renderWithProviders, signIn } from '@/test/utils';
import type { GuideVideoPlay, YourVideoRow, YourVideosView } from '@dk/shared/types';

// The server is a double; ApiError stays the real one, so the card tells a 404 from any other failure.
const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), socket: null as unknown as FakeSocket }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, post: h.post },
}));
vi.mock('@/lib/socket', () => ({ getSocket: () => h.socket }));

const LIST = '/v1/me/your-videos';
const WATCH = '/v1/me/your-videos/watch';

function row(id: string, over: Partial<YourVideoRow> = {}): YourVideoRow {
  return {
    id,
    title: { hi: `${id} हिंदी`, en: `${id} title` },
    summary: { hi: 'सार', en: 'summary' },
    durationMs: 60_000,
    service: 'dsr-report',
    examples: [{ hl: `${id} hinglish`, hi: `${id} देवनागरी`, en: `${id} english` }],
    watched: false,
    watchedAt: null,
    ...over,
  };
}

const VIEW: YourVideosView = {
  mine: [
    row('svc_fuel_orders', {
      title: { hi: 'चैट से लोड ऑर्डर', en: 'Fuel orders from the chat' },
      examples: [
        { hl: 'Load laga dijiye 12KL HSD', hi: 'लोड लगा दीजिए 12KL HSD', en: 'Place a load of 12 KL HSD' },
        { hl: 'Ye order cancel kar do', hi: 'ये ऑर्डर कैंसल कर दो', en: 'Cancel this order' },
      ],
    }),
    row('svc_dsr', { watched: true, watchedAt: '2026-11-21T06:00:00.000Z' }),
  ],
  more: [row('svc_stock_check', { service: 'stock-check' })],
};

function serve(view: YourVideosView | Error, play?: GuideVideoPlay) {
  h.get.mockImplementation((path: string) => {
    if (path === LIST) return view instanceof Error ? Promise.reject(view) : Promise.resolve(view);
    return Promise.resolve(
      play ?? {
        id: 'svc_fuel_orders',
        title: { hi: 'x', en: 'x' },
        url: 'https://bucket.test/v.mp4?sig=1',
        durationMs: 60_000,
        startSec: 0,
        chapters: [],
      },
    );
  });
}

function list(lang: 'en' | 'hi' | 'hl' = 'en', role: 'dealer-owner' | 'dealer-staff' = 'dealer-owner') {
  signIn({ role, dealerId: 'd1' });
  useLangStore.setState({ lang, explicit: true });
  h.socket = makeFakeSocket(true);
  const message = makeMessage({
    id: 'videos-msg',
    senderId: 'system-user',
    senderRole: 'admin',
    senderName: 'MDG',
    system: true,
    body: 'Your videos: a short video for each service.',
    videoList: {},
  });
  return renderWithProviders(<MessageBubble message={message} mine={false} />);
}

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
});
afterEach(() => cleanup());

const rowOf = (id: string) => screen.findByTestId(`your-video-${id}`);

describe('the "your videos" list in the chat', () => {
  it('shows the services this pump has first, then the ones it can still start, and how many are watched', async () => {
    serve(VIEW);
    list();
    await rowOf('svc_fuel_orders');
    const groups = screen.getAllByRole('region');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Your services', 'Also available']);
    expect(within(groups[0]!).getAllByRole('button').map((b) => b.getAttribute('data-testid'))).toEqual([
      'your-video-svc_fuel_orders',
      'your-video-svc_dsr',
    ]);
    expect(within(groups[1]!).getByTestId('your-video-svc_stock_check')).toBeTruthy();
    expect(screen.getByTestId('your-videos-progress').textContent).toBe('1 of 3 watched');
  });

  it('draws a tick on a watched video and a play mark on the others', async () => {
    serve(VIEW);
    list();
    expect((await rowOf('svc_dsr')).getAttribute('data-watched')).toBe('true');
    expect((await rowOf('svc_fuel_orders')).getAttribute('data-watched')).toBe('false');
    expect(within(await rowOf('svc_dsr')).getByTestId('your-video-tick')).toBeTruthy();
    expect(within(await rowOf('svc_fuel_orders')).queryByTestId('your-video-tick')).toBeNull();
    expect(within(await rowOf('svc_dsr')).getByText('Watched')).toBeTruthy();
  });

  it('shows the sentences to type, in the reader’s own language', async () => {
    serve(VIEW);
    const { unmount } = list('hl');
    expect(await screen.findByText('“Load laga dijiye 12KL HSD”')).toBeTruthy();
    expect(screen.getByText('“Ye order cancel kar do”')).toBeTruthy();
    unmount();

    serve(VIEW);
    const second = list('hi');
    expect(await screen.findByText('“लोड लगा दीजिए 12KL HSD”')).toBeTruthy();
    second.unmount();

    serve(VIEW);
    list('en');
    expect(await screen.findByText('“Place a load of 12 KL HSD”')).toBeTruthy();
    expect(screen.getByText('Fuel orders from the chat')).toBeTruthy();
  });

  it('plays the video inside the app, in the full-screen player, from the list', async () => {
    serve(VIEW);
    list();
    fireEvent.click(await rowOf('svc_fuel_orders'));
    const sheet = await screen.findByTestId('guide-video-sheet');
    // Drawn on the page, not inside the bubble that swipes.
    expect(sheet.parentElement).toBe(document.body);
    expect(h.get).toHaveBeenCalledWith('/v1/me/guide-videos/svc_fuel_orders', { start: undefined });
    await waitFor(() => expect(screen.getByTestId('guide-video').getAttribute('src')).toContain('v.mp4'));
  });

  it('puts the tick on the row the moment this person’s other phone is told it counted', async () => {
    serve(VIEW);
    list();
    expect((await rowOf('svc_fuel_orders')).getAttribute('data-watched')).toBe('false');
    act(() => h.socket.server('videos:watched', { videoId: 'svc_fuel_orders', watchedAt: '2026-11-21T07:00:00.000Z' }));
    await waitFor(async () => expect((await rowOf('svc_fuel_orders')).getAttribute('data-watched')).toBe('true'));
    expect(screen.getByTestId('your-videos-progress').textContent).toBe('2 of 3 watched');
  });

  it('draws nothing on an older server that has no such list, and a retry on any other failure', async () => {
    serve(new ApiError(404, 'NOT_FOUND', 'nope'));
    const first = list();
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(first.container.querySelector('[data-setup-card="your-videos"]')).toBeNull();
    first.unmount();

    serve(new ApiError(500, 'BOOM', 'boom'));
    list();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    serve(VIEW);
    fireEvent.click(retry);
    expect(await rowOf('svc_fuel_orders')).toBeTruthy();
  });

  it('says so when there is nothing to show yet', async () => {
    serve({ mine: [], more: [] });
    list();
    expect(await screen.findByText('No videos yet')).toBeTruthy();
  });
});

describe('the player ticks the video once enough of it was played', () => {
  /** The player's <video>, with a position the test controls. */
  async function openPlayer(id = 'svc_fuel_orders') {
    fireEvent.click(await rowOf(id));
    const video = (await screen.findByTestId('guide-video')) as HTMLVideoElement;
    let pos = 0;
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => pos, set: (v: number) => (pos = v) });
    const at = (p: number) => {
      pos = p;
      fireEvent.timeUpdate(video);
    };
    return { video, at, seek: (p: number) => { pos = p; fireEvent.seeking(video); fireEvent.timeUpdate(video); } };
  }

  /** Play from `from` to `to` in quarter-second steps. */
  const playTo = (at: (p: number) => void, from: number, to: number) => {
    for (let p = from; p <= to + 1e-9; p += 0.25) at(p);
  };

  it('reports the video once 65% of it was played, and the list ticks it at once', async () => {
    serve(VIEW);
    h.post.mockResolvedValue({ id: 'svc_fuel_orders', watched: true, watchedAt: '2026-11-21T08:00:00.000Z', neededSec: 39 });
    list();
    const { at } = await openPlayer();
    playTo(at, 0, 38);
    expect(h.post).not.toHaveBeenCalled();
    playTo(at, 38.25, 40);
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    const [path, body] = h.post.mock.calls[0]!;
    expect(path).toBe(WATCH);
    expect(body).toMatchObject({ videoId: 'svc_fuel_orders' });
    expect((body as { playedSec: number }).playedSec).toBeGreaterThanOrEqual(39);
    await waitFor(() => expect(screen.getAllByTestId('your-video-tick').length).toBe(2));
    // Reported once, not at every update after it.
    playTo(at, 40.25, 45);
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it('does not report a video that was skipped to the end', async () => {
    serve(VIEW);
    list();
    const { at, seek } = await openPlayer();
    playTo(at, 0, 5);
    seek(58);
    playTo(at, 58.25, 60);
    expect(h.post).not.toHaveBeenCalled();
  });

  it('tries again later when the report did not get through, and keeps the list as it was meanwhile', async () => {
    serve(VIEW);
    h.post.mockRejectedValueOnce(new Error('offline'));
    h.post.mockResolvedValue({ id: 'svc_fuel_orders', watched: true, watchedAt: '2026-11-21T08:00:00.000Z', neededSec: 39 });
    list();
    const { video, at } = await openPlayer();
    playTo(at, 0, 40);
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    expect((await rowOf('svc_fuel_orders')).getAttribute('data-watched')).toBe('false');
    // Pausing asks again at once.
    fireEvent.pause(video);
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(2));
    await waitFor(async () => expect((await rowOf('svc_fuel_orders')).getAttribute('data-watched')).toBe('true'));
  });

  it('keeps playing toward a longer bar when the server says it needs more seconds', async () => {
    serve(VIEW);
    h.post.mockResolvedValueOnce({ id: 'svc_fuel_orders', watched: false, watchedAt: null, neededSec: 45 });
    h.post.mockResolvedValue({ id: 'svc_fuel_orders', watched: true, watchedAt: '2026-11-21T08:00:00.000Z', neededSec: 45 });
    list();
    const { at, video } = await openPlayer();
    playTo(at, 0, 40);
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1));
    playTo(at, 40.25, 44);
    fireEvent.pause(video);
    expect(h.post).toHaveBeenCalledTimes(1);
    playTo(at, 44.25, 46);
    fireEvent.pause(video);
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(2));
  });
});
