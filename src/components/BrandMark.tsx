/**
 * The MDG Services mark — three people held in an open hand, inside an open ring.
 *
 * DRAWN, NOT DOWNLOADED. The header shows this at 32px on the first paint of
 * every screen, and the login screen shows it before the dealer has an account,
 * so a PNG would be a blocking request on a forecourt 2G link for something
 * worth under a kilobyte as paths. It is also the only version that stays crisp
 * on a 3x phone screen at 32px and on a 48px login tile from one source.
 *
 * IT PAINTS IN `currentColor`, which is what lets the same file sit white on the
 * dark brand tile and black on paper without a second asset. Nothing here names
 * a colour.
 *
 * THE STROKE IS DELIBERATELY HEAVIER THAN THE ARTWORK'S OWN. The source
 * (`mdg-app/assets/icon-src.svg`, which is also what the app icon and the
 * notification icon are cut from) is drawn for a 1024px app icon at stroke 30 —
 * which lands at less than one device pixel once it is scaled into a 32px
 * header tile, and a sub-pixel line renders as grey mush. `strokeWidth` below
 * is per-size, so the small mark is drawn thicker and reads as a logo rather
 * than as a smudge. The geometry is identical; only the pen changes.
 */
export interface BrandMarkProps {
  /** Rendered size in px, both axes. Defaults to the header's 32. */
  size?: number;
  className?: string;
}

/**
 * How thick to draw at a given size, in the artwork's own 1024 units.
 *
 * Measured, not guessed: each candidate was rasterised at its real size and
 * magnified pixel-for-pixel. 32px is where the whole mark survives — ring,
 * three people AND the hand under them. Below about 26px the hand closes up
 * into the bowl and the thing reads as a face, which is why the header shows it
 * at 32 with no tile around it rather than at 20 inside one: a dark tile costs
 * a third of the width to padding and merges with the ring's own stroke.
 */
function strokeFor(size: number): number {
  if (size <= 30) return 36;
  if (size <= 56) return 32;
  return 30;
}

export function BrandMark({ size = 32, className }: BrandMarkProps) {
  const stroke = strokeFor(size);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      className={className}
      // Decorative: every place this is used names the brand in text beside it,
      // and a screen reader announcing "logo" before the word "Dealer Kavach"
      // is one more thing to sit through on every screen.
      aria-hidden
      focusable="false"
    >
      <g fill="currentColor" stroke="none">
        <circle cx="372" cy="270" r="62" />
        <path d="M250 440 Q250 338 372 338 Q494 338 494 440 Z" />
        <circle cx="652" cy="270" r="62" />
        <path d="M530 440 Q530 338 652 338 Q774 338 774 440 Z" />
        <circle cx="512" cy="312" r="80" />
        <path d="M360 500 Q360 384 512 384 Q664 384 664 500 Z" />
      </g>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* The ring, open at the upper right. */}
        <path d="M654 122 A415 415 0 1 0 872 305" />
        {/* The cupped hand: finger lip, palm, wrist. */}
        <path d="M330 548 C296 552 284 602 316 638 C330 606 358 602 378 622 C474 702 598 702 700 628 C724 612 744 600 766 596" />
        <rect
          x="-78"
          y="-43"
          width="156"
          height="86"
          rx="26"
          transform="translate(836 666) rotate(40)"
        />
        <path d="M764 600 L800 636" />
      </g>
    </svg>
  );
}
