import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeAutopayStatus } from '@/test/payments';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerAutopayStatus, GuideVideoListItem, GuideVideoPlay } from '@dk/shared/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

const { HelpVideosPage } = await import('./HelpVideosPage');

function video(over: Partial<GuideVideoListItem> = {}): GuideVideoListItem {
  return {
    id: 'app_tour',
    title: { hi: 'ऐप कैसे चलाएं', en: 'How the app works' },
    summary: { hi: 'चैट, रिपोर्ट और सेटिंग', en: 'Chat, reports and settings' },
    durationMs: 94_900,
    service: null,
    available: true,
    ...over,
  };
}

function play(over: Partial<GuideVideoPlay> = {}): GuideVideoPlay {
  return {
    id: 'app_tour',
    title: { hi: 'ऐप कैसे चलाएं', en: 'How the app works' },
    url: 'https://bucket.test/guides/app-tour-hi-v2.mp4?sig=abc',
    durationMs: 94_900,
    startSec: 0,
    ...over,
  };
}

const AUTOPAY_PATH = '/v1/payments/me/autopay';

/**
 * The server answers by address: the list, one video, or the owner's autopay
 * (nothing to show unless a test says otherwise; `'pending'` never answers).
 */
function serve(
  list: GuideVideoListItem[] | Error,
  playFor: (id: string) => GuideVideoPlay | Error = () => play(),
  autopay: DealerAutopayStatus | Error | 'pending' = makeAutopayStatus(null),
) {
  vi.mocked(api.get).mockImplementation(((path: string) => {
    if (path === AUTOPAY_PATH) {
      if (autopay === 'pending') return new Promise(() => undefined);
      return autopay instanceof Error ? Promise.reject(autopay) : Promise.resolve(autopay);
    }
    if (path === '/v1/me/guide-videos') {
      return list instanceof Error ? Promise.reject(list) : Promise.resolve(list);
    }
    const id = decodeURIComponent(path.replace('/v1/me/guide-videos/', ''));
    const out = playFor(id);
    return out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
  }) as never);
}

function renderPage(lang: 'en' | 'hi' = 'en', role: 'dealer-owner' | 'dealer-staff' = 'dealer-owner') {
  signIn({ id: 'owner', role });
  useLangStore.setState({ lang, explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/settings/help" element={<HelpVideosPage />} />
      <Route path="/settings/autopay" element={<div>went:autopay</div>} />
      <Route path="/settings" element={<div>went:settings</div>} />
      <Route path="/chat" element={<div>went:chat</div>} />
      <Route path="/chat/:id" element={<div>went:thread</div>} />
    </Routes>,
    { route: '/settings/help', withRouter: true },
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  // jsdom has no media: a <video> there never loads and never plays.
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
});

afterEach(() => resetStores());

describe('HelpVideosPage — the list', () => {
  it('asks the server for this member\'s videos and lists each with its length', async () => {
    serve([
      video(),
      video({ id: 'add_manager', title: { hi: 'मैनेजर जोड़ें', en: 'Add your manager' }, durationMs: 60_000 }),
    ]);
    renderPage();

    expect(await screen.findByText('How the app works')).toBeInTheDocument();
    expect(screen.getByText('Add your manager')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/v1/me/guide-videos');
    expect(screen.getByText('1:35')).toBeInTheDocument();
    expect(screen.getByText('1:00')).toBeInTheDocument();
    expect(screen.getAllByText('Chat, reports and settings')).toHaveLength(2);
  });

  it('is headed Help videos with a back arrow, and says it in Hindi when the app is in Hindi', async () => {
    serve([video()]);
    renderPage('hi');
    expect(await screen.findByText('ऐप कैसे चलाएं')).toBeInTheDocument();
    expect(screen.getByText('मदद के वीडियो')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'वापस' })).toBeInTheDocument();
  });

  it('leaves out a video that has no file yet, instead of showing a row that cannot play', async () => {
    serve([video(), video({ id: 'papers', title: { hi: 'कागज़', en: 'Papers' }, available: false })]);
    renderPage();
    expect(await screen.findByText('How the app works')).toBeInTheDocument();
    expect(screen.queryByText('Papers')).not.toBeInTheDocument();
  });

  it('says there are no videos, and still offers the chat, when none can play', async () => {
    serve([video({ available: false })]);
    renderPage();
    expect(await screen.findByText('No videos yet')).toBeInTheDocument();
    expect(screen.getByText('Ask in chat')).toBeInTheDocument();
  });

  it('says it could not load, with a way to try again and a way out', async () => {
    serve(new ApiError(500, 'INTERNAL', 'boom'));
    renderPage();
    expect(await screen.findByText('The videos did not load')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();

    serve([video()]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('How the app works')).toBeInTheDocument();
  });

  it('shows no address of the old video website, and nothing about paying', async () => {
    serve([video()]);
    const { container } = renderPage();
    await screen.findByText('How the app works');
    expect(container.innerHTML).not.toMatch(/guide\.mdgservices/i);
    expect(container.querySelector('a[href]')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/\b(pay|payment|razorpay|upi)\b/i);
  });
});

describe('HelpVideosPage — playing', () => {
  it('opens the in-app player with a fresh link for the video that was tapped', async () => {
    serve([video()]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Play How the app works' }));

    const sheet = await screen.findByRole('dialog', { name: 'How the app works' });
    const el = await within(sheet).findByTestId('guide-video');
    expect(el.getAttribute('src')).toBe('https://bucket.test/guides/app-tour-hi-v2.mp4?sig=abc#t=0.1');
    expect(api.get).toHaveBeenCalledWith('/v1/me/guide-videos/app_tour', { start: undefined });
  });

  it('opens at the chapter the server names', async () => {
    serve([video()], () => play({ startSec: 46 }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Play How the app works' }));
    const el = await screen.findByTestId('guide-video');
    expect(el.getAttribute('src')).toMatch(/#t=46$/);
  });

  it('closes on the cross, and the list is still there', async () => {
    serve([video()]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Play How the app works' }));
    await screen.findByTestId('guide-video');
    fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('How the app works')).toBeInTheDocument();
  });

  it("closes on the phone's Back button and does not leave the screen", async () => {
    serve([video()]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Play How the app works' }));
    await screen.findByTestId('guide-video');
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('How the app works')).toBeInTheDocument();
  });

  it('asks for one fresh link when the phone cannot play the first, then says so in words', async () => {
    let n = 0;
    serve([video()], () => play({ url: `https://bucket.test/v.mp4?sig=${++n}` }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Play How the app works' }));

    const first = await screen.findByTestId('guide-video');
    expect(first.getAttribute('src')).toContain('sig=1');
    fireEvent.error(first);
    await waitFor(() => expect(screen.getByTestId('guide-video').getAttribute('src')).toContain('sig=2'));

    fireEvent.error(screen.getByTestId('guide-video'));
    expect(await screen.findByText("This video didn't play. Tap to try again.")).toBeInTheDocument();
    expect(screen.queryByTestId('guide-video')).not.toBeInTheDocument();

    // A tap tries again from the start.
    fireEvent.click(screen.getByText("This video didn't play. Tap to try again."));
    await waitFor(() => expect(screen.getByTestId('guide-video').getAttribute('src')).toContain('sig=3'));
  });

  it('says so when the server will not give a link', async () => {
    serve([video()], () => new ApiError(404, 'NOT_FOUND', 'no'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Play How the app works' }));
    expect(await screen.findByText("This video didn't play. Tap to try again.")).toBeInTheDocument();
  });
});

describe('HelpVideosPage — ask in chat', () => {
  it('opens the member\'s chat (the list, when none is loaded yet)', async () => {
    serve([video()]);
    renderPage();
    await screen.findByText('How the app works');
    fireEvent.click(screen.getByText('Ask in chat').closest('button')!);
    expect(await screen.findByText('went:chat')).toBeInTheDocument();
  });

  it('is offered on a failed load too', async () => {
    serve(new ApiError(500, 'INTERNAL', 'boom'));
    renderPage();
    await screen.findByText('The videos did not load');
    expect(screen.getByText('Ask in chat')).toBeInTheDocument();
  });
});

describe('HelpVideosPage — the back arrow', () => {
  it('goes to Settings when the screen was opened cold', async () => {
    serve([video()]);
    renderPage();
    await screen.findByText('How the app works');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('went:settings')).toBeInTheDocument();
  });
});

describe('HelpVideosPage — the autopay row', () => {
  /** The row is a button whose first line is "Autopay" (or ऑटोपे). */
  const row = (title = 'Autopay') => screen.queryByRole('button', { name: new RegExp(`^${title}`) });

  it('shows at the very top, above the intro and the videos, for the owner', async () => {
    serve([video()], undefined, makeAutopayStatus());
    renderPage();

    const autopay = await screen.findByRole('button', { name: /^Autopay/ });
    expect(within(autopay).getByText('₹3,540 a month · next 24 Nov')).toBeInTheDocument();
    const intro = screen.getByText('Short videos in Hindi. Tap one to watch.');
    const list = await screen.findByTestId('help-videos');
    // Document order: the autopay row, then the intro, then the videos.
    expect(autopay.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(autopay.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith(AUTOPAY_PATH);
  });

  it('says what each state is, in two lines that wrap and are never cut', async () => {
    const states = [
      [{ state: 'setting_up', nextDebitOn: null }, 'Waiting for your approval'],
      [{ state: 'on' }, '₹3,540 a month · next 24 Nov'],
      [{ state: 'failing' }, 'Last payment did not go through'],
      [{ state: 'off', nextDebitOn: null }, 'Off · works till 24 Nov'],
    ] as const;
    for (const [over, words] of states) {
      serve([video()], undefined, makeAutopayStatus(over));
      const view = renderPage();
      const sub = await screen.findByText(words);
      expect(sub.className).not.toMatch(/truncate|line-clamp/);
      view.unmount();
      resetStores();
    }
  });

  it('is in Hindi when the app is', async () => {
    serve([video()], undefined, makeAutopayStatus());
    renderPage('hi');

    const autopay = await screen.findByRole('button', { name: /^ऑटोपे/ });
    expect(within(autopay).getByText(/^₹3,540 हर महीने · अगली 24 नव/)).toBeInTheDocument();
  });

  it('opens the Autopay screen', async () => {
    serve([video()], undefined, makeAutopayStatus());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /^Autopay/ }));
    expect(await screen.findByText('went:autopay')).toBeInTheDocument();
  });

  it('is not there when there is no autopay to show', async () => {
    serve([video()], undefined, makeAutopayStatus(null));
    renderPage();
    await screen.findByText('How the app works');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(AUTOPAY_PATH));
    expect(row()).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for your approval|a month/)).not.toBeInTheDocument();
  });

  it('is not there for a manager, who is not even asked about it', async () => {
    serve([video()], undefined, makeAutopayStatus());
    renderPage('en', 'dealer-staff');
    await screen.findByText('How the app works');
    expect(row()).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith(AUTOPAY_PATH);
  });

  it('is not there while it loads, and the videos do not wait on it', async () => {
    serve([video()], undefined, 'pending');
    renderPage();
    expect(await screen.findByText('How the app works')).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(AUTOPAY_PATH));
    expect(row()).not.toBeInTheDocument();
    expect(screen.getByText('Ask in chat')).toBeInTheDocument();
  });

  it('is not there when it fails, and the videos still show', async () => {
    serve([video()], undefined, new ApiError(500, 'INTERNAL', 'boom'));
    renderPage();
    expect(await screen.findByText('How the app works')).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(AUTOPAY_PATH));
    expect(row()).not.toBeInTheDocument();
    expect(screen.queryByText("We couldn't load your autopay")).not.toBeInTheDocument();
  });

  it('is there beside a failed video list too, so the owner can still reach it', async () => {
    serve(new ApiError(500, 'INTERNAL', 'boom'), undefined, makeAutopayStatus());
    renderPage();
    expect(await screen.findByText('The videos did not load')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Autopay/ })).toBeInTheDocument();
  });

  it('adds no link to the page', async () => {
    serve([video()], undefined, makeAutopayStatus());
    const { container } = renderPage();
    await screen.findByRole('button', { name: /^Autopay/ });
    await screen.findByText('How the app works');
    expect(container.querySelector('a[href]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/guide\.mdgservices|razorpay/i);
  });
});
