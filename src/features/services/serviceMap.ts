import { BACKGROUND_SERVICE_IDS, OWNER_ONLY_SERVICE_IDS } from '@dk/shared';
import type { GuideVideoListItem, ReportKind, TodayTaskKind } from '@dk/shared/types';

/**
 * Which service is which, in the app (spec 4.2 and 4.3): the group a service sits in on the hub,
 * the report kinds it produces, the page template it gets, whether it has a page at all, which
 * open tasks belong to it and which guide video explains it.
 *
 * Pure data and small functions, no React: the tab bar, the glance model, the hub and the service
 * pages all read it, so it must be cheap to load. The server's `GET /v1/me/services` says whether a
 * service RUNS; this file says what a service IS. It never needs the server, so the hub still
 * draws its rows against an older API that has no such route.
 */

/** The row the hub shows first when Kavach is on: not a plugin, so it has no entry in `SERVICE_MAP`. */
export const KAVACH_ROW = 'kavach';

/**
 * Where a service sits on the hub.
 *  - `daily`      "Every day for you"
 *  - `filed`      "Filed for you"
 *  - `ask`        "When you ask"
 *  - `feeds`      "Behind the scenes": one collapsed row, "3 data feeds running", not tappable
 *  - `hidden`     never listed (a login's helper run, or a service the owner has not approved for dealers)
 *  - `button`     `custom-request`: becomes the "Ask MDG for something else" button
 */
export type ServiceGroup = 'daily' | 'filed' | 'ask' | 'feeds' | 'hidden' | 'button';

/** The groups that are drawn as rows, in the order the hub lists them (Kavach comes before `daily`). */
export const HUB_GROUPS: readonly Exclude<ServiceGroup, 'hidden' | 'button'>[] = [
  'daily',
  'filed',
  'ask',
  'feeds',
];

/** Template A is a daily report, B a filing (receipts), C a check done when asked (spec 4.3). */
export type ServiceTemplate = 'A' | 'B' | 'C';

export interface ServiceSpec {
  id: string;
  group: ServiceGroup;
  /** Null for a service that has no page of its own (a data feed, a hidden one). */
  template: ServiceTemplate | null;
  /** The report kinds it produces, newest of these is "its newest report". Empty for a chat box or a feed. */
  kinds: readonly ReportKind[];
  /** The owner's alone: a manager never sees the row or the page. */
  ownerOnly: boolean;
  /**
   * The service works in a chat box with its own endpoints and has no report kind
   * (`maintenance-complaints`, `work-permits`): its page lists what the box holds.
   */
  box?: 'complaints' | 'work-permits';
}

const spec = (
  id: string,
  group: ServiceGroup,
  template: ServiceTemplate | null,
  kinds: readonly ReportKind[] = [],
  extra: { ownerOnly?: boolean; box?: ServiceSpec['box'] } = {},
): ServiceSpec => ({
  id,
  group,
  template,
  kinds,
  ownerOnly: extra.ownerOnly ?? false,
  ...(extra.box ? { box: extra.box } : {}),
});

/**
 * Every service id MDG has a label for (`SERVICE_LABELS`, which the drift test holds equal to the
 * registered plugins). A plugin added on the server and not yet here is `undefined` and is treated as
 * hidden by every reader below: a dealer never reads a raw id.
 */
export const SERVICE_MAP: Readonly<Record<string, ServiceSpec>> = Object.fromEntries(
  [
    // Every day for you
    spec('dsr-report', 'daily', 'A', ['dsr_sales', 'dsr_variation']),
    spec('credit-dod-monitoring', 'daily', 'A', ['credit_dod', 'ledger_watch'], {
      ownerOnly: true,
    }),
    spec('water-ingress-testing', 'daily', 'A', ['water_ingress']),
    spec('load-planner', 'daily', 'A', ['load_plan']),
    spec('tt-density', 'daily', 'A', ['tanker_density']),
    spec('tanker-documents', 'daily', 'A', ['paper_expiry']),
    // Filed for you
    spec('dealer-declarations', 'filed', 'B', ['declaration_filed']),
    spec('du-otp-acknowledgement', 'filed', 'B', ['du_otp']),
    spec('tt-acknowledgement', 'filed', 'B', ['tt_ack']),
    spec('mock-drill', 'filed', 'B', ['mock_drill']),
    spec('electrical-audit', 'filed', 'B', ['electrical_audit']),
    spec('calibration-claim', 'filed', 'B', ['calibration_claim'], { ownerOnly: true }),
    spec('fuel-indent', 'filed', 'A', ['fuel_order']),
    spec('maintenance-complaints', 'filed', 'B', [], { box: 'complaints' }),
    spec('work-permits', 'filed', 'B', [], { box: 'work-permits' }),
    // When you ask
    spec('stock-check', 'ask', 'C', ['stock_check']),
    spec('ro-supply-status', 'ask', 'C', ['ro_supply']),
    // Behind the scenes: a hub row, no page (no dealer endpoint shows what they hold)
    spec('iras-shift-data', 'feeds', null),
    spec('bpcl-iot-data', 'feeds', null),
    spec('hpcl-portal-data', 'feeds', null),
    spec('inspection-reports', 'feeds', null),
    spec('hpcl-inspection-reports', 'feeds', null),
    // Never listed
    spec('hpcl-account', 'hidden', null),
    spec('sdms-password-reset', 'hidden', null),
    spec('sdms-old-password-reset', 'hidden', null),
    spec('iras-password-reset', 'hidden', null),
    spec('custom-request', 'button', null),
  ].map((s) => [s.id, s]),
);

/**
 * Ids the app hides on its own, whatever the server sends: `BACKGROUND_SERVICE_IDS` (an older server
 * may not know `iras-password-reset`) and the ids spec 4.2 names, so the client works against an
 * older API.
 */
export const HIDDEN_SERVICE_IDS: ReadonlySet<string> = new Set([
  ...BACKGROUND_SERVICE_IDS,
  'hpcl-account',
  'sdms-password-reset',
  'sdms-old-password-reset',
  'iras-password-reset',
]);

/** The owner's alone, from the shared list plus what this map says (an older shared copy is still safe). */
export const OWNER_ONLY_IDS: ReadonlySet<string> = new Set([
  ...OWNER_ONLY_SERVICE_IDS,
  'credit-dod-monitoring',
  'calibration-claim',
]);

export function serviceSpec(serviceId: string): ServiceSpec | undefined {
  return SERVICE_MAP[serviceId];
}

/** Never a row of any kind: hidden, unknown to this build, or the "ask for something else" button. */
export function isHiddenService(serviceId: string): boolean {
  if (HIDDEN_SERVICE_IDS.has(serviceId)) return true;
  const s = SERVICE_MAP[serviceId];
  return !s || s.group === 'hidden' || s.group === 'button';
}

/** Is the service the owner's alone? */
export function isOwnerOnlyService(serviceId: string): boolean {
  return OWNER_ONLY_IDS.has(serviceId) || SERVICE_MAP[serviceId]?.ownerOnly === true;
}

/** May this reader see the service at all (row and page)? A manager never sees an owner-only one. */
export function isServiceVisible(serviceId: string, isOwner: boolean): boolean {
  if (isHiddenService(serviceId)) return false;
  return isOwner || !isOwnerOnlyService(serviceId);
}

/** The group a service sits in on the hub; `null` for an id that is never listed. */
export function groupOf(serviceId: string): Exclude<ServiceGroup, 'hidden' | 'button'> | null {
  if (isHiddenService(serviceId)) return null;
  const g = SERVICE_MAP[serviceId]!.group;
  return g === 'hidden' || g === 'button' ? null : g;
}

/** The ids the hub lists in one group, in the spec's order, for this reader. */
export function servicesInGroup(group: ServiceGroup, isOwner: boolean): string[] {
  return Object.values(SERVICE_MAP)
    .filter((s) => s.group === group && isServiceVisible(s.id, isOwner))
    .map((s) => s.id);
}

/** Does the service have a page of its own (`/services/:serviceId`)? A feed gets only a hub row. */
export function hasServicePage(serviceId: string, isOwner = true): boolean {
  const s = SERVICE_MAP[serviceId];
  return !!s && s.template !== null && isServiceVisible(serviceId, isOwner);
}

/** The report kinds a service produces (empty for a chat box, a feed, or an id not known here). */
export function kindsOfService(serviceId: string): readonly ReportKind[] {
  return SERVICE_MAP[serviceId]?.kinds ?? [];
}

const KIND_TO_SERVICE: ReadonlyMap<ReportKind, string> = new Map(
  Object.values(SERVICE_MAP).flatMap((s) => s.kinds.map((k) => [k, s.id] as const)),
);

/** The service a report kind belongs to; `announcement` (MDG's own note) belongs to none. */
export function serviceOfKind(kind: ReportKind): string | null {
  return KIND_TO_SERVICE.get(kind) ?? null;
}

/**
 * The service an open task belongs to, for the "Needs you" rows that name their service and for the
 * state "Needs you" on a hub row. Null when the task belongs to no service:
 *  - a photo ask for a paper (`doc:`) belongs to My pump, Papers;
 *  - `portal_login`, `password_pick`, `outlet_details` and `setup` belong to the pump's settings and
 *    setup, not to a service.
 * A register-page ask (`reg:`) is the density register's, so it belongs to TT Density; a retired
 * Kavach ask (`kv:`) belongs to the Kavach row. The calibration claim asks for the owner's signed
 * letter and for the WEMMIS login.
 */
export function taskKindService(kind: TodayTaskKind, askRef?: string | null): string | null {
  switch (kind) {
    case 'du_otp':
      return 'du-otp-acknowledgement';
    case 'mock_drill':
      return 'mock-drill';
    case 'declarations':
      return 'dealer-declarations';
    case 'complaint':
      return 'maintenance-complaints';
    case 'work_permit':
      return 'work-permits';
    case 'fuel_confirm':
      return 'fuel-indent';
    case 'sign_letter':
    case 'wemmis_login':
      return 'calibration-claim';
    case 'ask':
      if (askRef?.startsWith('reg:')) return 'tt-density';
      if (askRef?.startsWith('kv:')) return KAVACH_ROW;
      return null;
    default:
      return null;
  }
}

/**
 * The guide video that explains a service: the first video the library tags with that service and
 * that is uploaded. Only a few videos carry the tag today, so most services have none and the page
 * shows no help chip (tagging more is content work, not code).
 */
export function videoFor(
  serviceId: string,
  videos: readonly Pick<GuideVideoListItem, 'id' | 'service' | 'available'>[] | undefined,
): string | undefined {
  return videos?.find((v) => v.service === serviceId && v.available)?.id;
}
