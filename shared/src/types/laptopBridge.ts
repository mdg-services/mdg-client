/**
 * The laptop bridge (ADR 0030): a browser on a super-admin's own laptop that the
 * server drives instead of its own, through a tunnel the laptop opens to the
 * server. The server still does every read, check and write; only the browser
 * window is on the laptop, where the admin can watch it, and its traffic leaves
 * from the laptop's own internet connection.
 */

/** Where a run's browser opens. */
export const BROWSER_PLACES = ['server', 'laptop'] as const;
export type BrowserPlace = (typeof BROWSER_PLACES)[number];

/**
 * The services that sign in to a portal with a browser, and so can run on the
 * laptop. The rest (the DSR, the Load Planner, custom requests, BPCL's data)
 * never open a browser on a portal.
 */
export const LAPTOP_RUN_SERVICE_IDS: readonly string[] = [
  'credit-dod-monitoring',
  'inspection-reports',
  'iras-shift-data',
  'water-ingress-testing',
  'tt-density',
  'ro-supply-status',
  'calibration-claim',
];

export function canRunOnLaptop(serviceId: string): boolean {
  return LAPTOP_RUN_SERVICE_IDS.includes(serviceId);
}

/** What the server can see of the bridge right now. Super-admins only. */
export interface LaptopBridgeStatus {
  /** The bridge answers and its browser library matches the server's. */
  up: boolean;
  /** Why it cannot be used, in plain words, when `up` is false. */
  reason: string | null;
  /** The laptop's name, as the bridge reported it. */
  laptop: string | null;
  /** When the bridge was started (ISO). */
  since: string | null;
}

/** The portals Summon can sign a super-admin in to. */
export const SUMMON_PORTALS = ['sdms', 'iras', 'wemmis'] as const;
export type SummonPortal = (typeof SUMMON_PORTALS)[number];

export const SUMMON_PORTAL_LABEL: Record<SummonPortal, string> = {
  sdms: 'SDMS',
  iras: 'IRAS',
  wemmis: 'eMaaptaul',
};

/**
 * Where one summoned window stands.
 *
 * `needs_you`: the window is open with the ID and password typed in, and the
 * person finishes the sign-in (a picture code the robot could not read).
 */
export const SUMMON_STATES = ['opening', 'signing_in', 'ready', 'needs_you', 'failed', 'closed'] as const;
export type SummonState = (typeof SUMMON_STATES)[number];

export interface SummonView {
  id: string;
  dealerId: string;
  portal: SummonPortal;
  state: SummonState;
  /** What to tell the admin, in plain words. */
  message: string;
  startedAt: string;
  updatedAt: string;
}
