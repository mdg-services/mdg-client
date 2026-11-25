import { act, fireEvent, screen } from '@testing-library/react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { markAccountHere } from '@/features/auth/firstScreen';
import { useOpenReport } from '@/features/reports/reportNav';
import { resetEmbeddedForTests } from '@/lib/embedMode';
import { requirePasswordChange, useAuthStore } from '@/store/auth';
import { makeUser, renderWithProviders, resetStores, signIn } from '@/test/utils';

import { App } from './App';

// Stub the lazy route chunks so the router resolves without loading real pages.
// The shell also hosts the report overlay, as the real one does, and says whether the tab bar
// has been asked to step aside. Its sockets and hooks are tested in `AppShell.test.tsx`.
vi.mock('@/AppShell', async () => {
  const { Outlet } = await import('react-router-dom');
  const { ReportHost } = await import('@/features/reports/ReportHost');
  const { useTabBarHidden } = await import('@/features/tabs/tabBarVisibility');
  function Shell() {
    const hidden = useTabBarHidden();
    return (
      <div data-testid="shell" data-tabs-hidden={hidden}>
        <Outlet />
        <ReportHost />
      </div>
    );
  }
  return { AppShell: Shell };
});
// The overlay is tested on its own (`ReportOverlay.test.tsx`); here it is a probe that hands back
// what the host gave it and presses each of its buttons.
vi.mock('@/features/reports/ReportOverlay', () => ({
  ReportOverlay: (props: {
    conversationId: string;
    messageId: string;
    placeholder?: { messageId: string };
    onClose: () => void;
    onOpenNewer: (t: { conversationId: string; messageId: string }) => void;
    onSeeInChat: (t: { conversationId: string; messageId: string }) => void;
    onGoToday: () => void;
  }) => (
    <div
      data-testid="overlay"
      data-cid={props.conversationId}
      data-mid={props.messageId}
      data-placeholder={props.placeholder?.messageId ?? ''}
    >
      <button type="button" onClick={props.onClose}>
        overlay-close
      </button>
      <button type="button" onClick={() => props.onOpenNewer({ conversationId: 'c2', messageId: 'newer' })}>
        overlay-newer
      </button>
      <button
        type="button"
        onClick={() => props.onSeeInChat({ conversationId: props.conversationId, messageId: props.messageId })}
      >
        overlay-chat
      </button>
      <button type="button" onClick={props.onGoToday}>
        overlay-today
      </button>
    </div>
  ),
}));
const socketEmit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/socket', () => ({ getSocket: () => ({ emit: socketEmit }) }));
vi.mock('@/pages/ReportsPage', () => ({
  ReportsPage: () => {
    const open = useOpenReport();
    return (
      <div>
        <span>reports-page</span>
        <button type="button" onClick={() => open({ conversationId: 'c1', messageId: 'from-list' })}>
          open-from-list
        </button>
      </div>
    );
  },
}));
vi.mock('@/pages/ChatListPage', () => ({
  ChatListPage: () => <div>chat-list-page</div>,
}));
vi.mock('@/pages/TodayPage', () => ({ TodayPage: () => <div>today-page</div> }));
// The thread keeps a counter and says where the router thinks it is, so a test can tell the
// screen stayed MOUNTED (the counter survives) under an overlay.
vi.mock('@/pages/ChatPage', () => ({
  ChatPage: () => {
    const [taps, setTaps] = React.useState(0);
    const open = useOpenReport();
    const loc = useLocation();
    return (
      <div>
        <span>chat-page</span>
        <span data-testid="chat-taps">{taps}</span>
        <span data-testid="chat-jump">
          {(loc.state as { jumpToMessageId?: string } | null)?.jumpToMessageId ?? ''}
        </span>
        <button type="button" onClick={() => setTaps((n) => n + 1)}>
          tap-in-chat
        </button>
        <button type="button" onClick={() => open({ conversationId: 'c1', messageId: 'm1' })}>
          open-report
        </button>
      </div>
    );
  },
}));
vi.mock('@/pages/ChatMediaPage', () => ({ ChatMediaPage: () => <div>chat-media-page</div> }));
vi.mock('@/pages/ChatInfoPage', () => ({ ChatInfoPage: () => <div>chat-info-page</div> }));
vi.mock('@/pages/SettingsPage', () => ({ SettingsPage: () => <div>settings-page</div> }));
vi.mock('@/pages/settings/ProfileInfoPage', () => ({
  SettingsProfilePage: () => <div>settings-profile-page</div>,
}));
vi.mock('@/pages/settings/AccountPage', () => ({
  SettingsAccountPage: () => <div>settings-account-page</div>,
}));
vi.mock('@/pages/settings/TeamPage', () => ({
  SettingsTeamPage: () => <div>settings-team-page</div>,
}));
vi.mock('@/pages/ServicesPage', () => ({ ServicesPage: () => <div>services-page</div> }));
vi.mock('@/pages/StaffPage', () => ({ StaffPage: () => <div>staff-page</div> }));
vi.mock('@/features/payments/PaymentsPage', () => ({
  PaymentsPage: () => <div>payments-page</div>,
}));
vi.mock('@/features/payments/PaymentDetailPage', () => ({
  PaymentDetailPage: () => <div>payment-detail-page</div>,
}));
// The redirect the four retired screens' addresses run is tested on its own
// (`OpenMyChat.test.tsx`); here it only has to be the thing those routes mount.
vi.mock('@/features/chat/OpenMyChat', () => ({ OpenMyChat: () => <div>open-my-chat</div> }));
vi.mock('@/pages/RegisterPage', () => ({ RegisterPage: () => <div>register-page</div> }));
// The screen itself is tested on its own (`ForcedPasswordChange.test.tsx`); here
// it only has to be what the gate shows.
vi.mock('@/features/auth/ForcedPasswordChange', () => ({
  ForcedPasswordChange: () => <div>forced-password-change</div>,
}));
vi.mock('@/pages/LoginPage', async () => {
  const { useLocation } = await import('react-router-dom');
  return {
    LoginPage: () => {
      const loc = useLocation();
      return (
        <div>
          login-page
          <span data-testid="from">{(loc.state as { from?: string } | null)?.from ?? ''}</span>
        </div>
      );
    },
  };
});

describe('App routing', () => {
  // A phone someone has signed in on before: a signed-out visit goes to Sign in.
  beforeEach(() => markAccountHere());
  afterEach(() => resetStores());

  it('opens on Register on a phone nobody has signed in on, and on Sign in once someone has', async () => {
    localStorage.clear();
    const fresh = renderWithProviders(<App />, { route: '/', withRouter: true });
    expect(await screen.findByText('register-page')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    fresh.unmount();

    // A real sign-in marks the phone; signing out later does not unmark it.
    useAuthStore.getState().login({ token: 'test-token', user: makeUser() });
    useAuthStore.getState().logout();
    renderWithProviders(<App />, { route: '/', withRouter: true });
    expect(await screen.findByText('login-page')).toBeInTheDocument();
  });

  it('redirects an unauthenticated visit to /login carrying the from path', async () => {
    renderWithProviders(<App />, { route: '/settings', withRouter: true });
    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('from')).toHaveTextContent('/settings');
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  it('renders the shell + a per-thread ChatPage via the Outlet when authenticated', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/chat/c1' });
    expect(await screen.findByTestId('shell')).toBeInTheDocument();
    expect(await screen.findByText('chat-page')).toBeInTheDocument();
  });

  // ADR 0055: the app opens on Today; the conversation list is the Chats tab.
  it('maps "/" to Today under the protected layout', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/' });
    expect(await screen.findByText('today-page')).toBeInTheDocument();
    expect(screen.queryByText('chat-list-page')).not.toBeInTheDocument();
  });

  it('keeps the conversation list at /chat', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/chat' });
    expect(await screen.findByText('chat-list-page')).toBeInTheDocument();
    expect(screen.queryByText('today-page')).not.toBeInTheDocument();
  });

  it('sends /today to Today, without keeping it in the history', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/today' });
    expect(await screen.findByText('today-page')).toBeInTheDocument();
  });

  // The other form of the old-style link a notification carries: `/chat?c=<id>`
  // is forwarded by the list itself (ChatListPage.test.tsx), `/?c=<id>` by the front door.
  it('sends an old-style /?c=<id> link on into the thread', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/?c=conv-9' });
    expect(await screen.findByText('chat-page')).toBeInTheDocument();
    expect(screen.queryByText('today-page')).not.toBeInTheDocument();
  });

  it('does not trust an /?c= value that is not a conversation id', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/?c=../../settings' });
    expect(await screen.findByText('today-page')).toBeInTheDocument();
    expect(screen.queryByText('settings-page')).not.toBeInTheDocument();
  });

  it('sends unknown paths to Today via the catch-all', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/nope-nowhere' });
    expect(await screen.findByText('today-page')).toBeInTheDocument();
  });

  // The Reports tab is gone, and so is its page. A link to it that is already on
  // a phone must land somewhere kind, not on a blank screen.
  it('sends the retired /records to Today', async () => {
    signIn();
    renderWithProviders(<App />, { route: '/records' });
    expect(await screen.findByText('today-page')).toBeInTheDocument();
  });

  it('serves a thread\'s media gallery and its info page inside the shell', async () => {
    signIn();
    const media = renderWithProviders(<App />, { route: '/chat/c1/media' });
    expect(await screen.findByText('chat-media-page')).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    media.unmount();

    renderWithProviders(<App />, { route: '/chat/c1/info' });
    expect(await screen.findByText('chat-info-page')).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });

  // `/profile` was the Profile tab. It is a second mount of Settings, not a
  // redirect, so nothing about the link is lost on the way.
  it.each(['/settings', '/profile'])('shows Settings at %s', async (route) => {
    signIn();
    renderWithProviders(<App />, { route });
    expect(await screen.findByText('settings-page')).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });

  it.each([
    ['/settings/profile', 'settings-profile-page'],
    ['/settings/account', 'settings-account-page'],
    ['/settings/team', 'settings-team-page'],
  ])('serves the Settings sub-page %s', async (route, marker) => {
    signIn();
    renderWithProviders(<App />, { route });
    expect(await screen.findByText(marker)).toBeInTheDocument();
  });

  // The feature pages that survive keep the path they always had, because pushes
  // already on phones name them.
  it.each([
    ['/services', 'services-page'],
    ['/staff', 'staff-page'],
  ])('keeps %s', async (route, marker) => {
    signIn();
    renderWithProviders(<App />, { route });
    expect(await screen.findByText(marker)).toBeInTheDocument();
  });

  // Payments (ADR 0022): two screens in the signed-in shell, reached by address
  // only — no menu or Settings row points at them yet.
  it.each([
    ['/payments', 'payments-page'],
    ['/payments/p1', 'payment-detail-page'],
  ])('serves the payments screen %s inside the shell', async (route, marker) => {
    signIn();
    renderWithProviders(<App />, { route });
    expect(await screen.findByText(marker)).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });

  it.each(['/payments', '/payments/p1'])(
    'does not serve %s to someone who is signed out',
    async (route) => {
      renderWithProviders(<App />, { route });
      expect(await screen.findByText('login-page')).toBeInTheDocument();
      expect(screen.queryByText('payments-page')).not.toBeInTheDocument();
      expect(screen.queryByText('payment-detail-page')).not.toBeInTheDocument();
    },
  );

  // ASKS LIVE IN THE CHAT. The paper list, the density screen and Pump health are
  // gone, but a push or a link already out there still names them — each must
  // open the member's own chat (not the list, not a blank page), with or without
  // the `?ask=` a push used to carry.
  it.each(['/asks', '/documents', '/documents?ask=a1', '/density', '/kavach'])(
    'opens the member\'s own chat from the retired address %s',
    async (route) => {
      signIn();
      renderWithProviders(<App />, { route });
      expect(await screen.findByText('open-my-chat')).toBeInTheDocument();
      expect(screen.getByTestId('shell')).toBeInTheDocument();
    },
  );

  it('does not serve the retired screens to someone who is signed out', async () => {
    renderWithProviders(<App />, { route: '/documents' });
    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(screen.queryByText('open-my-chat')).not.toBeInTheDocument();
  });

  // Someone with no login yet has to reach the sign-up form, so it must not
  // sit behind the sign-in gate.
  it('serves /register signed out, without bouncing to /login', async () => {
    renderWithProviders(<App />, { route: '/register' });
    expect(await screen.findByText('register-page')).toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  // A temporary password (one MDG's team gave) has to be replaced before anything
  // else: the whole app is swapped for the new-password screen.
  describe('a member on a temporary password', () => {
    it.each(['/', '/chat', '/chat/c1', '/settings', '/services'])(
      'sees only the new-password screen at %s, with no shell behind it',
      async (route) => {
        signIn({ mustChangePassword: true });
        renderWithProviders(<App />, { route });
        expect(await screen.findByText('forced-password-change')).toBeInTheDocument();
        expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
        expect(screen.queryByText('chat-list-page')).not.toBeInTheDocument();
        expect(screen.queryByText('today-page')).not.toBeInTheDocument();
      },
    );

    it('gets the app the moment the password is replaced', async () => {
      const user = signIn({ mustChangePassword: true });
      renderWithProviders(<App />, { route: '/chat' });
      await screen.findByText('forced-password-change');
      act(() => useAuthStore.getState().setUser({ ...user, mustChangePassword: false }));
      expect(await screen.findByTestId('shell')).toBeInTheDocument();
      expect(screen.getByText('chat-list-page')).toBeInTheDocument();
      expect(screen.queryByText('forced-password-change')).not.toBeInTheDocument();
    });

    it('is sent there when any call is refused for it', async () => {
      signIn();
      renderWithProviders(<App />, { route: '/chat' });
      expect(await screen.findByTestId('shell')).toBeInTheDocument();
      act(() => requirePasswordChange());
      expect(await screen.findByText('forced-password-change')).toBeInTheDocument();
      expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
    });

    it('is not asked again once it is done', async () => {
      signIn({ mustChangePassword: false });
      renderWithProviders(<App />, { route: '/chat' });
      expect(await screen.findByTestId('shell')).toBeInTheDocument();
      expect(screen.queryByText('forced-password-change')).not.toBeInTheDocument();
    });

    it('still reaches the login and register screens signed out', async () => {
      renderWithProviders(<App />, { route: '/register' });
      expect(await screen.findByText('register-page')).toBeInTheDocument();
    });
  });

  // The extension's side panel has no Today and no tab bar: its sign-in and
  // register addresses still go to the chat list.
  describe('inside the extension\'s panel', () => {
    beforeEach(() => {
      window.sessionStorage.setItem('dk.embed', 'extension');
      resetEmbeddedForTests({ framed: true });
    });
    afterEach(() => {
      window.sessionStorage.removeItem('dk.embed');
      resetEmbeddedForTests();
    });

    it.each(['/login', '/register'])('sends %s to the chat list', async (route) => {
      signIn();
      renderWithProviders(<App />, { route });
      expect(await screen.findByText('chat-list-page')).toBeInTheDocument();
      expect(screen.queryByText('today-page')).not.toBeInTheDocument();
    });

    // No Today, no bar and no browser Back: the front door and every unknown address
    // land on the chat list, so the dealer is never left on a page with no way out.
    it.each(['/', '/today', '/nowhere/at/all'])('sends %s to the chat list, not to Today', async (route) => {
      signIn();
      renderWithProviders(<App />, { route });
      expect(await screen.findByText('chat-list-page')).toBeInTheDocument();
      expect(screen.queryByText('today-page')).not.toBeInTheDocument();
    });
  });

  it('serves /login without pulling the shell', async () => {
    renderWithProviders(<App />, { route: '/login' });
    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });
});

/** Where the router really is, and a Back button, for the report tests. */
function Rig() {
  const loc = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="real-path">{loc.pathname}</span>
      <button type="button" onClick={() => navigate(-1)}>
        phone-back
      </button>
    </div>
  );
}

// ADR 0056 §4: a report is drawn OVER the screen the dealer came from.
describe('a report over a screen', () => {
  beforeEach(() => {
    markAccountHere();
    socketEmit.mockReset();
  });
  afterEach(() => resetStores());

  function renderAt(route: string) {
    signIn();
    return renderWithProviders(
      <>
        <App />
        <Rig />
      </>,
      { route },
    );
  }

  describe('from the chat', () => {
    it('draws the overlay over the chat, which stays mounted beneath, and hides the tab bar', async () => {
      renderAt('/chat/c1');
      await screen.findByText('chat-page');
      fireEvent.click(screen.getByText('tap-in-chat'));
      fireEvent.click(screen.getByText('open-report'));
      expect(await screen.findByTestId('overlay')).toHaveAttribute('data-mid', 'm1');
      expect(screen.getByTestId('real-path')).toHaveTextContent('/report/c1/m1');
      // Still there, and still the same instance: the counter was not reset.
      expect(screen.getByText('chat-page')).toBeInTheDocument();
      expect(screen.getByTestId('chat-taps')).toHaveTextContent('1');
      expect(screen.queryByText('today-page')).not.toBeInTheDocument();
      expect(screen.getByTestId('shell')).toHaveAttribute('data-tabs-hidden', 'true');
    });

    it('closes back to the chat at the same place, with the bar back', async () => {
      renderAt('/chat/c1');
      await screen.findByText('chat-page');
      fireEvent.click(screen.getByText('tap-in-chat'));
      fireEvent.click(screen.getByText('tap-in-chat'));
      fireEvent.click(screen.getByText('open-report'));
      await screen.findByTestId('overlay');
      fireEvent.click(screen.getByText('overlay-close'));
      expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
      expect(screen.getByTestId('real-path')).toHaveTextContent('/chat/c1');
      expect(screen.getByTestId('chat-taps')).toHaveTextContent('2');
      expect(screen.getByTestId('shell')).toHaveAttribute('data-tabs-hidden', 'false');
    });

    it('the phone\'s Back does exactly what Close does', async () => {
      renderAt('/chat/c1');
      await screen.findByText('chat-page');
      fireEvent.click(screen.getByText('tap-in-chat'));
      fireEvent.click(screen.getByText('open-report'));
      await screen.findByTestId('overlay');
      fireEvent.click(screen.getByText('phone-back'));
      expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
      expect(screen.getByTestId('real-path')).toHaveTextContent('/chat/c1');
      expect(screen.getByTestId('chat-taps')).toHaveTextContent('1');
    });

    it('hands the overlay the row the opener held', async () => {
      renderAt('/chat/c1');
      await screen.findByText('chat-page');
      fireEvent.click(screen.getByText('open-report'));
      expect(await screen.findByTestId('overlay')).toHaveAttribute('data-placeholder', '');
    });

    it('"See in chat" just closes when the chat is already the screen beneath', async () => {
      renderAt('/chat/c1');
      await screen.findByText('chat-page');
      fireEvent.click(screen.getByText('open-report'));
      await screen.findByTestId('overlay');
      fireEvent.click(screen.getByText('overlay-chat'));
      expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
      expect(screen.getByTestId('real-path')).toHaveTextContent('/chat/c1');
    });
  });

  describe('one entry per overlay', () => {
    it('"See newer" REPLACES the overlay: one Back goes to the chat, not through the first report', async () => {
      renderAt('/chat/c1');
      await screen.findByText('chat-page');
      fireEvent.click(screen.getByText('open-report'));
      await screen.findByTestId('overlay');
      fireEvent.click(screen.getByText('overlay-newer'));
      expect(screen.getByTestId('real-path')).toHaveTextContent('/report/c2/newer');
      expect(screen.getByTestId('overlay')).toHaveAttribute('data-mid', 'newer');
      fireEvent.click(screen.getByText('phone-back'));
      expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
      expect(screen.getByTestId('real-path')).toHaveTextContent('/chat/c1');
    });

    it('still draws the screen the dealer started on beneath the replacing overlay', async () => {
      renderAt('/chat/c1');
      await screen.findByText('chat-page');
      fireEvent.click(screen.getByText('tap-in-chat'));
      fireEvent.click(screen.getByText('open-report'));
      await screen.findByTestId('overlay');
      fireEvent.click(screen.getByText('overlay-newer'));
      expect(screen.getByTestId('chat-taps')).toHaveTextContent('1');
    });

    it('"See in chat" from over another screen PUSHES the chat at the message, and Back returns to the report', async () => {
      renderAt('/reports');
      await screen.findByText('reports-page');
      fireEvent.click(screen.getByText('open-from-list'));
      await screen.findByTestId('overlay');
      fireEvent.click(screen.getByText('overlay-chat'));
      expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
      expect(screen.getByTestId('real-path')).toHaveTextContent('/chat/c1');
      expect(screen.getByTestId('chat-jump')).toHaveTextContent('from-list');
      fireEvent.click(screen.getByText('phone-back'));
      expect(await screen.findByTestId('overlay')).toHaveAttribute('data-mid', 'from-list');
      fireEvent.click(screen.getByText('overlay-close'));
      expect(screen.getByTestId('real-path')).toHaveTextContent('/reports');
      expect(screen.getByText('reports-page')).toBeInTheDocument();
    });
  });

  describe('from the Reports list', () => {
    it('is drawn over the list, which Close brings back as it was', async () => {
      renderAt('/reports');
      await screen.findByText('reports-page');
      fireEvent.click(screen.getByText('open-from-list'));
      await screen.findByTestId('overlay');
      expect(screen.getByText('reports-page')).toBeInTheDocument();
      fireEvent.click(screen.getByText('overlay-close'));
      expect(screen.getByTestId('real-path')).toHaveTextContent('/reports');
    });
  });

  describe('a cold open (a push that started the app, a pasted link)', () => {
    it('draws Today beneath, and Close goes to Today instead of leaving the app', async () => {
      renderAt('/report/c1/m1');
      expect(await screen.findByTestId('overlay')).toHaveAttribute('data-mid', 'm1');
      expect(screen.getByText('today-page')).toBeInTheDocument();
      fireEvent.click(screen.getByText('overlay-close'));
      expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
      expect(screen.getByTestId('real-path')).toHaveTextContent(/^\/$/);
      expect(screen.getByText('today-page')).toBeInTheDocument();
    });

    it('"Today\'s page" replaces the dead overlay', async () => {
      renderAt('/report/c1/m1');
      await screen.findByTestId('overlay');
      fireEvent.click(screen.getByText('overlay-today'));
      expect(screen.getByTestId('real-path')).toHaveTextContent(/^\/$/);
      expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
    });

    it('marks the report read as the overlay opens', async () => {
      renderAt('/report/c1/m1');
      await screen.findByTestId('overlay');
      expect(socketEmit).toHaveBeenCalledWith('read', { conversationId: 'c1', messageIds: ['m1'] });
    });

    it('survives a bad id in the address without breaking the router', async () => {
      renderAt('/report/c1');
      // Not a report address: it is an unknown path, and unknown paths go to Today.
      expect(await screen.findByText('today-page')).toBeInTheDocument();
      expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
    });
  });

  describe('signed out', () => {
    it('remembers the report\'s own address to come back to after sign-in', async () => {
      renderWithProviders(<App />, { route: '/report/c1/m1' });
      expect(await screen.findByText('login-page')).toBeInTheDocument();
      expect(screen.getByTestId('from')).toHaveTextContent('/report/c1/m1');
    });
  });

  describe('an old link from before the overlay', () => {
    it('opens the report for a Today entry that still carries `focusReport` (the 0055 button)', async () => {
      signIn();
      renderWithProviders(<App />, {
        route: { pathname: '/', state: { focusReport: 'rep-9', conversationId: 'c4' } } as never,
      });
      expect(await screen.findByTestId('overlay')).toHaveAttribute('data-mid', 'rep-9');
      expect(screen.getByTestId('overlay')).toHaveAttribute('data-cid', 'c4');
    });
  });

  describe('the Reports tab', () => {
    it('is served in the shell', async () => {
      renderAt('/reports');
      expect(await screen.findByText('reports-page')).toBeInTheDocument();
      expect(screen.getByTestId('shell')).toBeInTheDocument();
    });

    it('is not in the extension\'s panel, which has no tab bar: it goes to the chat list', async () => {
      window.sessionStorage.setItem('dk.embed', 'extension');
      resetEmbeddedForTests({ framed: true });
      try {
        renderAt('/reports');
        expect(await screen.findByText('chat-list-page')).toBeInTheDocument();
        expect(screen.queryByText('reports-page')).not.toBeInTheDocument();
      } finally {
        window.sessionStorage.removeItem('dk.embed');
        resetEmbeddedForTests();
      }
    });
  });

  describe('inside the extension\'s panel', () => {
    afterEach(() => {
      window.sessionStorage.removeItem('dk.embed');
      resetEmbeddedForTests();
    });

    it('draws the chat list beneath a report opened by address, not a Today the panel does not have', async () => {
      window.sessionStorage.setItem('dk.embed', 'extension');
      resetEmbeddedForTests({ framed: true });
      renderAt('/report/c1/m1');
      expect(await screen.findByTestId('overlay')).toBeInTheDocument();
      expect(screen.getByText('chat-list-page')).toBeInTheDocument();
      expect(screen.queryByText('today-page')).not.toBeInTheDocument();
    });
  });
});
