import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { KindTile } from '@/features/reports/types';
import { useLangStore } from '@/store/lang';
import { renderWithProviders } from '@/test/utils';
import type { TodayReport } from '@dk/shared/types';

import { PumpTile, TILE_LINES_MAX, tileIsWide, tileLines } from './PumpTile';
import { TILE_SLOTS, type TileItem } from './todayView';

const slot = (id: string) => TILE_SLOTS.find((s) => s.id === id)!;

function item(id: string, kind: TileItem['kind'], tile: KindTile): TileItem {
  return {
    slot: slot(id),
    kind,
    tile,
    day: '2026-11-26',
    report: { messageId: `m-${id}`, conversationId: 'c1', kind, sentAt: '2026-11-26T01:00:00.000Z' } as TodayReport,
  };
}

describe('tileLines', () => {
  it('cuts a sub at its dots so each fact has a line', () => {
    expect(tileLines({ value: '₹1,24,000', sub: 'by 27 Nov · 3 days left' })).toEqual(['by 27 Nov', '3 days left']);
  });

  it('prefers the kind\'s own lines, and an empty list means no lines', () => {
    expect(tileLines({ value: 'x', sub: 'a · b', lines: ['only this'] })).toEqual(['only this']);
    expect(tileLines({ value: 'x', sub: 'a · b', lines: [] })).toEqual([]);
  });

  it('shows no more than the cap, and never an empty line', () => {
    const many = { value: 'x', sub: 'a · b · · c · d · e' };
    expect(tileLines(many)).toHaveLength(TILE_LINES_MAX);
    expect(tileLines(many)).not.toContain('');
    expect(tileLines({ value: 'x' })).toEqual([]);
  });
});

describe('tileIsWide', () => {
  it('is wide for a wide slot, or for a ledger of two or more rows, and not for one row', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `F${i}`, value: '1 L' }));
    expect(tileIsWide({ slot: slot('sales'), tile: { value: 'x' } })).toBe(true);
    expect(tileIsWide({ slot: slot('stock'), tile: { value: 'x', rows: rows(2) } })).toBe(true);
    expect(tileIsWide({ slot: slot('stock'), tile: { value: 'x', rows: rows(1) } })).toBe(false);
    expect(tileIsWide({ slot: slot('stock'), tile: { value: 'x' } })).toBe(false);
  });
});

describe('PumpTile', () => {
  beforeEach(() => useLangStore.setState({ lang: 'en', explicit: true }));

  it('draws a ledger: one row per fuel with the figure beside the name, then the small facts', () => {
    const tile: KindTile = {
      value: 'Petrol 4,744 L · Diesel 14,920 L',
      sub: 'Old reading · Read 6:00 am',
      status: 'attention',
      rows: [
        { label: 'Petrol', value: '4,744 L' },
        { label: 'Diesel', value: '14,920 L', hint: 'low' },
      ],
      lines: ['Old reading · Read 6:00 am', '1 tank not reading'],
    };
    const { container } = renderWithProviders(<ul><PumpTile item={item('stock', 'stock_check', tile)} today="2026-11-26" onOpen={() => {}} /></ul>);
    const rows = container.querySelectorAll('[data-tile-row]');
    expect(rows).toHaveLength(2);
    expect(within(rows[1] as HTMLElement).getByText('Diesel')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('14,920 L')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('low')).toBeTruthy();
    const lines = container.querySelector('[data-tile-lines]')!;
    expect(lines.children).toHaveLength(2);
    // Two or more rows take the full width.
    expect(container.querySelector('li')!.className).toContain('col-span-full');
    // The big single value is gone: the figures are the rows.
    expect(container.querySelector('[data-tile-value]')).toBeNull();
    expect(screen.getByText('Needs a look')).toBeTruthy();
  });

  it('draws one row as a small name over its big figure, in a half-width tile', () => {
    const tile: KindTile = { value: 'Diesel +908 L', status: 'problem', rows: [{ label: 'Diesel', value: '+908 L', hint: 'Over' }] };
    const { container } = renderWithProviders(<ul><PumpTile item={item('variation', 'dsr_variation', tile)} today="2026-11-26" onOpen={() => {}} /></ul>);
    expect(screen.getByText('Diesel · Over')).toBeTruthy();
    expect(container.querySelector('[data-tile-value]')!.textContent).toBe('+908 L');
    expect(container.querySelector('li')!.className).not.toContain('col-span-full');
  });

  it('puts the facts of a plain tile on separate lines and keeps its spoken label whole', () => {
    const tile: KindTile = { value: '₹23,46,861.82', sub: 'by 30 Nov · 3 days left', status: 'attention' };
    const { container } = renderWithProviders(<ul><PumpTile item={item('dues', 'credit_dod', tile)} today="2026-11-26" onOpen={() => {}} /></ul>);
    expect(container.querySelector('[data-tile-lines]')!.children).toHaveLength(2);
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('by 30 Nov · 3 days left');
  });
});
