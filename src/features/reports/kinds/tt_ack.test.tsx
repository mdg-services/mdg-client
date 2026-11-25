import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { TtAckData } from '@dk/shared/types';

import { reportOf, ttAckData } from './_tankerMoney.fixtures';
import { rowShortLitres, summarise, view } from './tt_ack';

function open(data: TtAckData, lang: 'hi' | 'hl' | 'en' = 'en') {
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={reportOf('tt_ack')} lang={lang} />);
}

const shortRow = {
  invoiceNo: '7010045407',
  invoiceDate: '2026-11-23',
  short: 'short' as const,
  totalShortL: 120,
  claimShortL: 80,
  products: [
    { code: 'HSD', totalShortL: 120, claimShortL: 80 },
    { code: 'MS', totalShortL: 0, claimShortL: 0 },
  ],
};
const unknownRow = {
  invoiceNo: '7010045408',
  invoiceDate: '2026-11-23',
  short: 'unknown' as const,
  totalShortL: null,
  claimShortL: null,
  products: [{ code: 'HSD', totalShortL: 0, claimShortL: 0 }],
};

const clean = ttAckData();
const short = ttAckData({ rows: [shortRow], anyShort: true });
const unknown = ttAckData({ rows: [unknownRow], anyShort: true });

describe('tt_ack: a clean receipt', () => {
  it('says the receipt was entered, in one sentence', () => {
    open(clean);
    expect(screen.getByTestId('report-lead')).toHaveTextContent("We marked this tanker as received on IndianOil's portal for you.");
  });

  it('draws the slip with the tanker, the condition word and one line per invoice', () => {
    open(clean);
    const slip = screen.getByTestId('slip');
    expect(within(slip).getByText('BR09GC8009')).toBeInTheDocument();
    expect(within(slip).getByText('Excellent')).toBeInTheDocument();
    expect(within(slip).getByText('7010045406')).toBeInTheDocument();
    expect(within(slip).getByText('23 Nov')).toBeInTheDocument();
    expect(within(slip).getByText('No shortage')).toBeInTheDocument();
    expect(within(slip).getByText(/^Entered:/).parentElement).toHaveTextContent('Entered: 24 Nov, 7:05 pm');
  });

  it('stamps RECEIVED with a tick and says it in a full sentence', () => {
    open(clean);
    const stamp = screen.getByTestId('slip-stamp');
    expect(stamp).toHaveAttribute('data-stamp', 'received');
    expect(stamp).toHaveTextContent('RECEIVED');
    expect(stamp.getAttribute('aria-label')).toContain("marked as received on IndianOil's portal");
    expect(stamp.className).toContain('-rotate-6');
  });

  it('has no shortage box and no alert', () => {
    open(clean);
    expect(screen.queryByTestId('officer-box')).toBeNull();
    expect(view.alert(clean, 'en')).toBeNull();
  });
});

describe('tt_ack: short', () => {
  it('leads with the litres short and stamps SHORT with the gap', () => {
    open(short);
    expect(screen.getByTestId('report-lead')).toHaveTextContent('The portal shows 120 L short.');
    const stamp = screen.getByTestId('slip-stamp');
    expect(stamp).toHaveAttribute('data-stamp', 'short');
    expect(stamp).toHaveTextContent('SHORT 120 L');
    expect(stamp.getAttribute('aria-label')).toContain('120 L');
  });

  it('marks the row with a word, shows the fuel split, and boxes the officer line', () => {
    open(short);
    const row = screen.getByTestId('slip-row');
    expect(row).toHaveAttribute('data-short', 'short');
    expect(within(row).getByText('Short 120 L')).toBeInTheDocument();
    // Only the fuel with a gap gets a line; the nil one is not listed.
    expect(within(row).getByText('Diesel (HSD): total short 120 L, claim short 80 L')).toBeInTheDocument();
    expect(within(row).queryByText(/Petrol/)).toBeNull();
    expect(screen.getByTestId('officer-box')).toHaveTextContent('Speak to your IndianOil sales officer');
  });

  it('adds the litres up across invoices and falls back to the fuels when a row has no total', () => {
    const data = ttAckData({
      rows: [shortRow, { ...shortRow, invoiceNo: '7010045409', totalShortL: null, claimShortL: null, products: [{ code: 'MS', totalShortL: 40, claimShortL: 0 }] }],
      anyShort: true,
    });
    expect(rowShortLitres(data.rows[1]!)).toBe(40);
    expect(summarise(data).totalShortL).toBe(160);
    open(data);
    expect(screen.getByTestId('slip-stamp')).toHaveTextContent('SHORT 160 L');
  });

  it('reads a claim-only shortage ("total short 0 L, claim short 35 L") as 35 L, in the row, the stamp, the lead and the alert', () => {
    const claimOnly = { ...shortRow, totalShortL: 0, claimShortL: 35, products: [{ code: 'HSD', totalShortL: 0, claimShortL: 35 }] };
    const data = ttAckData({ rows: [claimOnly], anyShort: true });
    expect(rowShortLitres(claimOnly)).toBe(35);
    expect(summarise(data).totalShortL).toBe(35);
    expect(view.alert(data, 'en')?.headline).toBe('Tanker came short by 35 L');
    open(data);
    expect(screen.getByTestId('slip-stamp')).toHaveTextContent('SHORT 35 L');
    // Per-fuel claim only, with no row figures at all, reads the same.
    const perFuel = { ...shortRow, totalShortL: null, claimShortL: null, products: [{ code: 'MS', totalShortL: 0, claimShortL: 12 }] };
    expect(rowShortLitres(perFuel)).toBe(12);
    // A short row with every figure at zero has no litres to print, not a "0 L".
    expect(rowShortLitres({ ...shortRow, totalShortL: 0, claimShortL: 0, products: [] })).toBeNull();
  });

  it('still says short when no figure could be read', () => {
    const data = ttAckData({ rows: [{ ...shortRow, totalShortL: null, claimShortL: null, products: [] }], anyShort: true });
    open(data);
    expect(screen.getByTestId('report-lead')).toHaveTextContent('The portal shows this tanker came short.');
    expect(screen.getByTestId('slip-stamp')).toHaveTextContent(/^SHORT$/);
  });

  it('is a problem alert with the litres in the headline', () => {
    expect(view.alert(short, 'en')).toEqual({
      headline: 'Tanker came short by 120 L',
      line: 'Speak to your IndianOil sales officer.',
      severity: 'problem',
    });
    expect(view.alert(short, 'hi')?.headline).toBe('टैंकर का माल 120 L कम उतरा');
    expect(view.alert(short, 'hl')?.headline).toBe('Tanker ka maal 120 L kam utra');
  });
});

describe('tt_ack: the shortage could not be read', () => {
  it('says to check the portal and shows a clock, never a made-up figure', () => {
    open(unknown);
    expect(screen.getByTestId('report-lead')).toHaveTextContent("We could not read the portal's shortage figure, so please check the portal.");
    const row = screen.getByTestId('slip-row');
    expect(within(row).getByText('See the portal')).toBeInTheDocument();
    expect(within(row).getByText("We could not read the portal's shortage figure. Check the portal.")).toBeInTheDocument();
    expect(screen.getByTestId('slip-stamp')).toHaveAttribute('data-stamp', 'received');
    expect(screen.queryByTestId('officer-box')).toBeNull();
  });

  it('is an attention alert only while the tag says so', () => {
    expect(view.alert(unknown, 'en')?.severity).toBe('attention');
    expect(view.alert({ ...unknown, anyShort: false }, 'en')).toBeNull();
  });
});

describe('tt_ack: honesty stays on screen whatever happened', () => {
  it.each([
    ['clean', clean],
    ['short', short],
    ['unknown', unknown],
  ])('%s: the three plain notes are there', (_name, data) => {
    open(data);
    const notes = within(screen.getByTestId('honest-notes')).getAllByRole('listitem');
    expect(notes.map((n) => n.textContent)).toEqual([
      "MDG's team entered this for you.",
      'MDG did not inspect the vehicle and filed no claim.',
      'For any change, speak to your IndianOil sales officer.',
    ]);
  });

  it('writes them in Hindi and Hinglish too', () => {
    const { unmount } = open(clean, 'hi');
    expect(screen.getByText('MDG ने गाड़ी नहीं देखी और कोई क्लेम फ़ाइल नहीं किया।')).toBeInTheDocument();
    unmount();
    open(clean, 'hl');
    expect(screen.getByText('MDG ne gaadi nahi dekhi aur koi claim file nahi kiya.')).toBeInTheDocument();
  });
});

describe('tt_ack: the edges', () => {
  it('copes with no tanker number and up to six invoices', () => {
    const rows = Array.from({ length: 6 }, (_v, i) => ({ ...clean.rows[0]!, invoiceNo: `70100454${i}0` }));
    open(ttAckData({ vehicleNo: null, vehicleKey: null, rows }));
    expect(screen.getByText('Tanker number not recorded')).toBeInTheDocument();
    expect(screen.getAllByTestId('slip-row')).toHaveLength(6);
  });

  it('shows invoice numbers as selectable text', () => {
    open(clean);
    expect(screen.getByText('7010045406').className).toContain('select-all');
  });
});

describe('tt_ack: the rest of the contract', () => {
  it('is never a tile', () => {
    expect(view.tile(clean, 'en')).toBeNull();
    expect(view.tile(short, 'en')).toBeNull();
  });

  it('has a one-line headline for each outcome', () => {
    expect(view.headline(clean, 'en')).toBe('Tanker BR09GC8009: received, no shortage');
    expect(view.headline(short, 'en')).toBe('Tanker BR09GC8009: 120 L short');
    expect(view.headline(unknown, 'en')).toBe('Tanker BR09GC8009: check the portal for shortage');
    expect(view.headline(clean, 'hi')).toBe('टैंकर BR09GC8009: प्राप्त दर्ज, कमी नहीं');
  });

  it('shares a proof the officer can read, with the honest line', () => {
    const text = view.share(short, 'en');
    expect(text).toContain('Tanker receipt (acknowledged on the IndianOil portal)');
    expect(text).toContain('Tanker: BR09GC8009');
    expect(text).toContain('Entered: 24 Nov, 7:05 pm');
    expect(text).toContain('Condition entered: Excellent');
    expect(text).toContain('Invoice 7010045407 (23 Nov): Short 120 L');
    expect(text).toContain('Diesel (HSD): total short 120 L, claim short 80 L');
    expect(text).toContain("MDG did not inspect the vehicle and filed no claim.");
  });

  it('draws a slip glyph', () => {
    const G = view.Glyph;
    const { container } = render(<G />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(view.kind).toBe('tt_ack');
  });
});
