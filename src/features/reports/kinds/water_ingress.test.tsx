import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEVANAGARI, renderOverlay, water, waterSlots } from './_supplyTestKit';
import { view, slotRange } from './water_ingress';

afterEach(cleanup);

describe('water checks: the day strip', () => {
  it('draws one block per window with its own state, in the portal order', () => {
    renderOverlay(view, water());
    const blocks = screen.getAllByTestId('water-slot');
    expect(blocks).toHaveLength(12);
    expect(blocks.filter((b) => b.dataset.state === 'recorded')).toHaveLength(10);
    expect(blocks.filter((b) => b.dataset.state === 'missed')).toHaveLength(2);
    expect(blocks[3]!.dataset.state).toBe('missed');
  });

  it('reads the number of windows from the snapshot and never assumes twelve', () => {
    renderOverlay(
      view,
      water({
        totalSlots: 6,
        recordedSlots: 6,
        missedSlots: 0,
        slots: waterSlots(['recorded', 'recorded', 'recorded', 'recorded', 'recorded', 'recorded']),
      }),
    );
    expect(screen.getAllByTestId('water-slot')).toHaveLength(6);
    expect(screen.getByTestId('report-lead')).toHaveTextContent('All 6 water checks are done.');
  });

  it('gives each block its own shape and a word, so it never rests on colour alone', () => {
    const { container } = renderOverlay(view, water({ openSlots: 1, slots: waterSlots(['recorded', 'missed', 'open']) }));
    const marks = Array.from(container.querySelectorAll('[data-mark]')).map((m) => m.getAttribute('data-mark'));
    expect(marks).toEqual(['recorded', 'missed', 'open']);
    // three different drawings, not one drawing in three colours
    const drawings = new Set(Array.from(container.querySelectorAll('[data-mark]')).map((m) => m.innerHTML));
    expect(drawings.size).toBe(3);
    const blocks = screen.getAllByTestId('water-slot');
    expect(blocks[0]).toHaveAttribute('aria-label', '12–2 am: Done');
    expect(blocks[1]).toHaveAttribute('aria-label', '2–4 am: Missed');
    expect(blocks[2]).toHaveAttribute('aria-label', '4–6 am: Open');
    // the missed one carries a hatch and a dashed border
    expect(blocks[1]!.className).toContain('border-dashed');
    expect(blocks[1]!.querySelector('svg path[stroke-width="2"]')).not.toBeNull();
  });

  it('says what happened in plain words, never as a charge against the dealer', () => {
    renderOverlay(view, water());
    expect(screen.getByTestId('report-lead')).toHaveTextContent('Water was checked in 10 of 12 windows.');
    const note = screen.getByTestId('water-missed-note');
    expect(note).toHaveTextContent('2 windows closed before they were recorded');
    expect(note).toHaveTextContent('You do not need to do anything');
    expect(document.body.textContent).not.toMatch(/you missed|your fault|failed to/i);
    expect(within(document.body).queryAllByRole('button')).toHaveLength(1); // only the "More" row
  });

  it('says "so far" for a day that is still running and does not call open windows missed', () => {
    renderOverlay(
      view,
      water({
        dayState: 'running',
        recordedSlots: 6,
        missedSlots: 0,
        openSlots: 6,
        slots: waterSlots([
          'recorded', 'recorded', 'recorded', 'recorded', 'recorded', 'recorded',
          'open', 'open', 'open', 'open', 'open', 'open',
        ]),
      }),
    );
    expect(screen.getByTestId('report-lead')).toHaveTextContent('So far 6 of 12. The day is not over.');
    expect(screen.getByTestId('water-not-final')).toBeInTheDocument();
    expect(screen.queryByTestId('water-missed-note')).toBeNull();
  });

  it('keeps the last good list and says the last check could not finish, without a raw reason', () => {
    renderOverlay(view, water({ lastCheckFailed: true }));
    const note = screen.getByTestId('water-check-failed');
    expect(note).toHaveTextContent('The last check could not finish. This list is from the last good check (24 Nov, 11:58 am).');
  });

  it('prints the last check time and the pump hours, and notes staff-recorded windows', () => {
    const slots = waterSlots(['recorded', 'recorded', 'missed']);
    slots[1]!.byService = false;
    renderOverlay(
      view,
      water({ totalSlots: 3, recordedSlots: 2, missedSlots: 1, slots, operating: { from: '06:00', to: '22:00', allDay: false } }),
    );
    expect(document.body.textContent).toContain('Last checked 24 Nov, 11:58 am');
    expect(document.body.textContent).toContain('Pump hours 6:00 am to 10:00 pm');
    expect(document.body.textContent).toContain('1 window was recorded by your own staff, the rest by our service.');
  });

  it('keeps the portal names of the windows behind a closed More row', () => {
    renderOverlay(view, water());
    const more = screen.getByTestId('water-more');
    const toggle = within(more).getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.className).toContain('min-h-[48px]');
    expect(within(more).getByText('0-2', { exact: true }).closest('[hidden]')).not.toBeNull();
  });

  it('speaks Hindi and Hinglish: Devanagari for hi, Latin letters only for hl', () => {
    const { unmount } = renderOverlay(view, water(), 'hi');
    expect(screen.getByTestId('report-lead').textContent).toMatch(DEVANAGARI);
    expect(screen.getByTestId('report-lead')).toHaveTextContent('पानी की जाँच 12 में से 10 बार हुई।');
    expect(screen.getByTestId('report-lead').className).toContain('leading-[1.7]');
    unmount();
    renderOverlay(view, water(), 'hl');
    expect(screen.getByTestId('report-lead')).toHaveTextContent('Paani ki jaanch 12 mein se 10 baar hui.');
    expect(screen.getByTestId('report-lead').textContent).not.toMatch(DEVANAGARI);
  });

  it('draws the blocks in a grid that drops to fewer columns as text grows', () => {
    renderOverlay(view, water());
    const grid = screen.getByRole('list', { name: 'Check windows' });
    expect(grid.className).toContain('minmax(4.5rem,1fr)');
  });
});

describe('water checks: a window written in hours', () => {
  it('shortens to fit a 72 px block', () => {
    expect(slotRange(0, 120, 'en')).toBe('12–2 am');
    expect(slotRange(120, 240, 'hl')).toBe('2–4 am');
    expect(slotRange(600, 720, 'en')).toBe('10 am–12 pm');
    expect(slotRange(1320, 1440, 'en')).toBe('10 pm–12 am');
    expect(slotRange(0, 120, 'hi')).toBe('रात 12–2');
    expect(slotRange(360, 420, 'hi')).toBe('सुबह 6–7');
    expect(slotRange(390, 450, 'en')).toBe('6:30–7:30 am');
  });
});

describe('water checks: tile, alert, headline, share', () => {
  it('gives a tile that counts done windows and says how the day stands', () => {
    expect(view.tile(water(), 'en')).toEqual({ value: '10 / 12', sub: 'done, 2 missed', status: 'attention' });
    expect(view.tile(water({ missedSlots: 0, recordedSlots: 12 }), 'en')).toEqual({ value: '12 / 12', sub: 'done', status: 'ok' });
    expect(view.tile(water({ dayState: 'running', recordedSlots: 6, missedSlots: 0, openSlots: 6 }), 'en')).toEqual({
      value: '6 / 12',
      sub: 'so far',
      status: 'waiting',
    });
    expect(view.tile(water({ totalSlots: 0, slots: [] }), 'en')).toBeNull();
  });

  it('raises a calm alert only for a finished day with misses', () => {
    expect(view.alert(water(), 'hl')).toEqual({
      headline: '2 jaanch chhoot gayi',
      line: 'Ab record nahi ho sakti. Aapko kuch nahi karna.',
      severity: 'attention',
    });
    expect(view.alert(water({ missedSlots: 0 }), 'en')).toBeNull();
    expect(view.alert(water({ dayState: 'running' }), 'en')).toBeNull();
  });

  it('has a one-line headline and a plain-text share', () => {
    expect(view.headline(water(), 'en')).toBe('Water checks 23 Nov: 10 / 12, 2 missed');
    const text = view.share(water(), 'en');
    expect(text.split('\n')[0]).toBe('Water checks · 23 Nov');
    expect(text).toContain('Water was checked in 10 of 12 windows.');
    expect(text).toContain('Last checked 24 Nov, 11:58 am');
    expect(view.share(water(), 'hi')).toMatch(DEVANAGARI);
  });

  it('has a glyph that is decorative', () => {
    const G = view.Glyph;
    const { container } = renderOverlay({ ...view, Overlay: () => <G size={20} /> }, water());
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toHaveAttribute('height', '20');
  });
});
