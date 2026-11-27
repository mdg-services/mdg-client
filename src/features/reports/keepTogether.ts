/** A piece of a headline this short is one thing ("Petrol 1,612 L"): it is not split across two lines. */
const PIECE_MAX = 24;

/**
 * For a line that lists figures ("Sold: Diesel 7,370 L, Petrol 1,612 L, XP95 petrol 586 L"): keeps each
 * short piece between the commas whole, so the line breaks after a comma and never inside "1,612 L".
 * Pieces are joined to their spaces with a no-break space; the commas keep an ordinary one. A line
 * with no list is left as it is. Display only: the words are unchanged, and a long piece (a sentence)
 * wraps as it always did.
 */
export function keepPiecesTogether(text: string): string {
  if (!text.includes(', ')) return text;
  return text
    .split(', ')
    .map((piece) => (piece.length <= PIECE_MAX ? piece.replace(/ /g, '\u00A0') : piece))
    .join(', ');
}
