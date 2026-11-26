/**
 * The website → app funnel (ADR 0059): which page on mdgservices.in a person
 * came from when they pressed "Ask in Kavach Shuruaat", and how many of them
 * went on to sign up and pay.
 *
 * A SOURCE is short and stable: `<collection>:<page-id>` for a guide page
 * (`pump:dealership-documents`, `mdg:qrc-team-visit`, `kk:join-pump`, `qa:<id>`)
 * or a page name (`home`, `pricing`, `new-pump`, `tools:<id>`, `chat`, `footer`).
 * It is the same tag the website puts on the funnel link, the Play Store install
 * tag and the sign-up form, so one pattern guards all of them. Anything else is
 * dropped, never refused: a link with a bad tag still takes the person to the app.
 */

/** Lower-case letters, digits, `:`, `_` and `-`; at most 80. */
export const FUNNEL_SOURCE_PATTERN = /^[a-z0-9:_-]{1,80}$/;

/** What kind of phone (or not) pressed the link, as the website's server read it. */
export const FUNNEL_DEVICES = ['android', 'ios', 'other'] as const;
export type FunnelDevice = (typeof FUNNEL_DEVICES)[number];

/** The website's languages. */
export const FUNNEL_LANGS = ['en', 'hi', 'or'] as const;
export type FunnelLang = (typeof FUNNEL_LANGS)[number];

/** The report's windows, in days. */
export const FUNNEL_WINDOWS = [7, 30, 90] as const;
export type FunnelWindow = (typeof FUNNEL_WINDOWS)[number];

/** Taps on the funnel link, by the kind of device that made them. */
export interface FunnelTaps {
  android: number;
  ios: number;
  other: number;
  total: number;
}

/** One page's numbers in the window. */
export interface FunnelRow {
  /** The page's tag; null on the "no source" row. */
  source: string | null;
  taps: FunnelTaps;
  /** Kavach Shuruaat sign-ups in the window that carried this tag. */
  signUps: number;
  /** Of those sign-ups, how many have ever paid. */
  paid: number;
}

/** What the admin's "Website → app" page reads: GET /v1/admin/funnel?days= */
export interface FunnelReport {
  days: FunnelWindow;
  /** ISO: the start of the window. */
  since: string;
  /** One row per tagged page, most sign-ups first, then most taps. */
  rows: FunnelRow[];
  /**
   * Sign-ups that came with no tag (the person found the app by themselves, or
   * installed it on an iPhone, which carries none), and any tap whose link had none.
   */
  noSource: FunnelRow;
  /** Every row above, the "no source" row included, added up. */
  totals: Omit<FunnelRow, 'source'>;
}
