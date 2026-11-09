/**
 * Khata Kavach sign-ins: every ask for a WhatsApp code, as the admin's page shows it.
 *
 * Khata Kavach keeps one row per ask (its `signinAttempts`); Meta's report on the message arrives here, on the
 * WhatsApp webhook. The server joins the two by Meta's message id and works out, in plain words, what became of
 * the code: `story` is the sentence the page prints, so no admin has to read a status code.
 */

export const KK_SIGNIN_INTENTS = ['join', 'start', 'primary'] as const;
export type KkSigninIntent = (typeof KK_SIGNIN_INTENTS)[number];

export const KK_SIGNIN_RESULTS = ['sent', 'repeat', 'send-failed', 'turned-away', 'review', 'error'] as const;
export type KkSigninResult = (typeof KK_SIGNIN_RESULTS)[number];

/** What WhatsApp itself says happened to the message. `none` = it never told us anything about it. */
export const KK_SIGNIN_DELIVERY = ['read', 'delivered', 'failed', 'sent', 'none', 'not-sent'] as const;
export type KkSigninDelivery = (typeof KK_SIGNIN_DELIVERY)[number];

/** How the page colours the row: fine, worth a look, or a person must act. */
export type KkSigninVerdict = 'ok' | 'info' | 'waiting' | 'problem';

export interface KkSigninRow {
  id: string;
  at: string;
  intent: KkSigninIntent;
  /** The number the code was for (91XXXXXXXXXX). Super-admin only. */
  phone: string;
  pumpCode: string | null;
  pumpName: string | null;
  result: KkSigninResult;
  delivery: KkSigninDelivery;
  deliveredAt: string | null;
  /** What WhatsApp said when it could not deliver (its number and title). */
  deliveryError: { code: number | null; title: string | null } | null;
  /** What WhatsApp said when it refused to take the message at all. */
  sendError: { status?: number; code?: number; network?: string } | null;
  typedRight: boolean;
  wrongTries: number;
  outcome: 'joined' | 'started' | 'handed-over' | null;
  verdict: KkSigninVerdict;
  /** The one sentence: what happened and why, in plain words. */
  story: string;
}

export interface KkSigninList {
  /** False when this server has no way to read Khata Kavach's records (the setting is not there). */
  connected: boolean;
  rows: KkSigninRow[];
  counts: { total: number; problems: number; waiting: number; gotIn: number };
}
