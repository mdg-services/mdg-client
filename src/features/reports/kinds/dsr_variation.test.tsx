import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OVER_BLOCK, SHORT_BLOCK, fakeReport, salesBlock, variationBlock, variationData } from './dsr_sales/fixtures';
import { CONSEQUENCE_WORDS, positionWords, view } from './dsr_variation';

const M = '−';

function open(data = variationData(), lang: 'hi' | 'hl' | 'en' = 'en') {
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={fakeReport('dsr_variation')} lang={lang} />);
}

const allFine = () =>
  variationData({
    products: [
      { key: 'HSD', tankNos: [4], variation: variationBlock() },
      { key: 'MS', tankNos: [1], variation: variationBlock({ variationL: 90 }) },
    ],
  });
const bothOut = () =>
  variationData({
    products: [
      { key: 'HSD', tankNos: [4], variation: SHORT_BLOCK },
      { key: 'MS', tankNos: [1], variation: OVER_BLOCK },
    ],
  });

describe('dsr_variation: tile', () => {
  it('says "All fine" with a tick when every fuel is inside the limit', () => {
    const tile = view.tile(allFine(), 'en')!;
    expect(tile.value).toBe('All fine');
    expect(tile.status).toBe('ok');
    expect(tile.sub).toBe('2 fuels within the limit');
  });

  it('names the one fuel and its allowed range when there is a single fuel', () => {
    const d = allFine();
    d.products = [d.products[0]!];
    expect(view.tile(d, 'en')!.sub).toBe(`Diesel: Allowed ${M}420 to +310 L`);
  });

  it('shows a short fuel with a triangle status and the word Short', () => {
    const tile = view.tile(variationData(), 'en')!;
    expect(tile.value).toBe(`Diesel ${M}520 L`);
    // A shortage beyond the limit is a problem, as red as an excess (amber is for "pending").
    expect(tile.status).toBe('problem');
    expect(tile.sub).toBe(`Short · Allowed ${M}420 to +310 L`);
  });

  it('shows an over fuel with an octagon (problem) status and the word Over', () => {
    const d = variationData({ products: [{ key: 'MS', tankNos: [1], variation: OVER_BLOCK }] });
    const tile = view.tile(d, 'en')!;
    expect(tile.value).toBe('Petrol +380 L');
    expect(tile.status).toBe('problem');
    expect(tile.sub).toMatch(/^Over · /);
  });

  it('puts over before short and says how many more are out', () => {
    const tile = view.tile(bothOut(), 'en')!;
    expect(tile.value).toBe('Petrol +380 L');
    expect(tile.status).toBe('problem');
    expect(tile.sub).toContain('+1 more');
  });

  it('draws one row per fuel that is out, worst first, with over/short beside the name', () => {
    const tile = view.tile(bothOut(), 'en')!;
    expect(tile.rows).toEqual([
      { label: 'Petrol', value: '+380 L', hint: 'Over' },
      { label: 'Diesel', value: `${M}520 L`, hint: 'Short' },
    ]);
    // With more than one fuel out the allowed range is the report's to say, not the tile's.
    expect(tile.lines).toEqual([]);
  });

  it('says the allowed range once, with the unit kept to its figure, when one fuel is out', () => {
    const tile = view.tile(variationData(), 'en')!;
    expect(tile.rows).toHaveLength(1);
    expect(tile.lines).toEqual([`Allowed ${M}420 to +310\u00A0L`]);
  });

  it('counts nothing before the first inspection', () => {
    const tile = view.tile(variationData({ beforeInspection: true }), 'en')!;
    expect(tile.value).toBe('Not counted yet');
    expect(tile.sub).toBe('Counting starts after the inspection');
    expect(tile.status).toBe('info');
  });

  it('has no tile when no fuel carries a variation', () => {
    expect(view.tile(variationData({ products: [{ key: 'HSD', tankNos: [4] }] }), 'en')).toBeNull();
  });

  it('reads in Hindi and Hinglish', () => {
    expect(view.tile(variationData(), 'hi')!.value).toBe(`डीज़ल ${M}520 L`);
    expect(view.tile(variationData(), 'hl')!.sub).toMatch(/^Kam · Maanya/);
    expect(view.tile(allFine(), 'hi')!.value).toBe('सब ठीक');
  });
});

describe('dsr_variation: alert', () => {
  it('raises a problem card for a short fuel, in plain words, with the same figure the tile prints', () => {
    const a = view.alert(variationData(), 'en')!;
    // The stock variation (the tile says -520 L); the 100 L beyond the limit is in the line.
    expect(a.headline).toBe('Diesel 520 L short');
    expect(a.line).toBe('Your stock is 100 L below the permitted limit. You may be asked to explain.');
    expect(a.severity).toBe('problem');
    expect(view.tile(variationData(), 'en')!.value).toBe(`Diesel ${M}520 L`);
  });

  it('says the litres beyond the limit in Hindi and Hinglish too', () => {
    expect(view.alert(variationData(), 'hi')!.line).toBe('आपका स्टॉक मान्य सीमा से 100 L कम है। आपसे लिखित स्पष्टीकरण माँगा जा सकता है।');
    expect(view.alert(variationData(), 'hl')!.line).toBe('Aapka stock maanya seema se 100 L kam hai. Aapse likhit jawab maanga ja sakta hai.');
    expect(view.alert(variationData(), 'hi')!.headline).toBe('डीज़ल 520 L कम है');
  });

  it('ranks an excess above a shortage, though both are problems', () => {
    expect(view.alert(variationData(), 'en')!.weight).toBe(0);
    expect(view.alert(variationData({ products: [{ key: 'MS', tankNos: [1], variation: OVER_BLOCK }] }), 'en')!.weight).toBe(1);
  });

  it('raises a problem card for an over fuel, and the two are told apart by words as well as severity', () => {
    const a = view.alert(variationData({ products: [{ key: 'MS', tankNos: [1], variation: OVER_BLOCK }] }), 'en')!;
    expect(a.headline).toBe('Petrol 380 L over');
    expect(a.line).toContain('Your stock is 70 L above the limit');
    expect(a.line).toContain('Sales can be stopped');
    expect(a.severity).toBe('problem');
  });

  it('leads with the worst fuel and says another one needs a look', () => {
    const a = view.alert(bothOut(), 'en')!;
    expect(a.headline).toBe('Petrol 380 L over');
    expect(a.line).toContain('1 more fuel also needs a look');
  });

  it('raises nothing when all is fine or before the first inspection', () => {
    expect(view.alert(allFine(), 'en')).toBeNull();
    expect(view.alert(variationData({ beforeInspection: true }), 'en')).toBeNull();
  });

  it('speaks Hinglish', () => {
    expect(view.alert(variationData(), 'hl')!.headline).toBe('Diesel 520 L kam hai');
  });
});

describe('dsr_variation: headline and share', () => {
  it('gives one line per state', () => {
    expect(view.headline(allFine(), 'en')).toBe('All fuels within the limit');
    expect(view.headline(variationData(), 'en')).toBe(`Diesel ${M}520 L (Short)`);
    expect(view.headline(bothOut(), 'en')).toBe(`Petrol +380 L (Over), Diesel ${M}520 L (Short)`);
    expect(view.headline(variationData({ beforeInspection: true }), 'en')).toBe('Before the first inspection: not counted');
  });

  it('shares the figures with the allowed range and the verdict, as plain text', () => {
    const text = view.share(variationData(), 'en').split('\n');
    expect(text[0]).toBe('Stock variation · 12E · 23 Nov');
    expect(text[1]).toBe(`Diesel (HSD): ${M}520 L · Allowed ${M}420 to +310 L · short, 100 L beyond the limit`);
    expect(text[2]).toBe(`Petrol (MS): ${M}200 L · Allowed ${M}420 to +310 L · within the limit`);
  });

  it('adds the sales sheet to the share when the message carries both sheets', () => {
    const d = variationData({
      sheets: ['variation', 'sales'],
      products: [{ key: 'HSD', tankNos: [4], variation: SHORT_BLOCK, sales: salesBlock() }],
    });
    expect(view.share(d, 'en')).toContain('Diesel (HSD): Sold: 10,430 L');
  });
});

describe('dsr_variation: overlay', () => {
  it('opens with one plain sentence', () => {
    open();
    expect(screen.getByText('Diesel is short. Petrol is fine.')).toBeInTheDocument();
  });

  it('draws one balance bar per fuel with a text alternative that says the same as the picture', () => {
    open();
    const bars = screen.getAllByRole('img');
    expect(bars).toHaveLength(2);
    const label = bars[0]!.getAttribute('aria-label')!;
    expect(label).toContain('Diesel (HSD)');
    expect(label).toContain('520 L short of zero');
    expect(label).toContain('Allowed range: from 420 L short to 310 L over.');
  });

  it('prints the signed number with a true minus at 40 px and the word Short in a triangle badge', () => {
    open();
    const numbers = screen.getAllByTestId('big-number');
    expect(numbers[0]!.textContent).toBe(`${M}520 L`);
    expect(numbers[0]!.className).toContain('text-[40px]');
    const diesel = numbers[0]!.closest('article')!;
    const badge = diesel.querySelector('[data-status]') as HTMLElement;
    expect(badge.getAttribute('data-status')).toBe('problem');
    expect(within(diesel).getByText('Short')).toBeInTheDocument();
    expect(within(diesel).getByText('You may be asked to explain')).toBeInTheDocument();
  });

  it('draws over as a different shape from short: an octagon badge and an up arrow, the word Over', () => {
    const { container } = open(bothOut());
    const shortCard = container.querySelector('article[data-fuel="HSD"]')!;
    const overCard = container.querySelector('article[data-fuel="MS"]')!;
    expect(within(overCard as HTMLElement).getByText('Over')).toBeInTheDocument();
    expect(within(overCard as HTMLElement).getByText('Sales can be stopped')).toBeInTheDocument();
    // The pointer: a triangle above the bar for short, one below it for over, both in the problem colour.
    const shortPointer = shortCard.querySelector('svg polygon')!;
    const overPointer = overCard.querySelector('svg polygon')!;
    expect(shortPointer.getAttribute('style')).toContain('--status-problem');
    expect(overPointer.getAttribute('style')).toContain('--status-problem');
    // Down arrow vs up arrow: the tip is the last point for short (bottom) and the first for over (top).
    const pts = (el: Element) => el.getAttribute('points')!.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    const s = pts(shortPointer);
    expect(s[2]![1]).toBeGreaterThan(s[0]![1]);
    const o = pts(overPointer);
    expect(o[0]![1]).toBeLessThan(o[1]![1]);
    // The badge outlines differ too.
    const shapes = new Set([...container.querySelectorAll('span[data-status] svg')].map((s) => s.innerHTML));
    expect(shapes.size).toBeGreaterThanOrEqual(2);
  });

  it('writes the three rows: variation, permissible variation, beyond the limit', () => {
    open(bothOut());
    const shortCard = document.querySelector('article[data-fuel="HSD"]') as HTMLElement;
    expect(within(shortCard).getByRole('row', { name: new RegExp(`Variation ${M}520 L`) })).toBeInTheDocument();
    expect(within(shortCard).getByRole('row', { name: /Permissible variation.*420 L/ })).toBeInTheDocument();
    expect(within(shortCard).getByRole('row', { name: new RegExp(`Beyond the limit ${M}100 L`) })).toBeInTheDocument();
    // The parts of the permissible band: 4% of stock and the evaporation part (short only).
    expect(within(shortCard).getByText(/4% of tank stock \(310 L\)/)).toBeInTheDocument();
    expect(within(shortCard).getByText(/0\.5% of sales for evaporation and handling \(110 L\)/)).toBeInTheDocument();
    const overCard = document.querySelector('article[data-fuel="MS"]') as HTMLElement;
    expect(within(overCard).getByText('The evaporation allowance counts only when stock is short.')).toBeInTheDocument();
  });

  it('shows the what-to-do box and the guideline consequence only when a fuel is out', () => {
    open(bothOut());
    const shortCard = document.querySelector('article[data-fuel="HSD"]') as HTMLElement;
    const overCard = document.querySelector('article[data-fuel="MS"]') as HTMLElement;
    expect(within(shortCard).getByTestId('what-to-do').textContent).toContain('Top up about 100 L from the dispenser into the tank.');
    expect(within(overCard).getByTestId('what-to-do').textContent).toContain('Account for about 70 L');
    expect(within(shortCard).getByText('MDG guideline 5.1.11')).toBeInTheDocument();
    expect(within(shortCard).getByText(/negative variation beyond the limit/i)).toBeInTheDocument();
    expect(within(overCard).getByText(/positive variation beyond the limit/i)).toBeInTheDocument();
  });

  it('shows neither for a fuel inside the limit', () => {
    open(allFine());
    expect(screen.queryByTestId('what-to-do')).not.toBeInTheDocument();
    expect(screen.queryByText('MDG guideline 5.1.11')).not.toBeInTheDocument();
    expect(screen.getAllByText('Within limit').length).toBe(2);
  });

  it('writes the inspection totals and "how we worked it out" under quiet rows', () => {
    const d = variationData({
      products: [
        {
          key: 'HSD',
          tankNos: [4],
          variation: variationBlock({
            how: { meterSalesL: 100_000, afterTestingL: 99_360, totalStockL: 40_000, dipStockL: 39_500, dipSalesL: 99_860 },
            band: { stockPct: 4, stockL: 310, leakPct: 0.5, leakL: 110, leakApplies: true, tiers: { firstPct: 0.5, restPct: 0.3, tier1L: 50_000, tier2L: 49_360, thresholdL: 50_000, days: 30 } },
          }),
        },
      ],
    });
    open(d);
    expect(screen.getByText('Total received since the inspection on 12 Oct: 1,20,000 L')).toBeInTheDocument();
    expect(screen.getByText('Total testing since the inspection on 12 Oct: 640 L')).toBeInTheDocument();
    expect(screen.getByText('How we worked this out')).toBeInTheDocument();
    expect(screen.getByText('Meter sales')).toBeInTheDocument();
    expect(screen.getByText(/0\.5% on the first 50,000 L of sales, 0\.3% after that \(30 days\)/)).toBeInTheDocument();
  });

  it('prints the allowance rates as they really are: 0.25% and 0.20% (diesel), 0.75% (petrol), never 0.3% / 0.2% / 0.8%', () => {
    const d = variationData({
      products: [
        {
          key: 'HSD',
          tankNos: [4],
          variation: variationBlock({
            variationL: -520,
            band: { stockPct: 4, stockL: 310, leakPct: 0.25, leakL: 581, leakApplies: true, tiers: { firstPct: 0.25, restPct: 0.2, tier1L: 1_643, tier2L: 0, thresholdL: 1_643, days: 30 } },
          }),
        },
        {
          key: 'MS',
          tankNos: [1],
          variation: variationBlock({
            variationL: -520,
            band: { stockPct: 4, stockL: 310, leakPct: 0.75, leakL: 90, leakApplies: true, tiers: { firstPct: 0.75, restPct: 0.6, tier1L: 1_000, tier2L: 0, thresholdL: 1_000, days: 30 } },
          }),
        },
      ],
    });
    open(d);
    expect(screen.getByText(/0\.25% of sales for evaporation and handling \(581 L\)/)).toBeInTheDocument();
    expect(screen.getByText(/0\.25% on the first 1,643 L of sales, 0\.2% after that/)).toBeInTheDocument();
    expect(screen.getByText(/0\.75% of sales for evaporation and handling \(90 L\)/)).toBeInTheDocument();
    expect(screen.getByText(/0\.75% on the first 1,000 L of sales, 0\.6% after that/)).toBeInTheDocument();
  });

  it('says "was, now" for a revised fuel', () => {
    const d = variationData({
      revised: true,
      revision: { changed: [{ productKey: 'HSD', fromL: -310, toL: -120, wasWithin: false, isWithin: true }] },
    });
    open(d);
    expect(screen.getByText(`Diesel was ${M}310 L, now ${M}120 L.`)).toBeInTheDocument();
  });

  it('says a revised copy is corrected even when it has no figures to compare', () => {
    open(variationData({ revised: true }));
    expect(screen.getByText('This is a corrected copy.')).toBeInTheDocument();
  });

  it('draws no verdict before the inspection: a calm line, no bars', () => {
    open(variationData({ beforeInspection: true }));
    expect(screen.getAllByText(/before the first inspection/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.queryByTestId('what-to-do')).not.toBeInTheDocument();
  });

  it('leaves out a fuel with no variation figure', () => {
    open(variationData({ products: [{ key: 'HSD', tankNos: [4], variation: SHORT_BLOCK }, { key: 'MS', tankNos: [1] }] }));
    expect(document.querySelectorAll('article')).toHaveLength(1);
  });

  it('shows the sales sheet under the bars when the message carries both sheets', () => {
    const d = variationData({
      sheets: ['variation', 'sales'],
      products: [{ key: 'HSD', tankNos: [4], variation: SHORT_BLOCK, sales: salesBlock() }],
    });
    open(d);
    expect(screen.getByRole('heading', { name: 'Daily sales sheet' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /daily sales report/ })).toBeInTheDocument();
    expect(screen.getByText('On 23 Nov you sold 10,430 L of Diesel.')).toBeInTheDocument();
  });

  it('does not show the sales sheet for a variation-only message', () => {
    open();
    expect(screen.queryByRole('heading', { name: 'Daily sales sheet' })).not.toBeInTheDocument();
  });

  it('reads in Hindi with the Devanagari consequence', () => {
    const { container } = open(variationData(), 'hi');
    expect(container.textContent).toContain('डीज़ल कम है');
    expect(container.textContent).toContain('आपसे लिखित स्पष्टीकरण माँगा जा सकता है');
    expect(container.textContent).toContain('क्या करना है');
  });
});

describe('dsr_variation: the guideline consequence in three languages', () => {
  it('has the Hinglish sentences in the kind words, beside the shared Hindi and English', () => {
    expect(CONSEQUENCE_WORDS.low.hl).toMatch(/^Seema se zyada \(−\) variation par sample jaanch/);
    expect(CONSEQUENCE_WORDS.high.hl).toMatch(/^Seema se zyada \(\+\) variation par sample lab/);
    expect(CONSEQUENCE_WORDS.low.hi).toMatch(/[ऀ-ॿ]/);
    expect(CONSEQUENCE_WORDS.high.en).toMatch(/suspended immediately/);
    // Short and over are never the same sentence.
    expect(CONSEQUENCE_WORDS.low.en).not.toBe(CONSEQUENCE_WORDS.high.en);
  });

  it('writes where the pointer is, in words', () => {
    expect(positionWords(SHORT_BLOCK, 'en')).toBe('520 L short of zero. Allowed range: from 420 L short to 310 L over.');
    expect(positionWords(OVER_BLOCK, 'hl')).toContain('Zero se 380 L zyada');
    expect(positionWords(variationBlock({ variationL: 0 }), 'en')).toMatch(/^Exactly at zero/);
  });
});

describe('dsr_variation: glyph', () => {
  it('is a decorative 40:28 bar with a pointer', () => {
    const Glyph = view.Glyph;
    const { container } = render(<Glyph size={28} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg.querySelector('polygon')).toBeTruthy();
    expect(view.kind).toBe('dsr_variation');
  });
});
