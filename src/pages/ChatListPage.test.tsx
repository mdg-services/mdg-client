import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseOutletsModule from '@/features/outlets/useOutlets';
import { useLangStore } from '@/store/lang';
import { usePushStore } from '@/store/push';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation } from '@dk/shared/types';

/** The slice of the query result ChatListPage reads. */
interface QueryStub {
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  isError: boolean;
  isFetching: boolean;
  data: Conversation[] | undefined;
  refetch: () => void;
}

function loaded(data: Conversation[]): QueryStub {
  return {
    status: 'success',
    fetchStatus: 'idle',
    isError: false,
    isFetching: false,
    data,
    refetch: h.refetch,
  };
}

const h = vi.hoisted(() => ({
  result: undefined as unknown as QueryStub,
  refetch: vi.fn(),
  /** What the Today feed holds (`undefined`: it has not answered). */
  feed: undefined as unknown,
  /** Whether the reader's text is at 140% or more (`useLargeText`). */
  large: false,
  /** What `useOutlets` holds: a person with one pump has nothing; with several, the pump they are in. */
  outlets: undefined as unknown,
}));
vi.mock('@/features/outlets/useOutlets', async (importOriginal) => ({
  ...(await importOriginal<typeof UseOutletsModule>()),
  useOutlets: () => ({ data: h.outlets }),
}));
vi.mock('@/lib/useLargeText', () => ({ useLargeText: () => h.large }));
vi.mock('@/hooks/api/useMyConversations', () => ({
  myConversationsKey: ['conversations', 'mine'],
  useMyConversations: () => h.result,
}));
// The rows read the Today feed for "waits for you" (the tab bar's badge reads it too).
vi.mock('@/hooks/api/useTodayFeed', () => ({ useTodayFeed: () => ({ data: h.feed }) }));

const { ChatListPage } = await import('./ChatListPage');
const { TabBar } = await import('@/features/tabs/TabBar');

/** A Wednesday afternoon (local time), so "today", "yesterday" and a weekday are all reachable. */
const NOW = new Date(2026, 9, 14, 15, 30);
const at = (day: number, hour = 9, minute = 5) =>
  new Date(2026, 9, day, hour, minute).toISOString();

function conv(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    dealerId: 'd1',
    userId: 'owner',
    kind: 'support',
    participantUserIds: ['owner'],
    status: 'OPEN',
    unreadByAdmin: false,
    unreadByDealer: false,
    unreadDealerUserIds: [],
    lastMessageAt: at(14),
    lastMessagePreview: 'hi',
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Conversation;
}

const support = (over: Partial<Conversation> = {}) =>
  conv({ id: 'support', kind: 'support', ...over });
const group = (over: Partial<Conversation> = {}) =>
  conv({ id: 'mgr', kind: 'manager', userId: 'manager', ...over });

function renderList(route = '/chat') {
  signIn({ id: 'owner' });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<ChatListPage />} />
      <Route path="/chat" element={<ChatListPage />} />
      <Route path="/chat/:id" element={<div>thread-page</div>} />
      <Route path="/settings" element={<div>settings-page</div>} />
    </Routes>,
    { route, withRouter: true },
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
  resetStores();
  h.refetch.mockReset();
  h.feed = undefined;
  h.large = false;
  h.outlets = undefined;
});

describe('ChatListPage — the Chats door', () => {
  it('is headed "Chats" (not the app name), with Search and the labelled My pump button', () => {
    h.result = loaded([support()]);
    renderList();
    expect(screen.getByRole('heading', { name: 'Chats' })).toBeInTheDocument();
    expect(screen.queryByText('Dealer Kavach')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    // My pump replaces the one-item three-dot menu: a door with a word, never a bare icon.
    expect(screen.getByRole('button', { name: /My pump/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
    // No back arrow: it is a root screen, one of the doors.
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('tells a person with several pumps which pump they are in, on the bar itself', () => {
    // The pump chip that used to sit on the list moved into My pump: the code of the pump now rides on
    // that button, so a multi-pump owner reading the chats still knows whose chats they are.
    h.outlets = {
      current: { userId: 'u15', dealerId: 'd15', code: '15E', role: 'dealer-owner' },
      outlets: [{ userId: 'u9', dealerId: 'd9', code: '9E', role: 'dealer-owner' }],
    };
    h.result = loaded([support()]);
    renderList();
    const button = screen.getByRole('button', { name: 'My pump, 15E' });
    expect(within(button).getByText('15E')).toBeInTheDocument();
    // In the same bar as the title, never a bare code and never only a colour.
    expect(button.closest('header')).toContainElement(screen.getByRole('heading', { name: 'Chats' }));
  });

  it('shows no pump code to a person with one pump', () => {
    h.result = loaded([support()]);
    renderList();
    expect(screen.getByRole('button', { name: 'My pump' })).toBeInTheDocument();
    expect(screen.queryByText('15E')).not.toBeInTheDocument();
  });

  it('reaches My pump from the button on the bar', async () => {
    h.result = loaded([support()]);
    signIn({ id: 'owner' });
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/chat" element={<ChatListPage />} />
        <Route path="/pump" element={<div>pump-page</div>} />
      </Routes>,
      { route: '/chat', withRouter: true },
    );
    fireEvent.click(screen.getByRole('button', { name: /My pump/ }));
    expect(await screen.findByText('pump-page')).toBeInTheDocument();
  });

  /**
   * It used to skip the list for a member with exactly one thread. The list carries the search, and
   * a screen that skipped it would have nowhere to hang it.
   */
  it('shows the list even when there is exactly one chat — no auto-forward', () => {
    h.result = loaded([support({ lastMessagePreview: 'Your report is ready' })]);
    renderList();
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Your report is ready')).toBeInTheDocument();
    expect(screen.queryByText('thread-page')).not.toBeInTheDocument();
  });

  it('opens a thread on tap', async () => {
    h.result = loaded([support(), group()]);
    renderList();
    fireEvent.click(screen.getByText('Manager chat'));
    expect(await screen.findByText('thread-page')).toBeInTheDocument();
  });

  it('says there are no chats, calmly, when there are none', () => {
    h.result = loaded([]);
    renderList();
    expect(screen.getByText(/No chats yet/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The bar is still there: My pump (and with it Log out) stays reachable.
    expect(screen.getByRole('button', { name: /My pump/ })).toBeInTheDocument();
  });

  it('shortens a long written reply in WORDS, not with a CSS clip', () => {
    // From v2 the first line composes its own prose: up to 280 letters of Hindi. A row may not clip
    // its words (no `truncate`, no `line-clamp`: at 200% text they cut a sentence to a few letters),
    // so the text is cut at a word and given an ellipsis, and the rest wraps.
    const long =
      'कल की रिपोर्ट बन गई है और MDG उसे देख रहा है। आपकी तरफ़ से अभी डेंसिटी रजिस्टर का ' +
      'कल वाला पन्ना बाकी है, वो भेज दीजिए तो बाकी काम आगे बढ़ जाएगा।';
    h.result = loaded([support({ lastMessagePreview: long }), group()]);
    const { container } = renderList();
    expect(screen.queryByText(long)).not.toBeInTheDocument();
    const shown = screen.getByText(/^कल की रिपोर्ट बन गई है/);
    expect(shown.textContent!.endsWith('…')).toBe(true);
    expect(shown.textContent!.length).toBeLessThan(long.length);
    expect(container.innerHTML).not.toMatch(/truncate|line-clamp/);
    // The full words are still what the search reads.
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'आगे बढ़ जाएगा' } });
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('draws no fixed pixel height, and a row at least 56px tall that can grow', () => {
    h.result = loaded([support(), group()]);
    const { container } = renderList();
    expect(container.innerHTML).not.toContain('h-[72px]');
    expect(container.innerHTML).not.toMatch(/\bh-\[\d+px\]/);
    const row = screen.getByText('Support').closest('button')!;
    expect(row.className).toContain('min-h-14');
    // The name wraps: it is never cut off.
    expect(screen.getByText('Support').className).toContain('break-words');
  });

  /**
   * The reported bug: the fetch failed and the dealer was told "No chats yet". Their chats were all
   * still on the server: the page turned a transport failure into a confident, wrong, dead-end empty
   * state.
   */
  it('shows a retry — NOT "No chats yet" — when the fetch fails', async () => {
    h.result = {
      status: 'error',
      fetchStatus: 'idle',
      isError: true,
      isFetching: false,
      data: undefined,
      refetch: h.refetch,
    };
    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent(/We could not load your chats/);
    expect(screen.queryByText(/No chats yet/)).not.toBeInTheDocument();
    // A failed list must not strand the dealer: the bar's My pump button is still there.
    expect(screen.getByRole('button', { name: /My pump/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the chats on screen when a background refresh fails', () => {
    // Back from a thread on a flaky link: the list refetches, the refetch fails, and the chats
    // already on the phone must stay, not hide behind "Try again".
    h.result = {
      ...loaded([conv({ lastMessagePreview: 'still here' })]),
      status: 'error',
      isError: true,
    };
    renderList();
    expect(screen.getByText('still here')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * Offline: react-query PAUSES the query: status stays 'pending' while fetchStatus is 'paused', so
   * `isLoading` is false. Without this branch the page would fall straight through to the empty state.
   */
  it('shows the retry when the query is paused (offline)', async () => {
    h.result = {
      status: 'pending',
      fetchStatus: 'paused',
      isError: false,
      isFetching: false,
      data: undefined,
      refetch: h.refetch,
    };
    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent(/We could not load your chats/);
    expect(screen.queryByText(/No chats yet/)).not.toBeInTheDocument();
  });

  it('shows a loading block, not the empty state, while the first load is in flight', () => {
    h.result = {
      status: 'pending',
      fetchStatus: 'fetching',
      isError: false,
      isFetching: true,
      data: undefined,
      refetch: h.refetch,
    };
    renderList();
    expect(screen.queryByText(/No chats yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chats' })).toBeInTheDocument();
  });

  it('speaks Hindi on the Hindi screen', () => {
    h.result = loaded([support()]);
    signIn({ id: 'owner' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/chat" element={<ChatListPage />} />
      </Routes>,
      { route: '/chat', withRouter: true },
    );
    expect(screen.getByRole('heading', { name: 'चैट' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /मेरा पंप/ })).toBeInTheDocument();
  });
});

describe('ChatListPage — the strips have left this screen', () => {
  let postMessage: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    postMessage = vi.fn();
    (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
  });
  afterEach(() => {
    delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
    usePushStore.setState({ pushState: 'unknown', canAskAgain: false });
  });

  // The bill, notification, battery and setup strips live in Today's notices row (spec 4.6).
  it('draws no notifications banner even when the phone said no', () => {
    h.result = loaded([support()]);
    usePushStore.setState({ pushState: 'off', canAskAgain: true });
    renderList();
    expect(screen.queryByText('Notifications are off')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Notifications are off' })).not.toBeInTheDocument();
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe('ChatListPage — a row at large text (200%)', () => {
  const task = (id: string, conversationId: string) => ({
    id,
    kind: 'dsr_photo',
    title: 'Send the register photo',
    since: at(14),
    conversationId,
    messageId: `m-${id}`,
  });

  it('is one column: no picture, no arrow, the time under the name, so the words get the whole width', () => {
    h.large = true;
    h.result = loaded([support({ lastMessageAt: at(14, 9, 5), unreadCount: 2 })]);
    h.feed = { tasks: [task('a', 'support'), task('b', 'support')], reports: [], done: [] };
    renderList();
    const row = screen.getByText('Support').closest('button')!;
    expect(row.className).toContain('flex-col');
    expect(row.querySelector('.h-12.w-12')).toBeNull();
    expect(row.querySelector('svg.lucide-chevron-right')).toBeNull();
    // The name and the time are stacked, not side by side.
    const head = screen.getByText('Support').parentElement!;
    expect(head.className).toContain('flex-col');
    expect(head.className).not.toContain('justify-between');
    expect(within(row).getByText('9:05 am')).toBeInTheDocument();
    // The chip takes the full width and wraps its words; the name never breaks inside a word.
    const chip = within(row).getByText('2 things wait for you').closest('[data-status]')!;
    expect(chip.className).toContain('w-full');
    expect(chip.className).toContain('whitespace-normal');
    expect(screen.getByText('Support').className).toContain('hyphens-none');
    expect(row.className).not.toMatch(/\b[hw]-\[/);
  });

  it('keeps the picture and the arrow at normal text', () => {
    h.result = loaded([support()]);
    renderList();
    const row = screen.getByText('Support').closest('button')!;
    expect(row.className).not.toContain('flex-col');
    expect(row.querySelector('.h-12.w-12')).not.toBeNull();
    expect(row.querySelector('svg.lucide-chevron-right')).not.toBeNull();
  });

  it('puts the title on its own line and the Search and My pump buttons under it', () => {
    h.large = true;
    h.result = loaded([support()]);
    renderList();
    const heading = screen.getByRole('heading', { name: 'Chats' });
    const search = screen.getByRole('button', { name: 'Search' });
    const pump = screen.getByRole('button', { name: /My pump/ });
    expect(heading.parentElement!.contains(search)).toBe(false);
    expect(heading.parentElement!.contains(pump)).toBe(false);
  });
});

describe('ChatListPage — a row', () => {
  it('says the time the Hindi way ("सुबह 9:05") on the Hindi screen, not "9:05 am"', () => {
    h.result = loaded([support({ lastMessageAt: '2026-10-14T03:35:00.000Z' })]);
    signIn({ id: 'owner' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/chat" element={<ChatListPage />} />
      </Routes>,
      { route: '/chat', withRouter: true },
    );
    expect(screen.getByText('सुबह 9:05')).toBeInTheDocument();
    expect(screen.queryByText(/\bam\b|\bpm\b/)).toBeNull();
  });

  it('shows today as the clock time', () => {
    h.result = loaded([support({ lastMessageAt: at(14, 9, 5) })]);
    renderList();
    expect(screen.getByText('9:05 am')).toBeInTheDocument();
  });

  it('shows yesterday as a word, the last week as a weekday, older as day/month/year', () => {
    h.result = loaded([
      support({ lastMessageAt: at(13) }),
      group({ lastMessageAt: at(12) }),
      conv({ id: 'old', kind: 'support', lastMessageAt: at(1) }),
    ]);
    renderList();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('01/10/26')).toBeInTheDocument();
  });

  it('falls back to who is in the group, then to "No messages yet", when there is no preview', () => {
    h.result = loaded([
      group({
        lastMessagePreview: '',
        participants: [
          { userId: 'manager', name: 'Pump Manager' },
          { userId: 'owner', name: 'Ramesh' },
        ],
      }),
      support({ lastMessagePreview: '' }),
    ]);
    renderList();
    expect(screen.getByText('Pump Manager')).toBeInTheDocument();
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  describe('what waits for the dealer in this chat', () => {
    const task = (id: string, conversationId: string) => ({
      id,
      kind: 'dsr_photo',
      title: 'Send the register photo',
      since: at(14),
      conversationId,
      messageId: `m-${id}`,
    });

    it('says "2 things wait for you" on the chat the tasks belong to, and nothing on the others', () => {
      h.result = loaded([support(), group()]);
      h.feed = { tasks: [task('a', 'support'), task('b', 'support')], reports: [], done: [] };
      renderList();
      const supportRow = screen.getByText('Support').closest('button')!;
      expect(within(supportRow).getByText('2 things wait for you')).toBeInTheDocument();
      const groupRow = screen.getByText('Manager chat').closest('button')!;
      expect(within(groupRow).queryByText(/wait for you|waits for you/)).not.toBeInTheDocument();
    });

    it('says "1 thing waits for you" for one, and "आपके लिए 2 काम हैं" in Hindi', () => {
      h.result = loaded([support()]);
      h.feed = { tasks: [task('a', 'support')], reports: [], done: [] };
      const first = renderList();
      expect(screen.getByText('1 thing waits for you')).toBeInTheDocument();
      first.unmount();

      h.feed = { tasks: [task('a', 'support'), task('b', 'support')], reports: [], done: [] };
      signIn({ id: 'owner' });
      useLangStore.setState({ lang: 'hi', explicit: true });
      renderWithProviders(
        <Routes>
          <Route path="/chat" element={<ChatListPage />} />
        </Routes>,
        { route: '/chat', withRouter: true },
      );
      expect(screen.getByText('आपके लिए 2 काम हैं')).toBeInTheDocument();
    });

    it('says nothing about tasks when the feed has not answered', () => {
      h.result = loaded([support()]);
      h.feed = undefined;
      renderList();
      expect(screen.queryByText(/wait for you|waits for you/)).not.toBeInTheDocument();
    });
  });

  describe("where the dealer's question to MDG stands", () => {
    const ticket = (over: Record<string, unknown> = {}) => ({
      id: 't1',
      number: 7,
      state: 'OPEN',
      seen: true,
      raisedAt: at(14, 10),
      ...over,
    });

    it('says "We are looking at it" for an open ticket a person has opened', () => {
      h.result = loaded([support({ tickets: [ticket()] as never })]);
      renderList();
      expect(screen.getByText('We are looking at it')).toBeInTheDocument();
    });

    it('names the time MDG promised an update by', () => {
      h.result = loaded([
        support({
          tickets: [ticket({ promiseUntil: new Date(2026, 9, 14, 16, 10).toISOString() })] as never,
        }),
      ]);
      renderList();
      expect(screen.getByText(/We are on it · update by/)).toBeInTheDocument();
    });

    it('says "Taking a little longer than we said" with a triangle when MDG is late', () => {
      h.result = loaded([
        support({
          tickets: [
            ticket({
              promiseUntil: new Date(2026, 9, 14, 12, 0).toISOString(),
              teamReminded: true,
            }),
          ] as never,
        }),
      ]);
      const { container } = renderList();
      const pill = screen
        .getByText('Taking a little longer than we said')
        .closest('[data-status]')!;
      expect(pill).toHaveAttribute('data-status', 'attention');
      expect(container).toBeTruthy();
    });

    it('says "Done ✓" for a question closed in the last day', () => {
      h.result = loaded([
        support({ tickets: [ticket({ state: 'RESOLVED', resolvedAt: at(14, 9) })] as never }),
      ]);
      renderList();
      expect(screen.getByText('Done ✓').closest('[data-status]')).toHaveAttribute(
        'data-status',
        'ok',
      );
    });

    it('says nothing when there is no ticket', () => {
      h.result = loaded([support()]);
      renderList();
      expect(screen.queryByText(/We are|Done|looking/)).not.toBeInTheDocument();
    });
  });

  describe('unread', () => {
    it('shows a dot, the number and the word "unread", and lights the time and the name', () => {
      h.result = loaded([
        support({ unreadCount: 3, unreadByDealer: true, unreadDealerUserIds: ['owner'] }),
        group({ unreadCount: 0 }),
      ]);
      renderList();

      const mark = screen.getByRole('img', { name: '3 unread' });
      // The words are drawn, not only spoken.
      expect(mark).toHaveTextContent('3 unread');

      const supportRow = screen.getByText('Support').closest('button')!;
      expect(within(supportRow).getByText('9:05 am').className).toMatch(/font-semibold/);
      expect(screen.getByText('Support').className).toMatch(/font-bold/);
      const groupRow = screen.getByText('Manager chat').closest('button')!;
      expect(within(groupRow).queryByRole('img')).not.toBeInTheDocument();
      expect(screen.getByText('Manager chat').className).not.toMatch(/font-bold/);
    });

    // A count of three says more than a flag, and a count of zero says "read" even when a coarse
    // flag has not caught up with another phone.
    it('trusts a count of zero over a stale flag', () => {
      h.result = loaded([
        support({ unreadCount: 0, unreadByDealer: true, unreadDealerUserIds: ['owner'] }),
      ]);
      renderList();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('caps a huge count', () => {
      h.result = loaded([support({ unreadCount: 1234 })]);
      renderList();
      expect(screen.getByRole('img', { name: '999+ unread' })).toHaveTextContent('999+ unread');
    });

    // A server that predates the count: the flags still light the row, with a dot and the word,
    // never a made-up number.
    it('draws the dot and the word "Unread" when only the flag says unread', () => {
      h.result = loaded([support({ unreadByDealer: true, unreadDealerUserIds: ['owner'] })]);
      renderList();
      const mark = screen.getByRole('img', { name: 'Unread' });
      expect(mark).toHaveTextContent('Unread');
      expect(mark).not.toHaveTextContent(/\d/);
    });
  });
});

describe('ChatListPage — the filter chips', () => {
  const four = () => [
    support({ unreadCount: 2 }),
    group({ unreadCount: 0 }),
    conv({ id: 'a', kind: 'support', lastMessagePreview: 'older one', unreadCount: 0 }),
    conv({ id: 'b', kind: 'support', lastMessagePreview: 'oldest one', unreadCount: 0 }),
  ];

  it('are not drawn for one to three chats', () => {
    h.result = loaded([support(), group(), conv({ id: 'a' })]);
    renderList();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('appear from four chats, at least 44px tall, with the unread count', () => {
    h.result = loaded(four());
    renderList();
    const chips = screen.getByRole('radiogroup', { name: 'Filter chats' });
    expect(within(chips).getByRole('radio', { name: 'All' })).toBeInTheDocument();
    // The count rides in the name: "Unread, 1".
    const unread = within(chips).getByRole('radio', { name: 'Unread, 1' });
    expect(unread.className).toContain('min-h-11');
    expect(within(chips).getByRole('radio', { name: 'Groups' })).toBeInTheDocument();
  });

  it('offer Groups only when a group thread exists', () => {
    h.result = loaded([support(), conv({ id: 'a' }), conv({ id: 'b' }), conv({ id: 'c' })]);
    renderList();
    expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Groups' })).not.toBeInTheDocument();
  });

  it('filter to the unread chats, and say so when there are none', () => {
    h.result = loaded(four());
    renderList();
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'Unread, 1' }));
    expect(screen.getByRole('radio', { name: 'Unread, 1' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.queryByText('Manager chat')).not.toBeInTheDocument();
  });

  it('say there is nothing unread instead of drawing an empty list, and the way back stays', () => {
    h.result = loaded(four().map((c) => ({ ...c, unreadCount: 0 })));
    renderList();
    fireEvent.click(screen.getByRole('radio', { name: 'Unread' }));
    expect(screen.getByText('No unread chats')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(screen.getAllByText('Support').length).toBeGreaterThan(0);
  });

  it('filter to the group', () => {
    h.result = loaded(four());
    renderList();
    fireEvent.click(screen.getByRole('radio', { name: 'Groups' }));
    expect(screen.getByText('Manager chat')).toBeInTheDocument();
    expect(screen.queryByText('Support')).not.toBeInTheDocument();
  });

  it('let go of a chip when the list shrinks below four, so nothing stays hidden', () => {
    h.result = loaded(four());
    const first = renderList();
    fireEvent.click(screen.getByRole('radio', { name: 'Groups' }));
    first.unmount();
    h.result = loaded([support(), group()]);
    renderList();
    // Both chats show, though the earlier choice was Groups.
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Manager chat')).toBeInTheDocument();
  });
});

describe('ChatListPage — the tab bar', () => {
  function renderWithBar() {
    signIn({ id: 'owner' });
    useLangStore.setState({ lang: 'en', explicit: true });
    return renderWithProviders(
      <Routes>
        <Route
          path="/chat"
          element={
            <>
              <ChatListPage />
              <TabBar />
            </>
          }
        />
      </Routes>,
      { route: '/chat', withRouter: true },
    );
  }

  it('shows the bar with Chat selected, and puts it away while the search is open', async () => {
    h.result = loaded([support()]);
    renderWithBar();
    expect(screen.getByRole('tab', { name: /^Chat/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('tablist')).toBeInTheDocument();
  });
});

describe('ChatListPage — search', () => {
  it('turns the bar into a search field, and the arrow puts the bar back', async () => {
    h.result = loaded([support()]);
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const field = screen.getByRole('searchbox');
    expect(field).toHaveFocus();
    expect(screen.queryByRole('heading', { name: 'Chats' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Chats' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('filters by the title and by the last message, ignoring case', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    h.result = loaded([
      support({ lastMessagePreview: 'Your report is ready' }),
      group({ lastMessagePreview: 'Tanker came at 6' }),
    ]);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const field = screen.getByRole('searchbox');

    await user.type(field, 'TANKER');
    expect(screen.getByText('Manager chat')).toBeInTheDocument();
    expect(screen.queryByText('Support')).not.toBeInTheDocument();

    await user.clear(field);
    await user.type(field, 'support');
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.queryByText('Manager chat')).not.toBeInTheDocument();
  });

  it('says so when nothing matches, and a cross wipes the words', () => {
    h.result = loaded([support()]);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('No chats found')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByText('Support')).toBeInTheDocument();
    // Nothing typed, nothing to clear.
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  // A root screen: an ordinary Back from here would close the app, with the keyboard up. It has to
  // close the search instead.
  it("closes the search on the phone's Back button, not the app", async () => {
    h.result = loaded([support()]);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('searchbox')).toBeInTheDocument();

    window.history.back();
    await waitFor(() => expect(screen.queryByRole('searchbox')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Chats' })).toBeInTheDocument();
  });

  it('opens a thread from the results', async () => {
    h.result = loaded([support(), group()]);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'manager' } });
    fireEvent.click(screen.getByText('Manager chat'));
    // Real timers for the history rewind that runs between closing and navigating.
    vi.useRealTimers();
    expect(await screen.findByText('thread-page')).toBeInTheDocument();
  });

  it('has a search field and buttons of at least 44px', () => {
    h.result = loaded([support()]);
    renderList();
    expect(screen.getByRole('button', { name: 'Search' }).className).toContain('h-11');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('searchbox').className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Back' }).className).toContain('h-11');
  });
});

describe('ChatListPage — an old-style link', () => {
  // The native shell turns a push that names only a conversation into `/chat?c=<id>`. The list is
  // where that lands.
  it('sends /chat?c=<id> on into the thread', async () => {
    h.result = loaded([support(), group()]);
    renderList('/chat?c=abc123');
    expect(await screen.findByText('thread-page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chats' })).not.toBeInTheDocument();
  });

  it('works from the root too', async () => {
    h.result = loaded([support()]);
    renderList('/?c=abc123');
    expect(await screen.findByText('thread-page')).toBeInTheDocument();
  });

  // The id goes straight into a route, so a value that is not an id is not followed.
  it('ignores a ?c= that is not a plain id', () => {
    h.result = loaded([support()]);
    renderList('/chat?c=../settings');
    expect(screen.queryByText('settings-page')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chats' })).toBeInTheDocument();
  });
});
