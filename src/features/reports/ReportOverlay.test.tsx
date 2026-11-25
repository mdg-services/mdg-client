import { QueryClient, onlineManager } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiModule from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { Attachment, ReportDetail, TodayReport } from '@dk/shared/types';

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof ApiModule>();
  return { ...real, api: { ...real.api, get: apiGet, post: apiPost } };
});
const downloadSpy = vi.hoisted(() => vi.fn());
const freshUrl = vi.hoisted(() => vi.fn());
vi.mock('@/lib/downloadAttachment', () => ({
  useAttachmentDownload: () => downloadSpy,
  fetchFreshInlineUrl: freshUrl,
}));
const copyText = vi.hoisted(() => vi.fn());
vi.mock('@/lib/clipboard', () => ({ copyText }));

// The kinds' own drawings are other builders' work and are tested with them. The shell is
// tested against a stand-in view that says what it was given.
const view = vi.hoisted(() => ({
  crash: false,
  alert: null as null | { headline: string; line: string; severity: 'problem' | 'attention' },
  /** The buttons the stand-in kind offers, built from the context the overlay hands it. */
  actions: null as null | ((ctx: unknown) => unknown[]),
  actionsCrash: false,
}));
vi.mock('./registry', () => ({
  KIND_VIEWS: {},
  getKindView: () => fakeView(),
  viewOfData: () => fakeView(),
}));
function fakeView() {
  return {
    Overlay: ({ data, lang }: { data: { kind: string }; lang: string }) => {
      if (view.crash) throw new Error('drawing failed');
      return (
        <div data-testid="kind-overlay" data-lang={lang}>
          drawn:{data.kind}
        </div>
      );
    },
    Glyph: () => null,
    tile: () => null,
    alert: () => view.alert,
    headline: (d: { kind: string }) => `headline:${d.kind}`,
    share: (d: { kind: string }, lang: string) => `share:${d.kind}:${lang}`,
    actions: (_d: unknown, _r: unknown, ctx: unknown) => {
      if (view.actionsCrash) throw new Error('actions failed');
      return view.actions ? view.actions(ctx) : [];
    },
  };
}

const { ReportOverlay } = await import('./ReportOverlay');
const { ApiError } = await import('@/lib/api');

const snapshot = { kind: 'dsr_sales', v: 1, businessDate: '2026-11-23', capturedAt: '2026-11-24T04:44:00.000Z', products: [] };

const detail = (over: Partial<ReportDetail> = {}, live: ReportDetail['live'] = {}): ReportDetail => ({
  id: 'm1',
  kind: 'dsr_sales',
  status: 'ok',
  day: '2026-11-23',
  sentAt: '2026-11-24T04:50:00.000Z',
  headline: 'Kal ki bikri ki report taiyaar hai.',
  attachments: [],
  conversationId: 'c1',
  messageId: 'm1',
  data: snapshot as never,
  ...over,
  live,
});

const card: Attachment = {
  storageKey: 'dsr/15E/sales.png',
  filename: 'dsr-sales.png',
  contentType: 'image/png',
  size: 100,
  kind: 'image',
  url: 'https://files.test/dsr-sales.png',
};

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: Infinity, staleTime: 0 } },
  });
}

function setup(props: Partial<React.ComponentProps<typeof ReportOverlay>> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onOpenNewer: vi.fn(),
    onSeeInChat: vi.fn(),
    onGoToday: vi.fn(),
  };
  const utils = renderWithProviders(
    <ReportOverlay conversationId="c1" messageId="m1" {...handlers} {...props} />,
    { queryClient: makeClient() },
  );
  return { ...handlers, ...utils };
}

const setShare = (fn: unknown) =>
  Object.defineProperty(navigator, 'share', { value: fn, configurable: true, writable: true });

beforeEach(() => {
  signIn({ role: 'dealer-owner' });
  useLangStore.setState({ lang: 'en', explicit: true });
  view.crash = false;
  view.alert = null;
  view.actions = null;
  view.actionsCrash = false;
  apiGet.mockReset();
  apiPost.mockReset();
  freshUrl.mockResolvedValue('https://files.test/fresh.png');
});
afterEach(() => {
  cleanup();
  resetStores();
  copyText.mockReset();
  downloadSpy.mockReset();
  delete (navigator as unknown as { share?: unknown }).share;
});

describe('the shell of a report: header, body, actions', () => {
  it('shows a skeleton while the answer is awaited, with Close already there', () => {
    apiGet.mockReturnValue(new Promise(() => undefined));
    setup();
    expect(screen.getByTestId('report-skeleton')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('report-close')).toHaveTextContent('Close');
    // Nothing to share or see in chat yet.
    expect(screen.queryByTestId('report-share')).toBeNull();
    expect(screen.queryByTestId('report-see-in-chat')).toBeNull();
  });

  it('asks the server for this one message, never the Today feed', async () => {
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0]![0]).toBe('/v1/me/reports/m1');
  });

  it('draws the kind\'s own view from the snapshot, in the reader\'s language', async () => {
    apiGet.mockResolvedValue(detail());
    setup();
    const body = await screen.findByTestId('kind-overlay');
    expect(body).toHaveTextContent('drawn:dsr_sales');
    expect(body).toHaveAttribute('data-lang', 'en');
  });

  it('draws the row the opener held AT ONCE, then the server\'s copy replaces it', async () => {
    let answer!: (d: ReportDetail) => void;
    apiGet.mockReturnValue(new Promise<ReportDetail>((r) => (answer = r)));
    const row: TodayReport = { ...detail() };
    delete (row as Partial<ReportDetail>).live;
    setup({ placeholder: row });
    // No wait: the snapshot on the row is the whole report.
    expect(screen.getByTestId('kind-overlay')).toHaveTextContent('drawn:dsr_sales');
    expect(screen.queryByTestId('report-skeleton')).toBeNull();
    await act(async () => answer(detail({}, { newerMessageId: 'm2' })));
    // The live state arrived with the server's answer.
    expect(await screen.findByTestId('report-banner')).toHaveAttribute('data-banner', 'newer');
  });

  it('ignores a held row that is about another message', async () => {
    apiGet.mockReturnValue(new Promise(() => undefined));
    setup({ placeholder: { ...detail(), messageId: 'other' } });
    expect(screen.getByTestId('report-skeleton')).toBeInTheDocument();
  });

  it('prints the report\'s name, the day it is about and the as-of time, in the family colour', async () => {
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    const overlay = screen.getByTestId('report-overlay');
    expect(overlay).toHaveAttribute('role', 'dialog');
    expect(overlay).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Daily sales (DSR)');
    expect(overlay).toHaveAttribute('aria-labelledby', screen.getByRole('heading', { level: 1 }).id);
    // The day is the report's business day, not the day it was sent.
    expect(screen.getByTestId('report-when').textContent).toMatch(/^Mon, 23 Nov · as of /i);
    // The family is a rule along the header's top edge; the header itself stays white and calm.
    expect(overlay.querySelector('header')).toHaveStyle({ boxShadow: 'inset 0 3px 0 var(--kind-dsr)' });
  });

  it('names the same report in Hindi and in Hinglish', async () => {
    apiGet.mockResolvedValue(detail());
    useLangStore.setState({ lang: 'hi', explicit: true });
    const hi = setup();
    await screen.findByTestId('kind-overlay');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('बिक्री रिपोर्ट (DSR)');
    expect(screen.getByTestId('report-close')).toHaveTextContent('बंद करें');
    hi.unmount();
    useLangStore.setState({ lang: 'hl', explicit: true });
    setup();
    await screen.findByTestId('kind-overlay');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bikri report (DSR)');
    expect(screen.getByTestId('report-close')).toHaveTextContent('Band karein');
  });

  describe('how it stands: a shape and a word, never colour alone', () => {
    it('says what the report\'s tag says', async () => {
      apiGet.mockResolvedValue(detail({ status: 'attention' }));
      setup();
      await screen.findByTestId('kind-overlay');
      const badge = within(screen.getByTestId('report-status'));
      expect(badge.getByText('Needs a look')).toBeInTheDocument();
      expect(screen.getByTestId('report-status').querySelector('svg')).not.toBeNull();
    });

    it('lets the kind call a problem a problem', async () => {
      view.alert = { headline: 'Diesel 412 L short', line: 'x', severity: 'problem' };
      apiGet.mockResolvedValue(detail({ status: 'attention' }));
      setup();
      await screen.findByTestId('kind-overlay');
      expect(within(screen.getByTestId('report-status')).getByText('Problem')).toBeInTheDocument();
    });

    it('drops an older report to grey and says so, so a stale red is never taken for today\'s', async () => {
      view.alert = { headline: 'x', line: 'x', severity: 'problem' };
      apiGet.mockResolvedValue(detail({}, { newerMessageId: 'm2' }));
      setup();
      await screen.findByTestId('kind-overlay');
      const badge = within(screen.getByTestId('report-status'));
      expect(badge.getByText('Older')).toBeInTheDocument();
      expect(badge.queryByText('Problem')).toBeNull();
    });
  });

  it('has Share and See in chat pinned at the bottom, 48 px tall', async () => {
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    for (const id of ['report-share', 'report-see-in-chat']) {
      expect(screen.getByTestId(id).className).toMatch(/min-h-12/);
    }
    expect(screen.getByTestId('report-share')).toHaveTextContent('Share');
    expect(screen.getByTestId('report-see-in-chat')).toHaveTextContent('See in chat');
    // Footer sits outside the scrolling body, so it stays put.
    expect(screen.getByTestId('report-body').contains(screen.getByTestId('report-share'))).toBe(false);
    expect(screen.getByTestId('report-close').closest('header')).not.toBeNull();
  });

  it('closes from the Close button and from Escape', async () => {
    apiGet.mockResolvedValue(detail());
    const { onClose } = setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('moves focus into the overlay on open', async () => {
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    expect(document.activeElement).toBe(screen.getByTestId('report-overlay'));
  });

  it('asks to see the report in its chat, by the message', async () => {
    apiGet.mockResolvedValue(detail());
    const { onSeeInChat } = setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-see-in-chat'));
    expect(onSeeInChat).toHaveBeenCalledWith({ conversationId: 'c1', messageId: 'm1' });
  });
});

describe('Share sends words, not a picture', () => {
  it('hands the kind\'s summary to the phone\'s share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-share'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0]![0]).toMatchObject({ text: 'share:dsr_sales:en' });
    expect(copyText).not.toHaveBeenCalled();
  });

  it('copies it and says so when the phone has no share sheet', async () => {
    copyText.mockResolvedValue(true);
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-share'));
    expect(await screen.findByText('Copied. Paste it in WhatsApp to send.')).toBeInTheDocument();
    expect(copyText).toHaveBeenCalledWith('share:dsr_sales:en');
  });

  it('says plainly when it could not share at all', async () => {
    copyText.mockResolvedValue(false);
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-share'));
    expect(await screen.findByText('Could not share this. Please try again.')).toBeInTheDocument();
  });

  it('writes the summary in the reader\'s language', async () => {
    copyText.mockResolvedValue(true);
    useLangStore.setState({ lang: 'hl', explicit: true });
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-share'));
    await waitFor(() => expect(copyText).toHaveBeenCalledWith('share:dsr_sales:hl'));
  });
});

describe('one banner at a time, in order', () => {
  it('says the team removed it, and keeps showing the copy the dealer was reading', async () => {
    apiGet.mockRejectedValue(new ApiError(410, 'REPORT_GONE', 'gone'));
    setup({ placeholder: detail() });
    const banner = await screen.findByTestId('report-banner');
    expect(banner).toHaveAttribute('data-banner', 'deleted');
    expect(banner).toHaveTextContent('The team removed this report. The new one will show here.');
    expect(screen.getByTestId('kind-overlay')).toBeInTheDocument();
  });

  it('says a newer one is here, and opens it from its own chat', async () => {
    apiGet.mockResolvedValue(detail({}, { newerMessageId: 'm9', newerConversationId: 'c7', corrected: true }));
    const { onOpenNewer } = setup();
    const banner = await screen.findByTestId('report-banner');
    expect(banner).toHaveAttribute('data-banner', 'newer');
    expect(screen.getAllByTestId('report-banner')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('report-see-newer'));
    expect(onOpenNewer).toHaveBeenCalledWith({ conversationId: 'c7', messageId: 'm9' });
  });

  it('says a figure was corrected', async () => {
    apiGet.mockResolvedValue(detail({}, { corrected: true }));
    setup();
    expect(await screen.findByTestId('report-banner')).toHaveAttribute('data-banner', 'corrected');
  });

  it('says some figures are still being worked out', async () => {
    apiGet.mockResolvedValue(
      detail({ data: { ...snapshot, products: [{ sales: { state: 'pending' } }] } as never }),
    );
    setup();
    expect(await screen.findByTestId('report-banner')).toHaveAttribute('data-banner', 'partial');
  });

  it('says it is showing what it saved when the refresh fails, and keeps the report on screen', async () => {
    apiGet.mockRejectedValue(new ApiError(500, 'X', 'boom'));
    setup({ placeholder: detail() });
    const banner = await screen.findByTestId('report-banner');
    expect(banner).toHaveAttribute('data-banner', 'offline');
    expect(banner).toHaveTextContent('Slow network. Showing what we have saved.');
    expect(screen.getByTestId('kind-overlay')).toBeInTheDocument();
  });

  it('wears no banner when there is nothing to say', async () => {
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    expect(screen.queryByTestId('report-banner')).toBeNull();
  });
});

describe('a report that will not open: one calm screen, and the way out', () => {
  it('says the team removed it (410)', async () => {
    apiGet.mockRejectedValue(new ApiError(410, 'REPORT_GONE', 'gone'));
    const { onGoToday } = setup();
    const state = await screen.findByTestId('report-empty');
    expect(state).toHaveAttribute('data-state', 'gone');
    expect(state).toHaveTextContent('This report was removed');
    expect(screen.queryByTestId('report-share')).toBeNull();
    expect(screen.queryByTestId('report-see-in-chat')).toBeNull();
    fireEvent.click(screen.getByTestId('report-go-today'));
    expect(onGoToday).toHaveBeenCalled();
  });

  it('tells the owner a missing report is not here any more (404)', async () => {
    apiGet.mockRejectedValue(new ApiError(404, 'REPORT_NOT_AVAILABLE', 'x'));
    setup();
    const state = await screen.findByTestId('report-empty');
    expect(state).toHaveAttribute('data-state', 'not_here');
    expect(state).toHaveTextContent('Today\'s page has the latest ones.');
  });

  it('tells a manager an owner\'s report is for the owner only, calmly', async () => {
    signIn({ role: 'dealer-staff' });
    apiGet.mockRejectedValue(new ApiError(404, 'REPORT_NOT_AVAILABLE', 'x'));
    setup({ placeholder: detail({ kind: 'credit_dod', data: undefined }) });
    const state = await screen.findByTestId('report-empty');
    expect(state).toHaveAttribute('data-state', 'owner_only');
    expect(state).toHaveTextContent('This one is for the owner only');
    // Nothing of the report is drawn behind the message.
    expect(screen.queryByTestId('kind-overlay')).toBeNull();
  });

  it('never draws an owner\'s snapshot for a manager, even if one reached the phone', async () => {
    signIn({ role: 'dealer-staff' });
    apiGet.mockResolvedValue(
      detail({ kind: 'credit_dod', data: { kind: 'credit_dod', v: 1, capturedAt: '2026-11-24T04:00:00.000Z' } as never }),
    );
    setup();
    const state = await screen.findByTestId('report-empty');
    expect(state).toHaveAttribute('data-state', 'owner_only');
    expect(screen.queryByTestId('kind-overlay')).toBeNull();
  });

  it('says the network is slow, with a way to try again, and tries again', async () => {
    apiGet.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'offline'));
    // The hook retries a stalled link twice before it gives up.
    apiGet.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'offline'));
    apiGet.mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'offline'));
    setup();
    const state = await screen.findByTestId('report-empty', undefined, { timeout: 4000 });
    expect(state).toHaveAttribute('data-state', 'offline');
    apiGet.mockResolvedValue(detail());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('kind-overlay')).toBeInTheDocument();
  });

  it('closes from the empty screen too', async () => {
    apiGet.mockRejectedValue(new ApiError(404, 'REPORT_NOT_AVAILABLE', 'x'));
    const { onClose } = setup();
    await screen.findByTestId('report-empty');
    fireEvent.click(screen.getAllByRole('button', { name: /^Close/ })[0]!);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('a message from before snapshots: the picture, shown inline', () => {
  const old = (over: Partial<ReportDetail> = {}) =>
    detail({ data: undefined, attachments: [card], ...over });

  it('shows the picture where the drawing would be, with a plain note', async () => {
    apiGet.mockResolvedValue(old());
    setup();
    expect(await screen.findByTestId('picture-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('kind-overlay')).toBeNull();
    expect(screen.getByRole('img', { name: 'dsr-sales.png' })).toHaveAttribute('src', card.url);
    expect(screen.getByText('This is an older report, shown as it was sent.')).toBeInTheDocument();
  });

  it('keeps the header and the way to the chat', async () => {
    apiGet.mockResolvedValue(old());
    const { onSeeInChat } = setup();
    await screen.findByTestId('picture-fallback');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Daily sales (DSR)');
    fireEvent.click(screen.getByTestId('report-see-in-chat'));
    expect(onSeeInChat).toHaveBeenCalled();
  });

  it('keeps the picture share: the button says picture and saves or sends the file', async () => {
    apiGet.mockResolvedValue(old());
    setup();
    await screen.findByTestId('picture-fallback');
    const share = screen.getByTestId('report-share');
    expect(share).toHaveTextContent('Send picture');
    fireEvent.click(share);
    await waitFor(() => expect(downloadSpy).toHaveBeenCalled());
    expect(downloadSpy.mock.calls[0]![0]).toMatchObject({ storageKey: card.storageKey });
    expect(downloadSpy.mock.calls[0]![1]).toEqual({ conversationId: 'c1', messageId: 'm1' });
  });

  it('says a picture that will not open did not open, with a button to try again', async () => {
    apiGet.mockResolvedValue(old());
    setup();
    const img = await screen.findByRole('img', { name: 'dsr-sales.png' });
    // First failure asks for a fresh link, the second is a real failure.
    fireEvent.error(img);
    await waitFor(() => expect(screen.getByRole('img', { name: 'dsr-sales.png' })).toHaveAttribute('src', 'https://files.test/fresh.png'));
    fireEvent.error(screen.getByRole('img', { name: 'dsr-sales.png' }));
    expect(await screen.findByTestId('picture-failed')).toHaveTextContent('The picture did not open');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows only the words for an old message with neither a snapshot nor a picture', async () => {
    apiGet.mockResolvedValue(detail({ data: undefined, attachments: [] }));
    setup();
    const words = await screen.findByTestId('report-words-only');
    expect(words).toHaveTextContent('Kal ki bikri ki report taiyaar hai.');
    // Nothing to share, but the chat is one tap away.
    expect(screen.queryByTestId('report-share')).toBeNull();
    expect(screen.getByTestId('report-see-in-chat')).toBeInTheDocument();
  });

  it('does the same for a snapshot of a version this app cannot read, rather than draw half of it', async () => {
    apiGet.mockResolvedValue(detail({ data: { ...snapshot, v: 2 } as never }));
    setup();
    expect(await screen.findByTestId('report-words-only')).toBeInTheDocument();
    expect(screen.queryByTestId('kind-overlay')).toBeNull();
  });
});

describe('a kind\'s drawing that fails does not take the shell down', () => {
  it('shows the words, and keeps Close and See in chat', async () => {
    view.crash = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiGet.mockResolvedValue(detail());
    const { onClose } = setup();
    expect(await screen.findByTestId('report-words-only')).toHaveTextContent('Kal ki bikri ki report taiyaar hai.');
    expect(screen.getByTestId('report-see-in-chat')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('report-close'));
    expect(onClose).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── the report's own buttons (ADR 0056 §4) ─────────────────────────────────────

const words = (en: string) => ({ hi: `${en} hi`, hl: `${en} hl`, en });

describe('a report\'s own buttons: pinned above Share and See in chat', () => {
  it('draws at most two, first, in the brand black, 48 px tall, and keeps Share and See in chat', async () => {
    view.actions = () => [
      { id: 'one', label: words('Copy density'), run: () => undefined },
      { id: 'two', label: words('Second'), run: () => undefined },
      { id: 'three', label: words('Third'), run: () => undefined },
    ];
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    const bar = screen.getByTestId('report-actions');
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Copy density', 'Second']);
    expect(screen.getByTestId('report-action-one').className).toMatch(/min-h-12/);
    expect(screen.getByTestId('report-action-one').className).toMatch(/bg-brand/);
    // The bar is above Share / See in chat and outside the scrolling body.
    const footer = screen.getByTestId('report-footer');
    expect(footer.firstElementChild!.firstElementChild).toBe(bar);
    expect(screen.getByTestId('report-body').contains(bar)).toBe(false);
    expect(screen.getByTestId('report-share')).toBeInTheDocument();
    expect(screen.getByTestId('report-see-in-chat')).toBeInTheDocument();
  });

  it('draws no bar at all for a kind with no buttons, and See in chat keeps its solid look', async () => {
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    expect(screen.queryByTestId('report-actions')).toBeNull();
    expect(screen.getByTestId('report-see-in-chat').className).toMatch(/bg-brand text-text-inverse/);
  });

  it('writes a button in the reader\'s language', async () => {
    view.actions = () => [{ id: 'one', label: words('Do it'), run: () => undefined }];
    apiGet.mockResolvedValue(detail());
    useLangStore.setState({ lang: 'hl', explicit: true });
    setup();
    await screen.findByTestId('kind-overlay');
    expect(screen.getByTestId('report-action-one')).toHaveTextContent('Do it hl');
  });

  it('runs the button with a context that knows this report\'s chat', async () => {
    const seen: Record<string, unknown> = {};
    view.actions = (ctx) => {
      seen.ctx = ctx;
      return [{ id: 'open', label: words('Open'), run: (c: { openChatAt: (id: string) => void }) => c.openChatAt('box-1') }];
    };
    apiGet.mockResolvedValue(detail());
    const onOpenChat = vi.fn();
    const { onSeeInChat } = setup({ onOpenChat });
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-action-open'));
    expect(onOpenChat).toHaveBeenCalledWith({ conversationId: 'c1', messageId: 'box-1' });
    expect(onSeeInChat).not.toHaveBeenCalled();
    const ctx = seen.ctx as { isOwner: boolean; lang: string };
    expect(ctx.isOwner).toBe(true);
    expect(ctx.lang).toBe('en');
  });

  it('falls back to See in chat at the right message when the host gave no chat opener', async () => {
    view.actions = () => [{ id: 'open', label: words('Open'), run: (c: { openChatAt: (id: string) => void }) => c.openChatAt('box-1') }];
    apiGet.mockResolvedValue(detail());
    const { onSeeInChat } = setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-action-open'));
    expect(onSeeInChat).toHaveBeenCalledWith({ conversationId: 'c1', messageId: 'box-1' });
  });

  it('types a sentence in the chat without sending it (draftInChat), and never posts a message', async () => {
    view.actions = () => [
      { id: 'order', label: words('Order now'), run: (c: { draftInChat: (t: string) => void }) => c.draftInChat('Please order diesel') },
    ];
    apiGet.mockResolvedValue(detail());
    const onOpenChat = vi.fn();
    setup({ onOpenChat });
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-action-order'));
    expect(onOpenChat).toHaveBeenCalledWith({ conversationId: 'c1', draft: 'Please order diesel' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('sends a sentence into this report\'s chat as the dealer (sendChat)', async () => {
    view.actions = () => [
      { id: 'ask', label: words('Ask again'), run: (c: { sendChat: (t: string) => Promise<void> }) => c.sendChat('stock kitna hai') },
    ];
    apiGet.mockResolvedValue(detail());
    apiPost.mockResolvedValue({ id: 'sent-1', conversationId: 'c1', body: 'stock kitna hai', attachments: [] });
    setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-action-ask'));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls[0]![0]).toBe('/v1/conversations/c1/messages');
    expect(apiPost.mock.calls[0]![1]).toMatchObject({ body: 'stock kitna hai' });
  });

  it('copies through the phone\'s clipboard', async () => {
    view.actions = () => [
      { id: 'copy', label: words('Copy'), run: (c: { copy: (t: string) => Promise<boolean> }) => void c.copy('0.8321') },
    ];
    copyText.mockResolvedValue(true);
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-action-copy'));
    expect(copyText).toHaveBeenCalledWith('0.8321');
  });

  it('greys a locked button out, says when it opens, and does not run it', async () => {
    const run = vi.fn();
    view.actions = () => [{ id: 'ask', label: words('Ask again'), run, disabled: { note: 'Newest reading possible at 10:45 am' } }];
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    const button = screen.getByTestId('report-action-ask');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('report-action-note')).toHaveTextContent('Newest reading possible at 10:45 am');
    fireEvent.click(button);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs a button once only when it is marked "once", and leaves a normal one usable', async () => {
    const once = vi.fn().mockResolvedValue(undefined);
    const again = vi.fn();
    view.actions = () => [
      { id: 'once', label: words('Once'), run: once, once: true },
      { id: 'again', label: words('Again'), run: again },
    ];
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-action-once'));
    await waitFor(() => expect(screen.getByTestId('report-action-once')).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(screen.getByTestId('report-action-once'));
    expect(once).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('report-action-again'));
    await waitFor(() => expect(screen.getByTestId('report-action-again')).not.toHaveAttribute('aria-disabled'));
    fireEvent.click(screen.getByTestId('report-action-again'));
    await waitFor(() => expect(again).toHaveBeenCalledTimes(2));
  });

  it('says it did not go through when a button\'s work fails, and lets the dealer try again', async () => {
    const run = vi.fn().mockRejectedValue(new Error('no network'));
    view.actions = () => [{ id: 'ask', label: words('Ask again'), run, once: true }];
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    fireEvent.click(screen.getByTestId('report-action-ask'));
    expect(await screen.findByText('That did not go through. Please try again.')).toBeInTheDocument();
    expect(screen.getByTestId('report-action-ask')).not.toHaveAttribute('aria-disabled');
    fireEvent.click(screen.getByTestId('report-action-ask'));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it('a kind whose buttons throw loses its buttons, not the report', async () => {
    view.actions = () => [{ id: 'x', label: words('X'), run: () => undefined }];
    view.actionsCrash = true;
    apiGet.mockResolvedValue(detail());
    setup();
    expect(await screen.findByTestId('kind-overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('report-actions')).toBeNull();
    expect(screen.getByTestId('report-see-in-chat')).toBeInTheDocument();
  });

  it('draws no buttons for a report that did not open, or for an old picture message', async () => {
    view.actions = () => [{ id: 'x', label: words('X'), run: () => undefined }];
    apiGet.mockRejectedValue(new ApiError(410, 'REPORT_GONE', 'gone'));
    setup();
    await screen.findByTestId('report-empty');
    expect(screen.queryByTestId('report-actions')).toBeNull();
  });
});

// ── several pumps ──────────────────────────────────────────────────────────────

describe('a person with more than one pump', () => {
  const outlets = {
    current: { userId: 'u-12', dealerId: 'd-12', code: '12E', role: 'dealer-owner' },
    outlets: [{ userId: 'u-15', dealerId: 'd-15', code: '15E', role: 'dealer-owner' }],
  };
  const answer = (report: Promise<ReportDetail> | ReportDetail) => (url: string) => {
    if (url === '/v1/auth/outlets') return Promise.resolve(outlets);
    return report instanceof Promise ? report : Promise.resolve(report);
  };
  const signInTwoPumps = () => signIn({ role: 'dealer-owner', personId: 'person-1' });

  it('prints the pump code in the header, from the snapshot', async () => {
    signInTwoPumps();
    apiGet.mockImplementation(answer(detail({ data: { ...snapshot, outletCode: '12E' } as never })));
    setup();
    await screen.findByTestId('kind-overlay');
    await waitFor(() => expect(screen.getByTestId('report-when').textContent).toMatch(/^Pump 12E · Mon, 23 Nov/));
    expect(screen.queryByTestId('report-other-pump')).toBeNull();
  });

  it('prints no pump code for a person with one pump', async () => {
    signIn({ role: 'dealer-owner' });
    apiGet.mockImplementation(answer(detail({ data: { ...snapshot, outletCode: '12E' } as never })));
    setup();
    await screen.findByTestId('kind-overlay');
    expect(screen.getByTestId('report-when').textContent).not.toMatch(/Pump/);
  });

  it('says the report is for another pump when it loaded but is about one, and keeps showing it', async () => {
    signInTwoPumps();
    apiGet.mockImplementation(answer(detail({ data: { ...snapshot, outletCode: '15E' } as never })));
    setup();
    await screen.findByTestId('kind-overlay');
    const strip = await screen.findByTestId('report-other-pump');
    expect(strip).toHaveAttribute('data-state', 'strip');
    expect(strip).toHaveTextContent('This is for pump 15E. Switch pump?');
    expect(screen.getByTestId('report-when').textContent).toMatch(/^Pump 15E/);
    expect(screen.getByTestId('kind-overlay')).toBeInTheDocument();
  });

  it('switches pump with the existing switch, to the login of that pump', async () => {
    signInTwoPumps();
    apiGet.mockImplementation(answer(detail({ data: { ...snapshot, outletCode: '15E' } as never })));
    apiPost.mockReturnValue(new Promise(() => undefined));
    setup();
    fireEvent.click(await screen.findByTestId('report-switch-pump'));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/v1/auth/switch-outlet', { userId: 'u-15' }));
    expect(screen.getByTestId('report-switch-pump')).toBeDisabled();
  });

  it('says whose it is, on a calm screen, when this login cannot open it at all (a push for the other pump)', async () => {
    signInTwoPumps();
    apiGet.mockImplementation((url: string) =>
      url === '/v1/auth/outlets' ? Promise.resolve(outlets) : Promise.reject(new ApiError(404, 'REPORT_NOT_AVAILABLE', 'x')),
    );
    setup({ outletHint: '15E' });
    const block = await screen.findByTestId('report-other-pump');
    expect(block).toHaveAttribute('data-state', 'block');
    expect(block).toHaveTextContent('This is for pump 15E. Switch pump?');
    expect(screen.queryByTestId('report-empty')).toBeNull();
    expect(screen.queryByTestId('report-actions')).toBeNull();
    fireEvent.click(screen.getByTestId('report-switch-pump'));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/v1/auth/switch-outlet', { userId: 'u-15' }));
  });

  it('still shows the plain "not here" screen when the link names this very pump', async () => {
    signInTwoPumps();
    apiGet.mockImplementation((url: string) =>
      url === '/v1/auth/outlets' ? Promise.resolve(outlets) : Promise.reject(new ApiError(404, 'REPORT_NOT_AVAILABLE', 'x')),
    );
    setup({ outletHint: '12e' });
    expect(await screen.findByTestId('report-empty')).toHaveAttribute('data-state', 'not_here');
    expect(screen.queryByTestId('report-other-pump')).toBeNull();
  });

  it('writes the pump line in Hindi and Hinglish', async () => {
    signInTwoPumps();
    apiGet.mockImplementation(answer(detail({ data: { ...snapshot, outletCode: '15E' } as never })));
    useLangStore.setState({ lang: 'hi', explicit: true });
    const hi = setup();
    expect(await screen.findByTestId('report-other-pump')).toHaveTextContent('यह पंप 15E के लिए है। पंप बदलें?');
    hi.unmount();
    useLangStore.setState({ lang: 'hl', explicit: true });
    setup();
    expect(await screen.findByTestId('report-other-pump')).toHaveTextContent('Yeh pump 15E ke liye hai. Pump badlein?');
  });
});

describe('no network and nothing to draw: a sentence and a way to try again, never a grey skeleton for good', () => {
  it('shows the offline screen with Try again when the parked request has no copy to show', async () => {
    onlineManager.setOnline(false);
    try {
      apiGet.mockReturnValue(new Promise(() => undefined));
      setup();
      const state = await screen.findByTestId('report-empty');
      expect(state).toHaveAttribute('data-state', 'offline');
      expect(screen.queryByTestId('report-skeleton')).toBeNull();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('keeps drawing the row the opener held while the phone is offline (no empty screen over a report it has)', async () => {
    onlineManager.setOnline(false);
    try {
      apiGet.mockReturnValue(new Promise(() => undefined));
      setup({ placeholder: detail() });
      expect(screen.getByTestId('kind-overlay')).toBeInTheDocument();
      expect(screen.queryByTestId('report-empty')).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });
});

describe('a report the team removed is not something to act on', () => {
  it('offers no kind button and no jump to the (gone) message, only a way back to Today', async () => {
    view.actions = () => [{ id: 'photo', label: words('Send photo'), run: () => undefined }];
    apiGet.mockRejectedValue(new ApiError(410, 'REPORT_GONE', 'gone'));
    const { onGoToday, onSeeInChat } = setup({ placeholder: detail() });
    expect(await screen.findByTestId('report-banner')).toHaveAttribute('data-banner', 'deleted');
    expect(screen.queryByTestId('report-action-photo')).toBeNull();
    expect(screen.queryByTestId('report-see-in-chat')).toBeNull();
    fireEvent.click(within(screen.getByTestId('report-footer')).getByTestId('report-go-today'));
    expect(onGoToday).toHaveBeenCalled();
    expect(onSeeInChat).not.toHaveBeenCalled();
    // The figures it was showing stay readable and shareable.
    expect(screen.getByTestId('report-share')).toBeInTheDocument();
  });

  it('still offers the kind button and See in chat for a report that is there', async () => {
    view.actions = () => [{ id: 'photo', label: words('Send photo'), run: () => undefined }];
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    expect(screen.getByTestId('report-action-photo')).toBeInTheDocument();
    expect(screen.getByTestId('report-see-in-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('report-go-today')).toBeNull();
  });
});

describe('the frame survives a notch and very large text', () => {
  it('clears the status bar and the notch on the Close row (not on the coloured band)', async () => {
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    const row = screen.getByTestId('report-header-row');
    expect(row.className).toContain('safe-top');
    expect(row).toContainElement(screen.getByTestId('report-close'));
    expect(row.closest('header')!.className).not.toContain('safe-top');
  });

  it('pins only the Close row and the badge: the title scrolls with the report, and the footer is capped at 30% of the screen', async () => {
    apiGet.mockResolvedValue(detail());
    setup();
    await screen.findByTestId('kind-overlay');
    const header = screen.getByTestId('report-overlay').querySelector('header')!;
    expect(header.querySelector('h1')).toBeNull();
    expect(screen.getByTestId('report-body')).toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(screen.getByTestId('report-body')).toContainElement(screen.getByTestId('report-when'));
    // The scrolling body is the one flexible part; the footer scrolls inside its own cap.
    expect(screen.getByTestId('report-body').className).toMatch(/min-h-0.*flex-1.*overflow-y-auto/);
    expect(screen.getByTestId('report-footer').className).toContain('max-h-[30vh]');
    expect(screen.getByTestId('report-footer').className).toContain('overflow-y-auto');
  });
});
