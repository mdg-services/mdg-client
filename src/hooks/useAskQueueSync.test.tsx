import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { useAskQueueStore, type QueuedAskPhoto } from '@/store/askQueue';
import { makeAskRow } from '@/test/askFixtures';
import { renderHookWithProviders, resetStores, signIn } from '@/test/utils';

/**
 * The loop that actually sends a queued photograph.
 *
 * WHAT IS BEING DEFENDED
 * ----------------------
 *  - A photograph that reached the bucket must not be uploaded twice because the
 *    step after it failed. That is the Kavach proof-card bug, and it is why the
 *    minted row id is written into the queue entry the moment it exists.
 *  - A network failure must leave the photograph exactly where it was, ready to
 *    go again — react-query is `retry: 0` here, so nothing else would catch it.
 *  - A refusal must NOT be retried for ever. Sending the same bytes at a server
 *    that has already said no just keeps a false promise on the dealer's card.
 */

const h = vi.hoisted(() => ({
  volunteer: vi.fn(),
  submit: vi.fn(),
  upload: vi.fn(),
  applied: vi.fn(),
}));

vi.mock('@/hooks/api/useAsks', () => ({
  volunteerAsk: h.volunteer,
  submitAsk: h.submit,
  applyAskRow: h.applied,
}));
vi.mock('@/lib/uploadDocumentAsk', () => ({ uploadDocumentAsk: h.upload }));

const { useAskQueueSync } = await import('./useAskQueueSync');

const ATTACHMENT = {
  storageKey: 'ask/d1/ask-1/abc.jpg',
  filename: 'page.jpg',
  contentType: 'image/jpeg',
  size: 3,
  kind: 'image' as const,
};

function item(over: Partial<QueuedAskPhoto> = {}): QueuedAskPhoto {
  return {
    matchKey: 'tt-register-page|2026-09-02',
    clientRef: 'ref-00000001',
    dealerId: 'd1',
    askId: 'ask-1',
    submitVia: '/v1/asks/me/ask-1/submit',
    kindCode: 'tt-register-page',
    periodKind: 'DAY',
    periodKey: '2026-09-02',
    filename: 'page.jpg',
    contentType: 'image/jpeg',
    kind: 'image',
    size: 3,
    base64: 'AQID',
    queuedAt: '2026-09-02T04:00:00.000Z',
    attempts: 0,
    state: 'queued',
    ...over,
  };
}

beforeEach(() => {
  signIn({ id: 'owner', dealerId: 'd1' });
  h.upload.mockResolvedValue(ATTACHMENT);
  h.submit.mockResolvedValue(makeAskRow({ state: 'SENT', waitingOn: 'mdg' }));
  h.volunteer.mockResolvedValue(
    makeAskRow({ id: 'minted-1', submitVia: '/v1/asks/me/minted-1/submit' }),
  );
});

afterEach(() => {
  resetStores();
  useAskQueueStore.setState({ items: [] });
  vi.clearAllMocks();
});

function run() {
  return renderHookWithProviders(() => useAskQueueSync(), { withRouter: false });
}

describe('a queued photograph goes', () => {
  it('uploads it, submits it, and takes it out of the queue', async () => {
    useAskQueueStore.setState({ items: [item()] });
    run();

    await waitFor(() => expect(useAskQueueStore.getState().items).toHaveLength(0));
    expect(h.upload).toHaveBeenCalledWith(
      expect.objectContaining({ askId: 'ask-1', dealerId: 'd1', kind: 'image' }),
    );
    // The retry key travels with the send, or a submit whose response was lost
    // would be refused as a second one.
    expect(h.submit).toHaveBeenCalledWith('/v1/asks/me/ask-1/submit', {
      attachment: ATTACHMENT,
      clientRef: 'ref-00000001',
    });
    // The list is updated from the row the server returned, so an open screen
    // does not have to refetch over 2G to learn what just happened.
    expect(h.applied).toHaveBeenCalled();
  });

  /**
   * A derived `owed` line has no row anywhere and an upload is filed under
   * `ask/<dealerId>/<askId>/`, so the row has to be minted first — and the path
   * the SERVER hands back is the one the submit uses.
   */
  it('mints the row first for a period nobody had asked about', async () => {
    useAskQueueStore.setState({
      items: [item({ askId: undefined, submitVia: '/v1/asks/me/volunteer' })],
    });
    run();

    await waitFor(() => expect(useAskQueueStore.getState().items).toHaveLength(0));
    expect(h.volunteer).toHaveBeenCalledWith('/v1/asks/me/volunteer', {
      kindCode: 'tt-register-page',
      periodKind: 'DAY',
      periodKey: '2026-09-02',
    });
    expect(h.upload).toHaveBeenCalledWith(expect.objectContaining({ askId: 'minted-1' }));
    expect(h.submit).toHaveBeenCalledWith('/v1/asks/me/minted-1/submit', expect.anything());
  });

  /** One pass empties the whole queue rather than one photograph per trigger. */
  it('sends everything that is waiting', async () => {
    useAskQueueStore.setState({
      items: [item({ matchKey: 'a', clientRef: 'ref-a0000001' }), item({ matchKey: 'b', clientRef: 'ref-b0000001' })],
    });
    run();

    await waitFor(() => expect(useAskQueueStore.getState().items).toHaveLength(0));
    expect(h.submit).toHaveBeenCalledTimes(2);
  });
});

describe('a photograph that does not go', () => {
  /**
   * The whole reason the queue exists. Nothing is thrown away, the attempt is
   * counted, and the entry goes back to `queued` so the next trigger picks it up.
   */
  it('stays in the queue after a network failure and is tried again', async () => {
    h.submit.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Network error'));
    useAskQueueStore.setState({ items: [item()] });
    run();

    await waitFor(() => expect(useAskQueueStore.getState().items[0]?.attempts).toBe(1));
    expect(useAskQueueStore.getState().items[0]?.state).toBe('queued');
    expect(useAskQueueStore.getState().items[0]?.base64).toBe('AQID');

    // The network comes back. It runs AT ONCE rather than waiting out the
    // backoff earned by the dead spot the dealer has just walked out of.
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(useAskQueueStore.getState().items).toHaveLength(0));
    expect(h.submit).toHaveBeenCalledTimes(2);
  });

  /**
   * A 4xx is a decision, not a hiccup — the ask was withdrawn, or the day is out
   * of the window. Repeating it would keep "it will go as soon as the internet
   * is back" on the card about a photograph that never will.
   */
  it('stops promising a refused photograph will go', async () => {
    h.submit.mockRejectedValue(new ApiError(409, 'CONFLICT', 'Already sent'));
    useAskQueueStore.setState({ items: [item()] });
    run();

    await waitFor(() => expect(useAskQueueStore.getState().items[0]?.state).toBe('stuck'));
    // The bytes are STILL there: the dealer is told to send it again, and the
    // card needs something to show while they decide.
    expect(useAskQueueStore.getState().items[0]?.base64).toBe('AQID');
    expect(h.submit).toHaveBeenCalledTimes(1);
  });

  /** A phone with no network at all does not even try. */
  it('does not try while the phone knows it is offline', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    useAskQueueStore.setState({ items: [item()] });
    run();

    await new Promise((r) => setTimeout(r, 20));
    expect(h.submit).not.toHaveBeenCalled();
    expect(useAskQueueStore.getState().items).toHaveLength(1);
    spy.mockRestore();
  });
});
