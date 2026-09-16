/**
 * The MDG Services mark — three people held in an open hand, inside an open ring.
 *
 * THIS IS THE REAL ARTWORK, not a redraw. Every curve below is traced from the
 * supplied logo (`mdg-app/assets/logo-source.png`, the same file the app icon,
 * the splash and the favicon are cut from), so the mark in the header is the
 * mark on the pamphlet. The redraw that stood here before approximated the hand
 * with a single wavy line, which at 32px read as a mouth under two eyes — a
 * smiley, not a logo.
 *
 * DRAWN, NOT DOWNLOADED. The header shows this on the first paint of every
 * screen, and the login screen shows it before the dealer has an account, so a
 * PNG would be a blocking request on a forecourt 2G link. The trace costs what
 * the redraw did not: this chunk went from 0.6 kB to 2.5 kB gzipped, about a
 * tenth of a second on 2G, paid once and then cached. It is also the only
 * version that stays crisp on a 3x phone screen at 32px and on a 48px login
 * tile from one source.
 *
 * IT PAINTS IN `currentColor`, which is what lets the same file sit white on a
 * dark surface and black on paper without a second asset. Nothing here names a
 * colour.
 *
 * ONE FILLED PATH, EVEN-ODD. The trace is an outline of the ink, so the ring,
 * the sleeve and the gaps between the fingers are holes in a single path rather
 * than strokes. That is why weight is added with `stroke` below instead of by
 * changing a `stroke-width`: there is no line to thicken, only ink to grow.
 */
export interface BrandMarkProps {
  /** Rendered size in px, both axes. Defaults to the header's 32. */
  size?: number;
  className?: string;
}

/**
 * How much to fatten the ink at a given size, in the artwork's own 1024 units.
 *
 * The artwork is drawn for a 1024px app icon with a line about 30 units wide,
 * which lands at less than one device pixel once it is scaled into a 32px
 * header tile — and a sub-pixel line renders as grey mush. Painting the fill
 * path with a hairline stroke of the same colour grows every edge outward by
 * half the stroke, so the ring reads as a ring again.
 *
 * Measured, not guessed: each candidate was rasterised at its real size and
 * magnified pixel-for-pixel. At 32px the ring needs +4 to stop being grey, and
 * +6 is already where the gaps between the fingers start closing up. At 48px
 * +2 is enough, and past about 64px the artwork carries itself.
 */
function inkGrowthFor(size: number): number {
  if (size <= 36) return 4;
  if (size <= 64) return 2;
  return 0;
}

/**
 * The traced outline, in a 1024-tall box. The artwork is very slightly taller
 * than it is wide (838 x 857 in the source), so the viewBox is offset by half
 * the difference to centre it in a square — `size` then means the box, and the
 * mark never needs a separate width and height at the call site.
 */
const MARK_PATH =
  'M479.7 1C474.2 1.4 466.4 2.3 462.2 2.9C457.9 3.5 449.3 4.7 443 5.5C229 34.4 51.6 198.5 9.5 406.5C2.4 441.9 0 466.1 0 505C0 549.8 2.9 578.8 11.1 615C38.2 735.2 98.2 830.2 196.8 909.3C279.7 975.9 365.3 1009.9 481 1022.2C493.7 1023.5 551.8 1023.5 565 1022.2C647.8 1013.7 717.9 991.3 782.2 952.9C812.1 935 828.3 922.8 854.2 898.8C869 885.2 907.8 842.5 925 821.1C927.5 818 934 810.1 939.5 803.5C958.7 780.5 978.4 755.2 993.2 734.5C1002.2 721.9 1004 708.9 998 699.8C992.4 691.3 936.4 642.6 921.2 632.9C907.9 624.5 885.2 622.5 869.4 628.4C865.5 629.8 861.9 631 861.5 631C861.2 631 852.9 623.2 843.1 613.8C777.7 549.9 699.9 537 614.8 575.8C589.2 587.5 591.6 587.2 506.5 587.9C432.5 588.6 432.5 588.6 425.2 591.2C416.2 594.5 405.2 601.7 401 607C396.7 612.4 398 613.1 378 594.3C368.1 585 351.5 569.4 341 559.5C320.5 540.3 315.1 536.4 303.1 532.3C284.5 526 263.2 529.7 247.7 542C241.5 547 241.8 547 233.9 541.2C174.3 497.8 110.8 572.6 165.1 622.2C176.9 633 206.1 660.1 234.7 686.9C248.5 699.9 264.5 714.8 270.2 720C276 725.2 291.4 739.6 304.6 751.9C353.1 797.4 330.7 793 512.2 793C633 793 655.9 793.2 661.8 794.5C683.7 799.1 700 810.7 700 821.7C700 843.1 704.2 848.8 749.3 889.4C764.5 903 777 914.6 777 915.1C777 920 717.7 950.1 685 961.7C489.5 1031.2 273.9 969.9 139.3 806.5C83.9 739.2 46.7 651.8 36.5 565C35.7 558.1 34.5 549.1 34 545C30 516.1 32.8 464 40.5 423.9C74.3 249.4 194.1 114.4 364.7 58.6C521.1 7.5 687.3 34.5 817.2 132.1C850.1 156.8 886.4 193.4 911.3 226.8C929 250.4 945.3 277 964.4 313.1C971.7 327 971.9 327.1 978.3 323.5C987.8 318.2 997.1 311.8 997.7 310.3C999.3 306.2 971.8 256.5 951.2 226C869 104.5 738.6 23.4 595 4.4C588.1 3.5 579.6 2.4 576 1.9C567.4 .6 492.2 0 479.7 1M702.1 171.5C655 182.9 631.9 242 659 282C690.5 328.6 758.3 324.8 784.4 275C812.7 221.2 761.7 157.1 702.1 171.5M284.5 183.4C228.1 194.2 207.1 262.6 247.9 303C303.7 358.2 394.7 292.9 360.5 222.3C347 194.6 314.1 177.7 284.5 183.4M489.5 191.7C442.7 201.6 412.8 249.3 424.4 295.2C442.1 365.1 532.5 382.2 575.6 323.8C620.5 262.9 563.8 175.8 489.5 191.7M661.1 338.1C646.6 340.5 627.4 349.1 616 358.4C607.3 365.3 607.3 366.1 615.7 370.4C641.9 383.6 667.4 409.4 679 434.4C683.1 443.2 689 461 689 464.5C689 465.6 689.7 467.6 690.6 468.8C692.9 472.1 841.6 472.3 849 468.9C861.8 463.1 865 457.1 865 438.9C865 390.5 830.3 349 781.3 339.1C770.3 336.8 673.5 336.1 661.1 338.1M229.7 342.6C189.5 351.4 160.2 380.9 151 422C146.4 442.4 149.2 458.4 158.5 465.6C165.7 471 163.7 470.9 243.6 471C328.7 471 319.6 472.3 322.5 460C331 424.8 357.2 391.3 390.4 373.3C395.3 370.7 399.5 368 399.7 367.3C401 363.5 376.7 349.3 360.5 344.3C349.4 340.9 243.8 339.5 229.7 342.6M440.2 381.1C392 388.2 349.8 430.9 343.1 479.3C339.5 504.8 343.8 519.4 356.9 526.2C363.2 529.5 643.4 530.8 651.1 527.6C666.3 521.2 671.5 507.2 668.1 481.7C661.6 433.1 628.8 396.5 579.8 383.3C568.9 380.3 457.2 378.6 440.2 381.1M190.7 561.4C178.9 564.6 173.2 575.1 177 586.4C178.2 590 202.8 613.7 267.6 673.5C280.2 685.1 296.8 700.5 304.7 707.9C312.5 715.2 320.5 722.4 322.4 723.9C324.2 725.3 332.3 732.6 340.2 740C353.8 752.8 358.2 756 367.5 759.4C369.6 760.1 414.8 760.6 520.5 761C670.5 761.5 670.5 761.5 680 764.9C690.5 768.7 702.2 775.5 711.3 783.1C718.3 788.9 718 788.9 721.8 784.8C732.3 773.3 758.8 743.2 765.6 735.1C770.1 729.8 782 716.2 792.1 704.8C825.4 667.5 835 656 835 653.8C835 646.8 797.2 614.8 776.2 604.2C751.9 591.8 737 588.5 705.5 588.5C673.6 588.5 659.3 591.6 629.7 605.1C597.6 619.7 596.4 619.9 510.5 620.6C432.9 621.2 434.2 621.1 426.8 627.8C411.1 642 418.5 667.3 439.5 670.9C443.5 671.6 471.1 672 518.4 672C598.8 672 594.3 671.6 599.6 678.5C605.4 686.2 602.8 697.3 594 701.8C589.6 704 589.6 704 513.5 704C428.2 704 430.3 704.2 416.2 696.4C409.9 693 409.9 693 386.2 693C343.2 693 354.2 699.9 272.5 621C249.4 598.7 227 577.1 222.7 573.2C211.1 562.2 201 558.5 190.7 561.4M271.9 564.3C264.4 568.3 266.1 572.4 280.5 584.3C283.8 587.1 302.8 605.1 322.7 624.4C364.7 665 360.8 662.2 374.8 661.8C385.5 661.5 385.5 661.5 385.8 654.6C386.1 646.7 384.2 642.9 376.7 636.9C372.2 633.3 351.6 614 320.9 584.8C296.2 561.2 285.9 556.9 271.9 564.3M883.5 658.8C874.6 661.9 869.3 665.8 861.3 675.1C857 680.1 844.3 694.6 833 707.3C821.7 720.1 811.6 731.7 810.5 733.1C809.4 734.6 799.5 745.9 788.5 758.2C741.3 811.3 734.1 820.1 734 825C734 831.6 736.2 834 765.4 860C771.9 865.8 783.1 875.8 790.3 882.3C797.6 888.7 804.3 894 805.3 894C812.4 894 856.3 851.9 885.6 817C934.9 758.4 966 718.6 966 714.2C965.9 712.6 959.1 706.5 925.7 678.1C902.2 658 894.9 654.7 883.5 658.8M884.5 706.6C873.8 712.5 871.4 724.3 879.3 732.9C891.7 746.4 914.1 731.1 906 714.6C902.2 706.8 891.5 702.8 884.5 706.6';

export function BrandMark({ size = 32, className }: BrandMarkProps) {
  const grow = inkGrowthFor(size);
  return (
    <svg
      width={size}
      height={size}
      viewBox="-11.5 0 1024 1024"
      className={className}
      // Decorative: every place this is used names the brand in text beside it,
      // and a screen reader announcing "logo" before the word "Dealer Kavach"
      // is one more thing to sit through on every screen.
      aria-hidden
      focusable="false"
    >
      <path
        d={MARK_PATH}
        fill="currentColor"
        fillRule="evenodd"
        stroke={grow ? 'currentColor' : 'none'}
        strokeWidth={grow}
        strokeLinejoin="round"
      />
    </svg>
  );
}
