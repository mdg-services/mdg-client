import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PENDING_SALES, fakeReport, ledgerRow, salesBlock, salesData } from './dsr_sales/fixtures';
import { compareWords, isSold, salesLead, weekCompare, view } from './dsr_sales';

const LANGS = ['hi', 'hl', 'en'] as const;

function open(data = salesData(), lang: 'hi' | 'hl' | 'en' = 'en') {
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={fakeReport('dsr_sales')} lang={lang} />);
}

describe('dsr_sales: tile', () => {
  it('puts each fuel side by side, never added together, with the weekday comparison', () => {
    const tile = view.tile(salesData(), 'en')!;
    expect(tile.value).toBe('Diesel 10,430 L · Petrol 4,210 L');
    expect(tile.sub).toContain('23 Nov');
    expect(tile.sub).toContain('Diesel +6%');
    expect(tile.sub).toContain('Petrol −4%');
    expect(tile.sub).toContain('last Monday');
    // Sales judge nothing: the tile is plain information.
    expect(tile.status).toBe('info');
    // The same facts set out for the eye: a row per fuel, the week's change beside the name,
    // and the day and what the change is against on lines of their own.
    expect(tile.rows).toEqual([
      { label: 'Diesel', value: '10,430 L', hint: '+6%' },
      { label: 'Petrol', value: '4,210 L', hint: '−4%' },
    ]);
    expect(tile.lines).toEqual(['23 Nov', 'Change vs last Monday']);
  });

  it('shows one big number for one fuel', () => {
    const d = salesData();
    d.products = [d.products[0]!];
    const tile = view.tile(d, 'en')!;
    expect(tile.value).toBe('10,430 L');
    expect(tile.sub).toBe('23 Nov · Diesel · +6% vs last Monday');
  });

  it('says it in Hindi and Hinglish too', () => {
    const d = salesData();
    d.products = [d.products[0]!];
    expect(view.tile(d, 'hi')!.sub).toContain('पिछले सोमवार से +6%');
    expect(view.tile(d, 'hl')!.sub).toContain('pichhle Monday se +6%');
  });

  it('never shows a 0 when yesterday is not worked out: dashes and a clock', () => {
    const d = salesData({ products: [{ key: 'HSD', tankNos: [4], sales: PENDING_SALES }] });
    const tile = view.tile(d, 'en')!;
    expect(tile.value).toBe('--');
    expect(tile.sub).toMatch(/not worked out yet/i);
    expect(tile.status).toBe('waiting');
  });

  it('keeps the closed fuel and names the pending one', () => {
    const d = salesData();
    d.products = [d.products[0]!, { key: 'MS', tankNos: [1], sales: PENDING_SALES }];
    const tile = view.tile(d, 'en')!;
    expect(tile.value).toBe('10,430 L');
    expect(tile.sub).toContain('Petrol: not worked out yet');
    expect(tile.status).toBe('waiting');
  });

  it('says the first weeks cannot be compared yet instead of inventing a percent', () => {
    const noLast = salesBlock({ sameWeekdayLastWeek: null });
    expect(weekCompare(noLast)).toBeNull();
    expect(compareWords(noLast, 'en')).toBeNull();
    const zeroLast = salesBlock({ sameWeekdayLastWeek: { day: '2026-11-16', soldL: 0 } });
    expect(weekCompare(zeroLast)).toBeNull();
  });
});

describe('dsr_sales: alert, headline, share', () => {
  it('raises no alert, ever: a sales sheet judges nothing', () => {
    expect(view.alert(salesData(), 'en')).toBeNull();
    expect(view.alert(salesData({ products: [{ key: 'HSD', tankNos: [4], sales: PENDING_SALES }] }), 'en')).toBeNull();
  });

  it('gives a one-line history headline', () => {
    expect(view.headline(salesData(), 'en')).toBe('Sold: Diesel 10,430 L, Petrol 4,210 L');
    expect(view.headline(salesData({ products: [{ key: 'HSD', tankNos: [4], sales: PENDING_SALES }] }), 'en')).toBe(
      'Sales not worked out yet',
    );
    expect(view.headline(salesData(), 'hi')).toMatch(/[ऀ-ॿ]/);
  });

  it('shares plain text with the outlet, the day, and each fuel', () => {
    const text = view.share(salesData(), 'en');
    const lines = text.split('\n');
    expect(lines[0]).toBe('Daily sales (DSR) · 12E · 23 Nov');
    expect(lines[1]).toBe('Diesel (HSD): Sold: 10,430 L · Stock this morning: 24,330 L · Received: 8,000 L');
    expect(lines[2]).toContain('Petrol (MS): Sold: 4,210 L');
    expect(text).not.toMatch(/variation|short|over/i);
  });

  it('shares "not worked out yet" for a pending fuel, never 0 L', () => {
    const text = view.share(salesData({ products: [{ key: 'HSD', tankNos: [4], sales: PENDING_SALES }] }), 'en');
    expect(text).toContain('Not worked out yet');
    expect(text).not.toContain('0 L');
  });
});

describe('dsr_sales: lead sentence', () => {
  it('names the day and the litres of each fuel', () => {
    const products = salesData().products;
    expect(salesLead(products, 'en')).toBe('On 23 Nov you sold 10,430 L of Diesel and 4,210 L of Petrol.');
    expect(salesLead(products, 'hl')).toBe('23 Nov ko aapne Diesel 10,430 L aur Petrol 4,210 L becha.');
    expect(salesLead(products, 'hi')).toBe('23 नवंबर को आपने डीज़ल 10,430 L और पेट्रोल 4,210 L बेचा।');
  });

  it('says plainly that a pending fuel is being fixed', () => {
    const products = [salesData().products[0]!, { key: 'MS', tankNos: [1], sales: PENDING_SALES }];
    expect(salesLead(products, 'en')).toBe('On 23 Nov you sold 10,430 L of Diesel. Sales for Petrol are not worked out yet. We are fixing it.');
  });

  it('treats a closed day with no litre figure as pending', () => {
    expect(isSold(salesBlock({ soldL: null }))).toBe(false);
  });
});

describe('dsr_sales: overlay', () => {
  it('draws the lead, one block per fuel and the glance strip with real numbers', () => {
    open();
    expect(screen.getByText('On 23 Nov you sold 10,430 L of Diesel and 4,210 L of Petrol.')).toBeInTheDocument();
    expect(screen.getAllByText('Sold 23 Nov')).toHaveLength(2);
    expect(screen.getAllByText('10,430 L').length).toBeGreaterThan(0);
    expect(screen.getByText('24,330 L')).toBeInTheDocument();
    expect(screen.getAllByText('Stock this morning')).toHaveLength(2);
    // The receipt source is words, never only a letter.
    expect(screen.getByText('entered by hand')).toBeInTheDocument();
    expect(screen.getByText('worked out from the tank dip')).toBeInTheDocument();
    expect(screen.getByText('+6% vs last Monday')).toBeInTheDocument();
    expect(screen.getByText('Diesel')).toBeInTheDocument();
    expect(screen.getByText('(HSD)')).toBeInTheDocument();
    expect(screen.getByText('· tanks 4, 6, 8')).toBeInTheDocument();
  });

  it('draws the ledger as a real table with a caption and a pinned date column', () => {
    open();
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);
    const diesel = tables[0]!;
    expect(within(diesel).getByText(/Diesel \(HSD\), daily sales report/)).toBeInTheDocument();
    // The same columns, in the same order, as the sheet the manager fills in and the card printed.
    const headers = within(diesel).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Date',
      'Tank 4/6/8',
      'Opening stock',
      'Receipt',
      'Total stock',
      'Opening meter reading',
      'Testing',
      'Sales',
      'Cumulative sales(this month)',
      'Remarks',
      'Dip',
      'Water dip',
      '1',
      '2',
    ]);
    const rowHeaders = within(diesel).getAllByRole('rowheader');
    expect(rowHeaders.map((h) => h.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('22 Nov'), expect.stringContaining('23 Nov'), expect.stringContaining('24 Nov')]),
    );
    // The date column is sticky.
    expect(rowHeaders[0]!.className).toContain('sticky');
    expect(rowHeaders[0]!.className).toContain('left-0');
    // The scroll region is reachable by keyboard and labelled.
    expect(screen.getAllByRole('region')[0]).toHaveAttribute('tabindex', '0');
  });

  it('marks the open day "Today" as the sheet does, and shows a dash for its sales', () => {
    open();
    const diesel = screen.getAllByRole('table')[0]!;
    const openRow = diesel.querySelector('tr[data-open="true"]') as HTMLElement;
    expect(within(openRow).getByText('Today')).toBeInTheDocument();
    const cells = within(openRow).getAllByRole('cell');
    // Sales and the cumulative are both dashes on the open row.
    expect(cells.filter((c) => c.textContent === '—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('— today’s sales close on tomorrow’s reading').length).toBeGreaterThan(0);
  });

  it('prints a meter reading as the dispenser shows it, with no grouping commas, and "--" when there is none', () => {
    const d = salesData();
    const diesel = d.products[0]!;
    diesel.sales = {
      ...diesel.sales!,
      rows: [ledgerRow({ pumps: [{ nozzleNo: 1, reading: 1_234_567 }, { nozzleNo: 2, reading: null as never }] })],
    };
    open(d);
    const table = screen.getAllByRole('table')[0]!;
    expect(within(table).getByText('1234567')).toBeInTheDocument();
    expect(within(table).queryByText('12,34,567')).not.toBeInTheDocument();
  });

  it('never draws a 0 for a fuel whose sales are pending', () => {
    open(salesData({ products: [{ key: 'HSD', tankNos: [4], sales: PENDING_SALES }] }));
    expect(screen.getByText('Sales for Diesel are not worked out yet. We are fixing it.')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Not worked out yet')).toBeInTheDocument();
    expect(screen.queryByText('0 L')).not.toBeInTheDocument();
    // No rows, so no table.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('carries the sales sheet only: no variation or verdict words anywhere', () => {
    const { container } = open();
    expect(container.textContent).not.toMatch(/variation|\bshort\b|within the limit|permissible/i);
  });

  it('shows a corrected-copy line without any variation figures', () => {
    open(salesData({ revised: true }));
    expect(screen.getByText(/This is a corrected copy/)).toBeInTheDocument();
  });

  it('marks a new month on the row where the cumulative restarts', () => {
    const rows = [ledgerRow({ day: '2026-11-30' }), ledgerRow({ day: '2026-12-01', newMonth: true, monthToDateL: 9_800 })];
    open(salesData({ products: [{ key: 'HSD', tankNos: [4], sales: salesBlock({ closedDay: '2026-12-01', rows }) }] }));
    expect(screen.getByText('New month')).toBeInTheDocument();
  });

  it('gives each tank its own Dip, Water dip and Stock columns, as the sheet does', () => {
    const rows = [
      ledgerRow({
        day: '2026-11-23',
        tanks: [
          { tankNo: 4, dip: 101.5, waterDip: 0, stockL: 6_200, stockSource: 'reported' },
          { tankNo: 6, dip: 88, waterDip: 0.2, stockL: 5_100, stockSource: 'carried', stockAsOf: '2026-11-21' },
        ],
      }),
    ];
    open(salesData({ products: [{ key: 'HSD', tankNos: [4, 6], sales: salesBlock({ rows }) }] }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Tank 4')).toBeInTheDocument();
    expect(within(table).getByText('Tank 6')).toBeInTheDocument();
    expect(within(table).getAllByText('Stock')).toHaveLength(2);
    expect(within(table).getByText('101.5')).toBeInTheDocument();
    expect(within(table).getByText('5,100')).toBeInTheDocument();
  });

  it('shows every day the report carries, as the card did', () => {
    const rows = Array.from({ length: 3 }, (_, i) => ledgerRow({ day: `2026-11-${String(21 + i).padStart(2, '0')}` }));
    open(salesData({ products: [{ key: 'HSD', tankNos: [4], sales: salesBlock({ rows }) }] }));
    expect(screen.getAllByRole('rowheader')).toHaveLength(3);
  });

  it('offers a jump control from three fuels up', () => {
    const d = salesData();
    d.products = [...d.products, { key: 'XP', tankNos: [2], sales: salesBlock() }];
    open(d);
    const nav = screen.getByRole('navigation', { name: 'Jump to a fuel' });
    expect(within(nav).getAllByRole('button')).toHaveLength(3);
    // Clicking must not throw where scrolling is unsupported (jsdom).
    fireEvent.click(within(nav).getByRole('button', { name: 'XP95 petrol' }));
  });

  it('explains retired nozzles and the receipt marks under "More"', () => {
    const d = salesData();
    d.products[0] = { ...d.products[0]!, retiredNozzles: [3] };
    open(d);
    expect(screen.getByText(/Retired nozzles \(meter stopped\): Diesel 3/)).toBeInTheDocument();
    // The receipt marks are explained under the table, in the sheet's own words.
    expect(screen.getByText('receipt entered by hand')).toBeInTheDocument();
  });

  it('marks a receipt typed by hand with the sheet\'s M, and one read from the dip with D', () => {
    open();
    const tables = screen.getAllByRole('table');
    expect(within(tables[0]!).getByText('M')).toBeInTheDocument();
    expect(within(tables[1]!).getByText('D')).toBeInTheDocument();
  });

  it('speaks Hindi and Hinglish all the way through', () => {
    for (const lang of ['hi', 'hl'] as const) {
      const { container, unmount } = open(salesData(), lang);
      expect(container.textContent).toContain(lang === 'hi' ? 'बिक्री' : 'Bikri');
      expect(container.textContent).not.toContain('Stock this morning');
      unmount();
    }
    const { container } = open(salesData(), 'hi');
    expect(container.textContent).toContain('आज सुबह का स्टॉक');
    expect(container.textContent).toContain('दिनांक');
    expect(container.textContent).toContain('शुरुआती मीटर रीडिंग');
  });
});

describe('dsr_sales: glyph', () => {
  it('is a decorative 40:28 ruled grid', () => {
    const Glyph = view.Glyph;
    const { container } = render(<Glyph size={28} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '28');
    const { container: big } = render(<Glyph size={56} />);
    expect(big.querySelector('svg')).toHaveAttribute('width', '80');
  });

  it('is the view of its own kind', () => {
    expect(view.kind).toBe('dsr_sales');
    for (const lang of LANGS) expect(view.headline(salesData(), lang).trim()).not.toBe('');
  });
});
