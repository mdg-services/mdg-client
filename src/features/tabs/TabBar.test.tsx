import { act, fireEvent, screen } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetEmbeddedForTests } from '@/lib/embedMode';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation } from '@dk/shared/types';

const h = vi.hoisted(() => ({
  tasks: [] as unknown[],
  convos: [] as Conversation[],
  feedCalls: 0,
  kavach: undefined as { on: boolean; now: unknown[] } | undefined,
  kavachCalls: 0,
}));

vi.mock('@/hooks/api/useTodayFeed', () => ({
  useTodayFeed: () => {
    h.feedCalls += 1;
    return { data: { tasks: h.tasks } };
  },
}));
vi.mock('@/hooks/api/useKavach', () => ({
  useKavach: () => {
    h.kavachCalls += 1;
    return { data: h.kavach };
  },
}));
vi.mock('@/hooks/api/useMyConversations', () => ({
  myConversationsKey: ['conversations', 'mine'],
  useMyConversations: () => ({ data: h.convos }),
}));

const { TabBar } = await import('./TabBar');
const { useHideTabBar } = await import('./tabBarVisibility');

function conv(over: Partial<Conversation>): Conversation {
  return {
    id: 'c',
    kind: 'support',
    unreadByDealer: false,
    unreadDealerUserIds: [],
    ...over,
  } as Conversation;
}

/** Says where we are and how we got there, so a test can tell a push from a replace. */
function Probe() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  return <p data-testid="where">{`${pathname}|${type}`}</p>;
}

function Hider({ hide }: { hide: boolean }) {
  useHideTabBar(hide);
  return null;
}

function renderBar(route: string, props: { keyboardOpen?: boolean } = {}, extra?: React.ReactNode) {
  signIn({ id: 'owner' });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
      {extra}
      <TabBar {...props} />
    </>,
    { route, withRouter: true },
  );
}

afterEach(() => {
  resetStores();
  resetEmbeddedForTests();
  window.sessionStorage.removeItem('dk.embed');
  h.tasks = [];
  h.convos = [];
  h.feedCalls = 0;
  h.kavach = undefined;
  h.kavachCalls = 0;
});

describe('TabBar', () => {
  it('is a tablist with Today, Chats and Reports, the one you are on selected', () => {
    renderBar('/');
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Today', 'Chats', 'Reports']);
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Chats' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'false');
  });

  describe('the Kavach tab', () => {
    it('is not there until Kavach is known to be on for the pump', () => {
      renderBar('/');
      expect(screen.queryByRole('tab', { name: /Kavach/ })).not.toBeInTheDocument();
    });

    it('is not there when Kavach is off, whatever is open', () => {
      h.kavach = { on: false, now: [{}] };
      renderBar('/');
      expect(screen.queryByRole('tab', { name: /Kavach/ })).not.toBeInTheDocument();
    });

    it('is the fourth tab where Kavach is on, and selected on /kavach', () => {
      h.kavach = { on: true, now: [] };
      renderBar('/kavach');
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Today', 'Chats', 'Reports', 'Kavach']);
      expect(screen.getByRole('tab', { name: 'Kavach' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'false');
    });

    it("carries the number of this member's points for today as its badge", () => {
      const today = { canSend: true, how: 'photo', everyDays: 1, state: 'todo', late: false };
      const nextWeek = { canSend: true, how: 'photo', everyDays: 30, state: 'todo', late: false, dueAt: '2099-01-01T00:00:00.000Z' };
      const ownerOnly = { ...today, canSend: false };
      const data = { ...today, how: 'data' };
      h.kavach = { on: true, now: [today, today, today, nextWeek, ownerOnly, data] };
      renderBar('/');
      expect(screen.getByRole('img', { name: '3 to do' })).toHaveTextContent('3');
    });

    it('carries no badge when there is nothing to do', () => {
      h.kavach = { on: true, now: [] };
      renderBar('/');
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('opens /kavach by REPLACING the history entry, like every other tab', () => {
      h.kavach = { on: true, now: [] };
      renderBar('/');
      fireEvent.click(screen.getByRole('tab', { name: 'Kavach' }));
      expect(screen.getByTestId('where')).toHaveTextContent('/kavach|REPLACE');
    });

    it('is named in Hindi', () => {
      h.kavach = { on: true, now: [] };
      signIn({ id: 'owner' });
      useLangStore.setState({ lang: 'hi', explicit: true });
      renderWithProviders(<TabBar />, { route: '/', withRouter: true });
      expect(screen.getByRole('tab', { name: 'कवच' })).toBeInTheDocument();
    });

    it('asks for nothing where the bar is not drawn', () => {
      h.kavach = { on: true, now: [] };
      h.kavachCalls = 0;
      renderBar('/settings');
      expect(h.kavachCalls).toBe(0);
    });
  });

  it('selects Chats on /chat', () => {
    renderBar('/chat');
    expect(screen.getByRole('tab', { name: 'Chats' })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects Reports on /reports, and is drawn there', () => {
    renderBar('/reports');
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'false');
  });

  it('draws every tab with an icon and a word: nothing is told by colour alone', () => {
    renderBar('/');
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.querySelector('svg')).not.toBeNull();
      expect(tab.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('speaks the reader\'s language', () => {
    signIn({ id: 'owner' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(<TabBar />, { route: '/', withRouter: true });
    expect(screen.getByRole('tab', { name: 'आज' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'चैट' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'रिपोर्ट' })).toBeInTheDocument();
  });

  it('speaks Hinglish too', () => {
    signIn({ id: 'owner' });
    useLangStore.setState({ lang: 'hl', explicit: true });
    renderWithProviders(<TabBar />, { route: '/', withRouter: true });
    expect(screen.getByRole('tab', { name: 'Aaj' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Report' })).toBeInTheDocument();
  });

  it.each([
    '/chat/c1',
    '/chat/c1/info',
    '/chat/c1/media',
    '/settings',
    '/settings/team',
    '/services',
    '/payments',
    '/report/c1/m1',
  ])(
    'is not drawn on %s',
    (route) => {
      renderBar(route);
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    },
  );

  it('asks for nothing where it is not drawn', () => {
    renderBar('/settings');
    expect(h.feedCalls).toBe(0);
  });

  it('is not drawn inside the extension\'s panel', () => {
    window.sessionStorage.setItem('dk.embed', 'extension');
    resetEmbeddedForTests({ framed: true });
    renderBar('/chat');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('steps aside while the keyboard is open, and comes back after', () => {
    const { rerender } = renderBar('/', { keyboardOpen: true });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    rerender(
      <>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
        <TabBar keyboardOpen={false} />
      </>,
    );
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('steps aside while a screen asks (the chat list\'s search), and comes back when it stops', () => {
    const view = renderBar('/chat', {}, <Hider hide />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    view.unmount();
    renderBar('/chat', {}, <Hider hide={false} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('REPLACES the history entry when a tab is tapped, and does nothing for the tab already open', () => {
    renderBar('/');
    expect(screen.getByTestId('where')).toHaveTextContent('/|POP');
    fireEvent.click(screen.getByRole('tab', { name: 'Today' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/|POP');

    fireEvent.click(screen.getByRole('tab', { name: 'Chats' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/chat|REPLACE');
    expect(screen.getByRole('tab', { name: /^Chats/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Today' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/|REPLACE');

    fireEvent.click(screen.getByRole('tab', { name: 'Reports' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/reports|REPLACE');
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'true');
  });

  it('steps aside under an open report, and comes back when it closes (the overlay asks, as the search does)', () => {
    // The real address is a report's, so the bar is not drawn there on its own account…
    const view = renderBar('/', {}, <Hider hide />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    view.unmount();
    // …and the screen beneath an overlay (still on "/") shows it again once nothing asks.
    renderBar('/', {}, <Hider hide={false} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  describe('badges', () => {
    it('shows the open tasks on Today and the chats with something unread on Chats', () => {
      h.tasks = [{}, {}, {}];
      h.convos = [
        conv({ id: 'a', unreadCount: 4 }),
        conv({ id: 'b', unreadCount: 0 }),
        // An older server sends no number: the flags decide.
        conv({ id: 'c', unreadByDealer: true, unreadDealerUserIds: ['owner'] }),
      ];
      renderBar('/');
      expect(screen.getByRole('img', { name: '3 to do' })).toHaveTextContent('3');
      expect(screen.getByRole('img', { name: '2 unread' })).toHaveTextContent('2');
    });

    it('sets the badge number in at least 12 px text', () => {
      h.tasks = [{}];
      renderBar('/');
      const badge = screen.getByRole('img', { name: '1 to do' });
      expect(badge.className).toContain('text-micro');
      expect(badge.className).not.toContain('text-[11px]');
    });

    it('shows no badge when nothing is waiting', () => {
      renderBar('/');
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('puts no badge on Reports: nothing there is waiting on the dealer', () => {
      h.tasks = [{}];
      h.convos = [conv({ id: 'a', unreadCount: 3 })];
      renderBar('/reports');
      const reports = screen.getByRole('tab', { name: 'Reports' });
      expect(reports.querySelector('[role="img"]')).toBeNull();
    });

    it('caps a long count', () => {
      h.tasks = Array.from({ length: 140 }, () => ({}));
      renderBar('/');
      expect(screen.getByRole('img', { name: '140 to do' })).toHaveTextContent('99+');
    });

    it('follows the data as it changes', () => {
      const view = renderBar('/');
      expect(screen.queryByRole('img', { name: '1 to do' })).not.toBeInTheDocument();
      h.tasks = [{}];
      act(() => {
        view.rerender(
          <>
            <Routes>
              <Route path="*" element={<Probe />} />
            </Routes>
            <TabBar />
          </>,
        );
      });
      expect(screen.getByRole('img', { name: '1 to do' })).toBeInTheDocument();
    });
  });
});

describe('TabBar for someone planning a pump (ADR 0058)', () => {
  it('has only Today and Chats: no Reports, and no Kavach even where the answer says on', () => {
    h.kavach = { on: true, now: [] };
    signIn({ id: 'owner', dealerStatus: 'PLANNING' });
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(<TabBar />, { route: '/', withRouter: true });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Today', 'Chats']);
  });
});
