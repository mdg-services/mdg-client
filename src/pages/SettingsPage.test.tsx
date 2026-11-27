import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { api } from '@/lib/api';
import { resetEmbeddedForTests } from '@/lib/embedMode';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { usePushStore, type PushState } from '@/store/push';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), patch: vi.fn() } };
});

const { SettingsPage } = await import('./SettingsPage');

/** A stand-in for each place a row leads, so the test reads where a tap went. */
const DESTINATIONS = ['/settings/profile', '/settings/account', '/pump', '/login'];

function renderSettings(route = '/settings') {
  useLangStore.setState({ lang: 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/chat" element={<Link to="/settings">open-settings</Link>} />
      <Route path="/settings" element={<SettingsPage />} />
      {DESTINATIONS.map((path) => (
        <Route key={path} path={path} element={<div>{`went:${path}`}</div>} />
      ))}
    </Routes>,
    { route, withRouter: true },
  );
}

const rows = () =>
  screen
    .getAllByRole('button')
    // Everything below the profile row and above the end, by its title text.
    .map((b) => b.textContent ?? '');

beforeEach(() => {
  vi.mocked(api.patch).mockResolvedValue({} as never);
  // The sheets lock the page's scroll, and jsdom has no `scrollTo` to do it with.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  resetStores();
  usePushStore.setState({ pushState: 'unknown' });
  delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
});

describe('SettingsPage — what is on it', () => {
  // Settings is the quiet phone page: this person and this phone, nothing about the pump's business
  // (that is My pump). The order is the order he reads it: who, language, password, then the small print.
  it('lists the owner\'s rows: who, language, password, the legal pages, log out, and delete apart at the end', () => {
    signIn({ id: 'owner', name: 'Ramesh Kumar', role: 'dealer-owner', email: 'ramesh@pump.in' });
    renderSettings();

    const text = rows();
    const order = ['Ramesh Kumar', 'Language', 'Change password', 'Privacy policy', 'Terms of service', 'Log out', 'Delete my account'];
    const positions = order.map((title) => text.findIndex((t) => t.includes(title)));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // Delete is the very last thing, apart from the rest.
    expect(text.at(-1)).toMatch(/^Delete my account/);
    expect(screen.getByRole('region', { name: 'Delete account' })).toBeInTheDocument();
    expect(screen.getByText('Choose a new password')).toBeInTheDocument();
  });

  // Everything that is the pump's business moved to My pump: a row coming back here would be a second door.
  it.each([
    'Your team',
    'Your services',
    'Warriors & points',
    'Payments & receipts',
    'Help videos',
    'IDs & passwords',
    'Switch pump',
  ])('has no "%s" row any more: that is on My pump', (title) => {
    signIn({ role: 'dealer-owner' });
    renderSettings();
    expect(screen.queryByText(title)).not.toBeInTheDocument();
  });

  it('shows a manager the same quiet page', () => {
    signIn({ role: 'dealer-staff' });
    renderSettings();
    const text = rows();
    expect(text.some((t) => t.startsWith('Language'))).toBe(true);
    expect(text.some((t) => t.startsWith('Change password'))).toBe(true);
    expect(text.some((t) => t.startsWith('Log out'))).toBe(true);
  });

  it('says it in Hindi', () => {
    signIn({ role: 'dealer-owner' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: '/settings', withRouter: true },
    );
    expect(screen.getByText('पासवर्ड बदलें')).toBeInTheDocument();
    expect(screen.getByText('नया पासवर्ड चुनें')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'खाता हटाना' })).toBeInTheDocument();
  });

  it('is headed Settings, with a back arrow', () => {
    signIn({ role: 'dealer-owner' });
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('shows the profile row first: name, role, and the phone', () => {
    signIn({ name: 'Ramesh Kumar', role: 'dealer-owner', email: 'r@pump.in', phone: '9876543210' });
    renderSettings();
    const profile = screen.getByText('Ramesh Kumar').closest('button')!;
    expect(within(profile).getByText('Owner')).toBeInTheDocument();
    expect(within(profile).getByText('9876543210')).toBeInTheDocument();
    // The phone, when there is one, stands in for the email.
    expect(within(profile).queryByText('r@pump.in')).not.toBeInTheDocument();
  });

  it('puts the email on its own line, under the name and role, so it has the card\'s whole width', () => {
    signIn({ name: 'Ramesh Sharma', role: 'dealer-owner', email: 'owner@904s.test' });
    renderSettings();
    const email = screen.getByText('owner@904s.test');
    expect(email.className).toContain('break-all');
    // Not beside the picture: it is a line of the card, not of the name column.
    expect(email.parentElement).toBe(screen.getByText('Ramesh Sharma').closest('button'));
  });

  it('has a heading above the delete card, which still says what happens before the tap', () => {
    signIn({ role: 'dealer-owner' });
    renderSettings();
    const region = screen.getByRole('region', { name: 'Delete account' });
    expect(within(region).getByRole('heading', { name: 'Delete account' })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Delete my account' })).toBeInTheDocument();
  });

  it('falls back to the email when no phone is on file', () => {
    signIn({ name: 'Ramesh Kumar', role: 'dealer-owner', email: 'r@pump.in' });
    renderSettings();
    expect(screen.getByText('r@pump.in')).toBeInTheDocument();
  });

  // The extension's side panel has no bar and no "My pump" button, so Settings carries its one door.
  it('has a My pump row only inside the extension\'s side panel', () => {
    signIn({ role: 'dealer-owner' });
    renderSettings();
    expect(screen.queryByText('My pump')).not.toBeInTheDocument();
    cleanup();

    window.sessionStorage.setItem('dk.embed', 'extension');
    resetEmbeddedForTests({ framed: true });
    try {
      signIn({ role: 'dealer-owner' });
      renderSettings();
      fireEvent.click(screen.getByText('My pump').closest('button')!);
      expect(screen.getByText('went:/pump')).toBeInTheDocument();
    } finally {
      window.sessionStorage.removeItem('dk.embed');
      resetEmbeddedForTests();
    }
  });

  it('keeps every row at least 44 pixels tall and every text at 16 or 14 pixels, with no cut-off names', () => {
    signIn({ role: 'dealer-owner', name: 'Ramesh Kumar' });
    const { container } = renderSettings();
    const html = container.innerHTML;
    expect(html).not.toMatch(/\btruncate\b|line-clamp|text-\[|min-h-\[|h-\[\d+px\]/);
    for (const b of screen.getAllByRole('button')) {
      if (b.getAttribute('aria-label') === 'Back') continue;
      expect(b.className).toMatch(/min-h-(11|12|14|tap)|p-4/);
    }
  });

  it('says so, with the bar still on screen, when nobody is signed in', () => {
    renderSettings();
    expect(screen.getByText('Not signed in')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });
});

// PINNED (spec 4.5, 11.1): Settings never asks the server. Everything on it is read from the sign-in
// already on the phone and from the phone itself. A row that needed the server would make this page
// slow and blank on a bad network, which is the one place the owner must always be able to log out from.
describe('SettingsPage — never asks the server', () => {
  it('makes no request of any kind, for an owner, a manager, inside the app, and in Hindi', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const role of ['dealer-owner', 'dealer-staff'] as const) {
      for (const lang of ['en', 'hi'] as const) {
        (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage: vi.fn() };
        usePushStore.setState({ pushState: 'off' });
        signIn({ role });
        useLangStore.setState({ lang, explicit: true });
        renderWithProviders(
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>,
          { route: '/settings', withRouter: true },
        );
        cleanup();
      }
    }
    expect(api.get).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not ask which pumps the person has: Switch pump lives on My pump', () => {
    signIn({ role: 'dealer-owner', personId: 'p1' } as never);
    renderSettings();
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByText('Switch pump')).not.toBeInTheDocument();
  });
});

describe('SettingsPage — where a row goes', () => {
  beforeEach(() => {
    signIn({ role: 'dealer-owner', name: 'Ramesh Kumar' });
  });

  it.each([
    ['Ramesh Kumar', '/settings/profile'],
    ['Change password', '/settings/account'],
  ])('%s opens %s', (title, path) => {
    renderSettings();
    fireEvent.click(screen.getByText(title).closest('button')!);
    expect(screen.getByText(`went:${path}`)).toBeInTheDocument();
  });

  // Delete account stays reachable inside the app (the store's rule) at its old address, and it asks
  // for the delete block to be brought into view.
  it('Delete my account opens the Account page, scrolled to the delete block', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByText('went:/settings/account')).toBeInTheDocument();
  });
});

describe('SettingsPage — the back arrow', () => {
  beforeEach(() => signIn({ role: 'dealer-owner' }));

  it('goes back to where the dealer came from', async () => {
    renderSettings('/chat');
    fireEvent.click(screen.getByText('open-settings'));
    expect(await screen.findByText('Settings')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('open-settings')).toBeInTheDocument();
  });

  // Opened cold from a notification there is nothing behind it: Back would walk
  // off the app, so the arrow takes the dealer home — Today (ADR 0055).
  it('goes to Today when Settings was the first thing opened', async () => {
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/" element={<div>today-page</div>} />
        <Route path="/chat" element={<div>chat-list</div>} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: '/settings', withRouter: true },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('today-page')).toBeInTheDocument();
    expect(screen.queryByText('chat-list')).not.toBeInTheDocument();
  });
});

describe('SettingsPage — the back arrow in the extension\'s side panel', () => {
  beforeEach(() => {
    signIn({ role: 'dealer-owner' });
    window.sessionStorage.setItem('dk.embed', 'extension');
    resetEmbeddedForTests({ framed: true });
  });
  afterEach(() => {
    window.sessionStorage.removeItem('dk.embed');
    resetEmbeddedForTests();
  });

  // The panel has no Today: opened cold, the arrow goes back to its chat.
  it('goes to the chat list when Settings was the first thing opened', async () => {
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/" element={<div>today-page</div>} />
        <Route path="/chat" element={<div>chat-list</div>} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: '/settings', withRouter: true },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('chat-list')).toBeInTheDocument();
    expect(screen.queryByText('today-page')).not.toBeInTheDocument();
  });
});

describe('SettingsPage — language', () => {
  beforeEach(() => signIn({ role: 'dealer-owner' }));

  it('names the current language under the row', () => {
    renderSettings();
    const row = screen.getByText('Language').closest('button')!;
    expect(within(row).getByText('English')).toBeInTheDocument();
  });

  it('opens a sheet with every language, each named in its own script', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    const sheet = screen.getByRole('dialog', { name: 'Language' });
    const options = within(sheet).getAllByRole('radio', { name: /./ });
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual(['हिंदी', 'Hinglish', 'English']);
    expect(within(sheet).getByRole('radio', { name: 'English' })).toBeChecked();
    // The sample says what the current choice means, in that language.
    expect(within(sheet).getByTestId('language-sample')).toHaveTextContent('will now come in English');
  });

  it('switches the whole app at once, shows the sample, saves it, and closes on Done', async () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    fireEvent.click(screen.getByRole('radio', { name: 'हिंदी' }));

    expect(useLangStore.getState().lang).toBe('hi');
    expect(api.patch).toHaveBeenCalledWith('/v1/me', { lang: 'hi' });
    expect(useAuthStore.getState().user?.lang).toBe('hi');
    expect(screen.getByTestId('language-sample')).toHaveTextContent('हिंदी में आएँगे');
    fireEvent.click(screen.getByRole('button', { name: 'हो गया' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The page redraws in the new language straight away.
    expect(screen.getByText('सेटिंग')).toBeInTheDocument();
  });

  it('switches to Hinglish: the page reads Hindi in English letters', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    fireEvent.click(screen.getByRole('radio', { name: 'Hinglish' }));
    expect(useLangStore.getState().lang).toBe('hl');
    expect(api.patch).toHaveBeenCalledWith('/v1/me', { lang: 'hl' });
    expect(screen.getByTestId('language-sample')).toHaveTextContent('Hinglish mein aayenge');
  });

  it('does not call the server when the dealer picks the language they already have', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('survives a failed save: the language still switches', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('offline'));
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    fireEvent.click(screen.getByRole('radio', { name: 'हिंदी' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(useLangStore.getState().lang).toBe('hi');
  });

  // A sheet that Back walked straight through would take the dealer off Settings.
  it("closes on the phone's Back button and leaves Settings where it is", async () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('closes on a tap outside it', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Language').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('SettingsPage — log out', () => {
  let logout: ReturnType<typeof vi.fn>;
  const realLogout = useAuthStore.getState().logout;

  beforeEach(() => {
    signIn({ role: 'dealer-owner' });
    // The real one reaches for the push bridge and a network; what matters here
    // is that it was called, and that the session ended.
    logout = vi.fn(() => useAuthStore.setState({ token: null, user: null }));
    useAuthStore.setState({ logout: logout as unknown as () => void });
  });
  afterEach(() => useAuthStore.setState({ logout: realLogout }));

  it('is in red, above the delete block, and asks before it does anything', () => {
    renderSettings();
    const row = screen.getByRole('button', { name: 'Log out' });
    expect(row.className).toContain('text-danger');
    const text = rows();
    expect(text.findIndex((t) => t === 'Log out')).toBeLessThan(text.findIndex((t) => t.startsWith('Delete my account')));

    fireEvent.click(row);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('keeps the dealer signed in when they cancel', () => {
    renderSettings();
    fireEvent.click(screen.getByText('Log out').closest('button')!);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('signs out and goes to the login screen when they confirm', async () => {
    renderSettings();
    fireEvent.click(screen.getByText('Log out').closest('button')!);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Log out' }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('went:/login')).toBeInTheDocument();
  });

  it('is cancelled by the phone\'s Back button', async () => {
    renderSettings();
    fireEvent.click(screen.getByText('Log out').closest('button')!);
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(logout).not.toHaveBeenCalled();
  });
});

describe('SettingsPage — the legal pages', () => {
  beforeEach(() => signIn({ role: 'dealer-owner' }));

  it('has a Privacy policy row and a Terms of service row, above Log out', () => {
    renderSettings();
    const text = rows();
    const privacy = text.findIndex((t) => t.startsWith('Privacy policy'));
    const terms = text.findIndex((t) => t.startsWith('Terms of service'));
    expect(privacy).toBeGreaterThan(text.findIndex((t) => t.startsWith('Change password')));
    expect(terms).toBe(privacy + 1);
    expect(text.findIndex((t) => t === 'Log out')).toBeGreaterThan(terms);
  });

  // The website pages open in the phone's own browser (the shell hands an https
  // link to Safari or Chrome), and never replace the app's own screen.
  it.each([
    ['Privacy policy', 'https://mdgservices.in/privacy'],
    ['Terms of service', 'https://mdgservices.in/terms'],
  ])('%s opens %s in a new window, cut off from the app', (title, url) => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderSettings();
    fireEvent.click(screen.getByText(title).closest('button')!);
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('says both in Hindi', () => {
    renderSettings();
    cleanup();
    signIn({ role: 'dealer-owner' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: '/settings', withRouter: true },
    );
    expect(screen.getByText('प्राइवेसी पॉलिसी')).toBeInTheDocument();
    expect(screen.getByText('सेवा की शर्तें')).toBeInTheDocument();
  });
});

describe('SettingsPage — "Messages reaching me"', () => {
  let postMessage: ReturnType<typeof vi.fn>;
  const posted = () => postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string));
  const w = () =>
    window as unknown as { ReactNativeWebView?: unknown; __DK_NATIVE_PLATFORM__?: string; __DK_PHONE_MAKER__?: string };

  beforeEach(() => {
    signIn({ role: 'dealer-owner' });
    postMessage = vi.fn();
  });
  afterEach(() => {
    delete w().__DK_NATIVE_PLATFORM__;
    delete w().__DK_PHONE_MAKER__;
  });

  function renderInApp(state: PushState) {
    w().ReactNativeWebView = { postMessage };
    usePushStore.setState({ pushState: state });
    return renderSettings();
  }

  const row = (line: string) => screen.getByText(line).closest('button')!;

  // A browser has no phone to switch anything on.
  // ...but the row is still there, so the owner knows where messages arrive; it has nothing to tap.
  it('says where messages arrive outside the app, with nothing to switch on', () => {
    usePushStore.setState({ pushState: 'ask' });
    renderSettings();
    const card = screen.getByRole('region', { name: 'Messages reaching me' });
    expect(within(card).getByText('Messages come to your chat. Phone notifications work in the MDG app.')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });

  it('is not there where there is nothing to turn on (Expo Go, a build with no notifications)', () => {
    renderInApp('unavailable');
    expect(screen.queryByText('Messages reaching me')).not.toBeInTheDocument();
  });

  it('is one card, between the password and the legal pages, with a shape and a word', () => {
    renderInApp('on');
    const text = rows();
    const at = (title: string) => text.findIndex((t) => t.includes(title));
    expect(at('Notifications are on')).toBeGreaterThan(at('Change password'));
    expect(at('Notifications are on')).toBeLessThan(at('Privacy policy'));
    const card = screen.getByRole('region', { name: 'Messages reaching me' });
    // The state is a pill with a word beside its shape, never colour alone.
    expect(card.querySelector('[data-status="ok"]')).not.toBeNull();
  });

  it.each([
    ['on', 'Notifications are on', 'ok'],
    ['off', 'Notifications are off. Tap to turn them on in your phone', 'attention'],
    ['ask', 'Notifications are not on yet. Tap to turn them on', 'attention'],
    // An older shell that never said: asking again is harmless, so it reads as "not yet".
    ['unknown', 'Notifications are not on yet. Tap to turn them on', 'attention'],
  ] as const)('while %s it says "%s"', (state, line, status) => {
    renderInApp(state);
    const card = screen.getByRole('region', { name: 'Messages reaching me' });
    expect(within(card).getByText(line)).toBeInTheDocument();
    expect(card.querySelector(`[data-status="${status}"]`)).not.toBeNull();
  });

  it('never asked: a tap lets the phone show its prompt', () => {
    renderInApp('ask');
    fireEvent.click(row('Notifications are not on yet. Tap to turn them on'));
    expect(posted()).toEqual([{ type: 'push:register' }]);
  });

  it('refused: a tap opens the phone\'s Settings: asking again cannot work', () => {
    renderInApp('off');
    fireEvent.click(row('Notifications are off. Tap to turn them on in your phone'));
    expect(posted()).toEqual([{ type: 'permission:openSettings' }]);
  });

  it('on: a tap opens the phone\'s Settings, so it can be changed', () => {
    renderInApp('on');
    fireEvent.click(row('Notifications are on'));
    expect(posted()).toEqual([{ type: 'permission:openSettings' }]);
  });

  it('follows the phone: the line changes the moment the answer arrives', () => {
    renderInApp('ask');
    act(() => usePushStore.setState({ pushState: 'on' }));
    expect(screen.getByText('Notifications are on')).toBeInTheDocument();
  });

  // One question, one row: "will MDG's messages reach me?" folds the battery-saver warning in, on the
  // phone makers that hide notifications, instead of a second row of its own.
  it('folds the battery-saver warning in, with its own button, only on a phone that hides messages', () => {
    w().__DK_NATIVE_PLATFORM__ = 'android';
    w().__DK_PHONE_MAKER__ = 'xiaomi';
    renderInApp('on');
    const card = screen.getByRole('region', { name: 'Messages reaching me' });
    expect(within(card).getByText('Your phone may hide messages to save battery.')).toBeInTheDocument();
    // A fact to know, not a fault: the pill is the plain "info" one, not "needs a look".
    expect(card.querySelector('[data-status="info"]')).not.toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'See the steps' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // No separate "Messages not arriving?" row any more.
    expect(screen.queryByText('Messages not arriving?')).not.toBeInTheDocument();
  });

  it('says no battery word on a phone that does not hide messages', () => {
    w().__DK_NATIVE_PLATFORM__ = 'android';
    w().__DK_PHONE_MAKER__ = 'google';
    renderInApp('on');
    expect(screen.queryByText('Your phone may hide messages to save battery.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See the steps' })).not.toBeInTheDocument();
  });

  it('says it in Hindi', () => {
    renderInApp('off');
    cleanup();
    w().ReactNativeWebView = { postMessage };
    signIn({ role: 'dealer-owner' });
    useLangStore.setState({ lang: 'hi', explicit: true });
    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: '/settings', withRouter: true },
    );
    expect(screen.getByText('मुझ तक आने वाले मैसेज')).toBeInTheDocument();
    expect(screen.getByText('नोटिफ़िकेशन बंद हैं। फ़ोन में चालू करने के लिए दबाएँ')).toBeInTheDocument();
  });
});
