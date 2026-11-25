import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeReport, loadPlanData } from './dsr_sales/fixtures';
import { bannerWords, orderLinesText, orderLoad, planIsOld, view } from './load_plan';

// "Now" is 24 Nov 2026, noon IST, unless a test says otherwise. Only Date is faked, so
// promises and the clipboard still run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T06:30:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

function open(data = loadPlanData(), lang: 'hi' | 'hl' | 'en' = 'en') {
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={fakeReport('load_plan')} lang={lang} />);
}

const urgent = (over = {}) =>
  loadPlanData({
    severity: 'urgent',
    verdict: { code: 'ORDER_NOW_RUNNING_OUT', tankers: 1, products: ['MS'], closedDays: [], nextOrderOn: null, horizonDays: 4 },
    ...over,
  });
const calm = (over = {}) =>
  loadPlanData({
    severity: 'calm',
    verdict: { code: 'NEXT_ORDER', tankers: 0, products: [], closedDays: [], nextOrderOn: '2026-11-27', horizonDays: 4 },
    order: null,
    ...over,
  });

describe('load_plan: severity words follow the snapshot', () => {
  it('writes the urgent banner with the fuel that is running out', () => {
    expect(bannerWords(urgent(), 'en')).toBe('Order a tanker now. Petrol is running out.');
    expect(bannerWords(urgent(), 'hl')).toBe('Abhi tanker mangwaiye. Petrol khatam hone wala hai.');
    expect(bannerWords(urgent(), 'hi')).toBe('अभी टैंकर मँगवाइए। पेट्रोल खत्म होने वाला है।');
  });

  it('names several fuels and a closed depot', () => {
    expect(bannerWords(urgent({ verdict: { code: 'ORDER_NOW_RUNNING_OUT', tankers: 2, products: ['HSD', 'MS'], closedDays: [], nextOrderOn: null, horizonDays: 4 } }), 'en')).toBe(
      'Order a tanker now. Petrol and Diesel are running out.',
    );
    expect(
      bannerWords(urgent({ verdict: { code: 'ORDER_NOW_DEPOT_CLOSED', tankers: 1, products: [], closedDays: ['2026-11-26'], nextOrderOn: null, horizonDays: 4 } }), 'en'),
    ).toBe('Order a tanker now. The depot is closed on Thu 26 Nov.');
  });

  it('says "today" for an order-today plan and never uses the red words on a calm day', () => {
    expect(bannerWords(loadPlanData(), 'en')).toBe('Order a tanker today.');
    expect(bannerWords(calm(), 'en')).toBe('No order needed today. Next order on 27 Nov.');
    expect(bannerWords(calm({ verdict: { code: 'NONE_IN_WINDOW', tankers: 0, products: [], closedDays: [], nextOrderOn: null, horizonDays: 4 } }), 'en')).toBe(
      'No order needed in the next 4 days.',
    );
  });

  it('follows the severity even if the code disagrees: an urgent plan is never worded as "no order"', () => {
    const odd = loadPlanData({ severity: 'urgent', verdict: { code: 'NEXT_ORDER', tankers: 0, products: [], closedDays: [], nextOrderOn: '2026-11-27', horizonDays: 4 } });
    expect(bannerWords(odd, 'en')).toBe('Order a tanker now.');
    const calmOdd = loadPlanData({ severity: 'calm', verdict: { code: 'ORDER_TODAY', tankers: 1, products: [], closedDays: [], nextOrderOn: null, horizonDays: 4 } });
    expect(bannerWords(calmOdd, 'en')).toBe('No order needed today.');
  });
});

describe('load_plan: tile', () => {
  it('urgent is an octagon (problem) with "Order now" and what to order', () => {
    const tile = view.tile(urgent(), 'en')!;
    expect(tile.value).toBe('Order now');
    expect(tile.status).toBe('problem');
    expect(tile.sub).toBe('1 tanker: Petrol 2,000 L, Diesel 8,000 L');
  });

  it('order today is a triangle (attention)', () => {
    const tile = view.tile(loadPlanData(), 'en')!;
    expect(tile.value).toBe('Order today');
    expect(tile.status).toBe('attention');
  });

  it('calm is a tick with the next order day', () => {
    const tile = view.tile(calm(), 'en')!;
    expect(tile.value).toBe('No order today');
    expect(tile.status).toBe('ok');
    expect(tile.sub).toBe('Next order 27 Nov');
  });

  it('says how many days have no order when nothing is due in the window', () => {
    const d = calm({ verdict: { code: 'NONE_IN_WINDOW', tankers: 0, products: [], closedDays: [], nextOrderOn: null, horizonDays: 4 } });
    expect(view.tile(d, 'en')!.sub).toBe('No order in the next 4 days');
  });

  it('a plan older than two days is "Plan of 21 Nov" with a clock, whatever its severity', () => {
    const old = loadPlanData({ planDay: '2026-11-21' });
    expect(planIsOld(old)).toBe(true);
    const tile = view.tile(old, 'en')!;
    expect(tile.value).toBe('Plan of 21 Nov');
    expect(tile.status).toBe('waiting');
    expect(planIsOld(loadPlanData({ planDay: '2026-11-22' }))).toBe(false);
  });

  it('reads in Hindi and Hinglish', () => {
    expect(view.tile(loadPlanData(), 'hi')!.value).toBe('आज ऑर्डर करें');
    expect(view.tile(loadPlanData(), 'hl')!.value).toBe('Aaj order karein');
  });
});

describe('load_plan: alert', () => {
  it('urgent raises a problem card with the reason', () => {
    const a = view.alert(urgent(), 'en')!;
    expect(a.headline).toBe('Order a tanker now');
    expect(a.line).toBe('Petrol is running out.');
    expect(a.severity).toBe('problem');
  });

  it('order today raises a calm "needs a look" card with the order', () => {
    const a = view.alert(loadPlanData(), 'en')!;
    expect(a.headline).toBe('Order a tanker today');
    expect(a.line).toBe('1 tanker: Petrol 2,000 L, Diesel 8,000 L');
    expect(a.severity).toBe('attention');
  });

  it('raises nothing on a calm day, and nothing from an old plan', () => {
    expect(view.alert(calm(), 'en')).toBeNull();
    expect(view.alert(urgent({ planDay: '2026-11-20' }), 'en')).toBeNull();
  });
});

describe('load_plan: headline and share', () => {
  it('gives a history line for each severity', () => {
    expect(view.headline(urgent(), 'en')).toBe('Order now: Petrol is running out');
    expect(view.headline(loadPlanData(), 'en')).toBe('Order today: 1 tanker');
    expect(view.headline(calm(), 'en')).toBe('No order needed; next 27 Nov');
  });

  it('shares the order lines but never the credit money', () => {
    const text = view.share(loadPlanData(), 'en');
    expect(text).toContain('Next tanker plan · 12E · Plan of 24 Nov');
    expect(text).toContain('Order a tanker today.');
    expect(text).toContain('Tanker: Diesel 4,000 L, Diesel 4,000 L, Petrol 2,000 L');
    expect(text).toContain('24 Nov: Petrol 2,000 L, Diesel 8,000 L');
    expect(text).toContain('27 Nov: Petrol 6,000 L');
    expect(text).not.toMatch(/Rs|₹|deposit|credit|40,000|12,000/i);
  });
});

describe('load_plan: order lines', () => {
  it('lists only the days with a tanker and an open depot', () => {
    expect(orderLinesText(loadPlanData(), 'en')).toBe('24 Nov: Petrol 2,000 L, Diesel 8,000 L\n27 Nov: Petrol 6,000 L');
  });

  it('sums the order by fuel across tankers', () => {
    expect(orderLoad(loadPlanData())).toEqual({
      trucks: 1,
      byProduct: [
        { product: 'MS', litres: 2_000 },
        { product: 'HSD', litres: 8_000 },
      ],
    });
    expect(orderLoad(calm())).toBeNull();
  });
});

describe('load_plan: overlay', () => {
  it('opens with the severity banner in its own shape and the plan date', () => {
    open(urgent());
    const banner = screen.getByTestId('severity-banner');
    expect(banner.getAttribute('data-status')).toBe('problem');
    expect(banner.textContent).toContain('Order a tanker now. Petrol is running out.');
    expect(screen.getByText('Plan of 24 Nov')).toBeInTheDocument();
  });

  it('uses the triangle for order-today and the tick for a calm day, never red on a calm day', () => {
    const { unmount } = open(loadPlanData());
    expect(screen.getByTestId('severity-banner').getAttribute('data-status')).toBe('attention');
    unmount();
    open(calm());
    expect(screen.getByTestId('severity-banner').getAttribute('data-status')).toBe('ok');
  });

  it('draws the lorry with a text alternative that names every chamber', () => {
    open();
    const lorry = screen.getByRole('img');
    const label = lorry.getAttribute('aria-label')!;
    expect(label).toContain('Diesel 4,000 L');
    expect(label).toContain('Petrol 2,000 L');
    expect(label).toContain('Empty');
    // Fuel letters sit above the chambers and litres inside them.
    const texts = [...lorry.querySelectorAll('text')].map((x) => x.textContent);
    expect(texts).toEqual(expect.arrayContaining(['HSD', 'MS', '4,000', '2,000']));
  });

  it('lists the chambers as real text: fuel, litres, tank, and "about" when the tank size is an estimate', () => {
    open();
    expect(screen.getByRole('table', { name: 'Tanker' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Stock and days left' })).toBeInTheDocument();
    const rows = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    // Chamber 1 sits on tank 4 whose size was estimated.
    expect(rows.some((r) => r.includes('1(Tank 4)') && r.includes('Diesel') && r.includes('about 4,000 L'))).toBe(true);
    expect(rows.some((r) => r.includes('2(Tank 6)') && r.includes('4,000 L') && !r.includes('about'))).toBe(true);
    expect(rows.some((r) => r.includes('Empty'))).toBe(true);
  });

  it('writes the order, load and arrival in words with no invented hour', () => {
    open();
    expect(screen.getByText('Order 24 Nov. Loads at the depot 25 Nov. Arrives about 4:00 pm, 25 Nov.')).toBeInTheDocument();
  });

  it('stacks several tankers with their own lorry and label', () => {
    const d = loadPlanData();
    d.order!.trucks = [d.order!.trucks[0]!, { full: false, chambers: [{ litres: 6_000, product: 'MS', poolKey: 'MS-1', tankNo: 1 }] }];
    open(d);
    // The label is printed over the lorry and is the name of its chamber table.
    expect(screen.getByRole('table', { name: 'Tanker 1 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Tanker 2 of 2' })).toBeInTheDocument();
    expect(screen.getAllByText('Tanker 2 of 2').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByText('Not a full tanker')).toBeInTheDocument();
  });

  it('says plainly when no tanker is planned', () => {
    open(calm());
    expect(screen.getByText('No tanker is planned yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows stock and days left per pool, with tank numbers only where a fuel has two pools', () => {
    const { container } = open();
    const rows = [...container.querySelectorAll('tr[data-pool]')];
    expect(rows).toHaveLength(3);
    const first = rows.find((r) => r.getAttribute('data-pool') === 'HSD-4-6')!;
    expect(first.textContent).toContain('Tank 4, 6');
    expect(first.textContent).toContain('6,000 L');
    expect(first.textContent).toContain('2.4 days');
    expect(first.textContent).toContain('At the minimum');
    expect(first.querySelector('[aria-hidden="true"] div')).toBeTruthy();
    const petrol = rows.find((r) => r.getAttribute('data-pool') === 'MS-1')!;
    expect(petrol.textContent).not.toContain('Tank');
    expect(petrol.textContent).toContain('9.2 days');
    expect(petrol.textContent).not.toContain('At the minimum');
  });

  it('says "not enough days of sales yet" instead of a number or a zero', () => {
    const { container } = open();
    const row = container.querySelector('tr[data-pool="HSD-8"]')!;
    expect(row.textContent).toContain('not enough days of sales yet');
    expect(row.textContent).not.toMatch(/\b0\s*days/);
  });

  it('draws the four-day strip: an order, no order, a hatched closed depot', () => {
    const { container } = open();
    const cells = [...container.querySelectorAll('li[data-date]')];
    expect(cells).toHaveLength(4);
    expect(cells.map((c) => c.getAttribute('data-cell'))).toEqual(['order', 'none', 'closed', 'order']);
    expect(cells[0]!.textContent).toContain('Tue 24');
    expect(cells[0]!.textContent).toContain('×1');
    expect(cells[0]!.textContent).toContain('HSD 8,000');
    expect(cells[0]!.textContent).toContain('MS 2,000');
    expect(cells[1]!.textContent).toContain('No order');
    expect(cells[2]!.textContent).toContain('Depot closed');
    // Copy buttons only on the days with an order, 48 px high.
    expect(cells[0]!.querySelector('button')!.className).toContain('min-h-[48px]');
    expect(cells[1]!.querySelector('button')).toBeNull();
    expect(cells[2]!.querySelector('button')).toBeNull();
  });

  it('copies one day’s line for IndianOil’s form', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { container } = open();
    fireEvent.click(container.querySelector('li[data-date="2026-11-27"] button')!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('27 Nov: Petrol 6,000 L'));
    await waitFor(() => expect(within(container.querySelector('li[data-date="2026-11-27"]') as HTMLElement).getByText('Copied')).toBeInTheDocument());
  });

  it('copies all the order lines at once', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy all order lines' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('24 Nov: Petrol 2,000 L, Diesel 8,000 L\n27 Nov: Petrol 6,000 L'));
  });

  it('offers no copy-all when nothing is to be ordered', () => {
    open(calm({ projection: [{ date: '2026-11-24', depotClosed: false, tankers: 0, litresByProduct: {}, cover: [] }] }));
    expect(screen.queryByRole('button', { name: 'Copy all order lines' })).not.toBeInTheDocument();
  });

  it('opens a stored plan whose empty litres objects were lost (days with no tanker, `litresByProduct` missing)', () => {
    // Older copies came back from the database without the empty object: the field is just gone.
    const stripped = calm({
      projection: [
        { date: '2026-11-24', depotClosed: false, tankers: 0, cover: [] },
        { date: '2026-11-25', depotClosed: false, tankers: 1, litresByProduct: { MS: 4000 }, cover: [] },
        { date: '2026-11-26', depotClosed: false, tankers: 0, cover: [] },
      ] as never,
    });
    expect(() => open(stripped)).not.toThrow();
    expect(screen.getByRole('button', { name: 'Copy all order lines' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-date]')).toHaveLength(3);
  });

  it('lists what is on the way, with "about" when the litres are an estimate', () => {
    open();
    const item = screen.getByText('about 6,000 L').closest('li')!;
    expect(item.textContent).toContain('Diesel');
    expect(item.textContent).toContain('invoice 22 Nov');
    expect(item.textContent).toContain('BR01GA1234');
  });

  it('shows the credit line to an owner: deposit when short, enough when not', () => {
    open();
    expect(screen.getByTestId('credit-line').textContent).toContain('Deposit about ₹40,000 before ordering');
    expect(screen.getByTestId('credit-line').getAttribute('data-status')).toBe('attention');
  });

  it('says credit is enough when nothing is short', () => {
    open(loadPlanData({ credit: { availableRs: 90_000, shortByRs: 0 } }));
    expect(screen.getByTestId('credit-line').textContent).toContain('Credit is enough');
    expect(screen.getByTestId('credit-line').getAttribute('data-status')).toBe('ok');
  });

  it('says nothing about credit when the figure is unknown, absent, or stripped for a manager', () => {
    for (const credit of [{ availableRs: null, shortByRs: null }, null, undefined]) {
      const { unmount } = open(loadPlanData({ credit }));
      expect(screen.queryByTestId('credit-line')).not.toBeInTheDocument();
      unmount();
    }
    const d = loadPlanData();
    delete d.credit;
    const { container } = open(d);
    expect(container.textContent).not.toMatch(/Rs |Deposit|Credit is enough/);
  });

  it('warns that an old plan is old, with its date', () => {
    open(loadPlanData({ planDay: '2026-11-21' }));
    expect(screen.getByTestId('old-plan').textContent).toContain('This is the plan of 21 Nov. Check the date before you order.');
  });

  it('has no old-plan warning for today’s plan', () => {
    open();
    expect(screen.queryByTestId('old-plan')).not.toBeInTheDocument();
  });

  it('leaves out the strip when the plan has no projection', () => {
    open(loadPlanData({ projection: [] }));
    expect(screen.queryByText('Next 4 days')).not.toBeInTheDocument();
  });

  it('speaks Hindi and Hinglish', () => {
    const { container } = open(urgent(), 'hi');
    expect(container.textContent).toContain('अभी टैंकर मँगवाइए।');
    expect(container.textContent).toContain('24 नवंबर का प्लान');
    expect(container.textContent).toContain('क्या मँगवाना है');
    const hl = open(urgent(), 'hl');
    expect(hl.container.textContent).toContain('Abhi tanker mangwaiye.');
    expect(hl.container.textContent).toContain('24 Nov ka plan');
  });
});

describe('load_plan: glyph', () => {
  it('is a decorative 40:28 lorry', () => {
    const Glyph = view.Glyph;
    const { container } = render(<Glyph />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toHaveAttribute('width', '40');
    expect(view.kind).toBe('load_plan');
  });
});
