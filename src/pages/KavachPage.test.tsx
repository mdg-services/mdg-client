import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { kItem, kView } from '@/features/kavach/kavachFixtures';
import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores, signIn } from '@/test/utils';
import type { KavachDealerCheck, KavachDealerView } from '@dk/shared/types';

interface Q {
  data: KavachDealerView | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  refetch: () => void;
}

const h = vi.hoisted(() => ({
  q: undefined as unknown as Q,
  send: vi.fn(),
  upload: vi.fn(),
  check: { data: undefined, isPending: false, isError: false, refetch: vi.fn() } as {
    data: KavachDealerCheck | undefined;
    isPending: boolean;
    isError: boolean;
    refetch: () => void;
  },
  sheetLoad: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/hooks/api/useKavach', () => ({
  kavachKey: ['kavach', 'me'],
  useKavach: () => h.q,
  useKavachSend: () => ({ mutateAsync: h.send }),
  useKavachCheck: () => h.check,
  fetchKavachSheet: (id: string) => h.sheetLoad(id),
}));
vi.mock('@/lib/uploadKavachPhoto', () => ({ uploadKavachFile: (...a: unknown[]) => h.upload(...a) }));
vi.mock('@/lib/pdf', () => ({ fetchPdfBytes: vi.fn().mockResolvedValue(new ArrayBuffer(1)) }));
vi.mock('@/components/PdfViewer', () => ({
  PdfViewer: ({ title, load }: { title: string; load: () => Promise<unknown> }) => {
    void load();
    return <div data-testid="pdf-viewer">{title}</div>;
  },
}));
vi.mock('@/features/outlets/useOutlets', () => ({
  useOutlets: () => ({ data: undefined }),
  hasOtherOutlets: () => false,
}));
vi.mock('@/lib/perfReport', () => ({ markFirstScreen: vi.fn() }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => h.navigate,
}));

const { KavachPage } = await import('./KavachPage');

function done(over = {}) {
  return kItem({ checkId: 'd1', code: 'licence-dto', titleEn: 'Trade licence valid', titleHi: 'ट्रेड लाइसेंस', state: 'done', everyDays: 365, validUntil: '2027-03-12T00:00:00.000Z', ...over });
}

function load(view: KavachDealerView | undefined, over: Partial<Q> = {}) {
  h.q = {
    data: view,
    isPending: !view,
    isError: false,
    isFetching: false,
    fetchStatus: view ? 'idle' : 'fetching',
    refetch: vi.fn(),
    ...over,
  };
}

function renderPage(opts: { lang?: 'en' | 'hi' | 'hl'; role?: 'dealer-owner' | 'dealer-staff' } = {}) {
  signIn({ id: 'u1', role: opts.role ?? 'dealer-staff', dealerId: 'd1' });
  useLangStore.setState({ lang: opts.lang ?? 'en', explicit: true });
  return renderWithProviders(<KavachPage />, { route: '/kavach' });
}

/** Press a row's main button (it remembers which row asked), then hand the camera input a file. */
function takePhoto(code: string, file: File, input = 'kavach-camera-input', button = `kavach-act-${code}`) {
  fireEvent.click(screen.getByTestId(button));
  fireEvent.change(screen.getByTestId(input), { target: { files: [file] } });
}

const photoFile = () => new File(['x'.repeat(1200)], 'p.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  h.send.mockReset().mockResolvedValue({});
  h.upload.mockReset().mockResolvedValue({ storageKey: 'kavach/d1/x.jpg', filename: 'x.jpg', contentType: 'image/jpeg', size: 1, kind: 'image' });
  h.sheetLoad.mockReset().mockResolvedValue({ url: 'https://s3.test/sheet.pdf' });
  h.navigate.mockReset();
  h.check = { data: undefined, isPending: false, isError: false, refetch: vi.fn() };
  load(kView());
});
afterEach(() => {
  cleanup();
  resetStores();
  vi.restoreAllMocks();
});

describe('KavachPage — the top', () => {
  it('shows the % in the big figure, one sentence and the three counts', () => {
    load(
      kView({
        now: [kItem({ checkId: 'a' }), kItem({ checkId: 'b', late: true, code: 'b' })],
        waiting: [kItem({ checkId: 'w', code: 'w', state: 'sent', sentAt: '2026-11-25T04:12:00.000Z' })],
        done: [done()],
      }),
    );
    renderPage();
    expect(screen.getByTestId('kavach-pct')).toHaveTextContent('62%');
    expect(screen.getByTestId('kavach-pct').className).toContain('text-display');
    expect(screen.getByTestId('kavach-sentence')).toHaveTextContent('2 to do today — 1 late');
    expect(screen.getByTestId('kavach-count-done')).toHaveTextContent('1');
    expect(screen.getByTestId('kavach-count-sent')).toHaveTextContent('1');
    expect(screen.getByTestId('kavach-count-todo')).toHaveTextContent('2');
  });

  it('speaks Hindi and Hinglish', () => {
    renderPage({ lang: 'hi' });
    expect(screen.getByTestId('kavach-sentence')).toHaveTextContent('आज 1 काम बाकी हैं');
    expect(screen.getByRole('heading', { name: /आज करें/ })).toBeInTheDocument();
    cleanup();
    renderPage({ lang: 'hl' });
    expect(screen.getByTestId('kavach-sentence')).toHaveTextContent('Aaj 1 kaam baaki hain');
  });

  it('says "All done for today" when nothing is left', () => {
    load(kView({ now: [], done: [done()] }));
    renderPage();
    expect(screen.getByTestId('kavach-all-done')).toHaveTextContent('All done for today');
  });
});

describe('KavachPage — the sections', () => {
  it('lists Do today, This week, With MDG, the folded ones, Coming up and When it happens in that order', () => {
    load(
      kView({
        now: [
          kItem(),
          kItem({ checkId: 'wk', code: 'wk', titleEn: 'Solar panels', everyDays: 15, dueAt: '2099-01-02T00:00:00.000Z' }),
          kItem({ checkId: 'ow2', code: 'ow2', titleEn: 'DAR', uploader: 'owner', canSend: false }),
          kItem({ checkId: 'dt2', code: 'dt2', titleEn: 'Variation', how: 'data', canSend: false }),
        ],
        waiting: [kItem({ checkId: 'w', code: 'w', titleEn: 'Waiting one', state: 'sent', sentAt: '2026-11-25T04:12:00.000Z' })],
        done: [done()],
        upcoming: [kItem({ checkId: null, code: 'up', titleEn: 'Fire audit', everyDays: 365, opensAt: '2026-12-10T00:00:00.000Z' })],
        events: [kItem({ checkId: null, code: 'ev', titleEn: 'Tanker decantation', everyDays: null })],
      }),
    );
    renderPage();
    const heads = screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent?.replace(/\d+$/, '').trim());
    expect(heads).toEqual([
      'Do today',
      'This week',
      'With MDG',
      'The owner sends these',
      'MDG checks these from your reports',
      'Done',
      'Coming up',
      'When it happens',
    ]);
    // The rows nobody here acts on are folded away too.
    expect(screen.queryByText('DAR')).not.toBeInTheDocument();
    expect(screen.queryByText('Variation')).not.toBeInTheDocument();
    // Done is folded away until asked.
    expect(screen.queryByText('Trade licence valid')).not.toBeInTheDocument();
    const toggle = screen.getByTestId('kavach-done-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Trade licence valid')).toBeInTheDocument();
    expect(screen.getByText('Valid till 12 Mar')).toBeInTheDocument();
    expect(screen.getByText('Opens 10 Dec')).toBeInTheDocument();
  });

  it('gives each row a quiet tag with a word, and puts a sent-back row\'s reason above its button', () => {
    load(
      kView({
        now: [
          kItem({
            checkId: 'sb',
            code: 'sb',
            titleEn: 'DSR sheet',
            state: 'sent_back',
            sentBack: { reason: 'numbers_differ', note: null, at: '2026-11-25T03:00:00.000Z' },
          }),
        ],
      }),
    );
    renderPage();
    const li = document.querySelector('[data-kavach-code="sb"]') as HTMLElement;
    expect(within(li).getByText('Please send again: The numbers do not match')).toBeInTheDocument();
    expect(li.querySelector('[data-status="attention"]')).toHaveTextContent('Send again');
    const text = li.textContent ?? '';
    expect(text.indexOf('The numbers do not match')).toBeLessThan(text.indexOf('Send again', text.indexOf('numbers')));
  });

  it('shows no button on a data point, only our words', () => {
    load(kView({ now: [kItem({ checkId: 'dt', code: 'dt', how: 'data', canSend: false, titleEn: 'Stock variation', dataEn: 'No DSR for 24 Nov yet', dataHi: '' })] }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /MDG checks these from your reports/ }));
    const li = document.querySelector('[data-kavach-code="dt"]') as HTMLElement;
    expect(within(li).getByText('No DSR for 24 Nov yet')).toBeInTheDocument();
    expect(li.querySelectorAll('button')).toHaveLength(1); // the words that open the details, and nothing else
  });

  it('says who sends a point this member cannot send, with no button', () => {
    load(kView({ now: [kItem({ checkId: 'ow', code: 'ow', titleEn: 'TDS certificate', uploader: 'owner', canSend: false })] }));
    renderPage({ role: 'dealer-staff' });
    fireEvent.click(screen.getByRole('button', { name: /The owner sends these/ }));
    const li = document.querySelector('[data-kavach-code="ow"]') as HTMLElement;
    expect(within(li).getByText('Owner sends this')).toBeInTheDocument();
    expect(screen.queryByTestId('kavach-act-forecourt-photo')).not.toBeInTheDocument();
    expect(li.querySelector('[data-testid^="kavach-act-"]')).toBeNull();
  });

  it('uses 48 px or taller buttons, brand black, and the type scale only', () => {
    renderPage();
    const btn = screen.getByTestId('kavach-act-forecourt-photo');
    expect(btn.className).toContain('h-12');
    expect(btn.className).toContain('bg-brand');
    const page = screen.getByTestId('kavach-page');
    expect(page.innerHTML).not.toMatch(/text-\[\d+px\]/);
    expect(page.innerHTML).not.toMatch(/\bfont-bold\b/);
  });
});

describe('KavachPage — sending a photo', () => {
  it('Take photo opens the rear camera input, then the confirm sheet, then uploads, files, and moves the row to With MDG', async () => {
    renderPage();
    const camera = screen.getByTestId('kavach-camera-input') as HTMLInputElement;
    expect(camera).toHaveAttribute('capture', 'environment');
    const click = vi.spyOn(camera, 'click');
    fireEvent.click(screen.getByTestId('kavach-act-forecourt-photo'));
    expect(click).toHaveBeenCalled();

    const file = photoFile();
    fireEvent.change(camera, { target: { files: [file] } });
    expect(screen.getByRole('dialog', { name: 'Send this photo?' })).toBeInTheDocument();
    expect(h.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('today-photo-confirm-send'));

    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
    expect(h.upload.mock.calls[0]![0]).toBe(file);
    expect(h.upload.mock.calls[0]![1]).toBe('d1');
    expect(h.send.mock.calls[0]![0]).toMatchObject({ target: { checkId: 'c1' }, files: [{ storageKey: 'kavach/d1/x.jpg' }] });
    // The row left "Do now" and is under "With MDG" without waiting for the next read.
    await waitFor(() => expect(screen.getByRole('heading', { name: /^With MDG/ })).toBeInTheDocument());
    const waiting = screen.getByRole('list', { name: /^With MDG/ });
    expect(within(waiting).getByText('Forecourt photo')).toBeInTheDocument();
    expect(screen.getByTestId('kavach-all-done')).toBeInTheDocument();
  });

  it('closing the confirm sheet sends nothing', () => {
    renderPage();
    takePhoto('forecourt-photo', photoFile());
    // the sheet's backdrop
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Send this photo?' })).not.toBeInTheDocument();
  });

  it('keeps the file when the send fails, so Try again sends the same photo', async () => {
    h.send.mockRejectedValueOnce(new Error('network'));
    renderPage();
    const file = photoFile();
    takePhoto('forecourt-photo', file);
    fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
    expect(await screen.findByText('It did not go.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(2));
    expect(h.upload.mock.calls[1]![0]).toBe(file);
    await waitFor(() => expect(screen.getByRole('heading', { name: /^With MDG/ })).toBeInTheDocument());
  });

  it('refuses a file that is not a picture, where the point takes no PDF', () => {
    renderPage();
    const pdf = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    takePhoto('forecourt-photo', pdf);
    expect(screen.queryByRole('dialog', { name: 'Send this photo?' })).not.toBeInTheDocument();
    expect(screen.getByText('Please send a photo.')).toBeInTheDocument();
  });

  it('lets a point that takes a file choose a photo or a PDF', async () => {
    load(kView({ now: [kItem({ acceptsFile: true })] }));
    renderPage();
    const choose = screen.getByTestId('kavach-choose-input') as HTMLInputElement;
    expect(choose.accept).toContain('application/pdf');
    expect(choose).not.toHaveAttribute('capture');
    takePhoto('forecourt-photo', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }), 'kavach-choose-input', 'kavach-choose-forecourt-photo');
    expect(screen.getByRole('dialog', { name: 'Send this photo?' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
  });

  it('files a when-it-happens point by its code, and keeps the row where it is', async () => {
    load(kView({ now: [], events: [kItem({ checkId: null, code: 'decantation', titleEn: 'Tanker decantation', everyDays: null })] }));
    renderPage();
    takePhoto('decantation', photoFile());
    fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
    expect(h.send.mock.calls[0]![0].target).toEqual({ code: 'decantation' });
    expect(await screen.findByText('Sent. MDG will check.')).toBeInTheDocument();
  });
});

describe('KavachPage — a sheet MDG made', () => {
  it('opens our PDF in the in-app reader and offers Send photo beside it', async () => {
    load(kView({ now: [kItem({ checkId: 'sh', code: 'dsr-sheet', how: 'sheet', sheet: 'dsr-book', titleEn: 'Update DSR' })] }));
    renderPage();
    fireEvent.click(screen.getByTestId('kavach-act-dsr-sheet'));
    expect(await screen.findByTestId('pdf-viewer')).toHaveTextContent('Update DSR');
    await waitFor(() => expect(h.sheetLoad).toHaveBeenCalledWith('sh'));
    expect(screen.getByTestId('kavach-send-dsr-sheet')).toHaveTextContent('Send photo');
  });
});

describe('KavachPage — a row opens its details', () => {
  it('shows what to do, the photo sent, the last accepted one and the short history', () => {
    const item = kItem({ checkId: 'c1' });
    h.check = {
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        item,
        submission: { files: [{ storageKey: 'k1', filename: 'a.jpg', contentType: 'image/jpeg', size: 1, kind: 'image', url: 'https://s3.test/a.jpg' }], note: null, at: '2026-11-25T04:12:00.000Z', by: { name: 'Ramesh', role: 'dealer-staff' } },
        lastApproved: { at: '2026-11-24T05:00:00.000Z', files: [{ storageKey: 'k0', filename: 'b.jpg', contentType: 'image/jpeg', size: 1, kind: 'image', url: 'https://s3.test/b.jpg' }] },
        history: [
          { at: '2026-11-25T00:00:00.000Z', what: 'opened', note: null },
          { at: '2026-11-25T04:12:00.000Z', what: 'sent', note: null },
          { at: '2026-11-25T04:20:00.000Z', what: 'sent_back', note: 'Cover the logo' },
        ],
      },
    };
    renderPage();
    fireEvent.click(screen.getByText('Forecourt photo'));
    const sheet = screen.getByTestId('kavach-detail');
    expect(within(sheet).getByText('Stand at the entrance and show the whole forecourt.')).toBeInTheDocument();
    expect(within(sheet).getByText('The photo you sent')).toBeInTheDocument();
    expect(within(sheet).getByText('Last accepted photo')).toBeInTheDocument();
    expect(within(sheet).getByText('Sent back')).toBeInTheDocument();
    expect(within(sheet).getByText('Cover the logo')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('kavach-detail')).not.toBeInTheDocument();
  });
});

describe('KavachPage — the edges', () => {
  it('says calmly that Kavach is not started, with a way back', () => {
    load(kView({ on: false, now: [] }));
    renderPage();
    expect(screen.getByText('Kavach is not started for your pump yet')).toBeInTheDocument();
    expect(screen.queryByTestId('kavach-summary')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Today' }));
    expect(h.navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('draws a skeleton while the first answer comes', () => {
    load(undefined);
    renderPage();
    expect(screen.getByTestId('kavach-skeleton')).toBeInTheDocument();
  });

  it('says it could not load, with a retry', () => {
    load(undefined, { isError: true, isPending: false, fetchStatus: 'idle' });
    renderPage();
    expect(screen.getByText('Kavach could not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.q.refetch).toHaveBeenCalled();
  });

  it('keeps the last list and says so when a refresh fails', () => {
    load(kView(), { isError: true });
    renderPage();
    expect(screen.getByTestId('kavach-offline')).toBeInTheDocument();
    expect(screen.getByTestId('kavach-summary')).toBeInTheDocument();
  });
});
