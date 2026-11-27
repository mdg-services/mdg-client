import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLangStore } from '@/store/lang';
import { resetStores } from '@/test/utils';
import type { PaperExpiryData } from '@dk/shared/types';

import { reportOf } from './_paperwork.fixtures';
import { docName, groupByVehicle, hiddenCount, leafStatus, liveData, view } from './paper_expiry';

const tanker: PaperExpiryData = {
  kind: 'paper_expiry',
  v: 1,
  scope: 'tanker',
  allLapsed: false,
  items: [
    { vehicleReg: 'BR01GA1234', docType: 'road-permit', docLabel: 'License Type - Road Permit', daysLeft: 3, validUntil: '2026-11-27' },
    { vehicleReg: 'BR01GA1234', docType: 'vehicle-insurance', docLabel: 'License Type - Vehicle Insurance', daysLeft: -2 },
    { vehicleReg: 'BR09GC8009', docType: 'fitness-license-by-rto', docLabel: 'License Type - Fitness License', daysLeft: 12 },
    { vehicleReg: 'BR09GC8009', docType: 'pollution-under-control', docLabel: 'License Type - Pollution Under Control', daysLeft: 40 },
  ],
  moreCount: 0,
  sentOn: '2026-11-24',
};

const outlet: PaperExpiryData = {
  kind: 'paper_expiry',
  v: 1,
  scope: 'outlet',
  allLapsed: false,
  items: [{ docType: 'fire-noc', docLabel: 'Fire NOC', daysLeft: 12, validUntil: '2026-12-06' }],
  moreCount: 0,
  askId: 'a1',
  sentOn: '2026-11-24',
};

function open(data: PaperExpiryData, lang: 'hi' | 'hl' | 'en' = 'en') {
  // The kit's own words follow the app's language.
  useLangStore.setState({ lang });
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={reportOf('paper_expiry')} lang={lang} />);
}

// The fixtures are a report sent on 24 Nov: the clock is held on that day (in India).
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-24T06:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

describe('paper_expiry', () => {
  it('opens with the most urgent paper as one sentence', () => {
    open(tanker);
    expect(screen.getByText('Road permit of BR01GA1234 ends in 3 days.')).toBeInTheDocument();
  });

  it('names the known papers in the reader’s language and the unknown ones as the portal wrote them', () => {
    expect(docName(tanker.items[2]!, 'en')).toBe('Fitness certificate');
    expect(docName(tanker.items[2]!, 'hi')).toBe('फ़िटनेस सर्टिफ़िकेट');
    expect(docName(outlet.items[0]!, 'en')).toBe('Fire NOC');
    expect(docName({ docType: 'x', docLabel: 'License Type - Mystery Paper' }, 'en')).toBe('Mystery Paper');
  });

  it('draws one block per vehicle, each with its leaves, most urgent vehicle first', () => {
    expect(groupByVehicle(tanker.items).map((g) => [g.vehicleReg, g.items.length])).toEqual([
      ['BR01GA1234', 2],
      ['BR09GC8009', 2],
    ]);
    const { container } = open(tanker);
    const blocks = Array.from(container.querySelectorAll('[data-vehicle]'));
    expect(blocks.map((b) => b.getAttribute('data-vehicle'))).toEqual(['BR01GA1234', 'BR09GC8009']);
    expect(within(blocks[0] as HTMLElement).getByRole('heading', { name: 'BR01GA1234' })).toBeInTheDocument();
    expect(within(blocks[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
  });

  it('puts the answer in a big day count on each leaf, and speaks it as a sentence', () => {
    open(tanker);
    expect(screen.getByText('Road permit, 3 days left')).toBeInTheDocument();
    expect(screen.getByText('Fitness certificate, 12 days left')).toBeInTheDocument();
    expect(screen.getByText('3')).toHaveClass('text-display');
    expect(screen.getByText('Until 27 Nov')).toBeInTheDocument();
  });

  it('draws a lapsed paper with a torn corner, an octagon and the words "Ran out"', () => {
    const { container } = open(tanker);
    const lapsed = container.querySelector('[data-lapsed="yes"]') as HTMLElement;
    expect(lapsed).not.toBeNull();
    expect(lapsed.getAttribute('data-status')).toBe('problem');
    expect(within(lapsed).getByText('Insurance, ran out 2 days ago')).toBeInTheDocument();
    expect(within(lapsed).getByText('Ran out')).toBeInTheDocument();
    expect(within(lapsed).getByText('days ago')).toBeInTheDocument();
    // the torn outline has a zig-zag, the whole leaf does not
    const torn = lapsed.querySelector('path')!.getAttribute('d')!;
    const whole = (container.querySelector('[data-lapsed="no"]') as HTMLElement).querySelector('path')!.getAttribute('d')!;
    expect(torn).toContain('L93,79');
    expect(whole).not.toContain('L93,79');
    // the octagon: eight points
    const octagon = lapsed.querySelector('polygon')!;
    expect(octagon.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(8);
  });

  it('gives each leaf a status by its days: out or last day, within 15 days, or just info', () => {
    expect(leafStatus(-5)).toBe('problem');
    expect(leafStatus(0)).toBe('problem');
    expect(leafStatus(1)).toBe('problem');
    expect(leafStatus(2)).toBe('attention');
    expect(leafStatus(15)).toBe('attention');
    expect(leafStatus(16)).toBe('info');
    const { container } = open(tanker);
    const statuses = Array.from(container.querySelectorAll('li[data-status]')).map((l) => l.getAttribute('data-status'));
    expect(statuses).toEqual(['attention', 'problem', 'attention', 'info']);
  });

  it('says what to do: nothing to upload for a tanker, send the paper for an outlet', () => {
    const { unmount } = open(tanker);
    expect(screen.getByText('Renew with the authority. We will see the new date in our daily read. Nothing to upload.')).toBeInTheDocument();
    unmount();
    open(outlet);
    expect(screen.getByText('Please send us the new paper. We will file it.')).toBeInTheDocument();
  });

  it('an outlet paper is one big leaf with no plate', () => {
    const { container } = open(outlet);
    expect(screen.getByText('Fire NOC ends in 12 days.')).toBeInTheDocument();
    expect(container.querySelector('[data-vehicle="outlet"]')).not.toBeNull();
    // No plate heading: the only heading is the card's own "Your papers".
    expect(screen.queryByRole('heading', { name: /BR/ })).toBeNull();
    expect(screen.getByRole('heading', { name: /Your papers/ })).toBeInTheDocument();
    expect(container.querySelector('[data-vehicle="outlet"] .text-display')).toHaveTextContent('12');
    expect(screen.getByText('Until 6 Dec')).toBeInTheDocument();
  });

  it('counts days from the day the report was sent, and says so', () => {
    open(tanker);
    expect(screen.getByText('Days counted from 24 Nov')).toBeInTheDocument();
  });

  it('draws at most eight vehicles and counts the rest in one line', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ vehicleReg: `BR0${i}XX000${i}`, docType: 'road-permit', docLabel: 'Road Permit', daysLeft: 3 + i }));
    const many: PaperExpiryData = { ...tanker, items, moreCount: 5 };
    const { container } = open(many);
    expect(container.querySelectorAll('[data-vehicle]')).toHaveLength(8);
    expect(hiddenCount(many)).toBe(7);
    expect(screen.getByText('and 7 more papers')).toBeInTheDocument();
  });

  it('a list where everything has run out says so', () => {
    open({ ...tanker, allLapsed: true, items: tanker.items.map(({ validUntil: _v, ...i }) => ({ ...i, daysLeft: -3 })) });
    expect(screen.getByText('Every paper on this list has run out.')).toBeInTheDocument();
    expect(screen.getByText('Road permit of BR01GA1234 ran out 3 days ago.')).toBeInTheDocument();
  });

  it('speaks Hindi and Hinglish', () => {
    const { unmount } = open(tanker, 'hi');
    expect(screen.getByText('BR01GA1234 का रोड परमिट 3 दिन में खत्म होगा।')).toBeInTheDocument();
    unmount();
    open(tanker, 'hl');
    expect(screen.getByText('BR01GA1234 ka Road permit 3 din mein khatam hoga.')).toBeInTheDocument();
  });

  it('is an alert only when something is within 15 days, and a one-day paper is a problem', () => {
    expect(view.alert(tanker, 'en')).toEqual({
      headline: 'BR01GA1234: Insurance ran out 2 days ago',
      line: 'Renew it with the authority. Nothing to upload.',
      severity: 'problem',
    });
    expect(view.alert({ ...tanker, items: [tanker.items[0]!] }, 'en')?.severity).toBe('attention');
    expect(view.alert({ ...tanker, items: [tanker.items[3]!] }, 'en')).toBeNull();
    expect(view.alert({ ...tanker, items: [] }, 'en')).toBeNull();
    expect(view.alert(outlet, 'en')).toEqual({ headline: 'Fire NOC ends in 12 days', line: 'Please send us the new paper. We will file it.', severity: 'attention' });
  });

  it('writes the history line and the share text, and has no tile', () => {
    expect(view.headline(tanker, 'en')).toBe('Road permit of BR01GA1234 ends in 3 days (+3 more)');
    expect(view.share({ ...tanker, moreCount: 2 }, 'en').split('\n')).toEqual([
      'Papers running out (as of 24 Nov)',
      'BR01GA1234 · Road permit: ends in 3 days (27 Nov)',
      'BR01GA1234 · Insurance: ran out 2 days ago',
      'BR09GC8009 · Fitness certificate: ends in 12 days',
      'BR09GC8009 · Pollution (PUC): ends in 40 days',
      'and 2 more',
    ]);
    expect(view.tile(tanker, 'en')).toBeNull();
  });

  it('draws a 40 x 28 calendar-leaf glyph', () => {
    const Glyph = view.Glyph;
    const { container } = render(<Glyph />);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 40 28');
  });
});

describe('paper_expiry: days counted again from the end date', () => {
  it('a paper that ended in 3 days on the day it was sent says 1 day two days later, in the lead, the alert, the headline and the share', () => {
    vi.setSystemTime(new Date('2026-11-26T06:00:00.000Z'));
    const one = { ...tanker, items: [tanker.items[0]!] };
    open(one);
    expect(screen.getByText('Road permit of BR01GA1234 ends in 1 day.')).toBeInTheDocument();
    expect(screen.queryByText('Road permit of BR01GA1234 ends in 3 days.')).toBeNull();
    expect(view.alert(one, 'en')?.headline).toContain('ends in 1 day');
    expect(view.headline(one, 'en')).toContain('ends in 1 day');
    expect(view.share(one, 'en')).toContain('Road permit: ends in 1 day (27 Nov)');
  });

  it('says it has run out once the date is behind us, and "ends today" on the day', () => {
    const one = { ...tanker, items: [tanker.items[0]!] };
    vi.setSystemTime(new Date('2026-11-27T06:00:00.000Z'));
    expect(view.alert(one, 'en')?.headline).toContain('ends today');
    vi.setSystemTime(new Date('2026-11-29T06:00:00.000Z'));
    expect(view.alert(one, 'en')?.headline).toContain('ran out 2 days ago');
  });

  it('counts from today in the footer when every paper has a date, and keeps the sent day when one has none', () => {
    vi.setSystemTime(new Date('2026-11-26T06:00:00.000Z'));
    const { unmount } = open(outlet);
    expect(screen.getByText('Days counted from 26 Nov')).toBeInTheDocument();
    unmount();
    open(tanker);
    expect(screen.getByText('Days counted from 24 Nov')).toBeInTheDocument();
  });

  it('keeps the sent count for a paper with no end date, and follows the new counts for "all lapsed"', () => {
    vi.setSystemTime(new Date('2026-12-30T06:00:00.000Z'));
    const noDates = { ...tanker, items: tanker.items.map(({ validUntil: _v, ...i }) => i) };
    expect(liveData(noDates)).toEqual(noDates);
    const gone = liveData(outlet);
    expect(gone.items[0]!.daysLeft).toBeLessThan(0);
    expect(gone.allLapsed).toBe(true);
  });
});

describe('paper_expiry: the paper that runs out first', () => {
  it('is one tile with the day count, the plate and the paper, and a shape and word for how bad it is', () => {
    open(tanker);
    const tile = screen.getByRole('group', { name: /Runs out first/ });
    expect(within(tile).getByText('Runs out first')).toBeInTheDocument();
    // The insurance of BR01GA1234 ran out two days ago: the answer, counted again from today.
    expect(within(tile).getByText('2')).toBeInTheDocument();
    expect(within(tile).getByText('days ago')).toBeInTheDocument();
    expect(within(tile).getByText('BR01GA1234 · Insurance')).toBeInTheDocument();
    expect(tile.querySelector('[data-status="problem"]')).not.toBeNull();
  });

  it('counts again from the end date, so a stale snapshot never says "3 days" two days late', () => {
    vi.setSystemTime(new Date('2026-11-26T06:00:00.000Z'));
    open({ ...tanker, items: [tanker.items[0]!] });
    const tile = screen.getByRole('group', { name: /Runs out first/ });
    expect(within(tile).getByText('1')).toBeInTheDocument();
    expect(within(tile).getByText('day left')).toBeInTheDocument();
  });

  it('says "Last day" for a paper that ends today, with no number', () => {
    vi.setSystemTime(new Date('2026-11-27T06:00:00.000Z'));
    open({ ...tanker, items: [tanker.items[0]!] });
    const tile = screen.getByRole('group', { name: /Runs out first/ });
    expect(within(tile).getByText('Last day')).toBeInTheDocument();
  });

  it('puts the leaves under one card that counts the papers, and has no tile for an empty list', () => {
    open(tanker);
    expect(screen.getByRole('region', { name: /Your papers/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Your papers/ })).toHaveTextContent('4');
    expect(view.kind).toBe('paper_expiry');
  });

  it('reads in Hindi', () => {
    const { container } = open(tanker, 'hi');
    expect(container.textContent).toContain('सबसे पहले खत्म होने वाला');
    expect(container.textContent).toContain('आपके कागज़');
  });

  it('draws no tile and no card for an empty list', () => {
    open({ ...tanker, items: [] });
    expect(screen.queryByRole('group', { name: /Runs out first/ })).toBeNull();
    expect(screen.queryByRole('region', { name: /Your papers/ })).toBeNull();
  });
});
