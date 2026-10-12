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
