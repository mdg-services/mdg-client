import { act, fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetEmbeddedForTests } from '@/lib/embedMode';
import { useLangStore } from '@/store/lang';
import { makeSetupView } from '@/test/setupFixtures';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Conversation } from '@dk/shared/types';

const h = vi.hoisted(() => ({
  tasks: [] as unknown[],
  reports: [] as unknown[],
  convos: [] as Conversation[],
  feedCalls: 0,
  kavach: undefined as { on: boolean; now: unknown[] } | undefined,
  kavachCalls: 0,
  setup: undefined as unknown,
  large: false,
  reportsAsTab: false,
  backToToday: true,
}));

vi.mock('@/hooks/api/useTodayFeed', () => ({
  useTodayFeed: () => {
    h.feedCalls += 1;
    // The send time and the id a real answer always carries (the glance model orders and de-duplicates by them).
    const reports = h.reports.map((r, i) => ({ sentAt: '2026-11-27T05:00:00.000Z', messageId: `m${i}`, conversationId: 'c', ...r }));
    return { data: { tasks: h.tasks, reports } };
  },
}));
vi.mock('@/hooks/api/useKavach', () => ({
  useKavach: () => {
    h.kavachCalls += 1;
    return { data: h.kavach };
  },
}));
vi.mock('@/features/setup/useOutletSetup', () => ({ useOutletSetup: () => ({ data: h.setup }) }));
vi.mock('@/hooks/api/useMyConversations', () => ({
  myConversationsKey: ['conversations', 'mine'],
  useMyConversations: () => ({ data: h.convos }),
}));
vi.mock('@/lib/useLargeText', () => ({ useLargeText: () => h.large }));
// The two switches are read at the moment of use, so a test can flip one.
vi.mock('./tabConfig', () => ({
  get REPORTS_AS_TAB() {
    return h.reportsAsTab;
  },
  get BACK_GOES_TO_TODAY() {
    return h.backToToday;
  },
}));

const { TabBar, tabOf, tapReplacesEntry } = await import('./TabBar');
const { useHideTabBar } = await import('./tabBarVisibility');
const { KAVACH_MEMORY_KEY } = await import('./useKavachMemory');

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

function renderBar(route: string, props: { keyboardOpen?: boolean; role?: 'dealer-owner' | 'dealer-staff' } = {}, extra?: React.ReactNode) {
  const { role, ...barProps } = props;
  signIn({ id: 'owner', ...(role ? { role } : {}) });
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
      {extra}
      <TabBar {...barProps} />
    </>,
    { route, withRouter: true },
  );
}

const names = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

afterEach(() => {
  resetStores();
  resetEmbeddedForTests();
  window.sessionStorage.removeItem('dk.embed');
  h.tasks = [];
  h.reports = [];
  h.convos = [];
  h.feedCalls = 0;
  h.kavach = undefined;
  h.kavachCalls = 0;
  h.setup = undefined;
  h.large = false;
  h.reportsAsTab = false;
  h.backToToday = true;
});

describe('tabOf', () => {
  it.each([
    ['/', 'today'],
    ['/services', 'services'],
    ['/services/', 'services'],
    ['/reports', 'services'],
    ['/kavach', 'kavach'],
    ['/chat', 'chat'],
  ])('puts %s on the %s door', (path, door) => {
    expect(tabOf(path)).toBe(door);
  });

  it.each([
    '/services/dsr_sales',
    '/pump',
    '/pump/papers',
    '/settings',
    '/settings/team',
    '/staff',
    '/staff/e1',
    '/payments',
    '/chat/c1',
    '/chat/c1/info',
    '/report/c1/m1',
  ])('puts %s on no door: a sub-page carries no bar', (path) => {
    expect(tabOf(path)).toBeNull();
  });

  it('makes Reports its own door when the switch is on', () => {
    h.reportsAsTab = true;
    expect(tabOf('/reports')).toBe('reports');
  });
});

describe('tapReplacesEntry (the Back rule)', () => {
  it('pushes from Today to any other door, so Back lands on Today', () => {
    expect(tapReplacesEntry('today', 'services', true)).toBe(false);
    expect(tapReplacesEntry('today', 'kavach', true)).toBe(false);
    expect(tapReplacesEntry('today', 'chat', true)).toBe(false);
  });

  it('replaces from one other door to another, and to Today', () => {
    expect(tapReplacesEntry('services', 'chat', true)).toBe(true);
    expect(tapReplacesEntry('kavach', 'services', true)).toBe(true);
    expect(tapReplacesEntry('chat', 'today', true)).toBe(true);
  });

  it('replaces every time when the switch is off, as the bar always did', () => {
    expect(tapReplacesEntry('today', 'services', false)).toBe(true);
    expect(tapReplacesEntry('services', 'today', false)).toBe(true);
  });
});

describe('TabBar', () => {
  it('is a tablist with Today, Services and Chat, the one you are on selected', () => {
    renderBar('/');
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(names()).toEqual(['Today', 'Services', 'Chat']);
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'false');
  });

  it('names the doors Today, Services, Kavach, Chat: Reports is not one of them', () => {
    h.kavach = { on: true, now: [] };
    renderBar('/');
    expect(names()).toEqual(['Today', 'Services', 'Kavach', 'Chat']);
    expect(screen.queryByRole('tab', { name: /Reports/ })).not.toBeInTheDocument();
  });

  it('puts Reports back as a fifth door when the switch is on', () => {
    h.kavach = { on: true, now: [] };
    h.reportsAsTab = true;
    renderBar('/reports');
    expect(names()).toEqual(['Today', 'Services', 'Reports', 'Kavach', 'Chat']);
    expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'false');
  });

  describe('the Kavach door', () => {
    it('is not there until Kavach is known to be on for the pump', () => {
      renderBar('/');
      expect(screen.queryByRole('tab', { name: /Kavach/ })).not.toBeInTheDocument();
    });

    it('is not there when Kavach is off, whatever is open', () => {
      h.kavach = { on: false, now: [{}] };
      renderBar('/');
      expect(screen.queryByRole('tab', { name: /Kavach/ })).not.toBeInTheDocument();
    });

    it('is the third door where Kavach is on, and selected on /kavach', () => {
      h.kavach = { on: true, now: [] };
      renderBar('/kavach');
      expect(names()).toEqual(['Today', 'Services', 'Kavach', 'Chat']);
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

  describe('remembering Kavach, so the bar never jumps from three doors to four', () => {
    it('draws the Kavach door at once from the remembered answer, before the query has one', () => {
      window.localStorage.setItem(KAVACH_MEMORY_KEY, '1');
      h.kavach = undefined; // the query has not answered
      renderBar('/');
      expect(names()).toEqual(['Today', 'Services', 'Kavach', 'Chat']);
    });

    it('keeps it away when the remembered answer is off', () => {
      window.localStorage.setItem(KAVACH_MEMORY_KEY, '0');
      renderBar('/');
      expect(names()).toEqual(['Today', 'Services', 'Chat']);
    });

    it('lets the real answer correct a wrong memory, and writes the answer down', () => {
      window.localStorage.setItem(KAVACH_MEMORY_KEY, '1');
      h.kavach = { on: false, now: [] };
      renderBar('/');
      expect(names()).toEqual(['Today', 'Services', 'Chat']);
      expect(window.localStorage.getItem(KAVACH_MEMORY_KEY)).toBe('0');
    });

    it('writes "1" once Kavach is known to be on', () => {
      h.kavach = { on: true, now: [] };
      renderBar('/');
      expect(window.localStorage.getItem(KAVACH_MEMORY_KEY)).toBe('1');
    });

    it('draws correctly with the browser\'s storage refusing every read and write of its key', () => {
      const realGet = Storage.prototype.getItem;
      const realSet = Storage.prototype.setItem;
      const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
        if (key === KAVACH_MEMORY_KEY) throw new Error('blocked');
        return realGet.call(this, key);
      });
      const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, v: string) {
        if (key === KAVACH_MEMORY_KEY) throw new Error('blocked');
        realSet.call(this, key, v);
      });
      h.kavach = { on: true, now: [] };
      renderBar('/');
      expect(names()).toEqual(['Today', 'Services', 'Kavach', 'Chat']);
      get.mockRestore();
      set.mockRestore();
    });
  });

  it('selects Chat on /chat', () => {
    renderBar('/chat');
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects Services on /services and on /reports, and is drawn on both', () => {
    renderBar('/services');
    expect(screen.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps Services selected on the old /reports address', () => {
    renderBar('/reports');
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'true');
  });

  it('draws every door with an icon and a word: nothing is told by colour alone', () => {
    renderBar('/');
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.querySelector('svg')).not.toBeNull();
      expect(tab.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('gives every door at least 44px to tap', () => {
    renderBar('/');
    for (const tab of screen.getAllByRole('tab')) expect(tab.className).toMatch(/min-h-(11|14)\b/);
  });

  it('speaks the reader\'s language', () => {
    h.kavach = { on: true, now: [] };
    signIn({ id: 'owner' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(<TabBar />, { route: '/', withRouter: true });
    expect(screen.getByRole('tab', { name: 'आज' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'सेवाएँ' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'चैट' })).toBeInTheDocument();
  });

  it('speaks Hinglish too', () => {
    signIn({ id: 'owner' });
    useLangStore.setState({ lang: 'hl', explicit: true });
    renderWithProviders(<TabBar />, { route: '/', withRouter: true });
    expect(screen.getByRole('tab', { name: 'Aaj' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
  });

  it.each([
    '/chat/c1',
    '/chat/c1/info',
    '/chat/c1/media',
    '/settings',
    '/settings/team',
    '/services/dsr_sales',
    '/pump',
    '/pump/papers',
    '/staff',
    '/staff/e1',
    '/payments',
    '/report/c1/m1',
  ])('is not drawn on %s', (route) => {
    renderBar(route);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

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

  describe('a tap, and the Back rule', () => {
    it('does nothing for the door already open', () => {
      renderBar('/');
      fireEvent.click(screen.getByRole('tab', { name: 'Today' }));
      expect(screen.getByTestId('where')).toHaveTextContent('/|POP');
    });

    it('PUSHES one entry from Today to another door, so the phone\'s Back lands on Today', () => {
      renderBar('/');
      fireEvent.click(screen.getByRole('tab', { name: 'Services' }));
      expect(screen.getByTestId('where')).toHaveTextContent('/services|PUSH');
      expect(screen.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'true');
    });

    it('REPLACES from one other door to another', () => {
      renderBar('/services');
      fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
      expect(screen.getByTestId('where')).toHaveTextContent('/chat|REPLACE');
    });

    it('REPLACES on the way back to Today', () => {
      renderBar('/chat');
      fireEvent.click(screen.getByRole('tab', { name: 'Today' }));
      expect(screen.getByTestId('where')).toHaveTextContent('/|REPLACE');
    });

    it('REPLACES from Today as well when the switch is off, like the bar always did', () => {
      h.backToToday = false;
      renderBar('/');
      fireEvent.click(screen.getByRole('tab', { name: 'Services' }));
      expect(screen.getByTestId('where')).toHaveTextContent('/services|REPLACE');
    });

    it('opens /kavach from Today by a push, and from Chat by a replace', () => {
      h.kavach = { on: true, now: [] };
      const first = renderBar('/');
      fireEvent.click(screen.getByRole('tab', { name: 'Kavach' }));
      expect(screen.getByTestId('where')).toHaveTextContent('/kavach|PUSH');
      first.unmount();
      renderBar('/chat');
      fireEvent.click(screen.getByRole('tab', { name: 'Kavach' }));
      expect(screen.getByTestId('where')).toHaveTextContent('/kavach|REPLACE');
    });
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

  describe('at large text', () => {
    it('is a one-row bar at normal size', () => {
      renderBar('/');
      expect(screen.getByRole('tablist')).toHaveAttribute('data-layout', 'row');
    });

    it('becomes a two-column grid of labels, with no icon to crowd a word, and hides no label', () => {
      h.large = true;
      h.kavach = { on: true, now: [] };
      renderBar('/');
      const list = screen.getByRole('tablist');
      expect(list).toHaveAttribute('data-layout', 'grid');
      expect(list.className).toContain('grid-cols-2');
      expect(names()).toEqual(['Today', 'Services', 'Kavach', 'Chat']);
      for (const tab of screen.getAllByRole('tab')) {
        expect(tab.className).not.toContain('flex-col');
        // A 44 px floor that does not grow with the text; the label inside still grows and wraps.
        expect(tab.className).toContain('min-h-tap');
        expect(tab.querySelector('svg')).toBeNull();
      }
    });

    it('marks the chosen door with a box and bold type, not by colour', () => {
      h.large = true;
      renderBar('/services');
      const chosen = screen.getByRole('tab', { name: 'Services' });
      expect(chosen.className).toContain('ring-2');
      expect(chosen.innerHTML).toContain('font-semibold');
      expect(screen.getByRole('tab', { name: 'Today' }).className).not.toContain('ring-2');
    });

    it('puts the badge after the label, spoken the same, and never over a word', () => {
      h.large = true;
      h.tasks = [{}, {}];
      renderBar('/');
      const badge = screen.getByRole('img', { name: '2 for you' });
      expect(badge).toHaveTextContent('2');
      expect(badge.className).not.toContain('absolute');
      expect(badge.previousElementSibling).toHaveTextContent('Today');
    });

    it('lets the odd last door span both columns with three doors', () => {
      h.large = true;
      renderBar('/');
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);
      expect(tabs[2]!.className).toContain('col-span-2');
      expect(tabs[0]!.className).not.toContain('col-span-2');
    });

    it('does not span any door with four doors', () => {
      h.large = true;
      h.kavach = { on: true, now: [] };
      renderBar('/');
      for (const tab of screen.getAllByRole('tab')) expect(tab.className).not.toContain('col-span-2');
    });

    it('never truncates a label', () => {
      h.large = true;
      renderBar('/');
      for (const tab of screen.getAllByRole('tab')) {
        expect(tab.innerHTML).not.toMatch(/truncate|line-clamp/);
      }
    });
  });

  describe('badges', () => {
    it('shows the open tasks on Today and the chats with something unread on Chat', () => {
      h.tasks = [{}, {}, {}];
      h.convos = [
        conv({ id: 'a', unreadCount: 4 }),
        conv({ id: 'b', unreadCount: 0 }),
        // An older server sends no number: the flags decide.
        conv({ id: 'c', unreadByDealer: true, unreadDealerUserIds: ['owner'] }),
      ];
      renderBar('/');
      expect(screen.getByRole('img', { name: '3 for you' })).toHaveTextContent('3');
      expect(screen.getByRole('img', { name: '2 unread' })).toHaveTextContent('2');
    });

    it('counts only the work waiting for the reader: reports that need a look are the card\'s count, not the bar\'s', () => {
      h.tasks = [{ kind: 'photo' }, { kind: 'photo' }];
      h.reports = [
        { kind: 'dsr_sales', status: 'attention' },
        { kind: 'dsr_sales', status: 'ok' },
        { kind: 'paper_expiry', status: 'info' },
      ];
      renderBar('/');
      expect(screen.getByRole('img', { name: '2 for you' })).toHaveTextContent('2');
    });

    it('does not count a report a task already covers', () => {
      h.tasks = [{ kind: 'du_otp' }];
      h.reports = [{ kind: 'du_otp', status: 'attention' }];
      renderBar('/');
      expect(screen.getByRole('img', { name: '1 for you' })).toHaveTextContent('1');
    });

    it('shows no Today badge when only reports need a look and no task is waiting', () => {
      h.reports = [{ kind: 'dsr_variation', status: 'attention' }];
      renderBar('/');
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('puts no badge on Services: its Reports pill shows its own count', () => {
      h.tasks = [{}];
      h.convos = [conv({ id: 'a', unreadCount: 3 })];
      renderBar('/services');
      const services = screen.getByRole('tab', { name: 'Services' });
      expect(within(services).queryByRole('img')).toBeNull();
    });

    it('sets the badge number in at least 12 px text, in a box that grows with the text', () => {
      h.tasks = [{}];
      renderBar('/');
      const badge = screen.getByRole('img', { name: '1 for you' });
      expect(badge.className).toContain('text-micro');
      expect(badge.className).not.toContain('text-[11px]');
      expect(badge.className).not.toMatch(/\bh-\[/);
    });

    it('shows no badge when nothing is waiting', () => {
      renderBar('/');
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('caps a long count', () => {
      h.tasks = Array.from({ length: 140 }, () => ({}));
      renderBar('/');
      expect(screen.getByRole('img', { name: '140 for you' })).toHaveTextContent('99+');
    });

    describe('the same numbers as the verdict card, for the signed-in role', () => {
      const late = { canSend: true, how: 'photo', everyDays: 365, state: 'todo', late: true, uploader: 'manager', code: 'first-aid-box' };
      const sentBack = { ...late, late: false, state: 'sent_back', everyDays: 1, code: 'toilet-sheet' };

      it("does not count the manager's late and sent-back jobs on the owner's Today or Kavach badge", () => {
        h.kavach = { on: true, now: [late, sentBack] };
        renderBar('/', { role: 'dealer-owner' });
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
      });

      it("counts them on the manager's badges: the late one and the sent-back one for Today, both again on Kavach", () => {
        h.kavach = { on: true, now: [late, sentBack] };
        renderBar('/', { role: 'dealer-staff' });
        expect(screen.getByRole('img', { name: '2 for you' })).toHaveTextContent('2');
        expect(screen.getByRole('img', { name: '2 to do' })).toHaveTextContent('2');
      });

      it("counts the owner's own late point once on Today, with the open tasks", () => {
        h.tasks = [{ kind: 'photo' }];
        h.kavach = { on: true, now: [{ ...late, uploader: 'owner' }] };
        renderBar('/', { role: 'dealer-owner' });
        expect(screen.getByRole('img', { name: '2 for you' })).toHaveTextContent('2');
      });

      it('leaves the setup task out while the setup hero on Today carries it, and counts it once the pump is live', () => {
        h.tasks = [{ kind: 'setup' }, { kind: 'photo' }];
        h.setup = makeSetupView({ stage: 'watch' });
        const first = renderBar('/');
        expect(screen.getByRole('img', { name: '1 for you' })).toHaveTextContent('1');
        first.unmount();
        h.setup = makeSetupView({ stage: 'live', active: false });
        renderBar('/');
        expect(screen.getByRole('img', { name: '2 for you' })).toHaveTextContent('2');
      });

      it('counts nothing for a missing sales report, a stale-alarm report or a covered one: the glance model decides, not the bar', () => {
        // An old alarm the server has let go (status info) and a report a task covers are not "to look at".
        h.tasks = [{ kind: 'du_otp' }];
        h.reports = [
          { kind: 'du_otp', status: 'attention' },
          { kind: 'ro_supply', status: 'info' },
        ];
        renderBar('/');
        expect(screen.getByRole('img', { name: '1 for you' })).toHaveTextContent('1');
      });
    });

    it('follows the data as it changes', () => {
      const view = renderBar('/');
      expect(screen.queryByRole('img', { name: '1 for you' })).not.toBeInTheDocument();
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
      expect(screen.getByRole('img', { name: '1 for you' })).toBeInTheDocument();
    });
  });
});

describe('TabBar for someone planning a pump (ADR 0058)', () => {
  it('has only Today and Chats: no Reports, and no Kavach even where the answer says on', () => {
    h.kavach = { on: true, now: [] };
    signIn({ id: 'owner', dealerStatus: 'PLANNING' });
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(<TabBar />, { route: '/', withRouter: true });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Today', 'Chat']);
  });
});
