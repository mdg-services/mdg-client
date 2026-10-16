/**
 * Who a report is sent to when an admin presses Share.
 *
 * A dealer has two kinds of app member, and they read in different places:
 *  - every OWNER has a private chat with MDG of their own;
 *  - the MANAGER has the outlet's group chat, which the owners can also open.
 *
 * `owners` posts into EVERY active owner's own chat — not just the first one —
 * `managers` posts into the group chat, and `both` does the two. Each person is
 * notified once, in the chat where their copy landed.
 */
export const SHARE_AUDIENCES = ['owners', 'managers', 'both'] as const;
export type ShareAudience = (typeof SHARE_AUDIENCES)[number];

/** Which side of the outlet one posted copy went to. */
export type ShareDeliveryTo = 'owner' | 'manager';

/** One posted copy of a shared report: the chat it went into and the message. */
export interface ShareDelivery {
  to: ShareDeliveryTo;
  conversationId: string;
  messageId: string;
  /** DSR only: the sheets this copy carried. Absent = both (copies sent before sheets were split). */
  sheets?: DsrSheet[];
}

/** How many people a share reached, by side — what the admin's toast reports. */
export interface ShareRecipients {
  owners: number;
  managers: number;
}

/**
 * The common part of every share endpoint's answer. `conversationId` and
 * `messageId` are the FIRST copy, kept so callers written before a report could
 * go to more than one chat keep working.
 */
export interface ShareOutcome {
  alreadyShared: boolean;
  conversationId: string;
  messageId: string;
  /** Absent on a report shared before the audience choice existed. */
  audience?: ShareAudience;
  /** Absent on a report shared before the audience choice existed. */
  recipients?: ShareRecipients;
}

/**
 * The answer to an admin's message sent to the outlet
 * (`POST /conversations/:id/messages/share`): every copy it became.
 */
export interface ChatShareOutcome extends ShareOutcome {
  audience: ShareAudience;
  recipients: ShareRecipients;
  deliveries: ShareDelivery[];
}

/** Labels for the admin's chooser, in the order it lists them. */
export const SHARE_AUDIENCE_LABELS: Record<ShareAudience, string> = {
  owners: 'Owners',
  managers: 'Manager',
  both: 'Both',
};

/**
 * "Sent to 2 owners and the manager." — the admin's one-line confirmation.
 * Counts what was actually reached, so a "Both" on an outlet with no manager on
 * the app says "Sent to 2 owners." rather than claiming a manager got it.
 */
export function describeShareRecipients(r: ShareRecipients): string {
  const parts: string[] = [];
  if (r.owners > 0) parts.push(r.owners === 1 ? '1 owner' : `${r.owners} owners`);
  if (r.managers > 0) parts.push(r.managers === 1 ? 'the manager' : `${r.managers} managers`);
  return parts.length > 0 ? `Sent to ${parts.join(' and ')}.` : 'Sent.';
}

/* ─────────────── A DSR is two pictures, and each has its own audience ─────────────── */

/**
 * The two pictures a Daily Sales Report is sent as.
 *
 *  - `sales`     the daily-sales sheet: dips, stock, meters, testing and sales.
 *  - `variation` the stock-variation sheet: the since-inspection variation, the
 *                permissible band and the within/over-limit verdict.
 *
 * An owner can want the manager to see the day's sales and keep the variation
 * verdict to themselves, so each sheet is sent to its own people.
 */
export const DSR_SHEETS = ['sales', 'variation'] as const;
export type DsrSheet = (typeof DSR_SHEETS)[number];

/** Who one sheet goes to: a {@link ShareAudience}, or `none` — not sent. */
export const DSR_SHEET_AUDIENCES = ['none', 'owners', 'managers', 'both'] as const;
export type DsrSheetAudience = (typeof DSR_SHEET_AUDIENCES)[number];

/** Who gets each sheet — of one send, or as an outlet's saved rule. */
export interface DsrSheetPlan {
  sales: DsrSheetAudience;
  variation: DsrSheetAudience;
}

export const DSR_SHEET_LABELS: Record<DsrSheet, string> = {
  sales: 'Daily sales',
  variation: 'Stock variation',
};

export const DSR_SHEET_AUDIENCE_LABELS: Record<DsrSheetAudience, string> = {
  none: 'Not sent',
  owners: 'Owners',
  managers: 'Manager',
  both: 'Both',
};

/** Which chats an audience posts into: each owner's own chat, the manager's group chat. */
export function audienceSides(audience: DsrSheetAudience | ShareAudience | null | undefined): {
  owners: boolean;
  managers: boolean;
} {
  return {
    owners: audience === 'owners' || audience === 'both',
    managers: audience === 'managers' || audience === 'both',
  };
}

/** The audience made of these sides; `none` when neither. */
export function audienceFromSides(owners: boolean, managers: boolean): DsrSheetAudience {
  if (owners && managers) return 'both';
  if (owners) return 'owners';
  if (managers) return 'managers';
  return 'none';
}

/** The same people for both sheets — what a plain Owners / Manager / Both pick means. */
export function dsrPlanForAudience(audience: ShareAudience): DsrSheetPlan {
  return { sales: audience, variation: audience };
}

/**
 * A plain Owners / Manager / Both pick, held to an outlet's saved rule: each sheet
 * goes to the people picked AND allowed by the rule. A quick send can narrow a
 * rule, never widen it, so a one-tap send from the Today board cannot put a sheet
 * the owner keeps to themselves into the group chat. No rule: the pick, for both.
 */
export function capDsrPlan(
  pick: ShareAudience,
  rule: DsrSheetPlan | null | undefined,
): DsrSheetPlan {
  if (!rule) return dsrPlanForAudience(pick);
  const p = audienceSides(pick);
  const cap = (s: DsrSheetAudience): DsrSheetAudience => {
    const r = audienceSides(s);
    return audienceFromSides(p.owners && r.owners, p.managers && r.managers);
  };
  return { sales: cap(rule.sales), variation: cap(rule.variation) };
}

/** True when the plan sends at least one sheet to somebody. */
export function dsrPlanSendsAnything(plan: DsrSheetPlan): boolean {
  return plan.sales !== 'none' || plan.variation !== 'none';
}

/** Who holds one sheet of one report, counted in people on the app now. */
export interface DsrSheetHolders {
  /** Active owners whose own chat holds it. */
  owners: number;
  /** The manager's group chat holds it (and there is an active manager). */
  manager: boolean;
}

/**
 * Where one report's sheets stand — what the admin's share window is built from.
 * `GET /dsr/reports/:id/share-status`.
 */
export interface DsrShareStatus {
  reportId: string;
  /** Who is on the app right now. */
  outlet: { owners: number; manager: boolean };
  /** The outlet's saved rule, or null when it has none. */
  rule: DsrSheetPlan | null;
  /** Who holds THIS version of each sheet. */
  holders: Record<DsrSheet, DsrSheetHolders>;
  /**
   * Who holds an EARLIER version of each sheet — a regeneration replaced what
   * they were sent, and they have not been sent the new one. Null when nobody.
   */
  oldHolders: Record<DsrSheet, DsrSheetHolders> | null;
  /** Some copies were sent before MDG recorded who got what; the counts are a floor. */
  unrecorded: boolean;
  /** The plan the share window opens with: the rule, else who had the old copy, else owners. */
  suggested: DsrSheetPlan;
}

/** What a send of `plan` would add now, per sheet: owners' chats, and the group chat. */
export function dsrSendPreview(
  status: Pick<DsrShareStatus, 'outlet' | 'holders'>,
  plan: DsrSheetPlan,
): Record<DsrSheet, DsrSheetHolders> {
  const one = (sheet: DsrSheet): DsrSheetHolders => {
    const sides = audienceSides(plan[sheet]);
    const held = status.holders[sheet];
    return {
      owners: sides.owners ? Math.max(0, status.outlet.owners - held.owners) : 0,
      manager: sides.managers && status.outlet.manager && !held.manager,
    };
  };
  return { sales: one('sales'), variation: one('variation') };
}

/** "2 owners and the manager", "the manager", "nobody". */
export function describeHolders(h: DsrSheetHolders): string {
  const parts: string[] = [];
  if (h.owners > 0) parts.push(h.owners === 1 ? '1 owner' : `${h.owners} owners`);
  if (h.manager) parts.push('the manager');
  return parts.length > 0 ? parts.join(' and ') : 'nobody';
}

/** The answer to a DSR share: the common part, plus who now holds each sheet. */
export interface DsrShareOutcome extends ShareOutcome {
  /** Who holds each sheet of this version after the send. */
  holders?: Record<DsrSheet, DsrSheetHolders>;
  /**
   * One plain sentence per thing this send was asked to do and did not: nobody
   * of that side on the app, or a copy that failed to post. Absent when
   * everything asked for went out.
   */
  notReached?: string[];
}

/* ─────────────── Reports that carry credit money go to owners only ─────────────── */

/**
 * The cards that print the outlet's credit position — limits, dues, ledger
 * charges. They go to owners only: the manager's group chat is read by the
 * manager, and nothing posted there can be taken back. (Owner's decision,
 * 16 Oct 2026, matching what the assistant already tells a manager.)
 */
export const OWNERS_ONLY_SHARES = ['credit_dod', 'ledger_watch'] as const;
export type OwnersOnlyShare = (typeof OWNERS_ONLY_SHARES)[number];

/** The audiences an owners-only card may be sent to. */
export const OWNERS_ONLY_AUDIENCES: readonly ShareAudience[] = ['owners'];

/** The one line the admin is shown wherever Manager / Both is unavailable for such a card. */
export const OWNERS_ONLY_REASON = 'Credit figures go to owners only.';
