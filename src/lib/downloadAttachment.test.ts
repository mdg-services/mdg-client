import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderHookWithProviders } from '@/test/utils';
import type { Attachment } from '@dk/shared/types';

import {
  deliverDownload,
  downloadAttachment,
  fetchFreshDownloadUrl,
  useAttachmentDownload,
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

// A file whose link was fetched AFTER the tap (a GST invoice): a new tab opened
// from there is blocked by Safari without a word, so the page itself is taken to
// the link, which saves the file (attachment disposition) and leaves the page.
describe('deliverDownload — sameTab', () => {
  const file = {
    url: 'https://s3.test/gst/invoice?sig=abc',
    filename: 'MDG-26-27-00001.pdf',
    contentType: 'application/pdf',
    kind: 'file' as const,
  };

  it('in a browser, clicks a link to the file in this tab and opens no window', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const clicked: Array<{ href: string; target: string; download: string }> = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ href: this.href, target: this.target, download: this.download });
      });

    const mode = await deliverDownload(file, { sameTab: true });

    expect(mode).toBe('browser');
    expect(click).toHaveBeenCalledTimes(1);
    expect(clicked[0]).toEqual({ href: file.url, target: '', download: file.filename });
    expect(open).not.toHaveBeenCalled();
    // The hidden link does not stay on the page.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('without the option, a browser still opens a new tab as before', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await deliverDownload(file);

    expect(open).toHaveBeenCalledWith(file.url, '_blank', 'noopener');
    expect(click).not.toHaveBeenCalled();
  });

  it('inside the app it still uses the app’s downloader, never the link', async () => {
    const postMessage = vi.fn((raw: string) => {
      const msg = JSON.parse(raw) as { type: string; id: string };
      expect(msg.type).toBe('media:download');
      window.dispatchEvent(
        new CustomEvent('native-media-download-started', { detail: { id: msg.id } }),
      );
      window.dispatchEvent(
        new CustomEvent('native-media-download', { detail: { id: msg.id, ok: true, mode: 'browser' } }),
      );
    });
    (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await deliverDownload(file, { sameTab: true });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});

/** A shell that takes the job and answers with this mode. */
function shellAnswers(mode: 'gallery' | 'browser' | 'share', extra: Record<string, unknown> = {}) {
  (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
    postMessage: vi.fn((raw: string) => {
      const msg = JSON.parse(raw) as { id: string };
      queueMicrotask(() => {
        window.dispatchEvent(
          new CustomEvent('native-media-download-started', { detail: { id: msg.id } }),
        );
        window.dispatchEvent(
          new CustomEvent('native-media-download', {
            detail: { id: msg.id, ok: true, mode, ...extra },
          }),
        );
      });
    }),
  };
}

const invoice: Attachment = {
  storageKey: 'chat/c1/uuid-invoice.pdf',
  filename: 'invoice.pdf',
  contentType: 'application/pdf',
  size: 90_000,
  kind: 'file',
  url: 'https://s3.test/stale?sig=old',
};

// On an iPhone the shell shows anything that is not a picture in the share sheet.
describe('a file shown in the share sheet', () => {
  it('comes back as "share", with no browser opened', async () => {
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    shellAnswers('share');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const mode = await downloadAttachment(invoice, source);

    expect(mode).toBe('share');
    expect(open).not.toHaveBeenCalled();
  });

  it('asks for the file by its own type, so the sheet knows what it holds', async () => {
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    shellAnswers('share');
    await downloadAttachment(invoice, source);
    const raw = vi.mocked(
      (window as unknown as { ReactNativeWebView: { postMessage: (m: string) => void } })
        .ReactNativeWebView.postMessage,
    ).mock.calls[0]![0];
    expect(JSON.parse(raw)).toMatchObject({
      type: 'media:download',
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
      kind: 'file',
    });
  });
});

describe('useAttachmentDownload — what the dealer is told', () => {
  beforeEach(() => {
    useLangStore.setState({ lang: 'en', explicit: true });
    api.get.mockResolvedValue({ url: 'https://s3.test/fresh?sig=new' });
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    delete (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__;
  });

  async function download(item: Attachment) {
    const { result } = renderHookWithProviders(() => useAttachmentDownload());
    await act(async () => {
      await result.current(item, source);
    });
  }

  it('Android: "Saved to your gallery"', async () => {
    (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__ = 'android';
    shellAnswers('gallery');
    await download(attachment);
    expect(screen.getByText('Saved to your gallery')).toBeInTheDocument();
  });

  it('iPhone: "Saved to Photos" — it has no gallery', async () => {
    (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__ = 'ios';
    shellAnswers('gallery');
    await download(attachment);
    expect(screen.getByText('Saved to Photos')).toBeInTheDocument();
    expect(screen.queryByText('Saved to your gallery')).toBeNull();
  });

  it('iPhone, in Hindi', async () => {
    useLangStore.setState({ lang: 'hi', explicit: true });
    (window as unknown as { __DK_NATIVE_PLATFORM__?: string }).__DK_NATIVE_PLATFORM__ = 'ios';
    shellAnswers('gallery');
    await download(attachment);
    expect(screen.getByText('फ़ोटो में सेव हो गया')).toBeInTheDocument();
  });

  it('a browser download still says it started in the browser', async () => {
    shellAnswers('browser');
    await download(invoice);
    expect(screen.getByText('Download started in your browser')).toBeInTheDocument();
  });

  // The share sheet on screen IS the answer. "Started in your browser" beneath it
  // would be untrue, and "Saving…" must not be left hanging either.
  it('a share sheet gets no toast at all, and "Saving…" is gone', async () => {
    shellAnswers('share');
    await download(invoice);
    expect(screen.queryByText('Download started in your browser')).toBeNull();
    expect(screen.queryByText(/Saved to/)).toBeNull();
    expect(screen.queryByText('Saving…')).toBeNull();
    expect(screen.queryByText(/Couldn't download/)).toBeNull();
  });

  it('a failure still says so', async () => {
    (window as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
      postMessage: vi.fn((raw: string) => {
        const msg = JSON.parse(raw) as { id: string };
        queueMicrotask(() =>
          window.dispatchEvent(
            new CustomEvent('native-media-download', {
              detail: { id: msg.id, ok: false, error: 'denied' },
            }),
          ),
        );
      }),
    };
    await download(invoice);
    expect(screen.getByText(/Couldn't download/)).toBeInTheDocument();
  });
});
