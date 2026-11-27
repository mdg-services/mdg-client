import { describe, expect, it } from 'vitest';

import { keepPiecesTogether } from './keepTogether';

const NB = '\u00A0';

describe('keepPiecesTogether', () => {
  it('ties each short piece of a list together and leaves the comma break free', () => {
    expect(keepPiecesTogether('Petrol 4,744 L, XP95 petrol 2,413 L, Diesel 14,920 L')).toBe(
      `Petrol${NB}4,744${NB}L, XP95${NB}petrol${NB}2,413${NB}L, Diesel${NB}14,920${NB}L`,
    );
  });

  it('keeps a bracketed word with its figure', () => {
    expect(keepPiecesTogether('Diesel +908 L (Over), Petrol −300 L (Short)')).toBe(
      `Diesel${NB}+908${NB}L${NB}(Over), Petrol${NB}−300${NB}L${NB}(Short)`,
    );
  });

  it('does not glue a long piece, so a sentence still wraps', () => {
    const long = 'Order now because the diesel will run out before the next tanker comes in';
    expect(keepPiecesTogether(`${long}, 2 tankers`)).toBe(`${long}, 2${NB}tankers`);
  });

  it('leaves a line with no list as it is', () => {
    expect(keepPiecesTogether('Diesel 310 L short')).toBe('Diesel 310 L short');
    expect(keepPiecesTogether('Rs 1,24,000 by 27 Nov')).toBe('Rs 1,24,000 by 27 Nov');
  });
});
