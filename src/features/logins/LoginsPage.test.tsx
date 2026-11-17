import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';

import type { LoginRow, LoginVersion, LoginsView } from './types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), put: vi.fn() } };
});

const { LoginsPage, } = await import('./LoginsPage');
const { SHOW_FOR_MS } = await import('./PasswordValue');

const LIST = '/v1/me/logins';

const line = (over: Partial<LoginVersion> & Pick<LoginVersion, 'id'>): LoginVersion => ({
  at: '2026-11-18T10:10:00.000Z',
  kind: 'saved',
  change: 'first',
  by: 'you',
  username: 'sdms-user',
  ...over,
});

const sdmsSaved = (over: Partial<LoginRow> = {}): LoginRow => ({
  portal: 'sdms',
  name: 'SDMS',
  needed: true,
  status: 'saved',
  username: 'sdms-user',
  savedAt: '2026-11-18T10:10:00.000Z',
  savedBy: 'you',
  history: [line({ id: 'v1' })],
  ...over,
});

const irasMissing = (over: Partial<LoginRow> = {}): LoginRow => ({
  portal: 'iras',
  name: 'IRAS',
  needed: true,
  status: 'missing',
  history: [],
  ...over,
});

/** What the server answers; tests change `current` to play a save. */
let current: LoginsView;
const PASSWORDS: Record<string, string> = { 'sdms:': 'Now#Pass-1', 'sdms:v1': 'Old#Pass-0', 'iras:': 'Iras#Pass', 'wemmis:': 'Bihar#Pass' };

beforeEach(() => {
  current = { rows: [sdmsSaved(), irasMissing()] };
  vi.mocked(api.get).mockImplementation((async (path: string) => {
    if (path !== LIST) throw new Error(`unexpected GET ${path}`);
    return current;
  }) as typeof api.get);
  vi.mocked(api.post).mockImplementation((async (path: string, body?: { versionId?: string }) => {
    const m = /^\/v1\/me\/logins\/(\w+)\/reveal$/.exec(path);
    if (!m) throw new Error(`unexpected POST ${path}`);
    const password = PASSWORDS[`${m[1]}:${body?.versionId ?? ''}`];
    if (!password) throw new ApiError(404, 'NOT_FOUND', 'nope');
    return { username: 'whoever', password };
  }) as typeof api.post);
  vi.mocked(api.put).mockResolvedValue({} as never);
});

afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

function renderPage(opts: { lang?: 'en' | 'hi' } = {}) {
  signIn({ id: 'u1', role: 'dealer-owner', dealerId: 'd1' });
  useLangStore.setState({ lang: opts.lang ?? 'en', explicit: true });
  return renderWithProviders(
    <Routes>
      <Route path="/settings/logins" element={<LoginsPage />} />
      <Route path="/settings" element={<div>went:settings</div>} />
    </Routes>,
    { route: '/settings/logins' },
  );
}

const card = async (portal: string) => within(await screen.findByTestId(`login-${portal}`));

describe('IDs & passwords page — what it shows', () => {
  it('lists each platform with its ID, and the password as dots (never the password itself)', async () => {
    renderPage();
    const sdms = await card('sdms');
    expect(sdms.getByText('SDMS')).toBeInTheDocument();
    expect(sdms.getByTestId('id-value')).toHaveTextContent('sdms-user');
    expect(sdms.getByTestId('password-value')).toHaveTextContent('••••••••');
    expect(document.body.textContent).not.toContain('Now#Pass-1');
    expect(sdms.getByText(/Saved .*2026.* · by you/)).toBeInTheDocument();
    // Nothing was asked for a password just by opening the page.
    expect(api.post).not.toHaveBeenCalled();
  });

  it('says who saved it: MDG’s team, or another owner by name', async () => {
    current = { rows: [sdmsSaved({ savedBy: 'mdg' }), irasMissing({ status: 'saved', username: 'i', savedBy: 'owner', savedAt: '2026-11-17T10:00:00.000Z' })] };
    renderPage();
    expect((await card('sdms')).getByText(/by MDG team/)).toBeInTheDocument();
    expect((await card('iras')).getByText(/by another owner/)).toBeInTheDocument();
  });

  it('shows the page in Hindi', async () => {
    renderPage({ lang: 'hi' });
    const sdms = await card('sdms');
    expect(sdms.getByText('मिल गया')).toBeInTheDocument();
    expect(sdms.getByText('बदलें')).toBeInTheDocument();
    expect(screen.getAllByText('आईडी और पासवर्ड').length).toBeGreaterThan(0);
  });

  it('says so when the list could not be loaded, and tries again on request', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockRejectedValueOnce(new Error('offline'));
    renderPage();
    expect(await screen.findByText(/Couldn't load this/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('SDMS')).toBeInTheDocument();
  });
});

describe('showing a password', () => {
  it('asks the server only at the tap, shows it, and hides it again on request', async () => {
    const user = userEvent.setup();
    renderPage();
    const sdms = await card('sdms');
    await user.click(sdms.getByRole('button', { name: 'Show password: SDMS' }));
    await waitFor(() => expect(sdms.getByTestId('password-value')).toHaveTextContent('Now#Pass-1'));
    expect(api.post).toHaveBeenCalledWith('/v1/me/logins/sdms/reveal', {});
    await user.click(sdms.getByRole('button', { name: 'Hide password: SDMS' }));
    expect(sdms.getByTestId('password-value')).toHaveTextContent('••••••••');
  });

  it('hides it by itself after half a minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    renderPage();
    const sdms = await card('sdms');
    await user.click(sdms.getByRole('button', { name: 'Show password: SDMS' }));
    await waitFor(() => expect(sdms.getByTestId('password-value')).toHaveTextContent('Now#Pass-1'));
    act(() => {
      vi.advanceTimersByTime(SHOW_FOR_MS + 100);
    });
    expect(sdms.getByTestId('password-value')).toHaveTextContent('••••••••');
  });

  it('says so, and keeps the dots, when the server will not show it', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'cannot open'));
    renderPage();
    const sdms = await card('sdms');
    await user.click(sdms.getByRole('button', { name: 'Show password: SDMS' }));
    expect(await sdms.findByRole('alert')).toHaveTextContent("Couldn't show it");
    expect(sdms.getByTestId('password-value')).toHaveTextContent('••••••••');
  });
});

describe('filling in a login that is not in yet', () => {
  it('opens the form by itself, and saves over the chat box’s own route', async () => {
    const user = userEvent.setup();
    renderPage();
    const iras = await card('iras');
    expect(iras.getByText('Not added yet')).toBeInTheDocument();
    await user.type(iras.getByLabelText('User ID'), '  iras-77 ');
    await user.type(iras.getByLabelText('Password'), 'Typed#Pass-9');
    // The server's answer after the save: the login is in, with its first line.
    current = { rows: [sdmsSaved(), irasMissing({ status: 'saved', username: 'iras-77', savedAt: '2026-11-18T11:00:00.000Z', savedBy: 'you', history: [line({ id: 'i1', username: 'iras-77' })] })] };
    await user.click(iras.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/v1/me/portal-logins/iras', { username: 'iras-77', password: 'Typed#Pass-9' }),
    );
    // The page asks again and now shows the ID and the dots, no form.
    expect(await iras.findByTestId('id-value')).toHaveTextContent('iras-77');
    expect(iras.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('will not save with a field empty', async () => {
    const user = userEvent.setup();
    renderPage();
    const iras = await card('iras');
    expect(iras.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(iras.getByLabelText('User ID'), 'only-id');
    expect(iras.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('tells the owner when this is the very password the portal turned away', async () => {
    const user = userEvent.setup();
    vi.mocked(api.put).mockRejectedValueOnce(new ApiError(409, 'PORTAL_LOGIN_SAME_AS_REFUSED', 'same'));
    renderPage();
    const iras = await card('iras');
    await user.type(iras.getByLabelText('User ID'), 'iras-77');
    await user.type(iras.getByLabelText('Password'), 'Dead#Pass');
    await user.click(iras.getByRole('button', { name: 'Save' }));
    expect(await iras.findByRole('alert')).toHaveTextContent('stopped working');
    // The dead password is cleared; the ID stays.
    expect(iras.getByLabelText('Password')).toHaveValue('');
    expect(iras.getByLabelText('User ID')).toHaveValue('iras-77');
  });

  it('a platform no service needs waits behind "Add it"', async () => {
    const user = userEvent.setup();
    current = { rows: [sdmsSaved(), irasMissing({ needed: false })] };
    renderPage();
    const iras = await card('iras');
    expect(iras.getByText('Not needed')).toBeInTheDocument();
    expect(iras.queryByLabelText('User ID')).not.toBeInTheDocument();
    await user.click(iras.getByRole('button', { name: 'Add it' }));
    expect(iras.getByLabelText('User ID')).toBeInTheDocument();
    await user.click(iras.getByRole('button', { name: 'Cancel' }));
    expect(iras.queryByLabelText('User ID')).not.toBeInTheDocument();
  });

  it('the eMaaptaul login saves over its own route', async () => {
    const user = userEvent.setup();
    current = { rows: [sdmsSaved(), { portal: 'wemmis', name: 'eMaaptaul', needed: true, status: 'missing', history: [] }] };
    renderPage();
    const w = await card('wemmis');
    await user.type(w.getByLabelText('User ID'), 'bihar');
    await user.type(w.getByLabelText('Password'), 'B#1');
    await user.click(w.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/v1/me/wemmis-login', { username: 'bihar', password: 'B#1' }));
  });
});

describe('a login the portal stopped accepting', () => {
  it('says so, has the ID in already, and wants only the new password', async () => {
    current = { rows: [sdmsSaved({ status: 'refused', refusedAt: '2026-11-18T09:00:00.000Z' }), irasMissing({ needed: false })] };
    renderPage();
    const sdms = await card('sdms');
    expect(sdms.getByText('Old password not working')).toBeInTheDocument();
    expect(sdms.getByText('SDMS did not accept this password. Type the new one.')).toBeInTheDocument();
    expect(sdms.getByLabelText('User ID')).toHaveValue('sdms-user');
    expect(sdms.getByLabelText('Password')).toHaveValue('');
  });
});

describe('changing a saved login', () => {
  it('opens with the ID and the password filled in, and saves what was changed', async () => {
    const user = userEvent.setup();
    renderPage();
    const sdms = await card('sdms');
    await user.click(sdms.getByRole('button', { name: 'Change' }));
    expect(api.post).toHaveBeenCalledWith('/v1/me/logins/sdms/reveal', {});
    const id = await sdms.findByLabelText('User ID');
    expect(id).toHaveValue('sdms-user');
    expect(sdms.getByLabelText('Password')).toHaveValue('Now#Pass-1');

    await user.clear(sdms.getByLabelText('Password'));
    await user.type(sdms.getByLabelText('Password'), 'Newer#Pass-2');
    await user.click(sdms.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/v1/me/portal-logins/sdms', { username: 'sdms-user', password: 'Newer#Pass-2' }),
    );
    // The form closes and the ID and dots are back.
    await waitFor(() => expect(sdms.queryByLabelText('Password')).not.toBeInTheDocument());
    expect(sdms.getByTestId('password-value')).toHaveTextContent('••••••••');
  });

  it('Cancel goes back without saving', async () => {
    const user = userEvent.setup();
    renderPage();
    const sdms = await card('sdms');
    await user.click(sdms.getByRole('button', { name: 'Change' }));
    await sdms.findByLabelText('User ID');
    await user.click(sdms.getByRole('button', { name: 'Cancel' }));
    expect(api.put).not.toHaveBeenCalled();
    expect(sdms.getByTestId('id-value')).toBeInTheDocument();
  });

  it('stays closed, with a message, when the current password cannot be opened', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'no'));
    renderPage();
    const sdms = await card('sdms');
    await user.click(sdms.getByRole('button', { name: 'Change' }));
    expect(await screen.findByText("Couldn't show it. Try again.")).toBeInTheDocument();
    expect(sdms.queryByLabelText('User ID')).not.toBeInTheDocument();
  });
});

describe('the history of a login', () => {
  const twoChanges = (): LoginRow =>
    sdmsSaved({
      username: 'new-id',
      history: [
        line({ id: 'v3', at: '2026-11-18T12:00:00.000Z', change: 'both', username: 'new-id', previousUsername: 'sdms-user', by: 'mdg' }),
        line({ id: 'v2', at: '2026-11-10T09:00:00.000Z', change: 'password', by: 'you' }),
        line({ id: 'v1', at: '2026-10-23T09:00:00.000Z', change: 'first', by: 'mdg' }),
      ],
    });

  it('is closed until asked for, then lists every change, newest first, with who and what', async () => {
    const user = userEvent.setup();
    current = { rows: [twoChanges(), irasMissing({ needed: false })] };
    renderPage();
    const sdms = await card('sdms');
    expect(sdms.queryByText('ID and password changed')).not.toBeInTheDocument();
    await user.click(sdms.getByRole('button', { name: /History \(3\)/ }));

    const items = within(sdms.getByRole('list', { name: 'SDMS' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText('ID and password changed')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Now')).toBeInTheDocument();
    expect(within(items[0]!).getByText('before: sdms-user')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/by MDG team/)).toBeInTheDocument();
    expect(within(items[1]!).getByText('Password changed')).toBeInTheDocument();
    expect(within(items[1]!).getByText(/by you/)).toBeInTheDocument();
    expect(within(items[2]!).getByText('Added')).toBeInTheDocument();
    expect(within(items[2]!).queryByText('Now')).not.toBeInTheDocument();
  });

  it('shows the password an old entry had, by asking for that entry', async () => {
    const user = userEvent.setup();
    current = { rows: [twoChanges(), irasMissing({ needed: false })] };
    renderPage();
    const sdms = await card('sdms');
    await user.click(sdms.getByRole('button', { name: /History \(3\)/ }));
    const items = within(sdms.getByRole('list', { name: 'SDMS' })).getAllByRole('listitem');
    await user.click(within(items[2]!).getByRole('button', { name: 'Show password: SDMS' }));
    // v1's password — not v3's, and not the one in use now.
    expect(api.post).toHaveBeenCalledWith('/v1/me/logins/sdms/reveal', { versionId: 'v1' });
    await waitFor(() => expect(within(items[2]!).getByTestId('password-value')).toHaveTextContent('Old#Pass-0'));
    expect(within(items[0]!).getByTestId('password-value')).toHaveTextContent('••••••••');
  });

  it('shows a removal as a line with nothing to show', async () => {
    const user = userEvent.setup();
    current = {
      rows: [
        sdmsSaved(),
        irasMissing({
          needed: false,
          history: [
            { id: 'r1', at: '2026-11-12T09:00:00.000Z', kind: 'removed', by: 'mdg' },
            line({ id: 'i1', username: 'i', at: '2026-11-01T09:00:00.000Z' }),
          ],
        }),
      ],
    };
    renderPage();
    const iras = await card('iras');
    await user.click(iras.getByRole('button', { name: /History \(2\)/ }));
    const items = within(iras.getByRole('list', { name: 'IRAS' })).getAllByRole('listitem');
    expect(within(items[0]!).getByText('Removed')).toBeInTheDocument();
    expect(within(items[0]!).queryByRole('button')).not.toBeInTheDocument();
    // Nothing is in use now, so no entry is marked "Now".
    expect(iras.queryByText('Now')).not.toBeInTheDocument();
  });

  it('a login with no history has no History button', async () => {
    current = { rows: [sdmsSaved({ history: [] }), irasMissing()] };
    renderPage();
    const sdms = await card('sdms');
    expect(sdms.queryByRole('button', { name: /History/ })).not.toBeInTheDocument();
  });
});
