import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TankerDensityData } from '@dk/shared/types';

import { densityData, reportOf } from './_tankerMoney.fixtures';
import { copyAllText, readableLines, view } from './tanker_density';

function open(data: TankerDensityData, lang: 'hi' | 'hl' | 'en' = 'en') {
  const Overlay = view.Overlay;
  return render(<Overlay data={data} report={reportOf('tanker_density')} lang={lang} />);
}

const two = densityData({
  lines: [
    { family: 'DIESEL', productKey: 'HSD', density15Raw: '820.500', quantity: 6, unit: 'KL', tankNo: 'T018' },
    { family: 'PETROL', productKey: 'MS', density15Raw: '745.200', quantity: 4.5, unit: 'KL', tankNo: 'T021' },
  ],
});

describe('tanker_density: the plate and the digits', () => {
  it('draws the tanker number on a yellow plate exactly as printed', () => {
    open(densityData());
    const plate = screen.getByTestId('number-plate');
    expect(plate).toHaveTextContent('BR09GC8009');
    expect(plate).toHaveStyle({ backgroundColor: 'rgb(250, 204, 21)' });
    expect(plate).toHaveAttribute('role', 'group');
    expect(plate.getAttribute('aria-label')).toContain('B R 0 9 G C 8 0 0 9');
  });

  it('keeps every character of the density as printed and adds no unit', () => {
    open(densityData({ lines: [{ family: 'DIESEL', productKey: 'HSD', density15Raw: '820.500', quantity: null, unit: null, tankNo: null }] }));
    const digits = screen.getByTestId('density-digits');
    expect(digits.textContent).toBe('820.500');
    // The invoice states no unit: none may be invented next to the number.
    expect(document.body.textContent).not.toMatch(/kg\/m|kg\/L|g\/cc/i);
  });

  it('reads the digits one by one to a screen reader', () => {
    open(densityData());
    expect(screen.getByText('8 2 0 point 5 0 0')).toHaveClass('sr-only');
    open(densityData(), 'hi');
    expect(screen.getByText('8 2 0 दशमलव 5 0 0')).toBeInTheDocument();
  });

  it('shows the fuel with letters, quantity and tank in small pills', () => {
    open(densityData());
    const block = screen.getByTestId('density-block');
    expect(within(block).getByText('HSD')).toBeInTheDocument();
    expect(within(block).getByText('Diesel')).toBeInTheDocument();
    expect(within(block).getByText('Quantity 6 KL')).toBeInTheDocument();
    expect(within(block).getByText('Tank T018')).toBeInTheDocument();
  });

  it('has no verdict anywhere: no status badge, no judging words', () => {
    const { container } = open(densityData());
    expect(container.querySelector('[data-status]')).toBeNull();
    expect(screen.getByText('From the IndianOil invoice. We check nothing here.')).toBeInTheDocument();
  });

  it('draws a dashed plate when the invoice has no tanker number', () => {
    open(densityData({ vehicleNo: null, vehicleKey: null }));
    expect(screen.queryByTestId('number-plate')).toBeNull();
    expect(screen.getByTestId('number-plate-empty')).toHaveTextContent('Tanker number is not on the invoice');
    expect(screen.getByText('A tanker has come. Write the density below in your register.')).toBeInTheDocument();
  });

  it('leaves out a line with no readable density, and says so when none reads', () => {
    const d = densityData({ lines: [{ family: 'UNKNOWN', productKey: 'XX', density15Raw: '  ', quantity: null, unit: null, tankNo: null }] });
    expect(readableLines(d)).toHaveLength(0);
    open(d);
    expect(screen.queryByTestId('density-block')).toBeNull();
    expect(screen.getByText(/could not read a density/)).toBeInTheDocument();
  });

  it('says how many lines stayed on the invoice', () => {
    open(densityData({ droppedLines: 3 }));
    expect(screen.getByText('3 more lines on the invoice')).toBeInTheDocument();
  });

  it('writes the lead in each language, with more air for Devanagari', () => {
    const { unmount } = open(densityData(), 'hi');
    const lead = screen.getByTestId('report-lead');
    expect(lead).toHaveTextContent('टैंकर BR09GC8009 आया है। नीचे की डेंसिटी अपने रजिस्टर में लिख लें।');
    expect(lead.className).toContain('leading-[1.7]');
    unmount();
    open(densityData(), 'hl');
    expect(screen.getByTestId('report-lead')).toHaveTextContent('Tanker BR09GC8009 aaya hai. Neeche ki density apne register mein likh lein.');
  });
});

describe('tanker_density: copy', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  it('copies the digits exactly, shows Copied with a tick, then goes back', async () => {
    open(densityData());
    const button = screen.getByRole('button', { name: /Copy Diesel/ });
    expect(button).toHaveAttribute('data-copy-state', 'idle');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(writeText).toHaveBeenCalledWith('820.500');
    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copied/ })).toHaveAttribute('data-copy-state', 'copied');
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('is a 48 px target', () => {
    open(densityData());
    expect(screen.getByRole('button', { name: /Copy Diesel/ }).className).toContain('min-h-[48px]');
  });

  it('offers Copy all only when there are several fuels, diesel first', async () => {
    const { unmount } = open(densityData());
    expect(screen.queryByText('Copy all')).toBeNull();
    unmount();
    open(two);
    expect(screen.getAllByTestId('density-block')).toHaveLength(2);
    expect(screen.getAllByTestId('density-digits').map((n) => n.textContent)).toEqual(['820.500', '745.200']);
    await act(async () => {
      fireEvent.click(screen.getByText('Copy all'));
    });
    expect(writeText).toHaveBeenCalledWith('Diesel 820.500\nPetrol 745.200');
    expect(copyAllText(two, 'en')).toBe('Diesel 820.500\nPetrol 745.200');
  });

  it('tells the dealer to press and hold when the phone refuses the copy', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true });
    const exec = vi.fn().mockReturnValue(false);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    open(densityData());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copy Diesel/ }));
    });
    expect(screen.getByText('Press and hold to copy')).toBeInTheDocument();
  });
});

describe('tanker_density: the rest of the contract', () => {
  it('is not a tile and never an alert', () => {
    expect(view.tile(densityData(), 'en')).toBeNull();
    expect(view.alert(densityData(), 'en')).toBeNull();
  });

  it('gives a one-line headline with the number and the density', () => {
    expect(view.headline(densityData(), 'en')).toBe('Tanker BR09GC8009: Density 820.500');
    expect(view.headline(two, 'en')).toBe('Tanker BR09GC8009: Density 820.500 (+1)');
    expect(view.headline(densityData({ vehicleNo: null, vehicleKey: null }), 'hl')).toBe('Density 820.500');
    expect(view.headline(densityData(), 'hi')).toBe('टैंकर BR09GC8009: डेंसिटी 820.500');
  });

  it('shares plain text with the digits as printed', () => {
    expect(view.share(densityData(), 'en')).toBe(
      [
        'Tanker density',
        'Tanker number: BR09GC8009',
        'IndianOil invoice 7010045406, 23 Nov, 4:10 pm',
        'Diesel (HSD): 820.500 (6 KL, Tank T018)',
        'From the IndianOil invoice.',
      ].join('\n'),
    );
    expect(view.share(two, 'hi')).toContain('पेट्रोल (MS): 745.200 (4.5 KL, टंकी T021)');
    expect(view.share(two, 'hi')).toContain('शाम 4:10');
  });

  it('draws a plate glyph at the requested height', () => {
    const G = view.Glyph;
    const { container } = render(<G size={28} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('height', '28');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg.innerHTML).toContain('#facc15');
  });

  it('names its kind', () => {
    expect(view.kind).toBe('tanker_density');
  });
});
