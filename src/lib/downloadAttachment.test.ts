import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Attachment } from '@dk/shared/types';

import {
  downloadAttachment,
  fetchFreshDownloadUrl,
  type AttachmentSource,
} from './downloadAttachment';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

const attachment: Attachment = {
  storageKey: 'chat/c1/uuid-photo.jpg',
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
  size: 1234,
  kind: 'image',
  // A stale embedded URL that must NEVER be used for downloads (900s expiry).
  url: 'https://s3.test/stale?sig=old',
};

/** Where it was found. Presigning is authorised through the message, not the key. */
const source: AttachmentSource = { conversationId: 'c1', messageId: 'm1' };

/**
 * A DSR card: same shape, but stored under the RUN's prefix rather than the
 * conversation's. `GET /uploads/download-url` refuses `dealers/` outright, which
 * is why the download button under every shared report used to fail.
 */
const dsrCard: Attachment = {
  storageKey: 'dealers/64f000000000000000000001/dsr-cards/r1/dsr-sales-2026-09-01.png',
  filename: 'dsr-sales-2026-09-01.png',
  contentType: 'image/png',
  size: 4096,
  kind: 'image',
  url: 'https://s3.test/card?sig=old',
};

afterEach(() => {
  delete (window as { ReactNativeWebView?: unknown }).ReactNativeWebView;
});

describe('fetchFreshDownloadUrl', () => {
  it('presigns a fresh attachment-disposition URL for the storage key', async () => {
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    const url = await fetchFreshDownloadUrl(attachment, source);
    expect(api.get).toHaveBeenCalledWith(
      '/v1/conversations/c1/messages/m1/download-url',
      { key: attachment.storageKey, disposition: 'attachment' },
    );
    expect(url).toBe('https://s3.test/fresh?sig=new');
  });

  it('falls back to the generic route for a message the server has not seen yet', async () => {
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    // The optimistic bubble the composer just put in the thread: there is no
    // message row to authorise through, and the key is this dealer's own chat
    // upload, which the generic route does authorise.
    await fetchFreshDownloadUrl(attachment, {
      conversationId: 'c1',
      messageId: 'temp-1757000000000',
    });
    expect(api.get).toHaveBeenCalledWith('/v1/uploads/download-url', {
      key: attachment.storageKey,
      disposition: 'attachment',
      filename: attachment.filename,
    });
  });

  it('presigns a service card the same way — the key prefix is not consulted', async () => {
    api.get.mockResolvedValue({ url: 'https://s3.test/card?sig=new' });
    const url = await fetchFreshDownloadUrl(dsrCard, {
      conversationId: 'c9',
      messageId: 'm9',
    });
    expect(api.get).toHaveBeenCalledWith(
      '/v1/conversations/c9/messages/m9/download-url',
      { key: dsrCard.storageKey, disposition: 'attachment' },
    );
    expect(url).toBe('https://s3.test/card?sig=new');
  });
});

describe('downloadAttachment', () => {
  it('opens the FRESH url (not the stale embedded one) in a plain browser', async () => {
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const mode = await downloadAttachment(attachment, source);
    expect(mode).toBe('browser');
    expect(open).toHaveBeenCalledWith(
      'https://s3.test/fresh?sig=new',
      '_blank',
      'noopener',
    );
  });

  it('routes through the native bridge in the shell: started ack, then gallery save', async () => {
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    const postMessage = vi.fn((raw: string) => {
      const msg = JSON.parse(raw) as { type: string; id: string; url: string };
      expect(msg.type).toBe('media:download');
      expect(msg.url).toBe('https://s3.test/fresh?sig=new');
      // A new shell acks immediately (before the slow download work) …
      queueMicrotask(() => {
        window.dispatchEvent(
          new CustomEvent('native-media-download-started', {
            detail: { id: msg.id },
          }),
        );
      });
      // … and reports the outcome later. The ack must NOT consume the pending
      // request — the result still has to settle it.
      queueMicrotask(() => {
        window.dispatchEvent(
          new CustomEvent('native-media-download', {
            detail: { id: msg.id, ok: true, mode: 'gallery' },
          }),
        );
      });
    });
    (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
      postMessage,
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const mode = await downloadAttachment(attachment, source);
    expect(mode).toBe('gallery');
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('falls back to window.open when an old shell never acks (3s)', async () => {
    vi.useFakeTimers();
    try {
      api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
      (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
        postMessage: vi.fn(), // old shell: swallows the message, never replies
      };
      const open = vi.spyOn(window, 'open').mockReturnValue(null);

      const promise = downloadAttachment(attachment, source);
      await vi.advanceTimersByTimeAsync(3000);
      const mode = await promise;
      expect(mode).toBe('browser');
      expect(open).toHaveBeenCalledWith(
        'https://s3.test/fresh?sig=new',
        '_blank',
        'noopener',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('after an ack, a slow shell gets the LONG window — no browser fallback at 3s', async () => {
    vi.useFakeTimers();
    try {
      api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
      (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
        postMessage: vi.fn((raw: string) => {
          const msg = JSON.parse(raw) as { id: string };
          // New shell on 2G: acks instantly, then downloads for a long time.
          queueMicrotask(() => {
            window.dispatchEvent(
              new CustomEvent('native-media-download-started', {
                detail: { id: msg.id },
              }),
            );
          });
          // Gallery save completes ~50s in — far beyond the old 8s heuristic.
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('native-media-download', {
                detail: { id: msg.id, ok: true, mode: 'gallery' },
              }),
            );
          }, 50_000);
        }),
      };
      const open = vi.spyOn(window, 'open').mockReturnValue(null);

      const promise = downloadAttachment(attachment, source);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(open).not.toHaveBeenCalled(); // still waiting, no double download
      await vi.advanceTimersByTimeAsync(40_000);
      const mode = await promise;
      expect(mode).toBe('gallery');
      expect(open).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('acked but never completed → FAILS after the completion cap, never window.open', async () => {
    vi.useFakeTimers();
    try {
      api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
      (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
        postMessage: vi.fn((raw: string) => {
          const msg = JSON.parse(raw) as { id: string };
          // Shell takes the job … and then goes silent.
          queueMicrotask(() => {
            window.dispatchEvent(
              new CustomEvent('native-media-download-started', {
                detail: { id: msg.id },
              }),
            );
          });
        }),
      };
      const open = vi.spyOn(window, 'open').mockReturnValue(null);

      const promise = downloadAttachment(attachment, source);
      const outcome = expect(promise).rejects.toThrow('timeout');
      await vi.advanceTimersByTimeAsync(120_000);
      await outcome;
      // The shell may still be downloading — opening the browser too would
      // fetch the same file twice over the same 2G link.
      expect(open).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws when the shell reports a hard failure (no browser fallback)', async () => {
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
      postMessage: vi.fn((raw: string) => {
        const msg = JSON.parse(raw) as { id: string };
        queueMicrotask(() => {
          window.dispatchEvent(
            new CustomEvent('native-media-download', {
              detail: { id: msg.id, ok: false, error: 'denied' },
            }),
          );
        });
      }),
    };
    await expect(downloadAttachment(attachment, source)).rejects.toThrow('denied');
  });
});
