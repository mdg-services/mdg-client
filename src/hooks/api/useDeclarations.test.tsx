import { onlineManager } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { makeCollect, makeDeclarationsView, makeLastPhotos } from '@/test/declarationsFixtures';
import { renderHookWithProviders, resetStores, signIn } from '@/test/utils';
import { declarationsAnswerSchema } from '@dk/shared/schemas';

import {
  declarationsKey,
  useAnswerDeclarations,
  useDeclarations,
  useDeclarationsBusy,
  useReuseDeclarationsPhotos,
} from './useDeclarations';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<{ ApiError: typeof ApiError }>()),
  api: { get: h.get, post: h.post },
}));

const ANSWER_PATH = '/v1/me/declarations/answer';

beforeEach(() => {
  signIn({ role: 'dealer-owner', dealerId: 'd1' });
  h.get.mockReset();
  h.post.mockReset();
  h.get.mockResolvedValue(makeCollect(0, { lastPhotos: makeLastPhotos() }));
});
afterEach(() => {
  onlineManager.setOnline(true);
  resetStores();
});

/** The view, the same-photos answer and the shared busy flags, as one box on screen holds them. */
const mount = () =>
  renderHookWithProviders(
    () => ({
      view: useDeclarations(),
      reuse: useReuseDeclarationsPhotos(),
      send: useAnswerDeclarations(),
      busy: useDeclarationsBusy(),
    }),
    { withRouter: false },
  );

describe('useReuseDeclarationsPhotos', () => {
  it('posts the same-photos step, in the shape the server accepts, and nothing with it', async () => {
    h.post.mockResolvedValue(makeCollect(2));
    const { result } = mount();
    await waitFor(() => expect(result.current.view.data).toBeDefined());
    await act(async () => {
      await result.current.reuse.mutateAsync();
    });
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.post).toHaveBeenCalledWith(ANSWER_PATH, { step: 'reuse' });
    expect(declarationsAnswerSchema.safeParse(h.post.mock.calls[0]![1]).success).toBe(true);
  });

  it('puts the whole fresh view the server answers with straight into the cache, for every box', async () => {
    const after = makeCollect(2);
    h.post.mockResolvedValue(after);
    const { result, queryClient } = mount();
    await waitFor(() => expect(result.current.view.data).toBeDefined());
    await act(async () => {
      await result.current.reuse.mutateAsync();
    });
    expect(queryClient.getQueryData(declarationsKey)).toEqual(after);
    // Nothing asked the server for the view again: the answer was the view.
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('asks the server where things stand after ANY error, and does not try the same answer twice', async () => {
    h.post.mockRejectedValue(new ApiError(400, 'BAD', 'The photos from last time are gone.'));
    const { result } = mount();
    await waitFor(() => expect(result.current.view.data).toBeDefined());
    expect(h.get).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.reuse.mutateAsync().catch(() => undefined);
    });
    // Once: never retried (a reuse that went through twice is harmless, but a dropped link is not a reason to guess).
    expect(h.post).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));

    // A dropped connection reads again too.
    h.post.mockRejectedValue(new Error('network'));
    await act(async () => {
      await result.current.reuse.mutateAsync().catch(() => undefined);
    });
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(3));
  });

  it('is not parked when the phone says it is offline: it goes and ends in the box’s own error', async () => {
    h.post.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = mount();
    await waitFor(() => expect(result.current.view.data).toBeDefined());
    onlineManager.setOnline(false);
    // By default a request made while offline is parked until the signal returns and this
    // would never settle: here it goes at once and fails into the box's own error.
    await act(async () => {
      await expect(result.current.reuse.mutateAsync()).rejects.toThrow('Failed to fetch');
    });
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it('counts as busy for every box while it is on its way, and says it is the same-photos answer', async () => {
    let finish!: () => void;
    h.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(makeCollect(2));
        }),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.view.data).toBeDefined());
    expect(result.current.busy).toEqual({ busy: false, uploadingSlot: null, reusing: false });

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.reuse.mutateAsync();
    });
    await waitFor(() =>
      expect(result.current.busy).toEqual({ busy: true, uploadingSlot: null, reusing: true }),
    );
    await act(async () => {
      finish();
      await pending;
    });
    await waitFor(() =>
      expect(result.current.busy).toEqual({ busy: false, uploadingSlot: null, reusing: false }),
    );
  });

  it('a Send on its way is busy but is not "reusing"', async () => {
    let finish!: () => void;
    h.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(makeDeclarationsView({ screen: 'waiting' }));
        }),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.view.data).toBeDefined());
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.send.mutateAsync({ step: 'send', confirmFresh: true });
    });
    await waitFor(() => expect(result.current.busy.busy).toBe(true));
    expect(result.current.busy.reusing).toBe(false);
    await act(async () => {
      finish();
      await pending;
    });
  });
});
