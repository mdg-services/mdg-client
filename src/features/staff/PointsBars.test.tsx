import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useLangStore } from '@/store/lang';
import { renderWithProviders, resetStores } from '@/test/utils';

import { PointsBars } from './PointsBars';

afterEach(() => resetStores());

const DATA = Array.from({ length: 14 }, (_, i) => ({
  label: `Day ${i + 1}`,
  tick: String(i + 1),
  value: i === 13 ? 28.5 : 0,
}));

describe('PointsBars', () => {
  it('names the chart by its spoken summary and keeps one row per day for a screen reader', () => {
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(<PointsBars data={DATA} summary="Last 14 days, 28.5 points." />);
    expect(screen.getByRole('img', { name: 'Last 14 days, 28.5 points.' })).toBeInTheDocument();
    expect(screen.getAllByRole('row', { hidden: true })).toHaveLength(15);
  });

  it('hides the table through a wrapper, never with the class on the table itself', () => {
    // A `table.sr-only` keeps its table layout: its long caption and cells poke past the right edge
    // and made the whole warrior page scroll sideways (390 px screen, 420 px page).
    useLangStore.setState({ lang: 'en', explicit: true });
    const { container } = renderWithProviders(<PointsBars data={DATA} summary="Last 14 days." />);
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table!.className).not.toContain('sr-only');
    expect(table!.parentElement!.className).toContain('sr-only');
  });

  it('prints today as the word, never split, with its number above the bar', () => {
    useLangStore.setState({ lang: 'en', explicit: true });
    renderWithProviders(<PointsBars data={DATA} summary="x" />);
    expect(screen.getByTestId('today-points')).toHaveTextContent('28.5');
    expect(screen.getByText(/^today$/i).className).toContain('whitespace-nowrap');
  });
});
