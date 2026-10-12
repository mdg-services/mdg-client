import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
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
}));
vi.mock('@/hooks/api/useMyConversations', () => ({
  myConversationsKey: ['conversations', 'mine'],
  useMyConversations: () => h.result,
}));

const { ChatListPage } = await import('./ChatListPage');

/** A Wednesday afternoon (local time), so "today", "yesterday" and a weekday are all reachable. */
const NOW = new Date(2026, 9, 14, 15, 30);
const at = (day: number, hour = 9, minute = 5) => new Date(2026, 9, day, hour, minute).toISOString();

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
});

describe('ChatListPage — the first screen', () => {
  it('is headed by the app name, with a search icon and a ⋮ menu', () => {
    h.result = loaded([support()]);
    renderList();
    expect(screen.getByText('Dealer Kavach')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
    // No back arrow: this is where the app starts.
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('reaches Settings from the ⋮ menu', async () => {
    h.result = loaded([support()]);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Settings' }));
    expect(await screen.findByText('settings-page')).toBeInTheDocument();
  });

  /**
   * It used to skip the list for a member with exactly one thread. With no tab
   * bar the list is the only place Settings can hang from, and WhatsApp itself
   * always opens on its list.
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

  it('shows an empty state when there are no conversations', () => {
    h.result = loaded([]);
    renderList();
    expect(screen.getByText('No chats yet')).toBeInTheDocument();
    // The bar is still there — Settings (and Log out) stay reachable.
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });

  it('keeps a long written reply to one line in the list', () => {
    // From v2 the first line composes its own prose, so `lastMessagePreview` is
    // no longer one of about thirty short hand-written sentences — it is up to
    // 280 characters of Hindi, which runs roughly 35% longer than English again.
    // The row must stay one line high whatever lands in it: two rows for one
    // thread pushes the rest of the list off a 360px screen. jsdom has no
    // layout, so the assertion is on the class that enforces it.
    const long =
      'कल की रिपोर्ट बन गई है और MDG उसे देख रहा है। आपकी तरफ़ से अभी डेंसिटी रजिस्टर का ' +
      'कल वाला पन्ना बाकी है, वो भेज दीजिए तो बाकी काम आगे बढ़ जाएगा।';
    h.result = loaded([support({ lastMessagePreview: long }), group()]);
    renderList();
    const preview = screen.getByText(long);
    expect(preview.textContent).toBe(long);
    expect(preview.getAttribute('class') ?? '').toContain('truncate');
  });

  /**
   * The reported bug: the fetch failed and the dealer was told "No chats yet".
   * Their chats were all still on the server — the page turned a transport
   * failure into a confident, wrong, dead-end empty state.
   */
  it('shows a retryable error — NOT "No chats yet" — when the fetch fails', async () => {
    h.result = {
      status: 'error',
      fetchStatus: 'idle',
      isError: true,
      isFetching: false,
      data: undefined,
      refetch: h.refetch,
    };
    renderList();

    expect(await screen.findByText("We couldn't load your chats")).toBeInTheDocument();
    expect(screen.queryByText('No chats yet')).not.toBeInTheDocument();
    // A failed list must not strand the dealer: the bar's menu is still there.
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the chats on screen when a background refresh fails', () => {
    // Back from a thread on a flaky link: the list refetches, the refetch fails,
    // and the chats already on the phone must stay — not hide behind "Try again".
    h.result = {
      ...loaded([conv({ lastMessagePreview: 'still here' })]),
      status: 'error',
      isError: true,
    };
    renderList();
    expect(screen.getByText('still here')).toBeInTheDocument();
    expect(screen.queryByText("We couldn't load your chats")).not.toBeInTheDocument();
  });

  /**
   * Offline: react-query PAUSES the query — status stays 'pending' while
   * fetchStatus is 'paused', so `isLoading` is false. Without this branch the
   * page would fall straight through to the empty state.
   */
  it('shows the retryable error when the query is paused (offline)', async () => {
    h.result = {
      status: 'pending',
      fetchStatus: 'paused',
      isError: false,
      isFetching: false,
      data: undefined,
      refetch: h.refetch,
    };
    renderList();

    expect(await screen.findByText("We couldn't load your chats")).toBeInTheDocument();
    expect(screen.queryByText('No chats yet')).not.toBeInTheDocument();
  });

  it('shows a spinner, not the empty state, while the first load is in flight', () => {
    h.result = {
      status: 'pending',
      fetchStatus: 'fetching',
      isError: false,
      isFetching: true,
      data: undefined,
      refetch: h.refetch,
    };
    renderList();
    expect(screen.queryByText('No chats yet')).not.toBeInTheDocument();
    expect(screen.queryByText("We couldn't load your chats")).not.toBeInTheDocument();
    expect(screen.getByText('Dealer Kavach')).toBeInTheDocument();
  });
});

describe('ChatListPage — a row', () => {
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

  describe('unread', () => {
    it("shows the server's count in a green pill and lights the time", () => {
      h.result = loaded([
        support({ unreadCount: 3, unreadByDealer: true, unreadDealerUserIds: ['owner'] }),
        group({ unreadCount: 0 }),
      ]);
      renderList();

      const pill = screen.getByRole('img', { name: '3 unread' });
      expect(pill).toHaveTextContent('3');
      // The read thread has no pill.
      expect(screen.getAllByRole('img')).toHaveLength(1);

      const supportRow = screen.getByText('Support').closest('button')!;
      const time = within(supportRow).getByText('9:05 am');
      expect(time.className).toMatch(/text-wa-badge/);
      const groupRow = screen.getByText('Manager chat').closest('button')!;
      expect(within(groupRow).queryByRole('img')).not.toBeInTheDocument();
    });

    // A count of three says more than a flag, and a count of zero says "read"
    // even when a coarse flag has not caught up with another phone.
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
      expect(screen.getByRole('img', { name: '1234 unread' })).toHaveTextContent('999+');
    });

    // A server that predates the count: the flags still light the row, with a
    // dot — never a made-up number.
    it('draws a plain dot when only the flag says unread', () => {
      h.result = loaded([support({ unreadByDealer: true, unreadDealerUserIds: ['owner'] })]);
      renderList();
      const dot = screen.getByRole('img', { name: 'Unread' });
      expect(dot).toBeEmptyDOMElement();
    });
  });
});

describe('ChatListPage — the chips', () => {
  it('offers All and Unread, and Groups only when a group thread exists', () => {
    h.result = loaded([support()]);
    const first = renderList();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unread' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Groups' })).not.toBeInTheDocument();
    first.unmount();

    h.result = loaded([support(), group()]);
    renderList();
    expect(screen.getByRole('button', { name: 'Groups' })).toBeInTheDocument();
  });

  it('filters to the unread chats, and says so when there are none', () => {
    h.result = loaded([support({ unreadCount: 2 }), group({ unreadCount: 0 })]);
    renderList();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.queryByText('Manager chat')).not.toBeInTheDocument();
  });

  it('says there is nothing unread instead of drawing an empty list', () => {
    h.result = loaded([support({ unreadCount: 0 })]);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByText('No unread chats')).toBeInTheDocument();
    // The way back is still on screen.
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('filters to the group', () => {
    h.result = loaded([support(), group()]);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    expect(screen.getByText('Manager chat')).toBeInTheDocument();
    expect(screen.queryByText('Support')).not.toBeInTheDocument();
  });
});

describe('ChatListPage — search', () => {
  it('turns the bar into a search field, and ← puts the bar back', async () => {
    h.result = loaded([support()]);
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const field = screen.getByRole('searchbox');
    expect(field).toHaveFocus();
    expect(screen.queryByText('Dealer Kavach')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Dealer Kavach')).toBeInTheDocument();
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

  it('says so when nothing matches, and a ✕ wipes the words', () => {
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

  // The first screen: an ordinary Back from here would close the app, with the
  // keyboard up. It has to close the search instead.
  it("closes the search on the phone's Back button, not the app", async () => {
    h.result = loaded([support()]);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('searchbox')).toBeInTheDocument();

    window.history.back();
    await waitFor(() => expect(screen.queryByRole('searchbox')).not.toBeInTheDocument());
    expect(screen.getByText('Dealer Kavach')).toBeInTheDocument();
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
});

describe('ChatListPage — an old-style link', () => {
  // The native shell turns a push that names only a conversation into
  // `/chat?c=<id>`. The list is where that lands.
  it('sends /chat?c=<id> on into the thread', async () => {
    h.result = loaded([support(), group()]);
    renderList('/chat?c=abc123');
    expect(await screen.findByText('thread-page')).toBeInTheDocument();
    expect(screen.queryByText('Dealer Kavach')).not.toBeInTheDocument();
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
    expect(screen.getByText('Dealer Kavach')).toBeInTheDocument();
  });
});
