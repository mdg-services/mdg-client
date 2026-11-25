import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeReport, stockData } from './dsr_sales/fixtures';
import { fillOf, hasNoReading, readingIsOld, view } from './stock_check';

function open(data = stockData(), lang: 'hi' | 'hl' | 'en' = 'en') {
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={fakeReport('stock_check')} lang={lang} />);
}

describe('stock_check: pure helpers', () => {
  const tank = stockData().fuels[0]!.tanks;
  it('fills a tank only when its size and a reading are both known', () => {
    expect(fillOf(tank[0]!)).toBeCloseTo(0.62, 5);
    expect(fillOf(tank[2]!)).toBeNull(); // no reading
    expect(fillOf(stockData().fuels[1]!.tanks[0]!)).toBeNull(); // size not known: never a fake 100%
    expect(fillOf({ ...tank[0]!, litres: 99_999 })).toBe(1);
  });

  it('treats a missing litre figure or a failed gauge as no reading, never as 0', () => {
    expect(hasNoReading(tank[2]!)).toBe(true);
    expect(hasNoReading({ ...tank[0]!, gaugeOk: false })).toBe(true);
    expect(hasNoReading(tank[0]!)).toBe(false);
  });
});

describe('stock_check: tile', () => {
  // The reading in the fixture is from 24 Nov 04:44 UTC; the clock is held 30 minutes after it.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T05:14:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('lists each fuel and, for a fresh reading, how long the stock lasts from the newest plan', () => {
    const tile = view.tile(stockData(), 'en')!;
    expect(tile.value).toBe('Diesel 16,200 L · Petrol 8,130 L');
    expect(tile.sub).toContain('Diesel lasts 4 days');
    expect(tile.sub).not.toContain('plan of');
    expect(tile.sub).toContain('1 tank not reading');
    expect(tile.status).toBe('ok');
  });

  it('shows one big number for one fuel', () => {
    const d = stockData();
    d.fuels = [d.fuels[1]!];
    d.cover = null;
    const tile = view.tile(d, 'en')!;
    expect(tile.value).toBe('8,130 L');
    expect(tile.sub).toBe('Read 10:14 am');
  });

  it('falls back to the reading time when there is no plan, and never invents days', () => {
    const tile = view.tile(stockData({ cover: null }), 'en')!;
    expect(tile.sub).toContain('Read 10:14 am');
    expect(tile.sub).not.toContain('lasts');
  });

  it('flags an old reading with a triangle status and the old time, ignoring the plan', () => {
    const tile = view.tile(stockData({ stale: true }), 'en')!;
    expect(tile.status).toBe('attention');
    expect(tile.sub).toContain('Old reading · Read 10:14 am');
    expect(tile.sub).not.toContain('lasts');
  });

  it('always carries the reading time, also beside "lasts N days"', () => {
    const tile = view.tile(stockData(), 'en')!;
    expect(tile.sub).toContain('Diesel lasts 4 days · Read 10:14 am');
  });

  it("names the plan's day once it is not today's plan", () => {
    // A fresh reading at 12:30 am on 25 Nov (IST), read against the plan of 24 Nov.
    vi.setSystemTime(new Date('2026-11-24T19:30:00.000Z'));
    const tile = view.tile(stockData({ readingAt: '2026-11-24T19:00:00.000Z' }), 'en')!;
    expect(tile.sub).toContain('Diesel lasts 4 days (plan of 24 Nov) · Read 12:30 am');
  });

  it('turns a tile that has sat for days into an old reading with a warning, though the card was fresh when sent', () => {
    // Fresh when it was sent (stale: false), opened five days later.
    vi.setSystemTime(new Date('2026-11-29T05:14:00.000Z'));
    const d = stockData();
    expect(d.stale).toBe(false);
    const tile = view.tile(d, 'en')!;
    expect(tile.status).toBe('attention');
    expect(tile.sub).toContain('Old reading · Read 24 Nov, 10:14 am');
    expect(tile.sub).not.toContain('lasts');
    expect(tile.value).toBe('Diesel 16,200 L · Petrol 8,130 L');
  });

  it('calls a reading old only after six hours, or when the card said so', () => {
    const d = stockData();
    expect(readingIsOld(d, Date.parse('2026-11-24T10:00:00.000Z'))).toBe(false);
    expect(readingIsOld(d, Date.parse('2026-11-24T10:45:00.000Z'))).toBe(true);
    expect(readingIsOld({ ...d, stale: true }, Date.parse('2026-11-24T05:00:00.000Z'))).toBe(true);
    expect(readingIsOld({ ...d, readingAt: null }, Date.parse('2026-12-24T05:00:00.000Z'))).toBe(false);
  });

  it('says "less than a day" rather than 0 days', () => {
    const d = stockData();
    d.cover = { planDay: '2026-11-24', fuels: [{ fuelKey: 'HSD', daysLeft: 0.4, runOutOn: '2026-11-24' }] };
    expect(view.tile(d, 'en')!.sub).toContain('lasts less than a day');
  });

  it('reads in Hindi and Hinglish', () => {
    expect(view.tile(stockData(), 'hi')!.sub).toContain('डीज़ल 4 दिन चलेगा · रीडिंग');
    expect(view.tile(stockData(), 'hl')!.sub).toContain('Diesel 4 din chalega · Reading');
    vi.setSystemTime(new Date('2026-11-24T19:30:00.000Z'));
    const late = stockData({ readingAt: '2026-11-24T19:00:00.000Z' });
    expect(view.tile(late, 'hi')!.sub).toContain('डीज़ल 4 दिन चलेगा (24 नवंबर का प्लान)');
    expect(view.tile(late, 'hl')!.sub).toContain('Diesel 4 din chalega (24 Nov ka plan)');
  });

  it('has no tile when there are no fuels', () => {
    expect(view.tile(stockData({ fuels: [] }), 'en')).toBeNull();
  });
});

describe('stock_check: alert, headline, share', () => {
  it('alerts only when the reading is old, using the reading time and not the message time', () => {
    expect(view.alert(stockData(), 'en')).toBeNull();
    const a = view.alert(stockData({ stale: true }), 'en')!;
    expect(a.headline).toBe('Stock reading is old');
    expect(a.line).toBe('This reading is from 24 Nov, 10:14 am. Ask again for a fresh one.');
    expect(a.severity).toBe('attention');
  });

  it('gives a one-line history headline', () => {
    expect(view.headline(stockData(), 'en')).toBe('Diesel 16,200 L, Petrol 8,130 L');
    expect(view.headline(stockData({ fuels: [] }), 'en')).toBe('Tank stock');
  });

  it('shares each tank, the dead gauge, and the plan cover as plain text', () => {
    const lines = view.share(stockData(), 'en').split('\n');
    expect(lines[0]).toBe('Tank stock · 12E · reading 24 Nov, 10:14 am');
    expect(lines[1]).toBe('Diesel (HSD): Total of 2 of 3 tanks: 16,200 L');
    expect(lines).toContain('  Tank 4: 6,200 L');
    expect(lines).toContain('  Tank 8: No reading');
    expect(lines).toContain('Diesel lasts about 4 days (from the plan of 24 Nov). Runs out about 28 Nov.');
  });
});

describe('stock_check: overlay', () => {
  it('opens with each fuel and its total, then the reading time', () => {
    open();
    expect(screen.getByText('Diesel 16,200 L. Petrol 8,130 L.')).toBeInTheDocument();
    expect(screen.getByText('Reading: 24 Nov, 10:14 am')).toBeInTheDocument();
  });

  it('draws one cylinder per tank with the litres printed large and a plain label', () => {
    open();
    const cylinders = screen.getAllByRole('img');
    expect(cylinders).toHaveLength(4);
    expect(cylinders[0]!.getAttribute('aria-label')).toBe('Tank 4, Diesel, 6,200 litres, 62 percent, water 0.4 litres');
    expect(screen.getByText('6,200 L')).toBeInTheDocument();
    expect(screen.getByText('10,000 L')).toBeInTheDocument();
    expect(screen.getByText('Tank 4')).toBeInTheDocument();
  });

  it('draws the water layer and warns with a word when there is water', () => {
    const { container } = open();
    expect(screen.getByText('Water 0.4 L')).toBeInTheDocument();
    // The tank with water has a dark water rectangle; the dry one has none.
    const tank4 = container.querySelector('li[data-tank="4"]')!;
    const tank6 = container.querySelector('li[data-tank="6"]')!;
    expect(tank4.innerHTML).toContain('#27272a');
    expect(tank6.innerHTML).not.toContain('#27272a');
    expect(within(tank6 as HTMLElement).getByText('Water 0 L')).toBeInTheDocument();
  });

  it('draws a silent gauge as a dashed outline with a question mark, not as an empty tank', () => {
    const { container } = open();
    const dead = container.querySelector('li[data-tank="8"]') as HTMLElement;
    expect(dead.getAttribute('data-state')).toBe('no-reading');
    expect(within(dead).getByText('No reading')).toBeInTheDocument();
    expect(within(dead).getByText("This tank's gauge is not sending a reading")).toBeInTheDocument();
    expect(dead.querySelector('text')!.textContent).toBe('?');
    expect(dead.innerHTML).toContain('stroke-dasharray="7 6"');
    expect(dead.getAttribute('data-state')).not.toBe('ok');
    // The fuel's total says how many tanks it counts.
    expect(screen.getByText('Total of 2 of 3 tanks: 16,200 L')).toBeInTheDocument();
  });

  it('hatches a tank whose size is not known and draws no level', () => {
    const { container } = open();
    const noSize = container.querySelector('li[data-tank="1"]') as HTMLElement;
    expect(noSize.getAttribute('data-state')).toBe('no-size');
    expect(within(noSize).getByText('Size not known')).toBeInTheDocument();
    expect(noSize.innerHTML).toContain('url(#');
    expect(noSize.innerHTML).toContain('<pattern');
    // The litres are still printed.
    expect(within(noSize).getByText('8,130 L')).toBeInTheDocument();
  });

  it('draws the low line only where the tank has one', () => {
    const { container } = open();
    expect(container.querySelector('li[data-tank="4"] line[stroke-dasharray="5 4"]')).toBeTruthy();
    expect(container.querySelector('li[data-tank="1"] line[stroke-dasharray="5 4"]')).toBeNull();
  });

  it('flags a tank at or under its low line with a triangle badge and a word', () => {
    const d = stockData();
    d.fuels[0]!.tanks[0] = { ...d.fuels[0]!.tanks[0]!, litres: 1_200 };
    const { container } = open(d);
    const tank = container.querySelector('li[data-tank="4"]') as HTMLElement;
    const badge = tank.querySelector('span[data-status="attention"]') as HTMLElement;
    expect(badge.textContent).toBe('Low');
    // The same word sits on the low line inside the drawing.
    expect(tank.querySelector('svg text')!.textContent).toBe('Low');
  });

  it('shows a tank that was read at a different time with its own time', () => {
    open();
    expect(screen.getByText('Reading 9:44 am')).toBeInTheDocument(); // tank 6 at 04:14 UTC = 9:44 am
  });

  it('shows the stale band, from the reading and not from the message', () => {
    open(stockData({ stale: true }));
    expect(screen.getByTestId('stale-band').textContent).toContain('This reading is old. Stock now may be different.');
    expect(screen.getByTestId('stale-band').getAttribute('data-status')).toBe('attention');
  });

  it('shows no stale band for a fresh reading', () => {
    open();
    expect(screen.queryByTestId('stale-band')).not.toBeInTheDocument();
  });

  it('writes the days of cover from the plan with that plan’s date', () => {
    open();
    const cover = screen.getByTestId('cover');
    expect(cover.textContent).toContain('Diesel lasts about 4 days (from the plan of 24 Nov). Runs out about 28 Nov.');
    expect(cover.textContent).toContain('Petrol lasts about 9 days');
  });

  it('draws no cover when there is no plan', () => {
    open(stockData({ cover: null }));
    expect(screen.queryByTestId('cover')).not.toBeInTheDocument();
  });

  it('says a fuel with no reading at all in the lead and the tank', () => {
    const d = stockData();
    d.fuels = [
      { fuelKey: 'HSD', prodCode: '103', totalL: 0, tanksRead: 0, tanksNoReading: 1, tanks: [{ tankNo: 4, litres: null, waterL: null, at: d.readingAt!, gaugeOk: false }] },
    ];
    open(d);
    expect(screen.getByText('Diesel: No reading.')).toBeInTheDocument();
  });

  it('copes with an unknown reading time', () => {
    open(stockData({ readingAt: null }));
    expect(screen.getByText('Reading: Reading time not known')).toBeInTheDocument();
  });

  it('explains what stock means under "More"', () => {
    open();
    expect(screen.getByText(/Stock means fuel without water/)).toBeInTheDocument();
  });

  it('speaks Hindi and Hinglish', () => {
    const { container } = open(stockData(), 'hi');
    expect(container.textContent).toContain('रीडिंग');
    expect(container.textContent).toContain('डीज़ल 16,200 L');
    expect(container.textContent).toContain('टंकी 4');
    expect(container.textContent).toContain('इस टंकी का गेज रीडिंग नहीं भेज रहा');
    const hl = open(stockData(), 'hl');
    expect(hl.container.textContent).toContain('Tanki 4');
  });
});

describe('stock_check: glyph', () => {
  it('is a decorative 40:28 cylinder and every instance has its own clip id', () => {
    const Glyph = view.Glyph;
    const a = render(<Glyph />);
    const b = render(<Glyph />);
    const idA = a.container.querySelector('clipPath')!.id;
    const idB = b.container.querySelector('clipPath')!.id;
    expect(idA).not.toBe(idB);
    expect(a.container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(view.kind).toBe('stock_check');
  });
});
