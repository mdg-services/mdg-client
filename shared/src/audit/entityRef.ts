/**
 * What an audit row points at, and which screen opens it.
 *
 * `AuditLog` stores `entity` + `entityId` and nothing else about its target. The
 * read API resolves a handful of kinds to a name; the rest render as a bare
 * 24-character hex string that links nowhere, which tells a reader nothing and
 * cannot be clicked.
 *
 * This table is the single place that says, per entity: what to call it, HOW ITS
 * ID IS SHAPED, and where a reader is sent when they tap it. It lives in
 * @dk/shared rather than in the admin app for two reasons. The server needs half
 * of it — it cannot batch a dealer lookup without first knowing which entities
 * are dealer-keyed — and a second copy of that knowledge is how the two ends
 * stop agreeing. It is also the only place either end has a test runner:
 * `mdg-admin` has no `test` script at all.
 *
 * THE ID SHAPE IS THE LOAD-BEARING PART, and the reason this is a table rather
 * than a `/${entity}/${entityId}` template. `entityId` is only sometimes the
 * entity's own id, and every one of these is real, verified at its write site:
 *
 *   - `Dealer`               usually a dealer's `_id` — but the Kavach catalog
 *                            writes the literal string `'GLOBAL'`, and an upload
 *                            whose key fails to parse writes the whole S3 key.
 *   - `InspectionReport`,
 *     `RoSupplyStatus`       the id IS the dealer's `_id`, not a report's.
 *   - `TtDensityDayLog`      TWO shapes: the day document's own `_id` from the
 *                            upload path, and `"<dealerId>:<businessDate>"`
 *                            from the two photo-view routes.
 *   - `Auth`                 the email address typed at the login form.
 *   - `LedgerWatch`          the literal string `'sweep'`.
 *   - `AiTurn`               a turn's `_id`, or the settings singleton's id.
 *
 * So a link is offered ONLY when the id validates for that entity's declared
 * shape. Anything else renders as plain text exactly as it does today. That
 * rule is what makes this strictly an improvement: it can add a working link,
 * and it cannot invent a broken one.
 */

/** The shapes an `entityId` is allowed to take. */
export type AuditIdShape =
  /** A 24-character Mongo ObjectId belonging to the entity itself. */
  | 'objectId'
  /** A 24-character ObjectId that IS a dealer's id. */
  | 'dealerId'
  /** `"<dealerId>:<businessDate>"`. */
  | 'dealerDay'
  /** Free text — an email, a sentinel like 'GLOBAL' or 'sweep', an S3 key. */
  | 'opaque';

export interface AuditEntityRef {
  /** What to call this kind of thing in a sentence, e.g. "outlet", "service". */
  label: string;
  shape: AuditIdShape;
  /**
   * Builds the admin route that opens this target, or returns `null` when this
   * particular id cannot be opened. Never returns a route it has not validated.
   */
  href?: (entityId: string, dealerId: string | null) => string | null;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** Is this string a Mongo ObjectId? The guard that stops 'GLOBAL' becoming a link. */
export function isObjectId(value: string | null | undefined): boolean {
  return !!value && OBJECT_ID.test(value);
}

/** `"<dealerId>:<businessDate>"` → its two halves, or `null` if it is not that shape. */
export function splitDealerDay(
  entityId: string,
): { dealerId: string; businessDate: string } | null {
  const at = entityId.indexOf(':');
  if (at <= 0) return null;
  const dealerId = entityId.slice(0, at);
  const businessDate = entityId.slice(at + 1);
  if (!isObjectId(dealerId)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) return null;
  return { dealerId, businessDate };
}

const dealerHref = (tab: string) => (entityId: string) =>
  isObjectId(entityId) ? `/dealers/${entityId}?tab=${tab}` : null;

/**
 * The catalogue.
 *
 * Every entity written anywhere in the backend appears here — verified by
 * grepping every `entity: '…'` write site — so a reader never meets a kind this
 * table has no opinion about. Entities whose target has no screen of its own
 * still get a `label`, which is the readability half of the job even when there
 * is nothing to link to.
 */
export const AUDIT_ENTITY_REFS: Record<string, AuditEntityRef> = {
  Dealer: {
    label: 'outlet',
    shape: 'dealerId',
    href: (entityId) => (isObjectId(entityId) ? `/dealers/${entityId}` : null),
  },
  DealerService: {
    label: 'service',
    shape: 'objectId',
    // The attachment has no screen of its own; its dealer's Services tab is
    // where it is actually managed, and that dealer is resolved server-side.
    href: (_entityId, dealerId) =>
      isObjectId(dealerId) ? `/dealers/${dealerId}?tab=services` : null,
  },
  ServiceRun: {
    label: 'run',
    shape: 'objectId',
    href: (entityId) => (isObjectId(entityId) ? `/runs?run=${entityId}` : null),
  },
  InspectionReport: {
    // The id IS the dealer's — verified at the write site.
    label: 'inspection report',
    shape: 'dealerId',
    href: dealerHref('data-vault'),
  },
  RoSupplyStatus: {
    label: 'supply status',
    shape: 'dealerId',
    href: dealerHref('data-vault'),
  },
  DsrReport: {
    label: 'daily sales report',
    shape: 'objectId',
    href: (_entityId, dealerId) => (isObjectId(dealerId) ? `/dsr/dealers/${dealerId}` : null),
  },
  TtDensityDayLog: {
    // TWO id shapes in the wild: the two photo-VIEW routes write
    // `"<dealerId>:<businessDate>"`, while the upload path writes the day
    // document's own `_id`. `dealerDay` covers the first; the second falls
    // through every guard and renders as plain text, which is what it did
    // before this change too.
    label: 'density day',
    shape: 'dealerDay',
    href: (entityId) => {
      const parts = splitDealerDay(entityId);
      return parts ? `/dealers/${parts.dealerId}?tab=data-vault` : null;
    },
  },
  WaterIngressDayLog: { label: 'water-ingress day', shape: 'objectId' },
  TtInvoice: { label: 'tanker invoice', shape: 'objectId' },
  LedgerFlag: {
    label: 'ledger movement',
    shape: 'objectId',
    href: () => '/ledger-watch',
  },
  LedgerMovementRule: {
    label: 'ledger rule',
    shape: 'objectId',
    href: () => '/ledger-watch',
  },
  LedgerWatch: {
    // entityId is the literal 'sweep' — there is no document behind it.
    label: 'ledger sweep',
    shape: 'opaque',
    href: () => '/ledger-watch',
  },
  Conversation: {
    label: 'chat',
    shape: 'objectId',
    href: (entityId) => (isObjectId(entityId) ? `/inbox?c=${entityId}&lens=all` : null),
  },
  Record: { label: 'record', shape: 'objectId' },
  DocumentAsk: { label: 'document request', shape: 'objectId' },
  DocumentKind: { label: 'document type', shape: 'objectId' },
  // Both of these land on the list rather than the row: verified that neither
  // AllUsersPage nor AdminsPage reads a selection query param, and a link that
  // silently ignores half of itself is worse than one that admits it goes to
  // the list. Give them a `?user=` / `?admin=` when those pages learn to read it.
  User: { label: 'person', shape: 'objectId', href: () => '/users' },
  Admin: { label: 'admin', shape: 'objectId', href: () => '/settings/team' },
  // The id is the email typed at the login form, so there is nothing to open —
  // the account may not even exist, which is the point of most of these rows.
  Auth: { label: 'sign-in', shape: 'opaque' },
  StaffWorkItem: { label: 'staff work', shape: 'objectId' },
  AiTurn: { label: 'AI answer', shape: 'objectId', href: () => '/ai-answers' },
  AssistSession: { label: 'assistant session', shape: 'objectId' },
  AssistBlock: { label: 'assistant block', shape: 'opaque' },
  AssistKnowledgeBase: { label: 'assistant knowledge', shape: 'opaque' },
  BankHoliday: { label: 'bank holiday', shape: 'objectId', href: () => '/bank-holidays' },
  FestivalSetting: { label: 'festival greeting', shape: 'objectId', href: () => '/festival' },
};

/**
 * The dealer an audit row is about, when it can be known from the id ALONE.
 *
 * Returns `null` rather than guessing. `'GLOBAL'`, an email and an S3 key all
 * arrive here under `entity: 'Dealer'`, and each of them must come back null.
 */
export function dealerIdFromEntityId(entity: string, entityId: string): string | null {
  const ref = AUDIT_ENTITY_REFS[entity];
  if (!ref) return null;
  if (ref.shape === 'dealerId') return isObjectId(entityId) ? entityId : null;
  if (ref.shape === 'dealerDay') return splitDealerDay(entityId)?.dealerId ?? null;
  return null;
}

/** One audit row's target, rendered. */
export interface AuditTargetDescription {
  /** "outlet 15E", "run", "sign-in akshat@example.com" — never a bare hex id. */
  text: string;
  label: string;
  /** Where tapping goes, or `null` when this id cannot open anything. */
  href: string | null;
  /** True when `text` fell back to the raw id because nothing resolved it. */
  isRawId: boolean;
}

/**
 * Turn a stored audit row into something a person can read and tap.
 *
 * `name` is what the server resolved (a dealer code, a person's name). When it
 * is absent the id is shown, because a row that hides its identifier entirely is
 * worse than one that shows an ugly one — but it is marked `isRawId` so the UI
 * can set it in a monospace face and stop pretending it is prose.
 */
export function describeAuditTarget(input: {
  entity: string;
  entityId: string;
  name?: string | null;
  dealerId?: string | null;
}): AuditTargetDescription {
  const ref = AUDIT_ENTITY_REFS[input.entity];
  const label = ref?.label ?? input.entity;
  const dealerId = input.dealerId ?? dealerIdFromEntityId(input.entity, input.entityId);
  const href = ref?.href?.(input.entityId, dealerId ?? null) ?? null;
  const name = input.name?.trim() || null;
  // A sentinel is more informative than the id it stands in for, and it is
  // already a word, so it is shown as one.
  const sentinel = !isObjectId(input.entityId) && input.entityId.length <= 24;
  const raw = name ?? (sentinel ? input.entityId : null);
  // A sentinel that already IS the label reads as a stutter — the ledger sweep
  // writes entityId 'sweep' under label 'ledger sweep', which would render as
  // "ledger sweep sweep".
  const shown = raw && label.toLowerCase().includes(raw.toLowerCase()) ? null : raw;
  return {
    text: shown ? `${label} ${shown}` : label,
    label,
    href,
    isRawId: !shown,
  };
}
