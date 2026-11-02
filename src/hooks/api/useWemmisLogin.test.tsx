import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { makeTestQueryClient, renderHookWithProviders, signIn } from '@/test/utils';
import type { DealerWemmisLoginView, WemmisResetState, WemmisResetView } from '@dk/shared/types';
import { WEMMIS_RESET_STATES } from '@dk/shared/types';

import {
  RESET_POLL_MS,
  invalidateWemmisLogin,
  resetIsLive,
  useAnswerWemmisReset,
  useSaveWemmisLogin,
  useStartWemmisReset,
  useWemmisLogin,
  useWemmisReset,
  wemmisLoginKey,
  wemmisResetKey,
} from './useWemmisLogin';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, post: h.post, put: h.put },
}));

function reset(state: WemmisResetState, over: Partial<WemmisResetView> = {}): WemmisResetView {
  return {
    id: 'r1',
    state,
    mobileMasked: 'XXXXXX1234',
    expiresAt: null,
    usernames: [],
    captchaImageUrl: null,
    message: null,
    ...over,
  };
}
function login(over: Partial<DealerWemmisLoginView> = {}): DealerWemmisLoginView {
  return { status: 'missing', username: null, canEdit: true, reset: null, ...over };
}

beforeEach(() => {
  signIn({ role: 'dealer-owner' });
  h.get.mockReset();
  h.post.mockReset();
  h.put.mockReset();
});
afterEach(() => {
  // Unmount before the shared teardown signs the user out, or the hook re-renders
  // outside `act`.
  cleanup();
  vi.useRealTimers();
});

describe('resetIsLive', () => {
  it('is true while the robot is working or waiting, false once it has ended', () => {
    const live = WEMMIS_RESET_STATES.filter((s) => resetIsLive(s));
    expect(live).toEqual([
      'starting',
      'otp_sent',
      'checking',
      'wrong_otp',
      'need_captcha',
      'choose_user',
      'resetting',
    ]);
    for (const ended of ['done', 'failed', 'expired'] as const) {
      expect(resetIsLive(ended)).toBe(false);
    }
  });
});

describe('useWemmisLogin', () => {
  it("reads the owner's own view from /v1/me/wemmis-login", async () => {
    h.get.mockResolvedValue(login({ status: 'saved', username: 'test-user-01' }));
    const { result } = renderHookWithProviders(() => useWemmisLogin());
    await waitFor(() => expect(result.current.data?.status).toBe('saved'));
    expect(h.get).toHaveBeenCalledWith('/v1/me/wemmis-login');
  });

  it('asks nothing while nobody is signed in', async () => {
    useAuthStore.setState({ token: null, user: null });
    renderHookWithProviders(() => useWemmisLogin());
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
  });
});

describe('useSaveWemmisLogin', () => {
  it('PUTs the pair to the login route and puts the fresh view in the cache', async () => {
    const view = login({ status: 'saved', username: 'test-user-01' });
    h.put.mockResolvedValue(view);
    const queryClient = makeTestQueryClient();
    const { result } = renderHookWithProviders(() => useSaveWemmisLogin(), { queryClient });
    await act(() =>
      result.current.mutateAsync({ username: 'test-user-01', password: 'Pa55word!x' }),
    );
    expect(h.put).toHaveBeenCalledWith('/v1/me/wemmis-login', {
      username: 'test-user-01',
      password: 'Pa55word!x',
    });
    expect(queryClient.getQueryData(wemmisLoginKey)).toEqual(view);
  });

  it('is not retried: a refused save would only be refused again', async () => {
    h.put.mockRejectedValue(new Error('no'));
    const { result } = renderHookWithProviders(() => useSaveWemmisLogin());
    await act(async () => {
      await result.current.mutateAsync({ username: 'a', password: 'b' }).catch(() => undefined);
    });
    expect(h.put).toHaveBeenCalledTimes(1);
  });
});

describe('useStartWemmisReset', () => {
  it('POSTs the mobile, and files both the login view and the new reset', async () => {
    const started = reset('starting');
    const view = login({ reset: started });
    h.post.mockResolvedValue(view);
    const queryClient = makeTestQueryClient();
    const { result } = renderHookWithProviders(() => useStartWemmisReset(), { queryClient });
    await act(() => result.current.mutateAsync({ mobile: '9876543210' }));
    expect(h.post).toHaveBeenCalledWith('/v1/me/wemmis-login/reset', { mobile: '9876543210' });
    expect(queryClient.getQueryData(wemmisLoginKey)).toEqual(view);
    expect(queryClient.getQueryData(wemmisResetKey('r1'))).toEqual(started);
  });
});

describe('useAnswerWemmisReset', () => {
  it('PUTs only what was answered to that reset, and files the fresh reset', async () => {
    const after = reset('checking');
    h.put.mockResolvedValue(after);
    const queryClient = makeTestQueryClient();
    const { result } = renderHookWithProviders(() => useAnswerWemmisReset('r1'), { queryClient });
    await act(() => result.current.mutateAsync({ otp: '4821' }));
    expect(h.put).toHaveBeenCalledWith('/v1/me/wemmis-login/reset/r1', { otp: '4821' });
    expect(queryClient.getQueryData(wemmisResetKey('r1'))).toEqual(after);

    await act(() => result.current.mutateAsync({ username: 'pump-a' }));
    expect(h.put).toHaveBeenLastCalledWith('/v1/me/wemmis-login/reset/r1', { username: 'pump-a' });
  });
});

describe('useWemmisReset', () => {
  /** Let the polls run for `ms` of fake time. */
  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('asks nothing without a reset to follow', async () => {
    renderHookWithProviders(() => useWemmisReset(null));
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
  });

  it('reads /v1/me/wemmis-login/reset/:id', async () => {
    h.get.mockResolvedValue(reset('otp_sent'));
    const { result } = renderHookWithProviders(() => useWemmisReset('r1'));
    await waitFor(() => expect(result.current.data?.state).toBe('otp_sent'));
    expect(h.get).toHaveBeenCalledWith('/v1/me/wemmis-login/reset/r1');
  });

  it('shows the reset it was given at once, before the first answer', () => {
    h.get.mockReturnValue(new Promise(() => undefined));
    const seed = reset('otp_sent');
    const { result } = renderHookWithProviders(() => useWemmisReset('r1', seed));
    expect(result.current.data).toEqual(seed);
  });

  it('ignores a seed that belongs to another reset', () => {
    h.get.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHookWithProviders(() => useWemmisReset('r2', reset('otp_sent')));
    expect(result.current.data).toBeUndefined();
  });

  it(`asks again every ${RESET_POLL_MS} ms while the reset is going`, async () => {
    vi.useFakeTimers();
    h.get.mockResolvedValue(reset('otp_sent'));
    renderHookWithProviders(() => useWemmisReset('r1'));
    await advance(0);
    expect(h.get).toHaveBeenCalledTimes(1);
    await advance(RESET_POLL_MS);
    expect(h.get).toHaveBeenCalledTimes(2);
    await advance(RESET_POLL_MS);
    expect(h.get).toHaveBeenCalledTimes(3);
    // Not before the interval is up.
    await advance(RESET_POLL_MS - 100);
    expect(h.get).toHaveBeenCalledTimes(3);
  });

  it.each(['done', 'failed', 'expired'] as const)(
    'stops asking once the reset is %s',
    async (end) => {
      vi.useFakeTimers();
      h.get.mockResolvedValue(reset('checking'));
      renderHookWithProviders(() => useWemmisReset('r1'));
      await advance(0);
      await advance(RESET_POLL_MS);
      const before = h.get.mock.calls.length;
      expect(before).toBeGreaterThanOrEqual(2);

      h.get.mockResolvedValue(reset(end));
      await advance(RESET_POLL_MS); // this poll learns the end
      const atEnd = h.get.mock.calls.length;
      await advance(RESET_POLL_MS * 10);
      expect(h.get).toHaveBeenCalledTimes(atEnd);
    },
  );

  it('keeps asking through every state that is not an end', async () => {
    vi.useFakeTimers();
    const states: WemmisResetState[] = [
      'starting',
      'otp_sent',
      'wrong_otp',
      'need_captcha',
      'choose_user',
      'checking',
      'resetting',
    ];
    for (const state of states) {
      h.get.mockReset();
      h.get.mockResolvedValue(reset(state));
      const { unmount } = renderHookWithProviders(() => useWemmisReset('r1'), {
        queryClient: makeTestQueryClient(),
      });
      await advance(0);
      await advance(RESET_POLL_MS * 2);
      expect(h.get.mock.calls.length, state).toBeGreaterThanOrEqual(3);
      unmount();
    }
  });

  it('stops asking when the box leaves the screen', async () => {
    vi.useFakeTimers();
    h.get.mockResolvedValue(reset('otp_sent'));
    const { unmount } = renderHookWithProviders(() => useWemmisReset('r1'));
    await advance(0);
    await advance(RESET_POLL_MS);
    unmount();
    const atUnmount = h.get.mock.calls.length;
    await advance(RESET_POLL_MS * 10);
    expect(h.get).toHaveBeenCalledTimes(atUnmount);
  });

  it('does not keep asking after a failed read (a reset swept away answers 404)', async () => {
    vi.useFakeTimers();
    h.get.mockRejectedValue(new Error('not found'));
    const { result } = renderHookWithProviders(() => useWemmisReset('r1'));
    await advance(0);
    expect(result.current.isError).toBe(true);
    await advance(RESET_POLL_MS * 5);
    expect(h.get).toHaveBeenCalledTimes(1);
  });
});

describe('invalidateWemmisLogin', () => {
  it('marks the login view out of date, and leaves a reset alone', () => {
    const qc = makeTestQueryClient();
    qc.setQueryData(wemmisLoginKey, login());
    qc.setQueryData(wemmisResetKey('r1'), reset('otp_sent'));
    invalidateWemmisLogin(qc);
    expect(qc.getQueryState(wemmisLoginKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(wemmisResetKey('r1'))?.isInvalidated).toBe(false);
  });
});
