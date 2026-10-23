import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { ApiError, api } from '@/lib/api';
import type * as NativeBridgeModule from '@/lib/nativeBridge';
import { queryClient as appQueryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { OutletChoice, User } from '@dk/shared/types';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});
const postToNative = vi.hoisted(() => vi.fn());
vi.mock('@/lib/nativeBridge', async (orig) => {
  const actual = await orig<typeof NativeBridgeModule>();
  return { ...actual, postToNative };
});

const { OutletChip } = await import('./OutletChip');
const { OutletSheet } = await import('./OutletSheet');
const { SettingsPage } = await import('@/pages/SettingsPage');
const { hasOtherOutlets } = await import('./useOutlets');

const FIRST: OutletChoice = { userId: 'u15', dealerId: 'd15', code: '15E', role: 'dealer-owner' };
const SECOND: OutletChoice = { userId: 'u16', dealerId: 'd16', code: '16E', role: 'dealer-owner' };
const TENTH: OutletChoice = { userId: 'u9', dealerId: 'd9', code: '9E', role: 'dealer-owner' };

function answerOutlets(view: { current: OutletChoice | null; outlets: OutletChoice[] }) {
  vi.mocked(api.get).mockImplementation(((path: string) =>
    path === '/v1/auth/outlets' ? Promise.resolve(view) : Promise.reject(new Error(`unexpected ${path}`))) as never);
}

const person = (over: Partial<User> = {}) => signIn({ id: 'u15', personId: 'p1', ...over });

beforeEach(() => {
  useLangStore.setState({ lang: 'en', explicit: true });
  // Sheets lock the page's scroll, and jsdom has no `scrollTo` to do it with.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  postToNative.mockReset();
});
afterEach(() => {
  resetStores();
});

describe('hasOtherOutlets', () => {
  it('needs a pump this login is in AND another to go to', () => {
    expect(hasOtherOutlets(undefined)).toBe(false);
    expect(hasOtherOutlets({ current: null, outlets: [SECOND] })).toBe(false);
    expect(hasOtherOutlets({ current: FIRST, outlets: [] })).toBe(false);
    expect(hasOtherOutlets({ current: FIRST, outlets: [SECOND] })).toBe(true);
  });
});

describe('OutletChip — "15E ▾" on the chat list', () => {
  it('draws nothing, and asks nothing, for a login that belongs to no person', async () => {
    signIn({ id: 'u1' });
    renderWithProviders(<OutletChip onOpen={() => undefined} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the pump’s code when the person has another pump, and opens on tap', async () => {
    person();
    answerOutlets({ current: FIRST, outlets: [SECOND] });
    const open = vi.fn();
    renderWithProviders(<OutletChip onOpen={open} />);
    const chip = await screen.findByRole('button', { name: 'Pump 15E. Tap to switch pump' });
    expect(chip).toHaveTextContent('15E');
    fireEvent.click(chip);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('is in Hindi when the dealer reads Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    person();
    answerOutlets({ current: FIRST, outlets: [SECOND] });
    renderWithProviders(<OutletChip onOpen={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'पंप 15E। पंप बदलने के लिए दबाइए' })).toBeInTheDocument();
  });

  it('draws nothing when the person has only this pump left', async () => {
    person();
    answerOutlets({ current: FIRST, outlets: [] });
    renderWithProviders(<OutletChip onOpen={() => undefined} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('OutletSheet', () => {
  it('lists the pumps by code, in the order a person reads them, marking the one they are in', async () => {
    person();
    answerOutlets({ current: FIRST, outlets: [SECOND, TENTH] });
    renderWithProviders(<OutletSheet onClose={() => undefined} />);
    const radios = await screen.findAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['9E', '15EYou are here', '16E']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });

  it('switches on one tap: posts the login’s id, signs in with the new token, tells the shell, reloads', async () => {
    person();
    answerOutlets({ current: FIRST, outlets: [SECOND] });
    const nextUser = { id: 'u16', name: 'Ramesh', role: 'dealer-owner', dealerId: 'd16', personId: 'p1' } as User;
    vi.mocked(api.post).mockResolvedValue({ token: 'token-16', user: nextUser, outlets: [FIRST] } as never);
    const onSwitched = vi.fn();
    renderWithProviders(<OutletSheet onClose={() => undefined} onSwitched={onSwitched} />);
    // the app's own cache, which the store's sign-in empties
    appQueryClient.setQueryData(['conversations', 'mine'], ['something from 15E']);

    fireEvent.click(await screen.findByRole('radio', { name: '16E' }));

    await waitFor(() => expect(onSwitched).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/v1/auth/switch-outlet', { userId: 'u16' });
    expect(useAuthStore.getState().token).toBe('token-16');
    expect(useAuthStore.getState().user?.id).toBe('u16');
    expect(postToNative).toHaveBeenCalledWith({ type: 'auth:login', token: 'token-16' });
    // nothing of the pump just left lingers in the cache
    expect(appQueryClient.getQueryData(['conversations', 'mine'])).toBeUndefined();
  });

  it('says "Opening 16E…" while it goes, and takes no second tap', async () => {
    person();
    answerOutlets({ current: FIRST, outlets: [SECOND, TENTH] });
    vi.mocked(api.post).mockReturnValue(new Promise(() => undefined) as never);
    renderWithProviders(<OutletSheet onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: '16E' }));
    expect(await screen.findByText('Opening 16E…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '9E' }));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the pump they are in is tapped', async () => {
    person();
    answerOutlets({ current: FIRST, outlets: [SECOND] });
    renderWithProviders(<OutletSheet onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: /15E/ }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps the sign-in and says why when that pump is not active (409)', async () => {
    person();
    answerOutlets({ current: FIRST, outlets: [SECOND] });
    vi.mocked(api.post).mockRejectedValue(new ApiError(409, 'OUTLET_UNAVAILABLE', 'That outlet is not active.'));
    const onSwitched = vi.fn();
    renderWithProviders(<OutletSheet onClose={() => undefined} onSwitched={onSwitched} />);
    fireEvent.click(await screen.findByRole('radio', { name: '16E' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That pump is not active right now');
    expect(onSwitched).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBe('test-token');
  });

  it('says it could not switch on any other failure, and lets them try again', async () => {
    person();
    answerOutlets({ current: FIRST, outlets: [SECOND] });
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'down'));
    renderWithProviders(<OutletSheet onClose={() => undefined} onSwitched={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: '16E' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't switch pump");
    // the radios are live again
    expect(screen.getByRole('radio', { name: '16E' })).not.toBeDisabled();
  });

  it('closes from the backdrop', async () => {
    person();
    answerOutlets({ current: FIRST, outlets: [SECOND] });
    const onClose = vi.fn();
    renderWithProviders(<OutletSheet onClose={onClose} />);
    await screen.findAllByRole('radio');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Settings — "Switch pump"', () => {
  function renderSettings() {
    return renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>,
      { route: '/settings', withRouter: true },
    );
  }

  it('is the first row for a person with another pump, and says which one they are in', async () => {
    person({ role: 'dealer-owner' });
    answerOutlets({ current: FIRST, outlets: [SECOND] });
    renderSettings();
    const row = (await screen.findByText('Switch pump')).closest('button')!;
    expect(within(row).getByText('You are in 15E now')).toBeInTheDocument();
    const titles = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(titles.findIndex((t) => t.startsWith('Switch pump'))).toBeLessThan(titles.findIndex((t) => t.startsWith('Account')));
  });

  it('opens the same sheet', async () => {
    person({ role: 'dealer-owner' });
    answerOutlets({ current: FIRST, outlets: [SECOND] });
    renderSettings();
    fireEvent.click((await screen.findByText('Switch pump')).closest('button')!);
    expect(await screen.findByRole('dialog', { name: 'Your pumps' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '16E' })).toBeInTheDocument();
  });

  it('has no such row for a one-pump login, which makes no request', () => {
    signIn({ role: 'dealer-owner' });
    renderSettings();
    expect(screen.queryByText('Switch pump')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });
});
