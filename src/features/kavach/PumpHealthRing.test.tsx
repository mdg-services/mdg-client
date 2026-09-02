import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/utils';

import { PumpHealthRing } from './PumpHealthRing';

/**
 * The ring is the last thing between MDG's Kavach figure and the dealer's eyes,
 * and it used to leak it.
 *
 * The settling-in state changed the colour and the caption and went on printing
 * the percentage in the middle, so a dealer whose programme had not been
 * switched on — or was still inside its grace period — read the number anyway,
 * in calm blue. `GET /kavach/me` now omits the figure entirely in that state
 * (`kavachScoreIsPublishable`), and these tests hold the other end of that: with
 * nothing to publish, the ring prints nothing.
 */
describe('PumpHealthRing', () => {
  it('prints the figure once MDG has stood behind it', () => {
    renderWithProviders(<PumpHealthRing pct={76} />);
    expect(screen.getByText('76%')).toBeInTheDocument();
  });

  it('prints NO percentage while settling, even when handed one', () => {
    // The `pct` here is the case that used to leak: a real, non-zero figure on a
    // programme the dealer may not be shown.
    renderWithProviders(<PumpHealthRing pct={76} settling />);
    expect(screen.queryByText('76%')).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('prints no percentage when the server omitted the figure', () => {
    renderWithProviders(<PumpHealthRing settling />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('does not invent a 0% out of a missing figure', () => {
    // Belt and braces: an absent percentage must not fall back to zero even if a
    // future caller forgets to pass `settling` alongside it. "0%" is a statement
    // about the outlet too.
    renderWithProviders(<PumpHealthRing />);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
