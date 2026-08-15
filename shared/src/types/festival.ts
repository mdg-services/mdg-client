/**
 * Festival greeting — the seasonal band that replaces the top brand strip on
 * the images MDG shares with dealers (today: the Credit & DOD card).
 *
 * The design is deliberately split in two:
 *
 *   CATALOG   what a festival LOOKS like — greeting wording, band colours,
 *             emblem. Static, versioned with the code, identical on the server
 *             that renders the image and in the admin screen that previews it.
 *   SETTING   which one is on RIGHT NOW and for how long — a single row the
 *             super-admin edits. Turning a festival on never touches the code.
 *
 * Adding a festival is therefore one catalog entry; running one is a toggle.
 */

/** Catalog keys. Adding a festival means adding a key + a catalog entry. */
export const FESTIVAL_KEYS = [
  'independence-day',
  'republic-day',
  'diwali',
  'holi',
  'new-year',
] as const;
export type FestivalKey = (typeof FESTIVAL_KEYS)[number];

/**
 * How the band's background is painted.
 *
 * `stripes` draws the three colours as horizontal bands — the national flag,
 * so it is right for Independence and Republic Day and wrong for everything
 * else. `gradient` blends them left-to-right, which reads as festive without
 * impersonating a flag.
 */
export type FestivalBandStyle = 'stripes' | 'gradient';

/** Everything needed to draw one festival's band, and nothing else. */
export interface FestivalDefinition {
  key: FestivalKey;
  /** Admin-facing name, e.g. "Independence Day". */
  label: string;
  /** Admin-facing Hindi name, e.g. "स्वतंत्रता दिवस". */
  labelHi: string;
  /** The greeting the dealer reads, in Hindi — the primary line. */
  greetingHi: string;
  /** The English twin, printed smaller beside it. */
  greetingEn: string;
  bandStyle: FestivalBandStyle;
  /** Exactly three colours, top→bottom for `stripes`, left→right for `gradient`. */
  colors: readonly [string, string, string];
  /** Colour of the greeting text; must carry against a near-white pill. */
  ink: string;
  /**
   * Inline SVG drawn either side of the greeting, or null for a text-only band.
   * A static constant in our own bundle — never user input — so both the server
   * renderer and the admin preview can inject it as markup.
   */
  emblemSvg: string | null;
  /** What the admin form pre-fills "for how many days" with. */
  defaultDays: number;
  /**
   * `MM-DD` when the festival falls on a fixed date, so the admin form can
   * pre-fill a sensible start. Null for the lunar ones (Diwali, Holi), whose
   * date moves every year and must be typed in.
   */
  observedOn: string | null;
}

/** The stored setting — which festival is on, from when, for how long. */
export interface FestivalSetting {
  festivalKey: FestivalKey;
  /** Master switch. Off means no band, whatever the dates say. */
  enabled: boolean;
  /** First day the band appears, `YYYY-MM-DD` in IST. */
  startDate: string;
  /** How many days it stays on, counting `startDate` as day 1. */
  days: number;
  /** ISO timestamp of the last edit, or null if never saved. */
  updatedAt: string | null;
}

/** The window a setting describes, resolved against a given day. */
export interface FestivalWindow {
  /** `YYYY-MM-DD`, inclusive. */
  startDate: string;
  /** `YYYY-MM-DD`, inclusive — the last day the band is drawn. */
  endDate: string;
  /** Whether the band is drawn on the day this was resolved against. */
  active: boolean;
  /**
   * Days remaining including today, or 0 once the window has closed. Lets the
   * admin screen say "2 more days" without redoing the arithmetic.
   */
  daysLeft: number;
}

/** GET /super-admin/festival response. */
export interface FestivalSettingsView {
  /** Every festival that can be switched on, in catalog order. */
  catalog: FestivalDefinition[];
  /** The saved setting, or null if a festival has never been configured. */
  setting: FestivalSetting | null;
  /** The setting's resolved window, or null when there is no setting. */
  window: FestivalWindow | null;
  /** The server's own IST calendar date — what `active` was judged against. */
  today: string;
}
