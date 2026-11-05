import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { makeDuOtpGroup, makeDuOtpView } from '@/test/duOtpFixtures';
import { makeTestQueryClient, renderHookWithProviders, signIn } from '@/test/utils';

import {
  DU_OTP_POLL_MS,
  duOtpIsBusy,
  duOtpKey,
  invalidateDuOtp,
  useAnswerDuOtp,
  useAnswerDuOtpPaper,
  useDuOtp,
} from './useDuOtp';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, post: h.post },
}));
vi.mock('@/lib/uploadDuOtpPaper', () => ({ uploadDuOtpPaper: h.upload }));

beforeEach(() => {
  signIn({ role: 'dealer-owner' });
  h.get.mockReset();
  h.post.mockReset();
  h.upload.mockReset();
});
afterEach(() => {
  // Unmount before the shared teardown signs the user out, or the hook re-renders
  // outside `act`.
  cleanup();
  vi.useRealTimers();
});

describe('duOtpIsBusy', () => {
  it('is true while a certificate is being fetched', () => {
    expect(duOtpIsBusy(makeDuOtpView({ fetch: { state: 'working', message: null, at: null } }))).toBe(true);
  });

  it.each(['ready', 'submitting'] as const)('is true while a group is %s', (state) => {
    expect(duOtpIsBusy(makeDuOtpView({ groups: [makeDuOtpGroup({ state })] }))).toBe(true);
  });

  it.each(['pending', 'collecting', 'failed'] as const)('is false for a group that is %s: it waits on the owner', (state) => {
    expect(duOtpIsBusy(makeDuOtpView({ groups: [makeDuOtpGroup({ state })] }))).toBe(false);
  });

  it('is false with nothing there, and for a fetch that ended', () => {
    expect(duOtpIsBusy(undefined)).toBe(false);
    expect(duOtpIsBusy(makeDuOtpView())).toBe(false);
    for (const state of ['idle', 'needs_login', 'failed', 'done'] as const) {
      expect(duOtpIsBusy(makeDuOtpView({ fetch: { state, message: null, at: null } }))).toBe(false);
    }
  });
});

describe('useDuOtp', () => {
  it("reads the outlet's own view from /v1/me/du-otp", async () => {
    h.get.mockResolvedValue(makeDuOtpView({ supplyBlockedForOtp: true }));
    const { result } = renderHookWithProviders(() => useDuOtp());
    await waitFor(() => expect(result.current.data?.supplyBlockedForOtp).toBe(true));
    expect(h.get).toHaveBeenCalledWith('/v1/me/du-otp');
  });

  it('asks nothing while nobody is signed in, or for an admin who has no outlet', async () => {
    useAuthStore.setState({ token: null, user: null });
    const first = renderHookWithProviders(() => useDuOtp());
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
    first.unmount();

    signIn({ role: 'admin' });
    renderHookWithProviders(() => useDuOtp());
    await Promise.resolve();
    expect(h.get).not.toHaveBeenCalled();
  });

  it('asks again when the cache is told the outlet moved', async () => {
    h.get.mockResolvedValueOnce(makeDuOtpView());
    const queryClient = makeTestQueryClient();
    const { result } = renderHookWithProviders(() => useDuOtp(), { queryClient });
    await waitFor(() => expect(result.current.data?.groups).toEqual([]));
    h.get.mockResolvedValue(makeDuOtpView({ groups: [makeDuOtpGroup()] }));
    act(() => invalidateDuOtp(queryClient));
    await waitFor(() => expect(result.current.data?.groups).toHaveLength(1));
    expect(h.get).toHaveBeenCalledTimes(2);
  });

  describe('while a robot is working', () => {
    async function advance(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    it(`asks again every ${DU_OTP_POLL_MS} ms, as a safety net for a missed socket event`, async () => {
      vi.useFakeTimers();
      h.get.mockResolvedValue(
        makeDuOtpView({ groups: [makeDuOtpGroup({ state: 'submitting', step: 'review' })] }),
      );
      renderHookWithProviders(() => useDuOtp());
      await advance(0);
      expect(h.get).toHaveBeenCalledTimes(1);
      await advance(DU_OTP_POLL_MS);
      expect(h.get).toHaveBeenCalledTimes(2);
      await advance(DU_OTP_POLL_MS);
      expect(h.get).toHaveBeenCalledTimes(3);
    });

    it('stops asking by itself once the robot is done', async () => {
      vi.useFakeTimers();
      h.get.mockResolvedValue(
        makeDuOtpView({ groups: [makeDuOtpGroup({ state: 'submitting', step: 'review' })] }),
      );
      renderHookWithProviders(() => useDuOtp());
      await advance(0);
      h.get.mockResolvedValue(makeDuOtpView());
      await advance(DU_OTP_POLL_MS);
      expect(h.get).toHaveBeenCalledTimes(2);
      await advance(DU_OTP_POLL_MS * 4);
      expect(h.get).toHaveBeenCalledTimes(2);
    });

    it('never polls a view that is waiting on the owner', async () => {
      vi.useFakeTimers();
      h.get.mockResolvedValue(
        makeDuOtpView({ groups: [makeDuOtpGroup({ state: 'collecting', step: 'reasons' })] }),
      );
      renderHookWithProviders(() => useDuOtp());
      await advance(0);
      await advance(DU_OTP_POLL_MS * 4);
      expect(h.get).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useAnswerDuOtp', () => {
  it('POSTs the answer to /v1/me/du-otp/answer and files the fresh view', async () => {
    const view = makeDuOtpView({
      groups: [makeDuOtpGroup({ state: 'collecting', step: 'reasons' })],
    });
    h.post.mockResolvedValue(view);
    const queryClient = makeTestQueryClient();
    const { result } = renderHookWithProviders(() => useAnswerDuOtp(), { queryClient });
    await act(() => result.current.mutateAsync({ step: 'start' }));
    expect(h.post).toHaveBeenCalledWith('/v1/me/du-otp/answer', { step: 'start' });
    expect(queryClient.getQueryData(duOtpKey)).toEqual(view);
  });

  it('is not retried: an answer that went through twice would walk the steps past the owner', async () => {
    h.post.mockRejectedValue(new ApiError(500, 'BOOM', 'no'));
    const { result } = renderHookWithProviders(() => useAnswerDuOtp());
    await act(async () => {
      await result.current.mutateAsync({ step: 'start' }).catch(() => undefined);
    });
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it('on a 409 (the step had moved) looks at where things really stand', async () => {
    h.post.mockRejectedValue(new ApiError(409, 'MOVED', 'That step is already done.'));
    const queryClient = makeTestQueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHookWithProviders(() => useAnswerDuOtp(), { queryClient });
    await act(async () => {
      await result.current.mutateAsync({ step: 'start' }).catch(() => undefined);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: duOtpKey });
  });

  it('on any other failure leaves the cache alone', async () => {
    h.post.mockRejectedValue(new ApiError(500, 'BOOM', 'no'));
    const queryClient = makeTestQueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHookWithProviders(() => useAnswerDuOtp(), { queryClient });
    await act(async () => {
      await result.current.mutateAsync({ step: 'start' }).catch(() => undefined);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useAnswerDuOtpPaper', () => {
  const vars = () => ({
    dealerId: 'd1',
    group: 'GB12345',
    slot: 'certificate' as const,
    file: new File(['%PDF'], 'cert.pdf', { type: 'application/pdf' }),
  });

  it('uploads the file, then answers with the key the server issued, and files the fresh view', async () => {
    const view = makeDuOtpView({ groups: [makeDuOtpGroup({ state: 'collecting', step: 'serviceReport' })] });
    h.upload.mockResolvedValue({ key: 'dealers/d1/du-otp/abc.pdf', filename: 'cert.pdf' });
    h.post.mockResolvedValue(view);
    const queryClient = makeTestQueryClient();
    const { result } = renderHookWithProviders(() => useAnswerDuOtpPaper(), { queryClient });
    const v = vars();
    await act(() => result.current.mutateAsync(v));

    expect(h.upload).toHaveBeenCalledWith(v.file, 'd1');
    expect(h.post).toHaveBeenCalledWith('/v1/me/du-otp/answer', {
      step: 'file',
      group: 'GB12345',
      slot: 'certificate',
      key: 'dealers/d1/du-otp/abc.pdf',
      filename: 'cert.pdf',
    });
    expect(queryClient.getQueryData(duOtpKey)).toEqual(view);
  });

  it('never answers for a file that did not upload', async () => {
    h.upload.mockRejectedValue(new Error('Upload failed: 403 Forbidden'));
    const { result } = renderHookWithProviders(() => useAnswerDuOtpPaper());
    await act(async () => {
      await result.current.mutateAsync(vars()).catch(() => undefined);
    });
    expect(h.post).not.toHaveBeenCalled();
  });

  it('is not retried', async () => {
    h.upload.mockResolvedValue({ key: 'k', filename: 'f.pdf' });
    h.post.mockRejectedValue(new ApiError(500, 'BOOM', 'no'));
    const { result } = renderHookWithProviders(() => useAnswerDuOtpPaper());
    await act(async () => {
      await result.current.mutateAsync(vars()).catch(() => undefined);
    });
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.post).toHaveBeenCalledTimes(1);
  });
});
