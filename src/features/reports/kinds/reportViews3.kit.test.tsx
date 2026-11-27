import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore, type Lang } from '@/store/lang';

import { renderOverlay, supply, water } from './_supplyTestKit';
import { densityData, fuelOrderData, reportOf, ttAckData } from './_tankerMoney.fixtures';
import { fakeReport, loadPlanData, stockData } from './dsr_sales/fixtures';
import { view as fuelOrderView } from './fuel_order';
import { arrivalLine, lowLineDays, view as loadPlanView } from './load_plan';
import { supplyPendingLine, supplyWord, verdictOf, view as supplyView } from './ro_supply';
import { view as stockView } from './stock_check';
import { view as densityView } from './tanker_density';
import { claimLitres, summarise, view as ttAckView } from './tt_ack';
import { progressText, view as waterView } from './water_ingress';

/**
 * The second half of the report kind views on the kit (spec 4.2, group P3b-3): every overlay opens with
 * a SectionCard that answers one question, says its number in words, and keeps the hard rules of the
 * redesign (3.1) in all three languages. The sentences themselves are `rv3.` in `reportViews3.ts`.
 */

vi.mock('@/features/help/GuideVideoSheet', () => ({ GuideVideoSheet: () => null }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T06:30:00.000Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useLangStore.setState({ lang: 'en' });
});

const LANGS: Lang[] = ['hi', 'hl', 'en'];
const DEVANAGARI = /[ऀ-ॿ]/;

describe('water checks: the number in words', () => {
  it('says done, missed and still to come in one line, in each language', () => {
    expect(progressText(water(), 'en')).toBe('10 of 12 checks done, 2 missed');
    expect(progressText(water(), 'hl')).toBe('12 mein se 10 jaanch hui, 2 chhoot gayi');
    expect(progressText(water(), 'hi')).toBe('12 में से 10 जाँच हुईं, 2 छूट गईं');
    expect(progressText(water({ missedSlots: 1 }), 'en')).toBe('10 of 12 checks done, 1 missed');
  });

  it('says "so far" and what is still to come while the day runs, and nothing missed when none is', () => {
    const running = water({ dayState: 'running', recordedSlots: 6, missedSlots: 0, openSlots: 6 });
    expect(progressText(running, 'en')).toBe('6 of 12 checks done so far, 6 still to come');
    expect(progressText(running, 'hl')).toBe('Ab tak 12 mein se 6 jaanch hui, 6 abhi baaki');
  });

  it('draws it as a labelled progress bar under the day and a status word', () => {
    renderOverlay(waterView, water(), 'en');
    const summary = screen.getByTestId('water-summary');
    const bar = within(summary).getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('10');
    expect(bar.getAttribute('aria-valuemax')).toBe('12');
    expect(bar.getAttribute('aria-valuetext')).toContain('10 of 12 checks done');
    expect(screen.getByRole('region', { name: 'For 23 Nov' })).toBeInTheDocument();
    // the status is a shape AND a word
    expect(within(summary).getByText('Needs a look')).toBeInTheDocument();
  });
});

describe('supply status: the big word and the pending count', () => {
  it('says Open for a clear supply and for one with work pending, Stopped when blocked', () => {
    const clear = supply({ blocked: false, failingCount: 0 });
    const pending = supply({ blocked: false, failingCount: 2 });
    const stopped = supply({ blocked: true, failingCount: 2 });
    expect(supplyWord(verdictOf(clear), 'en')).toBe('Open');
    expect(supplyWord(verdictOf(pending), 'en')).toBe('Open');
    expect(supplyWord(verdictOf(stopped), 'en')).toBe('Stopped');
    expect(supplyWord(verdictOf(stopped), 'hi')).toBe('रुकी है');
    expect(supplyWord(verdictOf(clear), 'hi')).toBe('चालू');
    expect(supplyWord('unclear', 'hl')).toBe('Saaf nahi');
  });

  it('counts the conditions that are pending, one or many, and warns only when the supply is still open', () => {
    const stopped = supply({ blocked: true, failingCount: 2 });
    const pending = supply({ blocked: false, failingCount: 2 });
    expect(supplyPendingLine(stopped, 'stopped', 'en')).toBe('2 conditions pending');
    expect(supplyPendingLine(supply({ blocked: true, failingCount: 1 }), 'stopped', 'en')).toBe('1 condition pending');
    expect(supplyPendingLine(supply({ blocked: true, failingCount: 0 }), 'stopped', 'en')).toBe('');
    expect(supplyPendingLine(pending, 'pending', 'en')).toBe('2 conditions pending. Any one can stop your supply.');
    expect(supplyPendingLine(pending, 'pending', 'hi')).toBe('2 शर्तें बाकी हैं। इनमें से कोई एक भी सप्लाई रोक सकती है।');
    expect(supplyPendingLine(supply({ blocked: false, failingCount: 0 }), 'clear', 'en')).toBe('No condition is pending');
    expect(supplyPendingLine(supply({ blocked: null as never, failingCount: 0 }), 'unclear', 'en')).toBe('');
  });

  it('opens with a card whose word is the shape of the verdict and the word itself', () => {
    renderOverlay(supplyView, supply({ blocked: true, failingCount: 2 }), 'en');
    const word = screen.getByTestId('supply-word');
    expect(word).toHaveTextContent('Stopped');
    const summary = screen.getByTestId('supply-summary');
    expect(within(summary).getByText('2 conditions pending')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Fuel supply' })).toBeInTheDocument();
    // the condition rows say their state in a word, not only in the lamp
    const states = screen.getAllByTestId('supply-row-state').map((n) => n.textContent);
    expect(states.length).toBe(4);
    expect(states.every((s) => (s ?? '').length > 0)).toBe(true);
  });
});

describe('next tanker: the arrival line and the low line', () => {
  it('finds the day on the same scale as days left at which a pool reaches its low line', () => {
    const [p] = loadPlanData().pools;
    // 3,000 L low line of 6,000 L in stock that lasts 2.4 days: half the stock, half the days
    expect(lowLineDays(p!)).toBeCloseTo(1.2, 5);
    expect(lowLineDays({ ...p!, daysLeft: null })).toBeNull();
    expect(lowLineDays({ ...p!, stockL: 0 })).toBeNull();
    expect(lowLineDays({ ...p!, lowLineL: 0 })).toBeNull();
  });

  it('says when the tanker arrives, with the time when there is one, in each language', () => {
    const data = loadPlanData();
    expect(arrivalLine(data, 'en')).toBe('Arrives 25 Nov, 4:00 pm');
    expect(arrivalLine(data, 'hl')).toBe('25 Nov ko 4:00 pm par aayega');
    expect(arrivalLine(data, 'hi')).toBe('25 नवंबर को शाम 4:00 पर आएगा');
    const noTime = loadPlanData({ order: { ...loadPlanData().order!, arriveTime: null } });
    expect(arrivalLine(noTime, 'en')).toBe('Arrives 25 Nov');
    expect(arrivalLine(loadPlanData({ order: null }), 'en')).toBe('');
  });

  it('opens with the verdict, its status word and the arrival, then a bar per pool with the low line named', () => {
    const Overlay = loadPlanView.Overlay;
    render(<Overlay data={loadPlanData()} report={fakeReport('load_plan')} lang="en" />);
    expect(screen.getByRole('region', { name: 'Next tanker' })).toBeInTheDocument();
    expect(screen.getByTestId('arrival-line')).toHaveTextContent('Arrives 25 Nov, 4:00 pm');
    const bars = screen.getAllByRole('progressbar');
    // two pools have days left; the one with none says so in words instead of drawing a bar
    expect(bars).toHaveLength(2);
    expect(bars.some((b) => (b.getAttribute('aria-valuetext') ?? '').includes('Low line 3,000 L'))).toBe(true);
  });

  it('does not promise an arrival from an old plan', () => {
    vi.setSystemTime(new Date('2026-11-30T06:30:00.000Z'));
    const Overlay = loadPlanView.Overlay;
    render(<Overlay data={loadPlanData()} report={fakeReport('load_plan')} lang="en" />);
    expect(screen.queryByTestId('arrival-line')).toBeNull();
  });
});

describe('tank stock: the old reading and the legend', () => {
  it('marks an old reading with a word and a shape, and names the dashed line once', () => {
    vi.setSystemTime(new Date('2026-11-24T20:30:00.000Z'));
    const Overlay = stockView.Overlay;
    render(<Overlay data={stockData()} report={fakeReport('stock_check')} lang="en" />);
    expect(screen.getByText('Old reading')).toBeInTheDocument();
    expect(screen.getAllByTestId('low-legend')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Tank stock' })).toBeInTheDocument();
  });

  it('lists how long each fuel lasts as rows of a card, and no legend when no tank has a low line', () => {
    const Overlay = stockView.Overlay;
    const base = stockData();
    const noLine = stockData({
      fuels: base.fuels.map((f) => ({ ...f, tanks: f.tanks.map((t) => ({ ...t, lowLineL: undefined })) })),
    });
    render(<Overlay data={noLine} report={fakeReport('stock_check')} lang="en" />);
    expect(screen.queryByTestId('low-legend')).toBeNull();
    const cover = screen.getByTestId('cover');
    expect(cover.textContent).toContain('Diesel');
    expect(screen.getByRole('region', { name: 'How long it lasts' })).toBeInTheDocument();
  });
});

describe('tanker receipt: the outcome and the litres', () => {
  const short = ttAckData({
    anyShort: true,
    rows: [
      {
        invoiceNo: '7010045407',
        invoiceDate: '2026-11-23',
        short: 'short',
        totalShortL: 120,
        claimShortL: 80,
        products: [{ code: 'HSD', totalShortL: 120, claimShortL: 80 }],
      },
      {
        invoiceNo: '7010045408',
        invoiceDate: '2026-11-23',
        short: 'short',
        totalShortL: 30,
        claimShortL: null,
        products: [{ code: 'MS', totalShortL: 30, claimShortL: 10 }],
      },
    ],
  });

  it('sums the claim figure over the short invoices, from the row or its products, and null when none printed one', () => {
    expect(claimLitres(summarise(short))).toBe(90);
    const none = ttAckData({
      anyShort: true,
      rows: [{ invoiceNo: '1', invoiceDate: '2026-11-23', short: 'short', totalShortL: 5, claimShortL: null, products: [] }],
    });
    expect(claimLitres(summarise(none))).toBeNull();
    expect(claimLitres(summarise(ttAckData()))).toBeNull();
  });

  it('opens with the word "Came short", how many invoices, and two tiles with the litres', () => {
    const Overlay = ttAckView.Overlay;
    render(<Overlay data={short} report={reportOf('tt_ack')} lang="en" />);
    const summary = screen.getByTestId('ack-summary');
    expect(within(summary).getByText('Came short')).toBeInTheDocument();
    expect(within(summary).getByText('2 invoices came short')).toBeInTheDocument();
    expect(within(summary).getByRole('group', { name: 'Litres short: 150 L' })).toBeInTheDocument();
    expect(within(summary).getByRole('group', { name: 'Claim figure: 90 L' })).toBeInTheDocument();
  });

  it('says "No shortage" with no litre tiles for a clean receipt', () => {
    const Overlay = ttAckView.Overlay;
    render(<Overlay data={ttAckData()} report={reportOf('tt_ack')} lang="en" />);
    const summary = screen.getByTestId('ack-summary');
    expect(within(summary).getByText('No shortage')).toBeInTheDocument();
    expect(within(summary).queryByRole('group')).toBeNull();
  });
});

describe('fuel order and density: cards that answer one question', () => {
  it('puts the rail, the plate and the fuel in one "Your order" card and the dates in another', () => {
    const Overlay = fuelOrderView.Overlay;
    render(<Overlay data={fuelOrderData()} report={reportOf('fuel_order')} lang="en" />);
    const card = screen.getByRole('region', { name: 'Your order' });
    expect(within(card).getByTestId('fuel-rail')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Order details' })).toBeInTheDocument();
  });

  it('puts the orders of a portal check in a card with their count', () => {
    const Overlay = fuelOrderView.Overlay;
    const data = fuelOrderData({
      event: 'check_result',
      stage: 'waiting',
      orders: [
        { orderNo: '4500012345', stage: 'waiting', ttNo: null, deliveryDay: '2026-11-25' },
        { orderNo: '4500012346', stage: 'tanker_assigned', ttNo: 'BR01GA1234', deliveryDay: '2026-11-26' },
      ],
    });
    render(<Overlay data={data} report={reportOf('fuel_order')} lang="en" />);
    const card = screen.getByRole('region', { name: /Your orders on the portal/ });
    expect(within(card).getByTestId('orders-list')).toBeInTheDocument();
    expect(card.textContent).toContain('2');
    expect(screen.queryByRole('region', { name: 'Your order' })).toBeNull();
  });

  it('gives a check with no orders no empty card', () => {
    const Overlay = fuelOrderView.Overlay;
    render(<Overlay data={fuelOrderData({ event: 'check_result', stage: 'waiting', orders: [] })} report={reportOf('fuel_order')} lang="en" />);
    expect(screen.queryByTestId('orders-list')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('names the register card and counts the fuels only when there are several', () => {
    const Overlay = densityView.Overlay;
    const one = render(<Overlay data={densityData()} report={reportOf('tanker_density')} lang="en" />);
    expect(screen.getByRole('region', { name: 'Write this in your register' })).toBeInTheDocument();
    expect(screen.queryByTestId('density-count')).toBeNull();
    one.unmount();
    const two = densityData({
      lines: [
        { family: 'DIESEL', productKey: 'HSD', density15Raw: '820.500', quantity: 6, unit: 'KL', tankNo: 'T018' },
        { family: 'PETROL', productKey: 'MS', density15Raw: '745.200', quantity: 4.5, unit: 'KL', tankNo: 'T021' },
      ],
    });
    render(<Overlay data={two} report={reportOf('tanker_density')} lang="hi" />);
    expect(screen.getByTestId('density-count')).toHaveTextContent('इस बिल पर 2 ईंधन');
    expect(screen.getAllByRole('button', { name: /डेंसिटी.*कॉपी करें/ }).length).toBeGreaterThan(0);
  });

  it('names each copy button after its fuel and its digits, in the reader\'s language', () => {
    const Overlay = densityView.Overlay;
    render(<Overlay data={densityData()} report={reportOf('tanker_density')} lang="en" />);
    expect(screen.getByRole('button', { name: /Copy Diesel density/ })).toBeInTheDocument();
  });
});

/** One fixture per kind, drawn as much as it will draw. */
const KINDS: Array<{ name: string; draw: (lang: Lang) => ReturnType<typeof render> }> = [
  { name: 'water_ingress', draw: (lang) => renderOverlay(waterView, water(), lang) },
  { name: 'ro_supply', draw: (lang) => renderOverlay(supplyView, supply({ blocked: true }), lang) },
  {
    name: 'load_plan',
    draw: (lang) => {
      const Overlay = loadPlanView.Overlay;
      return render(<Overlay data={loadPlanData()} report={fakeReport('load_plan')} lang={lang} />);
    },
  },
  {
    name: 'stock_check',
    draw: (lang) => {
      const Overlay = stockView.Overlay;
      return render(<Overlay data={stockData()} report={fakeReport('stock_check')} lang={lang} />);
    },
  },
  {
    name: 'tt_ack',
    draw: (lang) => {
      const Overlay = ttAckView.Overlay;
      return render(<Overlay data={ttAckData({ anyShort: true, rows: [{ invoiceNo: '1', invoiceDate: '2026-11-23', short: 'short', totalShortL: 5, claimShortL: 5, products: [] }] })} report={reportOf('tt_ack')} lang={lang} />);
    },
  },
  {
    name: 'fuel_order',
    draw: (lang) => {
      const Overlay = fuelOrderView.Overlay;
      return render(<Overlay data={fuelOrderData()} report={reportOf('fuel_order')} lang={lang} />);
    },
  },
  {
    name: 'tanker_density',
    draw: (lang) => {
      const Overlay = densityView.Overlay;
      return render(<Overlay data={densityData()} report={reportOf('tanker_density')} lang={lang} />);
    },
  },
];

describe('the seven views keep the hard rules of the redesign, in every language', () => {
  for (const k of KINDS) {
    for (const lang of LANGS) {
      it(`${k.name} (${lang}): cards with names, taps of 44 px or more, no cut-off names, no fixed pixels, no sentence key leaking`, () => {
        // the kit's own status words follow the app's language, which is the overlay's `lang` in the app
        useLangStore.setState({ lang });
        const { container } = k.draw(lang);
        // at least one card, each named
        const regions = screen.getAllByRole('region');
        expect(regions.length).toBeGreaterThan(0);
        for (const r of regions) expect(r.getAttribute('aria-labelledby') || r.getAttribute('aria-label')).toBeTruthy();
        // every button is at least 44 px tall by its class
        for (const b of Array.from(container.querySelectorAll('button'))) {
          expect(b.className, `${k.name} button`).toMatch(/min-h-(11|12|14|16|tap)\b|aspect-video|h-full/);
        }
        const html = container.innerHTML;
        expect(html).not.toMatch(/\btruncate\b|line-clamp|text-\[\d|whitespace-nowrap|\bdark:/);
        expect(html).not.toMatch(/(?:min-|max-)?(?:h|w)-\[\d+px/);
        expect(container.textContent ?? '').not.toMatch(/rv3\.|undefined|NaN|\[object/);
        // a drawing is decorative or named
        for (const svg of Array.from(container.querySelectorAll('svg'))) {
          const hidden = svg.getAttribute('aria-hidden') === 'true' || svg.closest('[aria-hidden="true"]');
          expect(hidden || svg.getAttribute('aria-label'), `${k.name} svg`).toBeTruthy();
        }
      });
    }

    it(`${k.name}: Hinglish has no Devanagari in the words of the kit`, () => {
      useLangStore.setState({ lang: 'hl' });
      const { container } = k.draw('hl');
      // Names a dealer's own data may carry stay as they are; the kit's words are Latin in Hinglish.
      expect(container.textContent ?? '').not.toMatch(DEVANAGARI);
    });
  }
});
