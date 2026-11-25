import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CalibrationClaimData } from '@dk/shared/types';

import { reportOf } from './_paperwork.fixtures';
import { nozzleLine, view } from './calibration_claim';

const claim: CalibrationClaimData = {
  kind: 'calibration_claim',
  v: 1,
  financialYear: '2026-27',
  nozzleCount: 12,
  nozzlesIncluded: 12,
  totalAmount: 12600,
  amountPerNozzle: 1050,
  reference: '99120',
  filedAt: '2026-11-24T08:00:00.000Z',
  units: [
    { serial: 'DU-101', make: 'Gilbarco', nozzles: 4, included: true },
    { serial: 'DU-102', make: 'Tokheim', nozzles: 4, included: true },
    { serial: 'DU-103', make: null, nozzles: 4, included: true },
  ],
};

function open(data: CalibrationClaimData, lang: 'hi' | 'hl' | 'en' = 'en') {
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={reportOf('calibration_claim')} lang={lang} />);
}

describe('calibration_claim', () => {
  it('says what was filed and for which year', () => {
    open(claim);
    expect(screen.getByText('We filed your calibration subsidy claim for 2026-27.')).toBeInTheDocument();
  });

  it('draws the cheque stub with the big amount, spoken as rupees', () => {
    const { container } = open(claim);
    const stub = container.querySelector('[data-cheque-stub]')!;
    expect(stub).not.toBeNull();
    expect(within(stub as HTMLElement).getByText('₹12,600')).toHaveAttribute('aria-hidden', 'true');
    expect(within(stub as HTMLElement).getByText('12,600 rupees')).toHaveClass('sr-only');
    expect(within(stub as HTMLElement).getByText('for 12 nozzles (₹1,050 each)')).toBeInTheDocument();
    // the perforation: a dashed line
    expect(stub.querySelector('line[stroke-dasharray]')).not.toBeNull();
  });

  it('groups the nozzles by dispenser with the count in words', () => {
    const { container } = open(claim);
    const list = screen.getByRole('list');
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(within(cards[0]!).getByText('DU-101 · Gilbarco')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('4 nozzles')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('In this claim')).toBeInTheDocument();
    expect(within(cards[2]!).getByText('DU-103')).toBeInTheDocument();
    // four small nozzle icons per dispenser, all decorative
    expect(cards[0]!.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll('[data-included="yes"]')).toHaveLength(3);
  });

  it('draws a dispenser left out as an outline with "Not in this claim"', () => {
    const partial: CalibrationClaimData = {
      ...claim,
      nozzlesIncluded: 8,
      totalAmount: 8400,
      units: [claim.units[0]!, claim.units[1]!, { serial: 'DU-103', make: null, nozzles: 4, included: false }],
    };
    const { container } = open(partial);
    expect(nozzleLine(partial, 'en')).toBe('for 8 of 12 nozzles (₹1,050 each)');
    expect(screen.getByText('for 8 of 12 nozzles (₹1,050 each)')).toBeInTheDocument();
    const left = container.querySelector('[data-included="no"]') as HTMLElement;
    expect(left).toHaveClass('border-dashed');
    expect(within(left).getByText('Not in this claim')).toBeInTheDocument();
    expect(within(left).queryByText('In this claim')).toBeNull();
  });

  it('shows the portal reference where it can be selected, or says there is none', () => {
    const { unmount } = open(claim);
    expect(screen.getByText('99120')).toHaveClass('select-all');
    unmount();
    open({ ...claim, reference: null });
    expect(screen.getByText('No reference shown by the portal.')).toBeInTheDocument();
  });

  it('draws at most twelve dispensers', () => {
    const many: CalibrationClaimData = {
      ...claim,
      units: Array.from({ length: 15 }, (_, i) => ({ serial: `DU-${i}`, make: null, nozzles: 1, included: true })),
    };
    open(many);
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(12);
  });

  it('speaks Hindi and Hinglish, with rupees in the reader’s way', () => {
    const { unmount } = open(claim, 'hi');
    expect(screen.getByText('हमने आपका कैलिब्रेशन सब्सिडी का दावा 2026-27 के लिए जमा कर दिया है।')).toBeInTheDocument();
    expect(screen.getByText('₹12,600')).toBeInTheDocument();
    expect(screen.getByText('12,600 रुपये')).toBeInTheDocument();
    unmount();
    open(claim, 'hl');
    expect(screen.getByText('12 nozzle ke liye (har nozzle ₹1,050)')).toBeInTheDocument();
  });

  it('closes with who did the work', () => {
    open(claim);
    expect(screen.getByText("Filed by MDG's team on IndianOil's portal for you.")).toBeInTheDocument();
  });

  it('writes the history line and the share text, and has no tile or alert', () => {
    expect(view.headline(claim, 'en')).toBe('Subsidy claim filed ₹12,600, 12 nozzles');
    expect(view.share(claim, 'en').split('\n')).toEqual([
      'Calibration subsidy claim 2026-27: ₹12,600',
      'for 12 nozzles (₹1,050 each)',
      'Filed 24 Nov',
      'IndianOil reference 99120',
    ]);
    expect(view.tile(claim, 'en')).toBeNull();
    expect(view.alert(claim, 'en')).toBeNull();
  });

  it('draws a 40 x 28 cheque-stub glyph', () => {
    const Glyph = view.Glyph;
    const { container } = render(<Glyph />);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 40 28');
  });
});
