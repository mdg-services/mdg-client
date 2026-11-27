import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLangStore } from '@/store/lang';
import { makeUser, resetStores } from '@/test/utils';

vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof ApiModule>();
  return { ...real, api: { ...real.api, patch: vi.fn() } };
});

const { startSession } = await import('./signIn');

beforeEach(() => {
  resetStores();
  vi.mocked(api.patch).mockResolvedValue({ ok: true, data: {} } as never);
});
afterEach(() => vi.clearAllMocks());

describe('the language picked before sign-in is handed to the account once', () => {
  it('sends the same update the signed-in picker sends, and marks the account as chosen', () => {
    useLangStore.setState({ lang: 'hl', explicit: true });
    const user = makeUser({ role: 'dealer-owner', langChosenAt: null });
    startSession({ token: 't', user });
    expect(api.patch).toHaveBeenCalledWith('/v1/me', { lang: 'hl' });
    expect(useAuthStore.getState().user).toMatchObject({ lang: 'hl' });
    expect(useAuthStore.getState().user?.langChosenAt).toBeTruthy();
  });

  it('does nothing when the reader never picked (the signed-in picker will ask, as before)', () => {
    useLangStore.setState({ lang: 'hi', explicit: false });
    startSession({ token: 't', user: makeUser({ role: 'dealer-owner', langChosenAt: null }) });
    expect(api.patch).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user?.langChosenAt).toBeNull();
  });

  it('does nothing when the account already chose, or for an admin or an old server', () => {
    useLangStore.setState({ lang: 'en', explicit: true });
    startSession({ token: 't', user: makeUser({ role: 'dealer-owner', langChosenAt: '2026-11-01T00:00:00Z' }) });
    startSession({ token: 't', user: makeUser({ role: 'admin', langChosenAt: null }) });
    startSession({ token: 't', user: makeUser({ role: 'dealer-owner' }) });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('a save that fails is dropped without an error', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('offline'));
    useLangStore.setState({ lang: 'en', explicit: true });
    expect(() =>
      startSession({ token: 't', user: makeUser({ role: 'dealer-owner', langChosenAt: null }) }),
    ).not.toThrow();
    await Promise.resolve();
  });
});
