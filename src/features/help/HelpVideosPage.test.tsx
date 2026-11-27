import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { GuideVideoListItem, GuideVideoPlay, YourVideoRow, YourVideosView } from '@dk/shared/types';

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
const YOURS_PATH = '/v1/me/your-videos';

function yours(over: Partial<YourVideoRow> & Pick<YourVideoRow, 'id'>): YourVideoRow {
  return {
    title: { hi: over.id, en: over.id },
    summary: { hi: '', en: '' },
    durationMs: 60_000,
    service: 'dsr',
    examples: [],
    posterUrl: null,
    watched: false,
    watchedAt: null,
    ...over,
  };
}

/**
 * The server answers by address: the list, one video, or the person's own list of videos for their
 * services (an older server answers 404 unless a test says otherwise; `'pending'` never answers).
 */
function serve(
  list: GuideVideoListItem[] | Error,
  playFor: (id: string) => GuideVideoPlay | Error = () => play(),
  mine: YourVideosView | Error | 'pending' = new ApiError(404, 'NOT_FOUND', 'no'),
) {
  vi.mocked(api.get).mockImplementation(((path: string) => {
    if (path === YOURS_PATH) {
      if (mine === 'pending') return new Promise(() => undefined);
      return mine instanceof Error ? Promise.reject(mine) : Promise.resolve(mine);
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
      <Route path="/pump" element={<div>went:pump</div>} />
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
    // It says which phone is asking, so an iPhone is not shown Android-only steps.
    expect(api.get).toHaveBeenCalledWith('/v1/me/guide-videos', { platform: 'web' });
    expect(screen.getByText('1:35')).toBeInTheDocument();
    expect(screen.getByText('1:00')).toBeInTheDocument();
    expect(screen.getAllByText('Chat, reports and settings')).toHaveLength(2);
  });

  // Some videos walk through screens that exist only on Android. The server
  // drops those for an iPhone, but only if the request says which phone it is.
  it.each(['ios', 'android'] as const)('says it is %s when the shell does', async (platform) => {
    (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__ = platform;
    try {
      serve([video()]);
      renderPage();
      expect(await screen.findByText('How the app works')).toBeInTheDocument();
      expect(api.get).toHaveBeenCalledWith('/v1/me/guide-videos', { platform });
    } finally {
      delete (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__;
    }
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
  // The arrow goes to My pump now (the address's parent, spec 2.5), where Settings used to be.
  it('goes to My pump when the screen was opened cold', async () => {
    serve([video()]);
    renderPage();
    await screen.findByText('How the app works');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('went:pump')).toBeInTheDocument();
  });
});

// Autopay is not on the Help page any more: it lives on Bill and plan (spec 4.5). A billing row on a page
// about videos was the least findable place in the app, and the page must not ask about money at all.
describe('HelpVideosPage — autopay is gone from here', () => {
  it('has no autopay row, asks nothing about autopay, and shows no money', async () => {
    serve([video()]);
    const { container } = renderPage();
    await screen.findByText('How the app works');
    expect(screen.queryByRole('button', { name: /^Autopay/ })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith(AUTOPAY_PATH);
    expect(container.textContent ?? '').not.toMatch(/₹|autopay/i);
  });

  it('is the same for a manager', async () => {
    serve([video()]);
    renderPage('en', 'dealer-staff');
    await screen.findByText('How the app works');
    expect(api.get).not.toHaveBeenCalledWith(AUTOPAY_PATH);
  });

  it('adds no link to the page', async () => {
    serve([video()]);
    const { container } = renderPage();
    await screen.findByText('How the app works');
    expect(container.querySelector('a[href]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/guide\.mdgservices|razorpay/i);
  });
});

describe('HelpVideosPage — grouped by the services he has (spec 4.5)', () => {
  const dsr = video({ id: 'svc_dsr', title: { hi: 'बिक्री रिपोर्ट', en: 'Daily sales report' }, service: 'dsr' });
  const water = video({ id: 'svc_water_ingress', title: { hi: 'पानी की जाँच', en: 'Water checks' }, service: 'water-ingress' });
  const tour = video({ id: 'app_tour' });
  const view = (over: Partial<YourVideosView> = {}): YourVideosView => ({
    mine: [yours({ id: 'svc_dsr', service: 'dsr' })],
    more: [yours({ id: 'svc_water_ingress', service: 'water-ingress' })],
    ...over,
  });
  const section = (name: string) => within(screen.getByRole('region', { name }));

  it('puts the videos for his own services first, then how the app works, then the other services', async () => {
    serve([tour, water, dsr], undefined, view());
    renderPage();
    await screen.findByText('Daily sales report');
    const names = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby')).filter(Boolean);
    expect(names.length).toBe(3);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['For the services you have', 'How the app works', 'Other services']);
    expect(section('For the services you have').getByText('Daily sales report')).toBeInTheDocument();
    expect(section('Other services').getByText('Water checks')).toBeInTheDocument();
  });

  it('asks the server which videos are his and which he has watched', async () => {
    serve([dsr], undefined, view());
    renderPage();
    await screen.findByText('Daily sales report');
    expect(api.get).toHaveBeenCalledWith(YOURS_PATH, { platform: 'web' });
  });

  it('shows "6 of 13 watched" with a bar, and a button for the next one not watched', async () => {
    serve(
      [dsr, water],
      undefined,
      view({
        mine: [yours({ id: 'svc_dsr', service: 'dsr', watched: true, watchedAt: '2026-11-20T10:00:00.000Z' })],
        more: [yours({ id: 'svc_water_ingress', service: 'water-ingress' })],
      }),
    );
    renderPage();
    expect(await screen.findByText('1 of 2 watched')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2');
    // The next one is the first of his videos he has not watched.
    fireEvent.click(screen.getByRole('button', { name: 'Next: Water checks' }));
    expect(await screen.findByRole('dialog', { name: 'Water checks' })).toBeInTheDocument();
  });

  it('says he has watched them all, instead of offering a next one', async () => {
    serve(
      [dsr],
      undefined,
      view({ mine: [yours({ id: 'svc_dsr', watched: true, watchedAt: '2026-11-20T10:00:00.000Z' })], more: [] }),
    );
    renderPage();
    expect(await screen.findByText('1 of 1 watched')).toBeInTheDocument();
    expect(screen.getByText('You have watched them all')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Next:/ })).not.toBeInTheDocument();
  });

  it('marks a watched video with a tick shape AND the word "Watched"', async () => {
    serve(
      [dsr, water],
      undefined,
      view({ mine: [yours({ id: 'svc_dsr', watched: true, watchedAt: '2026-11-20T10:00:00.000Z' })] }),
    );
    renderPage();
    const row = await screen.findByRole('button', { name: 'Watch Daily sales report again — already watched' });
    expect(within(row).getByText('Watched')).toBeInTheDocument();
    expect(row.querySelector('[data-status="ok"] svg')).not.toBeNull();
    // The one not watched has no such mark.
    expect(within(screen.getByRole('button', { name: 'Play Water checks' })).queryByText('Watched')).toBeNull();
  });

  it('does not count a general video, which has no tick, in "N of M watched"', async () => {
    serve([tour, dsr], undefined, view({ more: [] }));
    renderPage();
    expect(await screen.findByText('0 of 1 watched')).toBeInTheDocument();
  });

  // Without his own list nothing can be said about services or ticks, so nothing is guessed.
  it('without his own list, shows every video in one plain group, with no counts and no ticks', async () => {
    serve([tour, dsr]);
    renderPage();
    await screen.findByText('Daily sales report');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['All videos']);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('Watched')).not.toBeInTheDocument();
  });

  it('does not wait for his own list: the videos show while it is still on the way', async () => {
    serve([tour], undefined, 'pending');
    renderPage();
    expect(await screen.findByText('How the app works')).toBeInTheDocument();
  });

  it('draws the same page when his list is not the shape it expects', async () => {
    serve([tour], undefined, { nonsense: true } as never);
    renderPage();
    expect(await screen.findByText('How the app works')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('keeps long names and summaries whole: nothing is cut off', async () => {
    const long = video({
      id: 'svc_stock_check',
      title: { hi: 'x', en: 'A very long title that a narrow phone has to wrap onto several lines without cutting any of it' },
      summary: { hi: 'x', en: 'A long sentence about what this video shows, which must wrap and never be clamped to two lines' },
    });
    serve([long]);
    const { container } = renderPage();
    expect(await screen.findByText(/A very long title/)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/\btruncate\b|line-clamp|text-\[|min-h-\[|h-\[\d+px\]/);
  });
});

describe('HelpVideosPage — "Replay what is new" (spec 4.5)', () => {
  const whatsNew = video({ id: 'whats_new_today', title: { hi: 'ऐप में नया क्या है', en: 'What is new in the app' } });

  it('is a row at the top that plays the one-time video in the same player', async () => {
    serve([video(), whatsNew]);
    renderPage();
    const row = await screen.findByText('Replay what is new');
    fireEvent.click(row.closest('button')!);
    expect(await screen.findByRole('dialog', { name: 'What is new in the app' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/v1/me/guide-videos/whats_new_today', { start: undefined });
  });

  it('is not repeated in the list below it', async () => {
    serve([video(), whatsNew]);
    renderPage();
    await screen.findByText('Replay what is new');
    expect(screen.queryAllByText('What is new in the app')).toHaveLength(0);
  });

  it('is not there when the server did not give this person that video', async () => {
    serve([video()]);
    renderPage();
    await screen.findByText('How the app works');
    expect(screen.queryByText('Replay what is new')).not.toBeInTheDocument();
  });
});
