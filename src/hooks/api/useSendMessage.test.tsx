import { type InfiniteData } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { uploadAttachment } from '@/lib/uploadAttachment';
import type * as UploadModule from '@/lib/uploadAttachment';
import { makeMessage, makeTestQueryClient, renderHookWithProviders, signIn } from '@/test/utils';
import type { Attachment, ChatAskState, Message } from '@dk/shared/types';


import { chatAskStatesKey } from './useChatAskStates';
import { messagesQueryKey, renderKey, useMessages } from './useMessages';
import { NothingToSendError, useSendMessage } from './useSendMessage';

// Keep every real export; only stub the network call the mutation makes.
vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, post: vi.fn(), get: vi.fn() } };
});
vi.mock('@/lib/uploadAttachment', async (orig) => {
  const actual = await orig<typeof UploadModule>();
  return { ...actual, uploadAttachment: vi.fn() };
});

const KEY = messagesQueryKey('c1');
type Pages = InfiniteData<Message[]>;

function seed(messages: Message[]) {
  const qc = makeTestQueryClient();
  qc.setQueryData<Pages>(KEY, { pages: [messages], pageParams: [undefined] });
  const { result } = renderHookWithProviders(() => useSendMessage(), {
    queryClient: qc,
    withRouter: false,
  });
  return { qc, result };
}
const idsIn = (qc: ReturnType<typeof makeTestQueryClient>) =>
  (qc.getQueryData<Pages>(KEY)?.pages.flat() ?? []).map((m) => m.id);

describe('useSendMessage optimistic reconcile', () => {
  afterEach(() => vi.mocked(api.post).mockReset());

  it('onMutate prepends an optimistic temp message', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    vi.mocked(api.post).mockImplementation(() => new Promise(() => {})); // never resolves
    act(() => {
      result.current.mutate({ conversationId: 'c1', body: 'hi' });
    });
    await waitFor(() => {
      const first = qc.getQueryData<Pages>(KEY)!.pages[0][0];
      expect(first.id).toMatch(/^temp-/);
      expect(first.body).toBe('hi');
    });
  });

  it('sending while the thread is still loading does not throw that load away', async () => {
    // The dealer opens the chat and taps a quick reply before the history has
    // come down. The answer carrying MDG's newest message must still land, with
    // the dealer's own bubble kept beside it.
    signIn({ id: 'u1' });
    const qc = makeTestQueryClient();
    let answer: (v: Message[]) => void = () => {};
    vi.mocked(api.get).mockImplementation(
      () => new Promise<Message[]>((resolve) => (answer = resolve)) as never,
    );
    vi.mocked(api.post).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHookWithProviders(
      () => ({ list: useMessages('c1'), send: useSendMessage() }),
      { queryClient: qc, withRouter: false },
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    act(() => {
      result.current.send.mutate({ conversationId: 'c1', body: 'hi' });
    });
    await act(async () => {
      answer([makeMessage({ id: 'mdg-new', body: 'from MDG' })]);
    });
    await waitFor(() => {
      const ids = idsIn(qc);
      expect(ids).toContain('mdg-new');
      expect(ids.some((id) => id.startsWith('temp-'))).toBe(true);
    });
    vi.mocked(api.get).mockReset();
  });

  it('onError rolls the cache back to the previous state', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([makeMessage({ id: 's1' })]);
    vi.mocked(api.post).mockRejectedValue(new Error('fail'));
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' }).catch(() => {});
    });
    expect(idsIn(qc)).toEqual(['s1']);
  });

  it('branch 1 — socket echo already inserted the real msg: drops the temp, no duplicate', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    const real = makeMessage({ id: 'real-1', body: 'hi' });
    vi.mocked(api.post).mockImplementation(async () => {
      // The server echo lands (via socket) before the POST resolves.
      qc.setQueryData<Pages>(KEY, (old) => ({
        pages: [[real, ...(old?.pages[0] ?? [])]],
        pageParams: [undefined],
      }));
      return real;
    });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' });
    });
    const ids = idsIn(qc);
    expect(ids.filter((id) => id === 'real-1')).toHaveLength(1);
    expect(ids.some((id) => id.startsWith('temp-'))).toBe(false);
  });

  it('branch 2 — temp still present: replaces it in place', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    const real = makeMessage({ id: 'real-2', body: 'hi' });
    vi.mocked(api.post).mockResolvedValue(real);
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' });
    });
    const ids = idsIn(qc);
    expect(ids).toContain('real-2');
    expect(ids.some((id) => id.startsWith('temp-'))).toBe(false);
  });

  it('branch 3 — temp gone AND real absent (a backfill wiped the pages mid-send): prepends the real msg', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    const real = makeMessage({ id: 'real-3', body: 'hi' });
    vi.mocked(api.post).mockImplementation(async () => {
      // A reconnect refetch replaced the cache with server pages lacking our msg.
      qc.setQueryData<Pages>(KEY, {
        pages: [[makeMessage({ id: 'other' })]],
        pageParams: [undefined],
      });
      return real;
    });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' });
    });
    const ids = idsIn(qc);
    expect(ids).toContain('real-3'); // recovered instead of lost
    expect(ids).toContain('other');
    expect(ids.filter((id) => id === 'real-3')).toHaveLength(1); // no double-insert
  });

  it('seeds the cache when it is empty at success time', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    const real = makeMessage({ id: 'real-4' });
    vi.mocked(api.post).mockImplementation(async () => {
      qc.removeQueries({ queryKey: KEY });
      return real;
    });
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' });
    });
    expect(idsIn(qc)).toEqual(['real-4']);
  });
});


/**
 * A photograph or a voice note is drawn as itself, at once, and uploaded behind
 * its own bubble — and nothing about a slow or failed upload may take anything
 * else out of the thread.
 */
describe('useSendMessage — pictures and voice notes', () => {
  const uploaded = (name: string, kind: Attachment['kind'] = 'image'): Attachment => ({
    storageKey: `chat/c1/${name}`,
    filename: name,
    contentType: kind === 'image' ? 'image/jpeg' : 'audio/webm',
    size: 3,
    kind,
  });
  const file = (name: string, type = 'image/jpeg') => new File(['abc'], name, { type });

  let n = 0;
  beforeEach(() => {
    n = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => `blob:local-${(n += 1)}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });
  afterEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(uploadAttachment).mockReset();
    vi.useRealTimers();
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  const first = (qc: ReturnType<typeof makeTestQueryClient>) =>
    qc.getQueryData<Pages>(KEY)!.pages[0]![0]!;

  it('puts the phone\'s own copy of each picture and voice note in the bubble before anything is uploaded', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    vi.mocked(uploadAttachment).mockImplementation(() => new Promise(() => {})); // never finishes
    act(() => {
      result.current.mutate({
        conversationId: 'c1',
        files: [
          { file: file('IMG_1.jpg'), kind: 'image', contentType: 'image/jpeg' },
          { file: file('v.webm', 'audio/webm'), kind: 'audio', contentType: 'audio/webm', durationMs: 4000 },
          { file: file('rate.pdf', 'application/pdf'), kind: 'file', contentType: 'application/pdf' },
        ],
      });
    });
    await waitFor(() => expect(first(qc).id).toMatch(/^temp-/));
    const [img, voice, doc] = first(qc).attachments;
    expect(img).toMatchObject({ kind: 'image', filename: 'IMG_1.jpg', url: 'blob:local-1' });
    expect(voice).toMatchObject({ kind: 'audio', durationMs: 4000, url: 'blob:local-2' });
    // A document has nothing to show of itself yet; it is not given a link.
    expect(doc!.url).toBeUndefined();
    // Not real keys — nothing is stored yet — but unique, so the bubble can key on them.
    expect(new Set(first(qc).attachments.map((a) => a.storageKey)).size).toBe(3);
    expect(first(qc).attachments.every((a) => a.storageKey.startsWith('local:'))).toBe(true);
  });

  it('uploads behind the bubble, posts what was stored, and swaps in the real message', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    vi.mocked(uploadAttachment).mockResolvedValue(uploaded('IMG_1.jpg'));
    const real = makeMessage({ id: 'real-9', body: 'cap', attachments: [uploaded('IMG_1.jpg')] });
    vi.mocked(api.post).mockResolvedValue(real);
    let tempId = '';
    vi.mocked(api.post).mockImplementationOnce(async () => {
      tempId = first(qc).id;
      return real;
    });
    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'c1',
        body: 'cap',
        files: [{ file: file('IMG_1.jpg'), kind: 'image', contentType: 'image/jpeg' }],
      });
    });
    expect(uploadAttachment).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.post).mock.calls[0]![1]).toMatchObject({
      body: 'cap',
      attachments: [expect.objectContaining({ storageKey: 'chat/c1/IMG_1.jpg' })],
    });
    expect(idsIn(qc)).toEqual(['real-9']);
    // The row the dealer was looking at is the row the real message is drawn in.
    expect(tempId).toMatch(/^temp-/);
    expect(renderKey('real-9')).toBe(tempId);
  });

  it('keeps going past a file that fails, and says which one', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    vi.mocked(uploadAttachment)
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce(uploaded('b.jpg'));
    vi.mocked(api.post).mockResolvedValue(makeMessage({ id: 'real-1' }));
    const onFileFailed = vi.fn();
    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'c1',
        files: [
          { file: file('a.jpg'), kind: 'image' },
          { file: file('b.jpg'), kind: 'image' },
        ],
        onFileFailed,
      });
    });
    expect(onFileFailed).toHaveBeenCalledTimes(1);
    expect(onFileFailed.mock.calls[0]![0].file.name).toBe('a.jpg');
    expect(vi.mocked(api.post).mock.calls[0]![1]).toMatchObject({
      attachments: [expect.objectContaining({ storageKey: 'chat/c1/b.jpg' })],
    });
    expect(idsIn(qc)).toEqual(['real-1']);
  });

  it('when every file fails and there are no words, nothing is posted, and the bubble goes', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([makeMessage({ id: 's1' })]);
    vi.mocked(uploadAttachment).mockRejectedValue(new Error('net'));
    let error: unknown;
    await act(async () => {
      await result.current
        .mutateAsync({
          conversationId: 'c1',
          files: [{ file: file('a.jpg'), kind: 'image' }],
        })
        .catch((e: unknown) => (error = e));
    });
    expect(error).toBeInstanceOf(NothingToSendError);
    expect(api.post).not.toHaveBeenCalled();
    expect(idsIn(qc)).toEqual(['s1']);
  });

  it('when every file fails but there ARE words, the words are still sent', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    vi.mocked(uploadAttachment).mockRejectedValue(new Error('net'));
    vi.mocked(api.post).mockResolvedValue(makeMessage({ id: 'real-2', body: 'words' }));
    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'c1',
        body: 'words',
        files: [{ file: file('a.jpg'), kind: 'image' }],
      });
    });
    expect(vi.mocked(api.post).mock.calls[0]![1]).toMatchObject({ body: 'words', attachments: [] });
    expect(idsIn(qc)).toEqual(['real-2']);
  });

  it('a failed send takes out ITS bubble only — what arrived meanwhile stays', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([makeMessage({ id: 's1' })]);
    let fail!: (e: Error) => void;
    vi.mocked(api.post).mockReturnValue(new Promise((_, rej) => (fail = rej)));
    let rejected = false;
    act(() => {
      void result.current
        .mutateAsync({ conversationId: 'c1', body: 'x' })
        .catch(() => (rejected = true));
    });
    await waitFor(() => expect(idsIn(qc).some((id) => id.startsWith('temp-'))).toBe(true));
    // A message lands from the other side while the request is out.
    qc.setQueryData<Pages>(KEY, (old) => ({
      ...old!,
      pages: [[makeMessage({ id: 'arrived' }), ...old!.pages[0]!], ...old!.pages.slice(1)],
    }));
    await act(async () => fail(new Error('500')));
    await waitFor(() => expect(rejected).toBe(true));
    expect(idsIn(qc).sort()).toEqual(['arrived', 's1']);
  });

  it('lets the local copies go when the send fails (the composer keeps its own)', async () => {
    signIn({ id: 'u1' });
    const { result } = seed([]);
    vi.mocked(uploadAttachment).mockResolvedValue(uploaded('a.jpg'));
    vi.mocked(api.post).mockRejectedValue(new Error('500'));
    await act(async () => {
      await result.current
        .mutateAsync({ conversationId: 'c1', files: [{ file: file('a.jpg'), kind: 'image' }] })
        .catch(() => {});
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-1');
  });

  it('keeps the local copy a while after success, so the picture does not blank while the real one loads, then lets it go', async () => {
    signIn({ id: 'u1' });
    const { result } = seed([]);
    vi.mocked(uploadAttachment).mockResolvedValue(uploaded('a.jpg'));
    vi.mocked(api.post).mockResolvedValue(makeMessage({ id: 'real-3' }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'c1',
        files: [{ file: file('a.jpg'), kind: 'image' }],
      });
    });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-1');
  });

  it('tells the gallery there is something new when a message carries a file', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    qc.setQueryData(['conversation', 'c1', 'media', 'media'], { pages: [[]], pageParams: [undefined] });
    vi.mocked(uploadAttachment).mockResolvedValue(uploaded('a.jpg'));
    vi.mocked(api.post).mockResolvedValue(
      makeMessage({ id: 'real-4', attachments: [uploaded('a.jpg')] }),
    );
    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'c1',
        files: [{ file: file('a.jpg'), kind: 'image' }],
      });
    });
    expect(qc.getQueryState(['conversation', 'c1', 'media', 'media'])?.isInvalidated).toBe(true);
  });

  it('a plain text message leaves the gallery alone', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    qc.setQueryData(['conversation', 'c1', 'media', 'media'], { pages: [[]], pageParams: [undefined] });
    vi.mocked(api.post).mockResolvedValue(makeMessage({ id: 'real-5' }));
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hi' });
    });
    expect(qc.getQueryState(['conversation', 'c1', 'media', 'media'])?.isInvalidated).toBe(false);
  });

  it('two sends in the same instant get different placeholders', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    vi.mocked(api.post).mockImplementation(() => new Promise(() => {}));
    act(() => {
      result.current.mutate({ conversationId: 'c1', body: 'one' });
      result.current.mutate({ conversationId: 'c1', body: 'two' });
    });
    await waitFor(() => expect(idsIn(qc)).toHaveLength(2));
    expect(new Set(idsIn(qc)).size).toBe(2);
  });
});

/**
 * ASKS LIVE IN THE CHAT (ADR 0019). A photo sent as the answer to one of MDG's
 * requests names it, so the server can file it where the request lives.
 */
describe('useSendMessage — answering a request', () => {
  const REF = 'doc:ask1';
  const stored: Attachment = {
    storageKey: 'chat/c1/noc.jpg',
    filename: 'noc.jpg',
    contentType: 'image/jpeg',
    size: 3,
    kind: 'image',
  };
  const photo = () => ({
    file: new File(['abc'], 'noc.jpg', { type: 'image/jpeg' }),
    kind: 'image' as const,
    contentType: 'image/jpeg',
  });
  const STATES_KEY = chatAskStatesKey('c1', REF);

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:local'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });
  afterEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(uploadAttachment).mockReset();
    vi.useRealTimers();
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  it('posts answersAsk beside the reply target', async () => {
    signIn({ id: 'u1' });
    const { result } = seed([]);
    vi.mocked(uploadAttachment).mockResolvedValue(stored);
    vi.mocked(api.post).mockResolvedValue(makeMessage({ id: 'real-1' }));
    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'c1',
        files: [photo()],
        replyToMessageId: 'ask-msg',
        answersAsk: REF,
      });
    });
    expect(api.post).toHaveBeenCalledWith('/v1/conversations/c1/messages', {
      body: undefined,
      attachments: [stored],
      replyToMessageId: 'ask-msg',
      answersAsk: REF,
    });
  });

  it('leaves answersAsk out of an ordinary message', async () => {
    signIn({ id: 'u1' });
    const { result } = seed([]);
    vi.mocked(api.post).mockResolvedValue(makeMessage({ id: 'real-1' }));
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'hello' });
    });
    expect(vi.mocked(api.post).mock.calls[0]![1]).not.toHaveProperty('answersAsk');
  });

  it('an answer whose photo failed posts NOTHING, even with a caption — no text-only "answer"', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    vi.mocked(uploadAttachment).mockRejectedValue(new Error('network'));
    let error: unknown;
    await act(async () => {
      await result.current
        .mutateAsync({
          conversationId: 'c1',
          body: 'noc attached',
          files: [photo()],
          replyToMessageId: 'ask-msg',
          answersAsk: REF,
        })
        .catch((e: unknown) => (error = e));
    });
    expect(error).toBeInstanceOf(NothingToSendError);
    expect(api.post).not.toHaveBeenCalled();
    // The bubble goes, and the composer gets the photo and the caption back.
    expect(idsIn(qc)).toEqual([]);
  });

  it('an ordinary message whose photo failed still sends its words (unchanged)', async () => {
    signIn({ id: 'u1' });
    const { result } = seed([]);
    vi.mocked(uploadAttachment).mockRejectedValue(new Error('network'));
    vi.mocked(api.post).mockResolvedValue(makeMessage({ id: 'real-1' }));
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', body: 'words', files: [photo()] });
    });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('draws the request as SENT at once, before the server has said anything', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    qc.setQueryData<ChatAskState[]>(STATES_KEY, [{ ref: REF, status: 'open' }]);
    vi.mocked(uploadAttachment).mockResolvedValue(stored);
    vi.mocked(api.post).mockResolvedValue(
      makeMessage({ id: 'real-1', attachments: [stored], answersAsk: REF }),
    );
    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'c1',
        files: [photo()],
        answersAsk: REF,
      });
    });
    expect(qc.getQueryData(STATES_KEY)).toEqual([{ ref: REF, status: 'sent' }]);
  });

  it('asks the server again a few seconds later, which catches a filing that failed quietly', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    qc.setQueryData<ChatAskState[]>(STATES_KEY, [{ ref: REF, status: 'open' }]);
    vi.mocked(uploadAttachment).mockResolvedValue(stored);
    vi.mocked(api.post).mockResolvedValue(
      makeMessage({ id: 'real-1', attachments: [stored], answersAsk: REF }),
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'c1',
        files: [photo()],
        answersAsk: REF,
      });
    });
    expect(qc.getQueryState(STATES_KEY)?.isInvalidated).toBe(false);
    act(() => {
      vi.advanceTimersByTime(4_100);
    });
    expect(qc.getQueryState(STATES_KEY)?.isInvalidated).toBe(true);
  });

  it('draws the request as SENT while the photo is still uploading — the button is not live mid-upload', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    qc.setQueryData<ChatAskState[]>(STATES_KEY, [{ ref: REF, status: 'open' }]);
    let finishUpload!: (a: Attachment) => void;
    vi.mocked(uploadAttachment).mockImplementation(
      () => new Promise<Attachment>((resolve) => (finishUpload = resolve)),
    );
    vi.mocked(api.post).mockResolvedValue(
      makeMessage({ id: 'real-1', attachments: [stored], answersAsk: REF }),
    );

    act(() => {
      result.current.mutate({ conversationId: 'c1', files: [photo()], answersAsk: REF });
    });

    // The upload has not finished and nothing has been posted — and it already reads "sent".
    await waitFor(() =>
      expect(qc.getQueryData(STATES_KEY)).toEqual([{ ref: REF, status: 'sent' }]),
    );
    expect(api.post).not.toHaveBeenCalled();

    await act(async () => {
      finishUpload(stored);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(STATES_KEY)).toEqual([{ ref: REF, status: 'sent' }]);
  });

  it('gives the button back when the photo never goes — no "sent" for nothing', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    qc.setQueryData<ChatAskState[]>(STATES_KEY, [
      { ref: REF, status: 'open', rejectReason: 'Blurred — retake it' },
    ]);
    vi.mocked(uploadAttachment).mockRejectedValue(new Error('network'));
    await act(async () => {
      await result.current
        .mutateAsync({ conversationId: 'c1', files: [photo()], answersAsk: REF })
        .catch(() => undefined);
    });
    // Exactly as it was — including the reason MDG gave last time.
    expect(qc.getQueryData(STATES_KEY)).toEqual([
      { ref: REF, status: 'open', rejectReason: 'Blurred — retake it' },
    ]);
  });

  it('taking it back does not undo what the server said in the meantime', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    qc.setQueryData<ChatAskState[]>(STATES_KEY, [{ ref: REF, status: 'open' }]);
    let failUpload!: (e: Error) => void;
    vi.mocked(uploadAttachment).mockImplementation(
      () => new Promise<Attachment>((_, reject) => (failUpload = reject)),
    );
    let settled!: Promise<unknown>;
    act(() => {
      settled = result.current
        .mutateAsync({ conversationId: 'c1', files: [photo()], answersAsk: REF })
        .catch(() => undefined);
    });
    await waitFor(() =>
      expect(qc.getQueryData(STATES_KEY)).toEqual([{ ref: REF, status: 'sent' }]),
    );
    // A refetch lands during the upload: someone else got it to MDG first.
    qc.setQueryData<ChatAskState[]>(STATES_KEY, [{ ref: REF, status: 'received' }]);

    await act(async () => {
      failUpload(new Error('network'));
      await settled;
    });
    expect(qc.getQueryData(STATES_KEY)).toEqual([{ ref: REF, status: 'received' }]);
  });

  it('a failed send leaves the request exactly as it was — still open', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    qc.setQueryData<ChatAskState[]>(STATES_KEY, [{ ref: REF, status: 'open' }]);
    vi.mocked(uploadAttachment).mockResolvedValue(stored);
    vi.mocked(api.post).mockRejectedValue(new Error('500'));
    await act(async () => {
      await result.current
        .mutateAsync({ conversationId: 'c1', files: [photo()], answersAsk: REF })
        .catch(() => undefined);
    });
    expect(qc.getQueryData(STATES_KEY)).toEqual([{ ref: REF, status: 'open' }]);
  });

  it('touches no request state for a message that answers nothing', async () => {
    signIn({ id: 'u1' });
    const { qc, result } = seed([]);
    qc.setQueryData<ChatAskState[]>(STATES_KEY, [{ ref: REF, status: 'open' }]);
    vi.mocked(uploadAttachment).mockResolvedValue(stored);
    vi.mocked(api.post).mockResolvedValue(makeMessage({ id: 'real-1', attachments: [stored] }));
    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', files: [photo()] });
    });
    expect(qc.getQueryData(STATES_KEY)).toEqual([{ ref: REF, status: 'open' }]);
  });
});
