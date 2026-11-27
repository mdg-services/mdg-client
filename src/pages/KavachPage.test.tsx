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
  useKavachChecks: (ids: readonly string[]) => ids.map(() => ({ data: undefined, dataUpdatedAt: 0 })),
  fetchKavachSheet: (id: string) => h.sheetLoad(id),
}));
vi.mock('@/features/help/useGuideVideos', () => ({ useGuideVideos: () => ({ data: undefined }) }));
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

// 25 Nov 2026, 10:00 in India (04:30 UTC): the clock every "due" and "left" is read from.
const NOW = new Date('2026-11-25T04:30:00.000Z');

function done(over = {}) {
  return kItem({ checkId: 'd1', code: 'licence-dto', titleEn: 'Trade licence valid', titleHi: 'ट्रेड लाइसेंस', state: 'done', everyDays: 365, validUntil: '2027-03-12T00:00:00.000Z', ...over });
}
const sentBack = (over = {}) =>
  kItem({
    checkId: 'sb',
    code: 'sb',
    titleEn: 'Fire extinguisher',
    state: 'sent_back',
    sentBack: { reason: 'not_clear', note: 'Please retake in daylight', at: '2026-11-25T03:00:00.000Z' },
    ...over,
  });

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
const headings = () => screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent?.replace(/\d+$/, '').trim());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetStores();
});

describe('KavachPage — the score card', () => {
  it('shows the % as a number, the points behind it, one sentence and three counts that agree with the ring', () => {
    const view = kView({
      now: [
        sentBack({ checkId: 'sb1', code: 'sb1' }),
        sentBack({ checkId: 'sb2', code: 'sb2' }),
        kItem({ checkId: 'l1', code: 'l1', late: true }),
        ...Array.from({ length: 9 }, (_, i) => kItem({ checkId: `t${i}`, code: `t${i}` })),
      ],
      waiting: [kItem({ checkId: 'w', code: 'w', state: 'sent', sentAt: '2026-11-25T04:12:00.000Z' })],
      done: [done()],
    });
    view.summary = { pct: 62, donePoints: 2320, totalPoints: 3740, counts: { done: 1, sent: 1, todo: 12, late: 1, sentBack: 2 }, computedAt: '2026-11-25T04:00:00.000Z' };
    load(view);
    renderPage();
    expect(screen.getByTestId('kavach-pct')).toHaveTextContent('62%');
    expect(screen.getByTestId('kavach-pct').className).toContain('text-title');
    expect(screen.getByTestId('kavach-pct')).toHaveAccessibleName('62 percent');
    expect(screen.getByTestId('kavach-points')).toHaveTextContent('2,320 of 3,740 points');
    expect(screen.getByTestId('kavach-sentence')).toHaveTextContent('3 jobs need you first');
    expect(screen.getByTestId('kavach-count-sent-back')).toHaveTextContent('2 sent back');
    expect(screen.getByTestId('kavach-count-late')).toHaveTextContent('1 late');
    // To do today is Needs you plus Do today (3 + 9): the very number the bar's badge shows.
    expect(screen.getByTestId('kavach-count-todo')).toHaveTextContent('12 to do today');
    // The card says as of when the server scored it.
    expect(screen.getByText('as of 9:30 am')).toBeInTheDocument();
  });

  it('draws the ring at 8 rem, and uses no pixel sizes', () => {
    renderPage();
    expect(screen.getByTestId('kavach-ring').className).toContain('w-32');
    // It never takes more than two fifths of the card, whatever the text size.
    expect(screen.getByTestId('kavach-ring').className).toContain('max-w-[40%]');
    const page = screen.getByTestId('kavach-page');
    expect(page.innerHTML).not.toMatch(/text-\[\d+px\]/);
    expect(page.innerHTML).not.toMatch(/\bfont-bold\b/);
    expect(page.innerHTML).not.toMatch(/\btruncate\b|line-clamp/);
  });

  it('at 200% text shrinks the ring to 5 rem, keeps the three counts, and leaves the sentence to a screen reader', () => {
    document.documentElement.style.fontSize = '32px';
    try {
      load(kView({ now: [sentBack(), kItem({ checkId: 'l', code: 'l', late: true })] }));
      renderPage();
      expect(screen.getByTestId('kavach-ring').className).toContain('w-20');
      expect(screen.getByTestId('kavach-ring').className).not.toContain('w-32');
      expect(screen.getByTestId('kavach-sentence').className).toContain('sr-only');
      expect(screen.getByTestId('kavach-count-late')).toBeVisible();
      expect(screen.getByTestId('kavach-act-sb').className).toContain('min-h-11');
    } finally {
      document.documentElement.style.fontSize = '';
    }
  });

  it('speaks Hindi and Hinglish', () => {
    renderPage({ lang: 'hi' });
    expect(screen.getByTestId('kavach-sentence')).toHaveTextContent('आज 1 काम बाकी है');
    expect(screen.getByRole('heading', { name: /आज करें/ })).toBeInTheDocument();
    expect(screen.getByTestId('kavach-count-todo')).toHaveTextContent('1 आज करने हैं');
    cleanup();
    renderPage({ lang: 'hl' });
    expect(screen.getByTestId('kavach-sentence')).toHaveTextContent('Aaj 1 kaam baaki hai');
    expect(screen.getByTestId('kavach-count-todo')).toHaveTextContent('1 aaj karne hain');
  });

  it('says "All done for today" with a tick, and the next job date', () => {
    load(kView({ now: [], done: [done()], upcoming: [kItem({ checkId: null, code: 'up', titleEn: 'Fire audit', everyDays: 365, opensAt: '2026-12-10T00:00:00.000Z' })] }));
    renderPage();
    expect(screen.getByTestId('kavach-all-done')).toHaveTextContent('All done for today. Next job: Thu 10 Dec');
    expect(screen.getByTestId('kavach-sentence')).toHaveTextContent('All done for today');
  });

  it('says "Nothing to do right now" when only MDG\'s checking is left', () => {
    load(kView({ now: [], waiting: [kItem({ checkId: 'w', code: 'w', state: 'sent', sentAt: '2026-11-25T04:12:00.000Z' })] }));
    renderPage();
    expect(screen.getByTestId('kavach-all-done')).toHaveTextContent('Nothing to do right now.');
  });

  it('has its title and the My pump button on every state, even loading and failed', () => {
    load(undefined);
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Kavach' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /My pump/ })).toBeInTheDocument();
  });
});

describe('KavachPage — Needs you', () => {
  it('pulls sent-back and late rows to the top, with MDG\'s reason in plain words and one loud button each', () => {
    load(kView({ now: [kItem({ checkId: 'p', code: 'p', titleEn: 'Servo display' }), sentBack(), kItem({ checkId: 'l', code: 'l', titleEn: 'DSR sheet', late: true, dueAt: '2026-11-25T03:30:00.000Z' })] }));
    renderPage();
    const needs = screen.getByRole('region', { name: /^Needs you/ });
    expect(within(needs).getByText('Fire extinguisher')).toBeInTheDocument();
    expect(within(needs).getByText('Please send again: The photo is not clear. MDG wrote: Please retake in daylight')).toBeInTheDocument();
    expect(within(needs).getByText('Late. Was due 9:00 am')).toBeInTheDocument();
    // The loud button: near-black.
    expect(within(needs).getByTestId('kavach-act-sb').className).toContain('bg-brand');
    expect(within(needs).getByTestId('kavach-act-sb')).toHaveTextContent('Send again');
    expect(within(needs).getByTestId('kavach-act-l').className).toContain('bg-brand');
    // The ordinary row is not up here, and a row is never listed twice.
    expect(within(needs).queryByText('Servo display')).not.toBeInTheDocument();
    expect(screen.getAllByText('Fire extinguisher')).toHaveLength(1);
    expect(within(needs).getAllByRole('listitem')).toHaveLength(2);
  });

  it('is not drawn when nothing costs marks', () => {
    renderPage();
    expect(screen.queryByRole('region', { name: /^Needs you/ })).not.toBeInTheDocument();
  });

  it('gives every other row the calm button, so the loud one stands out', () => {
    renderPage();
    const btn = screen.getByTestId('kavach-act-forecourt-photo');
    expect(btn.className).toContain('min-h-11');
    expect(btn.className).toContain('bg-surface');
    expect(btn.className).not.toContain('bg-brand');
    expect(btn).toHaveAccessibleName('Send photo: Forecourt photo');
  });

  it('puts a sent-back photo back in Needs you, with a send button, when MDG sends a when-it-happens photo back', async () => {
    load(kView({ now: [], events: [kItem({ checkId: null, code: 'decantation', titleEn: 'Tanker decantation', everyDays: null })] }));
    // This phone remembers the check; the server (mocked) says MDG sent it back.
    window.localStorage.setItem(
      'mdg.client.kavachEventSends',
      JSON.stringify([
        {
          dealerId: 'd1',
          checkId: 'ev1',
          at: '2026-11-25T04:12:00.000Z',
          item: kItem({ checkId: 'ev1', code: 'decantation', titleEn: 'Tanker decantation', everyDays: null, state: 'sent_back', dueAt: null, sentBack: { reason: 'wrong_page', note: null, at: '2026-11-25T04:20:00.000Z' } }),
        },
      ]),
    );
    renderPage();
    const needs = screen.getByRole('region', { name: /^Needs you/ });
    expect(within(needs).getByText('Tanker decantation')).toBeInTheDocument();
    expect(within(needs).getByText('Please send again: Wrong page')).toBeInTheDocument();
    fireEvent.click(within(needs).getByTestId('kavach-act-decantation'));
    fireEvent.change(screen.getByTestId('kavach-camera-input'), { target: { files: [photoFile()] } });
    fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
    expect(h.send.mock.calls[0]![0].target).toEqual({ checkId: 'ev1' });
  });
});

describe("KavachPage — today's jobs", () => {
  const daily = (over = {}) => kItem({ everyDays: 1, ...over });

  it('says how many daily jobs are done, with a bar, and names the next deadline with the time left', () => {
    load(
      kView({
        now: [
          daily({ checkId: 'a', code: 'dsr', titleEn: 'DSR sheet', dueAt: '2026-11-25T05:50:00.000Z' }),
          daily({ checkId: 'b', code: 'stock', titleEn: 'Stock board', dueAt: '2026-11-25T12:30:00.000Z' }),
        ],
        waiting: [daily({ checkId: 'w', code: 'w', state: 'sent', sentAt: '2026-11-25T04:12:00.000Z' })],
        done: [done({ everyDays: 1, validUntil: null })],
      }),
    );
    renderPage();
    const card = screen.getByRole('region', { name: /^Today's jobs/ });
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4');
    expect(within(card).getByText('1 of 4 daily jobs done')).toBeInTheDocument();
    expect(within(card).getByText('1 with MDG for checking')).toBeInTheDocument();
    expect(screen.getByTestId('kavach-next')).toHaveTextContent('Next: DSR sheet by 11:20 am, 1 h 20 min left');
  });

  it('is not drawn when the pump has no daily job', () => {
    load(kView({ now: [kItem({ everyDays: 30, dueAt: '2026-12-01T10:00:00.000Z' })] }));
    renderPage();
    expect(screen.queryByRole('region', { name: /^Today's jobs/ })).not.toBeInTheDocument();
  });
});

describe('KavachPage — To do and Done', () => {
  it('lists Do today, This week, With MDG, MDG\'s part, the other member\'s jobs, Coming up and When it happens in that order', () => {
    load(
      kView({
        now: [
          kItem(),
          kItem({ checkId: 'wk', code: 'wk', titleEn: 'Solar panels', everyDays: 15, dueAt: '2026-12-02T00:00:00.000Z' }),
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
    expect(headings()).toEqual([
      'Inspection score',
      "Today's jobs",
      'Do today',
      'This week',
      'With MDG',
      'MDG checks these from your reports',
      "Owner's jobs",
      'Coming up',
      'When it happens',
    ]);
    // The other member's jobs are folded away until asked, but their number shows.
    expect(screen.queryByText('DAR')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^Owner's jobs/ })).toHaveTextContent('1');
    expect(screen.getByText('Opens Thu 10 Dec')).toBeInTheDocument();
    // Done is on the other side of the switch.
    expect(screen.queryByText('Trade licence valid')).not.toBeInTheDocument();
  });

  it('is a labelled switch, To do | Done, with a count on each; Done shows MDG\'s words for a data point', () => {
    load(
      kView({
        now: [kItem()],
        done: [
          done(),
          kItem({ checkId: 'dd', code: 'dd', titleEn: 'Stock variation within limit', how: 'data', canSend: false, state: 'done', everyDays: 1, dataEn: 'DSR of 24 Nov: all variations within limit', dataHi: '' }),
        ],
      }),
    );
    renderPage();
    const group = screen.getByRole('radiogroup', { name: 'Show' });
    expect(within(group).getByRole('radio', { name: 'To do, 1' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Done, 2' })).not.toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: 'Done, 2' }));
    expect(screen.queryByTestId('kavach-act-forecourt-photo')).not.toBeInTheDocument();
    expect(screen.getByText('Trade licence valid')).toBeInTheDocument();
    expect(screen.getByText('Valid till Fri 12 Mar')).toBeInTheDocument();
    expect(screen.getByText('DSR of 24 Nov: all variations within limit')).toBeInTheDocument();
    // Needs you and the score stay on both sides.
    expect(screen.getByTestId('kavach-summary')).toBeInTheDocument();
  });

  it('says calmly when nothing is done yet', () => {
    load(kView({ now: [kItem()], done: [] }));
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: 'Done, 0' }));
    expect(screen.getByText('Nothing is done yet.')).toBeInTheDocument();
  });

  it('shows five of This week, then "Show N more" and "Show fewer" (it was an uncapped wall of about thirty)', () => {
    const many = Array.from({ length: 8 }, (_, i) => kItem({ checkId: `w${i}`, code: `w${i}`, titleEn: `Weekly ${i}`, everyDays: 15, dueAt: `2026-12-0${i + 1}T10:00:00.000Z` }));
    load(kView({ now: many }));
    renderPage();
    const week = screen.getByRole('region', { name: /^This week/ });
    expect(within(week).getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(within(week).getByRole('button', { name: 'This week: Show 3 more' }));
    expect(within(week).getAllByRole('listitem')).toHaveLength(8);
    fireEvent.click(within(week).getByRole('button', { name: 'This week: Show fewer' }));
    expect(within(week).getAllByRole('listitem')).toHaveLength(5);
  });

  it('gives each row a tag with a word, and puts a sent-back row\'s reason above its button', () => {
    load(kView({ now: [sentBack({ sentBack: { reason: 'numbers_differ', note: null, at: '2026-11-25T03:00:00.000Z' } })] }));
    renderPage();
    const li = document.querySelector('[data-kavach-code="sb"]') as HTMLElement;
    expect(within(li).getByText('Please send again: The numbers do not match')).toBeInTheDocument();
    expect(li.querySelector('[data-status="attention"]')).toHaveTextContent('Send again');
    const text = li.textContent ?? '';
    expect(text.indexOf('The numbers do not match')).toBeLessThan(text.lastIndexOf('Send again'));
  });

  it('shows no button on a data point, only our words', () => {
    load(kView({ now: [kItem({ checkId: 'dt', code: 'dt', how: 'data', canSend: false, titleEn: 'Stock variation', dataEn: 'No DSR for 24 Nov yet', dataHi: '' })] }));
    renderPage();
    const li = document.querySelector('[data-kavach-code="dt"]') as HTMLElement;
    expect(within(li).getByText('No DSR for 24 Nov yet')).toBeInTheDocument();
    expect(li.querySelectorAll('button')).toHaveLength(1); // the words that open the details, and nothing else
  });
});

describe('KavachPage — owner and manager', () => {
  const managerJob = (over = {}) => kItem({ uploader: 'manager', everyDays: 1, ...over });
  const view = () =>
    kView({
      now: [
        managerJob({ checkId: 'm1', code: 'm1', titleEn: 'Forecourt photo' }),
        managerJob({ checkId: 'm2', code: 'm2', titleEn: 'Island display', late: true }),
        kItem({ checkId: 'o1', code: 'o1', titleEn: 'TDS certificate', uploader: 'owner', everyDays: 365, dueAt: '2026-11-25T11:00:00.000Z' }),
      ],
    });

  it('tells an owner the manager\'s jobs are the manager\'s: counted apart, folded, and not in his own list', () => {
    load(view());
    renderPage({ role: 'dealer-owner' });
    expect(screen.getByTestId('kavach-sentence')).toHaveTextContent('1 job to do today');
    expect(screen.queryByRole('region', { name: /^Needs you/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^Do today/ })).toHaveTextContent('TDS certificate');
    const others = screen.getByRole('region', { name: /^Manager's jobs/ });
    expect(others).toHaveTextContent('2');
    expect(screen.queryByText('Island display')).not.toBeInTheDocument();
    const toggle = within(others).getByRole('button', { name: "Show Manager's jobs" });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(within(others).getByText('Island display')).toBeInTheDocument();
    // Each says whose it is, and the late one is first.
    expect(within(others).getAllByText('Manager sends this')).toHaveLength(2);
    expect(within(others).getAllByRole('listitem')[0]).toHaveTextContent('Island display');
  });

  it('keeps a manager\'s own jobs, late first in Needs you, and folds the owner\'s', () => {
    const forManager = kView({ now: view().now.map((i) => (i.uploader === 'owner' ? { ...i, canSend: false } : i)) });
    load(forManager);
    renderPage({ role: 'dealer-staff' });
    expect(within(screen.getByRole('region', { name: /^Needs you/ })).getByText('Island display')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^Do today/ })).toHaveTextContent('Forecourt photo');
    expect(screen.getByRole('region', { name: /^Owner's jobs/ })).toHaveTextContent('1');
  });
});

describe('KavachPage — sending a photo', () => {
  it('Send photo opens the rear camera input, then the confirm sheet, then uploads, files, and moves the row to With MDG', async () => {
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
    // The row left the to-do lists and is under "With MDG" without waiting for the next read.
    await waitFor(() => expect(screen.getByRole('region', { name: /^With MDG/ })).toBeInTheDocument());
    expect(within(screen.getByRole('region', { name: /^With MDG/ })).getByText('Forecourt photo')).toBeInTheDocument();
    expect(screen.getByTestId('kavach-all-done')).toBeInTheDocument();
  });

  it('closing the confirm sheet sends nothing', () => {
    renderPage();
    takePhoto('forecourt-photo', photoFile());
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
    await waitFor(() => expect(screen.getByRole('region', { name: /^With MDG/ })).toBeInTheDocument());
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
    // The row has one button; the other way in is in the details sheet a tap on the row's words opens.
    expect(screen.queryByTestId('kavach-choose-forecourt-photo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Forecourt photo'));
    fireEvent.click(within(screen.getByTestId('kavach-detail')).getByTestId('kavach-choose-forecourt-photo'));
    fireEvent.change(choose, { target: { files: [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })] } });
    expect(screen.getByRole('dialog', { name: 'Send this photo?' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
  });

  it('files a when-it-happens point by its code, and keeps the row where it is for the next one', async () => {
    load(kView({ now: [], events: [kItem({ checkId: null, code: 'decantation', titleEn: 'Tanker decantation', everyDays: null })] }));
    renderPage();
    takePhoto('decantation', photoFile());
    fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
    expect(h.send.mock.calls[0]![0].target).toEqual({ code: 'decantation' });
    expect(await screen.findByText('Sent. MDG will check.')).toBeInTheDocument();
  });

  it('keeps a when-it-happens photo in view under With MDG after the three seconds (it used to vanish)', async () => {
    const check = kItem({ checkId: 'ev1', code: 'decantation', titleEn: 'Tanker decantation', everyDays: null, state: 'sent', dueAt: null, sentAt: '2026-11-25T04:30:00.000Z' });
    h.send.mockResolvedValue({ check });
    load(kView({ now: [], events: [kItem({ checkId: null, code: 'decantation', titleEn: 'Tanker decantation', everyDays: null })] }));
    renderPage();
    takePhoto('decantation', photoFile());
    fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
    const waiting = await screen.findByRole('region', { name: /^With MDG/ });
    expect(within(waiting).getByText('Tanker decantation')).toBeInTheDocument();
    expect(within(waiting).getByText('Sent 10:00 am')).toBeInTheDocument();
    // The point is still in When it happens, ready for the next one.
    expect(screen.getByRole('region', { name: /^When it happens/ })).toHaveTextContent('Tanker decantation');
    // And a visit later still finds it: the phone remembered the check.
    cleanup();
    renderPage();
    expect(within(screen.getByRole('region', { name: /^With MDG/ })).getByText('Tanker decantation')).toBeInTheDocument();
  });
});

describe('KavachPage — replacing a photo that is With MDG', () => {
  const waitingRow = () => kItem({ checkId: 'w1', code: 'sheet-photo', titleEn: 'Servo island display', state: 'sent', sentAt: '2026-11-25T04:12:00.000Z', thumbUrl: 'https://s3.test/t.jpg' });

  it('offers a different photo, sends it for the same check, and the row stays where it is', async () => {
    load(kView({ now: [], waiting: [waitingRow()] }));
    renderPage();
    const btn = screen.getByTestId('kavach-replace-sheet-photo');
    expect(btn).toHaveTextContent('Send a different photo');
    expect(btn).toHaveAccessibleName('Send a different photo: Servo island display');
    expect(btn.className).not.toContain('bg-brand'); // calm
    const file = photoFile();
    fireEvent.click(btn);
    fireEvent.change(screen.getByTestId('kavach-camera-input'), { target: { files: [file] } });
    expect(screen.getByRole('dialog', { name: 'Send this photo?' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('today-photo-confirm-send'));
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
    expect(h.send.mock.calls[0]![0]).toMatchObject({ target: { checkId: 'w1' } });
    expect(h.upload.mock.calls[0]![0]).toBe(file);
    expect(await screen.findByText('Sent. MDG will check.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /^With MDG/ })).getByText('Servo island display')).toBeInTheDocument();
  });

  it('gives a member who cannot send that point no button, and a data point none', () => {
    load(kView({ now: [], waiting: [kItem({ checkId: 'w2', code: 'w2', state: 'sent', canSend: false, uploader: 'owner' })] }));
    renderPage({ role: 'dealer-staff' });
    expect(screen.queryByTestId('kavach-replace-w2')).not.toBeInTheDocument();
  });
});

describe('KavachPage — a sheet MDG made', () => {
  it('opens our PDF in the in-app reader, beside a Send photo button that stays the row\'s main one', async () => {
    load(kView({ now: [kItem({ checkId: 'sh', code: 'dsr-sheet', how: 'sheet', sheet: 'dsr-book', titleEn: 'Update DSR' })] }));
    renderPage();
    expect(screen.getByTestId('kavach-act-dsr-sheet')).toHaveTextContent('Send photo');
    // One button on the row; "Open sheet" is in the details sheet.
    expect(screen.queryByTestId('kavach-sheet-dsr-sheet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Update DSR'));
    fireEvent.click(within(screen.getByTestId('kavach-detail')).getByTestId('kavach-sheet-dsr-sheet'));
    expect(await screen.findByTestId('pdf-viewer')).toHaveTextContent('Update DSR');
    await waitFor(() => expect(h.sheetLoad).toHaveBeenCalledWith('sh'));
  });
});

describe('KavachPage — a row opens its details', () => {
  function withCheck(item = kItem({ checkId: 'c1' })) {
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
    } as typeof h.check;
  }

  it('shows what to do, the photo sent and who sent it, the last accepted one and the short history', () => {
    withCheck();
    renderPage();
    fireEvent.click(screen.getByText('Forecourt photo'));
    const sheet = screen.getByTestId('kavach-detail');
    expect(within(sheet).getByText('Stand at the entrance and show the whole forecourt.')).toBeInTheDocument();
    expect(within(sheet).getByText('The photo you sent')).toBeInTheDocument();
    expect(within(sheet).getByText('Sent by Ramesh')).toBeInTheDocument();
    expect(within(sheet).getByText('Last accepted photo')).toBeInTheDocument();
    expect(within(sheet).getByText('Sent back')).toBeInTheDocument();
    expect(within(sheet).getByText('Cover the logo')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('kavach-detail')).not.toBeInTheDocument();
  });

  it('carries the row\'s own button: read the steps, press Send, and the camera opens (no closing and hunting for the row)', () => {
    withCheck();
    renderPage();
    const camera = screen.getByTestId('kavach-camera-input') as HTMLInputElement;
    const click = vi.spyOn(camera, 'click');
    fireEvent.click(screen.getByText('Forecourt photo'));
    const sheet = screen.getByTestId('kavach-detail');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send photo: Forecourt photo' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('kavach-detail')).not.toBeInTheDocument();
    fireEvent.change(camera, { target: { files: [photoFile()] } });
    expect(screen.getByRole('dialog', { name: 'Send this photo?' })).toBeInTheDocument();
  });

  it('has no button for a row nobody here acts on', () => {
    load(kView({ now: [], done: [done()] }));
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: /^Done/ }));
    fireEvent.click(screen.getByText('Trade licence valid'));
    const sheet = screen.getByTestId('kavach-detail');
    expect(within(sheet).queryByRole('button', { name: /Send photo|Send again/ })).not.toBeInTheDocument();
  });
});

describe('KavachPage — one source for every count (a defect found on a real phone)', () => {
  it('never says "Nothing left" or "Today\'s work is done" above a count of things to do, and never the reverse', () => {
    // Late and sent back are the reader\'s own: the card, the sentence, the count and the badge agree.
    load(kView({ now: [sentBack(), kItem({ checkId: 'l', code: 'l', titleEn: 'DSR sheet', late: true }), kItem({ checkId: 't', code: 't' })] }));
    renderPage();
    expect(screen.getByTestId('kavach-count-todo')).toHaveTextContent('3 to do today');
    expect(screen.getByTestId('kavach-sentence')).toHaveTextContent('2 jobs need you first');
    expect(screen.getByRole('region', { name: /^Needs you/ })).toHaveTextContent('2');
    expect(screen.getByRole('region', { name: /^Do today/ })).toHaveTextContent('1');
    expect(screen.queryByTestId('kavach-all-done')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'To do, 3' })).toBeChecked();
  });

  it('draws no tick card while sent-back or late jobs wait in Needs you', () => {
    load(kView({ now: [sentBack()] }));
    renderPage();
    expect(screen.getByRole('region', { name: /^Needs you/ })).toBeInTheDocument();
    expect(screen.queryByTestId('kavach-all-done')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Do today/ })).not.toBeInTheDocument();
  });

  it('counts the other member\'s late job nowhere in the owner\'s numbers, and keeps the week apart from today', () => {
    load(
      kView({
        now: [
          kItem({ checkId: 'm', code: 'm', uploader: 'manager', late: true }),
          kItem({ checkId: 'w', code: 'w', uploader: 'either', everyDays: 30, dueAt: '2026-12-02T10:00:00.000Z' }),
        ],
      }),
    );
    renderPage({ role: 'dealer-owner' });
    expect(screen.getByTestId('kavach-count-late')).toHaveTextContent('0 late');
    expect(screen.getByTestId('kavach-count-todo')).toHaveTextContent('0 to do today');
    expect(screen.getByTestId('kavach-sentence')).toHaveTextContent("Today's work is done. 1 more job this week.");
    expect(screen.getByTestId('kavach-all-done')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Needs you/ })).not.toBeInTheDocument();
  });

  it('says the counts are updating, with a refresh, when the server counts a send-back that no list shows', () => {
    const view = kView({ now: [] });
    view.summary!.counts = { done: 0, sent: 0, todo: 0, late: 0, sentBack: 1 };
    load(view);
    renderPage();
    expect(screen.queryByTestId('kavach-all-done')).not.toBeInTheDocument();
    expect(screen.getByTestId('kavach-counting')).toHaveTextContent('The counts are updating. Please refresh.');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(h.q.refetch).toHaveBeenCalled();
    cleanup();
    renderPage({ lang: 'hi' });
    expect(screen.getByTestId('kavach-counting')).toHaveTextContent('गिनती अपडेट हो रही है');
  });

  it('turns the sent-back and late counts into buttons that go to Needs you, and to do today into Do today', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    try {
      load(kView({ now: [sentBack(), kItem({ checkId: 'l', code: 'l', late: true }), kItem({ checkId: 't', code: 't' })] }));
      renderPage();
      const late = within(screen.getByTestId('kavach-count-late')).getByRole('button', { name: '1 late' });
      expect(late.className).toContain('min-h-11');
      fireEvent.click(late);
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.instances[0]).toBe(screen.getByTestId('kavach-needs'));
      fireEvent.click(within(screen.getByTestId('kavach-count-sent-back')).getByRole('button', { name: '1 sent back' }));
      expect(scroll.mock.instances[1]).toBe(screen.getByTestId('kavach-needs'));
      fireEvent.click(within(screen.getByTestId('kavach-count-todo')).getByRole('button', { name: '3 to do today' }));
      expect(scroll.mock.instances[2]).toBe(document.getElementById('kavach-now'));
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('leaves a count with nothing behind it as plain text', () => {
    renderPage();
    expect(within(screen.getByTestId('kavach-count-late')).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('KavachPage — one button on a row, the rest in the sheet', () => {
  it('gives every row exactly one action button, however many ways the point can be sent', () => {
    load(
      kView({
        now: [
          kItem({ checkId: 'a', code: 'a', titleEn: 'Row A', acceptsFile: true, how: 'sheet', sheet: 'dsr-book' }),
          sentBack({ acceptsFile: true }),
        ],
        events: [kItem({ checkId: null, code: 'ev', titleEn: 'Tanker decantation', everyDays: null, acceptsFile: true })],
      }),
    );
    renderPage();
    for (const code of ['a', 'sb', 'ev']) {
      const li = document.querySelector(`[data-kavach-code="${code}"]`) as HTMLElement;
      // The words that open the details, and the one action.
      expect(li.querySelectorAll('button')).toHaveLength(2);
      expect(within(li).getByTestId(`kavach-act-${code}`)).toHaveTextContent(/Send photo|Send again/);
    }
    expect(screen.queryByText(/Choose photo or PDF|Open sheet/)).not.toBeInTheDocument();
  });

  it('puts "Choose photo or PDF" and "Open sheet" in the details sheet', () => {
    load(kView({ now: [kItem({ checkId: 'a', code: 'a', titleEn: 'Row A', acceptsFile: true, how: 'sheet', sheet: 'dsr-book' })] }));
    renderPage();
    fireEvent.click(screen.getByText('Row A'));
    const sheet = screen.getByTestId('kavach-detail');
    expect(within(sheet).getByTestId('kavach-choose-a')).toBeInTheDocument();
    expect(within(sheet).getByTestId('kavach-sheet-a')).toBeInTheDocument();
  });

  it('says the "when it happens" sentence once under the heading, not on every row, and counts the rows', () => {
    load(
      kView({
        now: [],
        events: Array.from({ length: 4 }, (_, i) => kItem({ checkId: null, code: `ev${i}`, titleEn: `Event ${i}`, everyDays: null })),
      }),
    );
    renderPage();
    const events = screen.getByRole('region', { name: /^When it happens/ });
    expect(within(events).getAllByText('Send a photo when it happens')).toHaveLength(1);
    expect(within(events).getAllByRole('listitem')).toHaveLength(4);
    expect(events).toHaveTextContent('4');
  });

  it('shows five of MDG\'s checks, then "Show N more"', () => {
    const data = Array.from({ length: 7 }, (_, i) => kItem({ checkId: `d${i}`, code: `d${i}`, titleEn: `Check ${i}`, how: 'data', canSend: false }));
    load(kView({ now: data }));
    renderPage();
    const region = screen.getByRole('region', { name: /^MDG checks these/ });
    expect(within(region).getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(within(region).getByRole('button', { name: /Show 2 more/ }));
    expect(within(region).getAllByRole('listitem')).toHaveLength(7);
  });

  it('shows the soonest job due later today in Today\'s jobs, even when it is not a daily one', () => {
    load(
      kView({
        now: [
          kItem({ checkId: 'a', code: 'a', titleEn: 'Daily one', everyDays: 1, late: true, dueAt: '2026-11-25T03:00:00.000Z' }),
          kItem({ checkId: 'b', code: 'b', titleEn: 'Weekly stock board', everyDays: 7, uploader: 'either', dueAt: '2026-11-25T10:30:00.000Z' }),
        ],
      }),
    );
    renderPage();
    expect(screen.getByTestId('kavach-next')).toHaveTextContent('Next: Weekly stock board by 4:00 pm, 6 h left');
  });
});

describe('KavachPage — With MDG rows', () => {
  const sentRow = (over = {}) => kItem({ checkId: 'w1', code: 'w1', titleEn: 'Servo island display', state: 'sent', sentAt: '2026-11-25T04:12:00.000Z', thumbUrl: 'https://s3.test/t.jpg', ...over });

  it('shows a grey tile with the word Photo, never a broken picture, when the file cannot be read', () => {
    load(kView({ now: [], waiting: [sentRow()] }));
    renderPage();
    const li = document.querySelector('[data-kavach-code="w1"]') as HTMLElement;
    const img = li.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(li.querySelector('img')).toBeNull();
    const tile = within(li).getByTestId('kavach-thumb-missing');
    expect(tile).toHaveTextContent('Photo');
    expect(tile).toHaveAccessibleName('Photo');
  });

  it('shows the same tile when the server has no picture address at all', () => {
    load(kView({ now: [], waiting: [sentRow({ thumbUrl: null })] }));
    renderPage();
    expect(screen.getByTestId('kavach-thumb-missing')).toBeInTheDocument();
  });

  it('does not repeat the heading in a pill, and tells the owner nothing about who will send an already sent photo', () => {
    load(kView({ now: [], waiting: [sentRow({ uploader: 'manager' })] }));
    renderPage({ role: 'dealer-owner' });
    const li = document.querySelector('[data-kavach-code="w1"]') as HTMLElement;
    expect(li.querySelector('[data-status]')).toBeNull();
    expect(within(li).queryByText(/sends this/)).not.toBeInTheDocument();
    // And no "send a different photo" for a job that is the manager\'s.
    expect(within(li).queryByTestId('kavach-replace-w1')).not.toBeInTheDocument();
    expect(within(li).getByText('Sent 9:42 am')).toBeInTheDocument();
  });

  it('says "Manager sends this" quietly, with a person mark, on a manager\'s open job in the owner\'s folded list', () => {
    load(kView({ now: [kItem({ checkId: 'm', code: 'm', uploader: 'manager', titleEn: 'Island photo' })] }));
    renderPage({ role: 'dealer-owner' });
    fireEvent.click(screen.getByRole('button', { name: "Show Manager's jobs" }));
    const li = document.querySelector('[data-kavach-code="m"]') as HTMLElement;
    const who = within(li).getByText('Manager sends this');
    expect(who.className).toContain('text-meta');
    expect(who.className).not.toContain('font-medium');
    expect(who.querySelector('svg')).not.toBeNull();
  });
});

describe('KavachPage — the edges', () => {
  it('says calmly that Kavach is not started, with a way back', () => {
    load(kView({ on: false, now: [] }));
    renderPage();
    expect(screen.getByText('Kavach is not started for your pump yet. MDG will start it and let you know.')).toBeInTheDocument();
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
    expect(screen.getByText('Kavach could not load. Check your network and try again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.q.refetch).toHaveBeenCalled();
  });

  it('keeps the last list and says so when a refresh fails', () => {
    load(kView(), { isError: true });
    renderPage();
    expect(screen.getByTestId('kavach-offline')).toBeInTheDocument();
    expect(screen.getByTestId('kavach-summary')).toBeInTheDocument();
  });

  it('works when the server has none of the fields it may add later (group, counted, sent by)', () => {
    renderPage();
    expect(screen.queryByText(/Worth \d+% of your score/)).not.toBeInTheDocument();
    expect(screen.getByTestId('kavach-act-forecourt-photo')).toBeInTheDocument();
  });

  it('shows "Worth N% of your score" and who sent a photo only when the server says so', () => {
    const counted = { ...kItem({ checkId: 'cn', code: 'cn', titleEn: 'DAR report', points: 460, everyDays: 365, dueAt: '2026-11-25T11:00:00.000Z' }), counted: true };
    const sentBy = { ...kItem({ checkId: 'sx', code: 'sx', titleEn: 'Island photo', state: 'sent', sentAt: '2026-11-25T04:12:00.000Z' }), sentByName: 'Ramesh' };
    const view = kView({ now: [counted], waiting: [sentBy] });
    view.summary!.totalPoints = 3740;
    load(view);
    renderPage();
    expect(screen.getByText('Worth 12% of your score')).toBeInTheDocument();
    expect(screen.getByText('Sent 9:42 am by Ramesh')).toBeInTheDocument();
  });
});
