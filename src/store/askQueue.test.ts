import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_PERSIST_BYTES,
  MAX_QUEUED,
  base64ToFile,
  fileToBase64,
  queuedFor,
  queuedKeysFor,
  useAskQueueStore,
  type QueuedAskPhoto,
} from './askQueue';

/**
 * The queue that means a photograph taken in a dead spot is not lost.
 *
 * The two failures this file is written against are both silent. A photograph
 * that does not survive a reload is simply gone, and nothing in the app says so.
 * A photograph that is written down but comes back in a state the send loop
 * skips sits there for ever looking busy, which is worse — the card promises the
 * dealer it will go, and it never does.
 */

const STORE_KEY = 'mdg.client.askQueue';

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

afterEach(() => {
  useAskQueueStore.setState({ items: [] });
  localStorage.clear();
});

/**
 * Close the tab and open it again.
 *
 * The disk snapshot has to be taken BEFORE the in-memory state is cleared and
 * put back afterwards, because `persist` writes on every `set` — clearing the
 * store would otherwise overwrite the very thing the reload is supposed to read
 * back, and the test would prove nothing while looking like it did.
 */
async function reload(): Promise<void> {
  const snapshot = localStorage.getItem(STORE_KEY);
  useAskQueueStore.setState({ items: [] });
  if (snapshot !== null) localStorage.setItem(STORE_KEY, snapshot);
  else localStorage.removeItem(STORE_KEY);
  await useAskQueueStore.persist.rehydrate();
}

/** jsdom's `Blob` has no `arrayBuffer()`, so the bytes come back the long way. */
function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file);
  });
}

describe('the queue survives a reload', () => {
  it('writes the photograph to localStorage and reads it back', async () => {
    useAskQueueStore.getState().enqueue(item());
    expect(localStorage.getItem(STORE_KEY) ?? '').toContain('tt-register-page');

    await reload();

    const items = useAskQueueStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.base64).toBe('AQID');
    expect(items[0]?.clientRef).toBe('ref-00000001');
  });

  /**
   * Nothing is in flight after a reload. An entry rehydrated as `sending` would
   * be skipped by the send loop, which only ever picks up `queued` — so the
   * photograph would sit there for ever, looking as though it were going.
   */
  it('brings an interrupted send back as something the loop will pick up', async () => {
    useAskQueueStore.getState().enqueue(item({ state: 'sending' }));
    await reload();

    expect(useAskQueueStore.getState().items[0]?.state).toBe('queued');
  });

  /**
   * localStorage is about five megabytes for the whole app. An unusually large
   * photograph still sends in this session; it is simply not written down, and
   * a reload loses that one rather than the whole queue.
   */
  it('keeps an oversized photograph in memory without writing it down', async () => {
    useAskQueueStore.getState().enqueue(item({ base64: 'A'.repeat(MAX_PERSIST_BYTES + 1) }));
    expect(useAskQueueStore.getState().items).toHaveLength(1);

    await reload();
    expect(useAskQueueStore.getState().items).toHaveLength(0);
  });
});

describe('the queue stays small', () => {
  it('drops the oldest rather than refusing a new photograph', () => {
    for (let i = 0; i < MAX_QUEUED + 2; i += 1) {
      useAskQueueStore.getState().enqueue(item({ matchKey: `k${i}`, clientRef: `ref-0000000${i}` }));
    }
    const items = useAskQueueStore.getState().items;
    expect(items).toHaveLength(MAX_QUEUED);
    // The newest is kept, the oldest is gone. A queue that refused new
    // photographs would leave the dealer holding a camera that does nothing.
    expect(items[items.length - 1]?.matchKey).toBe(`k${MAX_QUEUED + 1}`);
    expect(items.map((i) => i.matchKey)).not.toContain('k0');
  });

  /** Retaking a page means the second photograph, not both. */
  it('replaces an earlier photograph for the same period', () => {
    useAskQueueStore.getState().enqueue(item({ base64: 'first' }));
    useAskQueueStore.getState().enqueue(item({ base64: 'second' }));
    expect(useAskQueueStore.getState().items).toHaveLength(1);
    expect(useAskQueueStore.getState().items[0]?.base64).toBe('second');
  });
});

describe('what the screens read off the queue', () => {
  it('hides the camera only for photographs that are actually going', () => {
    useAskQueueStore.setState({
      items: [
        item({ matchKey: 'waiting', state: 'queued' }),
        item({ matchKey: 'going', state: 'sending' }),
        item({ matchKey: 'refused', state: 'stuck' }),
      ],
    });
    const keys = queuedKeysFor(useAskQueueStore.getState().items, 'd1');
    expect(keys.has('waiting')).toBe(true);
    expect(keys.has('going')).toBe(true);
    // A stuck photograph needs the camera BACK: "that photo did not go through,
    // please send it again" with no way to send it again is a dead end.
    expect(keys.has('refused')).toBe(false);
  });

  it('never shows one outlet’s photographs to another', () => {
    useAskQueueStore.setState({
      items: [item({ matchKey: 'mine' }), item({ matchKey: 'theirs', dealerId: 'd2' })],
    });
    expect(queuedFor(useAskQueueStore.getState().items, 'd1').map((i) => i.matchKey)).toEqual([
      'mine',
    ]);
    expect(queuedKeysFor(useAskQueueStore.getState().items, undefined).size).toBe(0);
  });
});

describe('the bytes go in and come back out unchanged', () => {
  it('round-trips a file through base64 and back', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const original = new File([bytes], 'page.jpg', { type: 'image/jpeg' });

    const base64 = await fileToBase64(original);
    // The `data:<mime>;base64,` prefix is dropped — the MIME is already on the
    // entry, and storing it twice is a way for the two to disagree.
    expect(base64).not.toContain('data:');

    const restored = base64ToFile(item({ base64, size: bytes.length }));
    expect(restored.name).toBe('page.jpg');
    expect(restored.type).toBe('image/jpeg');
    expect(await readBytes(restored)).toEqual(bytes);
  });

  /** The chunked decode exists for a megabyte of base64 on a 512 MB phone. */
  it('round-trips something bigger than one decode slice', async () => {
    const bytes = new Uint8Array(20_000).map((_, i) => i % 256);
    const original = new File([bytes], 'big.jpg', { type: 'image/jpeg' });
    const restored = base64ToFile(
      item({ base64: await fileToBase64(original), size: bytes.length }),
    );
    expect(await readBytes(restored)).toEqual(bytes);
  });
});
