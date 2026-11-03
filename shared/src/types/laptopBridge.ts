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
 * What the server hands the Dealer Kavach Summon extension for one summon (ADR
 * 0030): the dealer's login for that portal (any admin may already reveal it in the
 * Password vault, under the same hourly limit and activity log), which sites to log
 * out of first, and a short-lived key for asking the server to read a picture code
 * and for saying the tab was closed.
 */
export interface SummonTicket {
  summonId: string;
  portal: SummonPortal;
  /** "SDMS", "IRAS", "eMaaptaul". */
  label: string;
  dealerCode: string | null;
  loginUrl: string;
  username: string;
  password: string;
  /** SDMS only: the radio on its login page. */
  dealerType?: 'retail' | 'lpg' | '1906';
  /** IRAS only: the role in its dropdown. */
  role?: string;
  /** Origins whose saved login is cleared before the new tab opens. */
  logoutOrigins: string[];
  key: string;
  /** SDMS only: how long the robot keeps off this login while the tab is open. */
  holdMinutes: number | null;
}

/** What the extension reports back to the admin page about one summon. */
export interface SummonResult {
  summonId: string;
  /**
   * `signed_in`: the portal moved past its login page. `needs_you`: the tab is open
   * with what could be filled, and the admin finishes (a picture code the robot
   * could not read, a wrong one). `failed`: nothing could be done, `message` says why.
   */
  state: 'signed_in' | 'needs_you' | 'failed';
  message: string;
}
