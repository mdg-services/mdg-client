/**
 * The two Dealer Kavach films on mdgservices.in, and how they are watched
 * (docs/films/FILM_PAGES_SPEC.md, ADR 0015).
 *
 * Three parties read these shapes: the public watch pages send `FilmBeacon`s,
 * the backend folds them into one row per page load, and the admin "Films" page
 * reads `FilmStats`, `FilmSessionRow` and the share links back. Nothing here
 * carries a name, a number, an account or an address — a viewer is a random id
 * their own browser made up.
 */

export const FILM_IDS = ['kavach', 'kavach-short'] as const;
export type FilmId = (typeof FILM_IDS)[number];

export const FILM_BEACON_KINDS = ['start', 'beat', 'end'] as const;
export type FilmBeaconKind = (typeof FILM_BEACON_KINDS)[number];

/** The buttons and taps the page counts. */
export const FILM_CTAS = ['full', 'register', 'share', 'replay', 'chapter', 'speed'] as const;
export type FilmCta = (typeof FILM_CTAS)[number];

export const FILM_AUTOPLAY_OUTCOMES = ['muted', 'blocked'] as const;
export type FilmAutoplay = (typeof FILM_AUTOPLAY_OUTCOMES)[number];

/** Who opened the page, from where, on what. Sent once, on the `start` beacon. */
export interface FilmBeaconContext {
  /** `?r=` — the share-link code. */
  tag?: string;
  /** `?from=` — e.g. `short` when the short's end button sent them. */
  from?: string;
  /** `document.referrer`, host only. */
  ref?: string;
  lang?: string;
  os?: string;
  browser?: string;
  mobile?: boolean;
  /** 'whatsapp' | 'facebook' | 'instagram' | … read from the user agent. */
  inApp?: string;
  screen?: [number, number];
  net?: { type?: string; saveData?: boolean; downlink?: number };
  geo?: { country?: string; region?: string; city?: string };
  autoplay: FilmAutoplay;
}

/**
 * One message from a watch page. `sid` is fresh per page load, `vid` lives in
 * the browser's own storage, `seq` counts up from 0 within a session.
 */
export interface FilmBeacon {
  v: 1;
  film: FilmId;
  sid: string;
  vid: string;
  seq: number;
  kind: FilmBeaconKind;
  /** Client clock, epoch ms. Informational only — the server's clock is used. */
  at: number;
  ctx?: FilmBeaconContext;
  /** Watched `[from, to]` seconds since the last beacon. */
  ranges?: Array<[number, number]>;
  pos?: number;
  muted?: boolean;
  /** Playhead when sound was first turned on (sent once). */
  unmutedAt?: number;
  /** The sound-on tap restarted the film from 0. */
  restarted?: boolean;
  /** Navigation start → first frame (sent once). */
  startupMs?: number;
  /** Since the last beacon. */
  rebuffers?: number;
  rebufferMs?: number;
  /** Rendition height now. */
  level?: number;
  ended?: boolean;
  /** Taps since the last beacon. */
  cta?: FilmCta[];
  /** playbackRate, when not 1. */
  rate?: number;
}

/** A film as the admin's switcher lists it. */
export interface FilmSummary {
  film: FilmId;
  title: string;
  /** The public page, e.g. `https://mdgservices.in/film`. */
  url: string;
  /** Seconds; `null` until the film has been packaged. */
  duration: number | null;
  version: string | null;
  /** Whether beacons for this film are being accepted (it has a duration). */
  ready: boolean;
  /** All time. */
  opens: number;
  /** All time; a view is a session with at least 3 s watched. */
  views: number;
}

export type FilmBreakdownKey =
  | 'tag'
  | 'region'
  | 'city'
  | 'device'
  | 'network'
  | 'referrer'
  | 'inApp';
export const FILM_BREAKDOWN_KEYS: readonly FilmBreakdownKey[] = [
  'tag',
  'region',
  'city',
  'device',
  'network',
  'referrer',
  'inApp',
];

export interface FilmBreakdownRow {
  key: string;
  /** What to show when `key` is not readable on its own (a link's label, "City, State"). */
  label?: string;
  views: number;
  viewers: number;
  avgPercent: number;
  completionRate: number;
  soundOnRate: number;
}

/** One narrated line of a film, as its `timeline.json` has it. */
export interface FilmLine {
  id: string;
  /** Start, seconds. */
  t: number;
  /** End, seconds. */
  end: number;
  /** The Hindi text. */
  hi: string;
}

export interface FilmDropoff {
  /** Start of the 5-second window in which the views were lost. */
  t: number;
  /** Share of all views lost across that window (0..1). */
  lost: number;
  /**
   * The narrated line being spoken where the most viewers left inside the
   * window (the last second they watched before the sharpest one-second fall),
   * if any.
   */
  line: { id: string; hi: string; t: number } | null;
}

export interface FilmStats {
  film: FilmId;
  title: string;
  duration: number;
  /** IST calendar days, inclusive. */
  range: { from: string; to: string };
  totals: {
    /** Sessions — the page opened and the player loaded. */
    opens: number;
    /** Sessions with at least 3 s watched. */
    views: number;
    /** Distinct viewer ids among views. */
    viewers: number;
    /** Viewers with more than one view in the range. */
    returning: number;
    watchSeconds: number;
    /** Per view. */
    avgWatchSeconds: number;
    /** Per view, 0..1. */
    avgPercent: number;
    /** completed / views. Completed = watched ≥ 95 %, or reached the end having watched ≥ 80 %. */
    completionRate: number;
    /** Views that turned the sound on / views. */
    soundOnRate: number;
    startupMedianMs: number | null;
    startupP90Ms: number | null;
    /** rebufferMs / (watchMs + rebufferMs). */
    rebufferRatio: number;
  };
  /**
   * Share of views that WATCHED the second completing 25/50/75 % of the film —
   * the retention curve's value there; seeking past it does not count — and
   * that watched the last second or the one before it (p100).
   */
  quartiles: { p25: number; p50: number; p75: number; p100: number };
  /** One entry per whole second of the film: share of views that watched it (0..1). */
  retention: number[];
  /** The same, among views that turned the sound on. All zeros when there are none. */
  retentionSoundOn: number[];
  /** The 8 steepest 5-second falls, steepest first, never overlapping. */
  dropoffs: FilmDropoff[];
  /**
   * Every narrated line with its start and end in seconds, so the admin's
   * retention curve can say what was being said at any second, not only at the
   * eight drop-offs. Empty for a film with no timeline yet. Optional so a reader
   * built before it existed still type-checks against an older server.
   */
  lines?: FilmLine[];
  /** Share of views that watched at least 3 s inside each chapter. */
  chapters: Array<{ t: number; title: string; reach: number }>;
  /** One row per IST day of the range, oldest first, zero days included. */
  daily: Array<{
    day: string;
    opens: number;
    views: number;
    viewers: number;
    watchSeconds: number;
  }>;
  /** Up to 50 rows each, most views first. */
  breakdowns: Record<FilmBreakdownKey, FilmBreakdownRow[]>;
  /**
   * The short only (null on the full film). `fullClicks` counts short views that
   * tapped "watch the full film"; `viewersWhoStartedFull` counts short viewers
   * who then opened the full film from it; `rate` = viewersWhoStartedFull /
   * the short's distinct viewers.
   */
  shortToFull: null | {
    shortViews: number;
    fullClicks: number;
    viewersWhoStartedFull: number;
    rate: number;
  };
  /**
   * True when the window held more page loads than one stats request reads:
   * the figures then cover only the newest of them, and the page should say
   * so. Optional so a reader built before it existed still type-checks.
   */
  truncated?: boolean;
}

/** One page load, for the recent-views drill-down. */
export interface FilmSessionRow {
  sid: string;
  /** ISO — when the first beacon arrived. */
  startedAt: string;
  lastSeenAt: string;
  tag: string | null;
  /** The share link's label, when the tag is one of ours. */
  tagLabel: string | null;
  from: string | null;
  region: string | null;
  city: string | null;
  os: string | null;
  browser: string | null;
  mobile: boolean | null;
  inApp: string | null;
  network: string | null;
  autoplay: FilmAutoplay | null;
  watchedSeconds: number;
  /** 0..1 of the film. */
  percent: number;
  /** At least 3 s watched. */
  isView: boolean;
  soundOn: boolean;
  completed: boolean;
  startupMs: number | null;
}

export interface FilmSessionPage {
  items: FilmSessionRow[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextBefore: string | null;
}

export interface FilmShareLink {
  /** 7 characters from an alphabet with no 0/o/1/l/i. */
  code: string;
  film: FilmId;
  /** Who or where it was sent to, ≤ 80 characters. */
  label: string;
  /** The public URL carrying `?r=<code>`. */
  url: string;
  createdBy: string | null;
  createdAt: string;
  archived: boolean;
}

/** A share link with how it has done, all time. */
export interface FilmShareLinkRow extends FilmShareLink {
  opens: number;
  views: number;
  viewers: number;
  avgPercent: number;
}
