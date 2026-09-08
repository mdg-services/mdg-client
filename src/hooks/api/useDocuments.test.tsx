import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type * as SocketModule from '@/lib/socket';
import { makeOnFileList, makeOnFileRow } from '@/test/askFixtures';
import { makeTestQueryClient, renderHookWithProviders, resetStores, signIn } from '@/test/utils';

import { askListQueryKey } from './useAsks';
import {
  documentsOnFileQueryKey,
  useDocumentsOnFileSocket,
  useMyDocumentsOnFile,
  useOpenDocumentFile,
} from './useDocuments';

/**
 * The filing cabinet's query, its socket, and the one route that hands a dealer
 * their own paper back.
 *
 * THE ASSERTIONS WORTH THE FILE are the two about round trips. This list is up
 * to 500 rows on a forecourt 2G link, so it must not be re-read for events
 * about papers it does not hold — and it must never reach for the chat
 * attachment helper, which presigns through a message and answers 403 for
 * everything under `ask/`.
 */

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

/** A socket with just enough of one to register and fire a handler. */
function fakeSocket() {
  const handlers = new Map<string, (payload: never) => void>();
  return {
    connected: true,
    on: vi.fn((event: string, fn: (payload: never) => void) => {
      handlers.set(event, fn);
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
    }),
    emit: <T,>(event: string, payload: T) => {
      (handlers.get(event) as ((p: T) => void) | undefined)?.(payload);
    },
  };
}

vi.mock('@/lib/socket', async (orig) => {
  const actual = await orig<typeof SocketModule>();
  return { ...actual, getSocket: vi.fn() };
});

afterEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(getSocket).mockReset();
  resetStores();
});

describe('useMyDocumentsOnFile', () => {
  it('does not fetch without a token', () => {
    const { result } = renderHookWithProviders(() => useMyDocumentsOnFile(), {
      withRouter: false,
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('reads the sibling route, not the to-do list with a mode on it', async () => {
    signIn({ id: 'owner', dealerId: 'd1' });
    vi.mocked(api.get).mockResolvedValue(
      makeOnFileList({ rows: [makeOnFileRow({ id: 'filed-noc' })] }),
    );
    const { result } = renderHookWithProviders(() => useMyDocumentsOnFile(), {
      withRouter: false,
    });

    await waitFor(() => expect(result.current.data?.rows).toHaveLength(1));
    expect(api.get).toHaveBeenCalledWith('/v1/asks/me/on-file');
  });
});

describe('useDocumentsOnFileSocket — what is worth a refetch', () => {
  /**
   * Most `document-ask:updated` events are about a paper that is not in the
   * cabinet and never will be — a register page being asked for, sent,
   * rejected. Re-reading 500 rows for each of those is a wasted round trip on a
   * connection that has few to spare.
   */
  it('leaves the cabinet alone for a paper it does not hold', async () => {
    signIn({ id: 'owner', dealerId: 'd1' });
    const socket = fakeSocket();
    vi.mocked(getSocket).mockReturnValue(socket as never);
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(documentsOnFileQueryKey, makeOnFileList({ rows: [] }));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderHookWithProviders(() => useDocumentsOnFileSocket(), {
      withRouter: false,
      queryClient,
    });
    socket.emit('document-ask:updated', {
      row: makeOnFileRow({ id: 'stranger', state: 'SENT', waitingOn: 'mdg' }),
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('re-reads it the moment a paper is accepted', async () => {
    signIn({ id: 'owner', dealerId: 'd1' });
    const socket = fakeSocket();
    vi.mocked(getSocket).mockReturnValue(socket as never);
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(documentsOnFileQueryKey, makeOnFileList({ rows: [] }));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderHookWithProviders(() => useDocumentsOnFileSocket(), {
      withRouter: false,
      queryClient,
    });
    socket.emit('document-ask:updated', { row: makeOnFileRow({ id: 'new-noc' }) });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: documentsOnFileQueryKey }),
    );
  });

  /** A validity corrected, or a renewal opened, on a paper already in the list. */
  it('re-reads it when a paper it already holds changes', async () => {
    signIn({ id: 'owner', dealerId: 'd1' });
    const socket = fakeSocket();
    vi.mocked(getSocket).mockReturnValue(socket as never);
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(
      documentsOnFileQueryKey,
      makeOnFileList({ rows: [makeOnFileRow({ id: 'held' })] }),
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderHookWithProviders(() => useDocumentsOnFileSocket(), {
      withRouter: false,
      queryClient,
    });
    socket.emit('document-ask:updated', {
      row: makeOnFileRow({ id: 'held', state: 'REJECTED', waitingOn: 'dealer' }),
    });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: documentsOnFileQueryKey }),
    );
  });

  /**
   * TWO CACHES MOVE ON ONE SERVER EVENT — a reminder auto-opens a renewal ask —
   * and events that fired while the socket was down are invisible to both. A 2G
   * link drops the socket without ever firing `offline`, so the reconnect is the
   * only place that knows to backfill.
   */
  it('backfills both lists after the socket comes back', async () => {
    signIn({ id: 'owner', dealerId: 'd1' });
    const socket = fakeSocket();
    vi.mocked(getSocket).mockReturnValue(socket as never);
    const queryClient = makeTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderHookWithProviders(() => useDocumentsOnFileSocket(), {
      withRouter: false,
      queryClient,
    });
    // `onSocketReconnect` ignores the first connect; this socket was already
    // connected when the hook registered, so one event is a RE-connect.
    socket.emit('connect', undefined);

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: documentsOnFileQueryKey }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: askListQueryKey });
  });
});

describe('useOpenDocumentFile', () => {
  /**
   * Through the papers route, which resolves the owning dealer from the STORED
   * ROW. The generic key-prefix download route authorises `avatars/`, `chat/`,
   * `staff/` and `kavach/` only, and answers 403 for everything under `ask/`.
   */
  it('presigns at tap time, through the route that authorises an ask', async () => {
    signIn({ id: 'owner', dealerId: 'd1' });
    vi.mocked(api.get).mockResolvedValue({
      viewUrl: 'https://bucket/signed',
      downloadUrl: 'https://bucket/signed?d=1',
      filename: 'noc.pdf',
      contentType: 'application/pdf',
      expiresIn: 900,
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const { result } = renderHookWithProviders(() => useOpenDocumentFile(), {
      withRouter: false,
    });
    await result.current('65f0000000000000000000aa');

    expect(api.get).toHaveBeenCalledWith('/v1/asks/me/65f0000000000000000000aa/file-url');
    expect(open).toHaveBeenCalledWith(
      'https://bucket/signed',
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
  });

  /** A failure says what to do next, and never names the step that broke. */
  it('does not open a window when the paper cannot be signed', async () => {
    signIn({ id: 'owner', dealerId: 'd1' });
    vi.mocked(api.get).mockRejectedValue(new Error('nope'));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const { result } = renderHookWithProviders(() => useOpenDocumentFile(), {
      withRouter: false,
    });
    await result.current('65f0000000000000000000aa');

    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
