import { fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SubPage, SubPageBar } from '@/components/SubPage';
import type * as ApiModule from '@/lib/api';
import { api } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { OutletsView } from '@dk/shared/types';

import { AskMdgButton, HelpChip, lastVisitKey, MyPumpButton, NoticesRow, PageHeader, useLastVisit } from './index';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});
// The player is its own screen; here it is a marker that says which video was asked for.
vi.mock('@/features/help/GuideVideoSheet', () => ({
  GuideVideoSheet: ({ id, title, onClose }: { id: string; title: string; onClose: () => void }) => (
    <div role="dialog" aria-label={title} data-video={id}>
      <button type="button" onClick={onClose}>
        close-player
      </button>
    </div>
  ),
}));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function expectTappable(el: HTMLElement) {
  expect(el.className).toMatch(/\bmin-h-(11|12|14)\b|\bh-11\b/);
}

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.mocked(api.get).mockReset();
});
afterEach(() => {
  resetStores();
  window.history.replaceState(null, '');
});

function answer(map: Record<string, unknown>) {
  vi.mocked(api.get).mockImplementation(((path: string) =>
    path in map ? Promise.resolve(map[path]) : Promise.reject(new Error(`unexpected ${path}`))) as never);
}

describe('PageHeader', () => {
  it('draws a door\'s bar with the title as its heading and "My pump" at the right', () => {
    signIn({ id: 'u1' });
    renderWithProviders(<PageHeader variant="tab" title="Services" subtitle={<span>as of 9:40 am</span>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Services' })).toBeInTheDocument();
    expect(screen.getByText('as of 9:40 am')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My pump' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('leaves "My pump" off when asked', () => {
    signIn({ id: 'u1' });
    renderWithProviders(<PageHeader variant="tab" title="Chat" hidePump />);
    expect(screen.queryByRole('button', { name: 'My pump' })).not.toBeInTheDocument();
  });

  it('draws a sub-page\'s bar with a 44px back arrow named for where it goes', () => {
    signIn({ id: 'u1' });
    renderWithProviders(<PageHeader variant="sub" title="Papers" back={{ label: 'My pump' }} />);
    const back = screen.getByRole('button', { name: 'Back to My pump' });
    expect(back.className).toContain('h-11');
    expect(back.className).toContain('w-11');
    expect(screen.queryByRole('button', { name: 'My pump' })).not.toBeInTheDocument();
  });

  it('says plain "Back" when it is not told where the arrow goes', () => {
    renderWithProviders(<PageHeader variant="sub" title="X" />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('wraps a long title and never truncates it', () => {
    const { container } = renderWithProviders(<PageHeader variant="sub" title="योद्धा और पॉइंट: एक बहुत लंबा नाम" />);
    const h1 = container.querySelector('h1')!;
    expect(h1.className).toContain('break-words');
    expect(container.innerHTML).not.toMatch(/truncate|line-clamp/);
  });

  it('goes to the named place when the page was opened cold', async () => {
    window.history.replaceState({ idx: 0, key: 'k' }, '');
    renderWithProviders(
      <>
        <Where />
        <Routes>
          <Route path="/services" element={<div>services-door</div>} />
          <Route path="/services/:id" element={<PageHeader variant="sub" title="DSR" back={{ to: '/services' }} />} />
        </Routes>
      </>,
      { route: '/services/dsr_sales', withRouter: true },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('services-door')).toBeInTheDocument();
  });

  it('goes to the address\'s own parent when no place is named', async () => {
    window.history.replaceState({ idx: 0, key: 'k' }, '');
    renderWithProviders(
      <Routes>
        <Route path="/pump" element={<div>my-pump</div>} />
        <Route path="/pump/papers" element={<PageHeader variant="sub" title="Papers" />} />
      </Routes>,
      { route: '/pump/papers', withRouter: true },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('my-pump')).toBeInTheDocument();
  });

  it('puts one action on the right of a sub-page', () => {
    renderWithProviders(<PageHeader variant="sub" title="T" right={<button type="button">Add</button>} />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('SubPage (built on the header)', () => {
  it('keeps its old props: a title, a back arrow, a column', () => {
    renderWithProviders(
      <SubPage title="Warriors" className="gap-3">
        <p>body</p>
      </SubPage>,
    );
    expect(screen.getByRole('heading', { name: 'Warriors' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByText('body').parentElement!.className).toContain('p-4');
  });

  it('is headed by the bar even with no children, so a failed page keeps its way out', () => {
    renderWithProviders(<SubPageBar title="Failed page" />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('draws a menu as one 44px button when it is given items', () => {
    renderWithProviders(<SubPageBar title="T" menu={[{ key: 'a', label: 'Do it', onSelect: () => undefined }]} />);
    const more = screen.getByRole('button', { name: 'More options' });
    expect(more.className).toContain('h-11');
  });

  it('falls back to its explicit fallback when one is given', async () => {
    window.history.replaceState({ idx: 0, key: 'k' }, '');
    renderWithProviders(
      <Routes>
        <Route path="/chat" element={<div>chat-list</div>} />
        <Route path="/staff" element={<SubPageBar title="Staff" fallback="/chat" />} />
      </Routes>,
      { route: '/staff', withRouter: true },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('chat-list')).toBeInTheDocument();
  });

  it('falls back to My pump when the page names none', async () => {
    window.history.replaceState({ idx: 0, key: 'k' }, '');
    renderWithProviders(
      <Routes>
        <Route path="/pump" element={<div>my-pump</div>} />
        <Route path="/staff" element={<SubPageBar title="Staff" />} />
      </Routes>,
      { route: '/staff', withRouter: true },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('my-pump')).toBeInTheDocument();
  });
});

describe('MyPumpButton', () => {
  it('says "My pump" in words, never a bare icon, and is 44px', () => {
    signIn({ id: 'u1' });
    const { container } = renderWithProviders(<MyPumpButton />);
    const button = screen.getByRole('button', { name: 'My pump' });
    expectTappable(button);
    expect(button).toHaveTextContent('My pump');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('makes no request for someone with one pump', () => {
    signIn({ id: 'u1' });
    renderWithProviders(<MyPumpButton />);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('says the pump they are in when they have more than one', async () => {
    signIn({ id: 'u15', personId: 'p1' });
    const view: OutletsView = {
      current: { userId: 'u15', dealerId: 'd15', code: '15E', role: 'dealer-owner' },
      outlets: [{ userId: 'u16', dealerId: 'd16', code: '16E', role: 'dealer-owner' }],
    };
    answer({ '/v1/auth/outlets': view });
    renderWithProviders(<MyPumpButton />);
    expect(await screen.findByRole('button', { name: 'My pump, 15E' })).toHaveTextContent('15E');
  });

  it('opens /pump', () => {
    signIn({ id: 'u1' });
    renderWithProviders(
      <>
        <Where />
        <MyPumpButton />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'My pump' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/pump');
  });

  it('says it in Hindi and Hinglish', () => {
    signIn({ id: 'u1' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    const hi = renderWithProviders(<MyPumpButton />);
    expect(screen.getByRole('button', { name: 'मेरा पंप' })).toBeInTheDocument();
    hi.unmount();
    useLangStore.setState({ lang: 'hl', explicit: true });
    renderWithProviders(<MyPumpButton />);
    expect(screen.getByRole('button', { name: 'Mera pump' })).toBeInTheDocument();
  });
});

describe('NoticesRow', () => {
  it('draws nothing when there is nothing to say', () => {
    renderWithProviders(<NoticesRow notices={[]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a single notice\'s own words on the line, which opens a sheet', () => {
    renderWithProviders(<NoticesRow notices={[{ id: 'bill', text: 'Bill due in 5 days' }]} />);
    const line = screen.getByRole('button', { name: 'Bill due in 5 days' });
    expectTappable(line);
    fireEvent.click(line);
    const sheet = screen.getByRole('dialog', { name: 'Notices' });
    expect(within(sheet).getByText('Bill due in 5 days')).toBeInTheDocument();
  });

  it('folds several into a count', () => {
    renderWithProviders(
      <NoticesRow
        notices={[
          { id: 'a', text: 'Bill due in 5 days' },
          { id: 'b', text: 'Notifications are off' },
          { id: 'c', text: 'Battery saver may stop messages' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: '3 notices' })).toBeInTheDocument();
  });

  it('says the count in Hindi and Hinglish, one and many apart', () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    const two = [
      { id: 'a', text: 'x' },
      { id: 'b', text: 'y' },
    ];
    const hi = renderWithProviders(<NoticesRow notices={two} />);
    expect(screen.getByRole('button', { name: '2 सूचनाएँ' })).toBeInTheDocument();
    hi.unmount();
    useLangStore.setState({ lang: 'hl', explicit: true });
    renderWithProviders(<NoticesRow notices={two} />);
    expect(screen.getByRole('button', { name: '2 soochnayein' })).toBeInTheDocument();
  });

  it('runs a notice\'s action, with a 44px button, and closes the sheet', () => {
    const onPress = vi.fn();
    renderWithProviders(
      <NoticesRow
        notices={[
          { id: 'a', text: 'Notifications are off', action: { label: 'Turn on', onPress } },
          { id: 'b', text: 'Plain notice' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '2 notices' }));
    const action = screen.getByRole('button', { name: 'Turn on' });
    expectTappable(action);
    fireEvent.click(action);
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('gives a notice with no action no button: the bill line in the phone shell is plain text', () => {
    renderWithProviders(
      <NoticesRow
        notices={[
          { id: 'bill', text: 'Bill due in 5 days' },
          { id: 'b', text: 'Another' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '2 notices' }));
    const sheet = screen.getByRole('dialog', { name: 'Notices' });
    const buttons = within(sheet).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    // Only "Close": there is nothing to tap on a notice itself.
    expect(buttons).toEqual(['Close']);
  });

  it('closes with its Close button', () => {
    renderWithProviders(<NoticesRow notices={[{ id: 'a', text: 'One' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('AskMdgButton', () => {
  it('opens the dealer\'s own chat with the question typed in and NOT sent', () => {
    signIn({ id: 'owner' });
    const { queryClient } = renderWithProviders(<div />);
    queryClient.setQueryData(['conversations', 'mine'], [{ id: 'c9', userId: 'owner' }]);
    function Probe() {
      const loc = useLocation();
      return (
        <p data-testid="probe">{`${loc.pathname}|${(loc.state as { draftText?: string } | null)?.draftText ?? ''}`}</p>
      );
    }
    renderWithProviders(
      <>
        <Probe />
        <AskMdgButton draft="Why is diesel stock low?" />
      </>,
      { queryClient },
    );
    const button = screen.getByRole('button', { name: 'Ask MDG' });
    expectTappable(button);
    fireEvent.click(button);
    expect(screen.getByTestId('probe')).toHaveTextContent('/chat/c9|Why is diesel stock low?');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('falls back to the chat list when no chat is loaded yet', () => {
    signIn({ id: 'owner' });
    renderWithProviders(
      <>
        <Where />
        <AskMdgButton draft="x" />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask MDG' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/chat');
  });

  it('says "MDG से पूछें" in Hindi', () => {
    signIn({ id: 'owner' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(<AskMdgButton draft="x" />);
    expect(screen.getByRole('button', { name: 'MDG से पूछें' })).toBeInTheDocument();
  });
});

describe('HelpChip', () => {
  const list = [
    {
      id: 'dsr_how',
      title: { hi: 'बिक्री रिपोर्ट', en: 'Daily sales report' },
      summary: { hi: 's', en: 's' },
      durationMs: 60000,
      service: 'dsr',
      available: true,
    },
    {
      id: 'not_uploaded',
      title: { hi: 'x', en: 'Not yet' },
      summary: { hi: 's', en: 's' },
      durationMs: 1000,
      service: null,
      available: false,
    },
  ];

  it('is hidden with no video id, and asks the server for nothing', () => {
    signIn({ id: 'u1' });
    renderWithProviders(<HelpChip />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('is hidden while the list has not arrived, and when the video is not in it', async () => {
    signIn({ id: 'u1' });
    answer({ '/v1/me/guide-videos': list });
    renderWithProviders(<HelpChip videoId="missing" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is hidden for a video that is not uploaded yet', async () => {
    signIn({ id: 'u1' });
    answer({ '/v1/me/guide-videos': list });
    renderWithProviders(<HelpChip videoId="not_uploaded" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is a 44px chip once the video is in the list, and opens that video\'s player', async () => {
    signIn({ id: 'u1' });
    answer({ '/v1/me/guide-videos': list });
    renderWithProviders(<HelpChip videoId="dsr_how" />);
    const chip = await screen.findByRole('button', { name: 'Watch a short video' });
    expectTappable(chip);
    fireEvent.click(chip);
    const player = screen.getByRole('dialog', { name: 'Daily sales report' });
    expect(player).toHaveAttribute('data-video', 'dsr_how');
    fireEvent.click(screen.getByRole('button', { name: 'close-player' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the video in Hindi for a Hindi reader', async () => {
    signIn({ id: 'u1' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    answer({ '/v1/me/guide-videos': list });
    renderWithProviders(<HelpChip videoId="dsr_how" />);
    fireEvent.click(await screen.findByRole('button', { name: 'छोटा वीडियो देखें' }));
    expect(screen.getByRole('dialog', { name: 'बिक्री रिपोर्ट' })).toBeInTheDocument();
  });
});

describe('useLastVisit', () => {
  it('has no "since" the first time, and keeps the stored one for the whole visit', () => {
    const first = renderHook(() => useLastVisit('u1', '15E'));
    expect(first.result.current.since).toBeNull();
    first.result.current.markSeen();
    // The same visit still says "never": `since` is what was there when the screen opened.
    expect(first.result.current.since).toBeNull();
    first.unmount();

    const second = renderHook(() => useLastVisit('u1', '15E'));
    expect(second.result.current.since).not.toBeNull();
    expect(Number.isNaN(new Date(second.result.current.since!).getTime())).toBe(false);
  });

  it('keeps one entry per person and pump', () => {
    renderHook(() => useLastVisit('u1', '15E')).result.current.markSeen();
    expect(window.localStorage.getItem(lastVisitKey('u1', '15E'))).not.toBeNull();
    expect(renderHook(() => useLastVisit('u1', '16E')).result.current.since).toBeNull();
    expect(renderHook(() => useLastVisit('u2', '15E')).result.current.since).toBeNull();
  });

  it('does nothing without a person or a pump', () => {
    const { result } = renderHook(() => useLastVisit(undefined, '15E'));
    expect(result.current.since).toBeNull();
    result.current.markSeen();
    expect(Object.keys(window.localStorage).filter((k) => k.includes('lastVisit'))).toEqual([]);
  });

  it('works with the browser\'s storage refusing everything', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useLastVisit('u1', '15E'));
    expect(result.current.since).toBeNull();
    expect(() => result.current.markSeen()).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});
