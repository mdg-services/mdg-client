/**
 * Khata Kavach sign-ins: every ask for a WhatsApp code, as the admin's page shows it.
 *
 * Khata Kavach keeps one row per ask (its `signinAttempts`); Meta's report on the message arrives here, on the
 * WhatsApp webhook. The server joins the two by Meta's message id and works out, in plain words, what became of
 * the code: `story` is the sentence the page prints, so no admin has to read a status code.
 */

/** What a code was asked for: the pump's three, then a transporter's first owner and any of his people. */
export const KK_SIGNIN_INTENTS = ['join', 'start', 'primary', 'fleet-setup', 'fleet-signin'] as const;
export type KkSigninIntent = (typeof KK_SIGNIN_INTENTS)[number];

/** What the step a code was for did once it was typed. */
export const KK_SIGNIN_OUTCOMES = [
  'joined',
  'started',
  'handed-over',
  'fleet-setup',
  'fleet-signed-in',
  'fleet-pin-reset',
] as const;
export type KkSigninOutcome = (typeof KK_SIGNIN_OUTCOMES)[number];

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
  outcome: KkSigninOutcome | null;
  verdict: KkSigninVerdict;
  /**
   * A super-admin can press "Show code" for this ask: it is a sent code, still unused, still inside its ten minutes, and
   * the server holds the sealed copy. False for everything else (and always false if the feature is not set up).
   */
  codeAvailable: boolean;
  /** The one sentence: what happened and why, in plain words. */
  story: string;
}

export interface KkSigninList {
  /** False when this server has no way to read Khata Kavach's records (the setting is not there). */
  connected: boolean;
  rows: KkSigninRow[];
  counts: { total: number; problems: number; waiting: number; gotIn: number };
}

/** What "Show code" returns: the six digits, and when they stop being readable. Never cached, never listed. */
export interface KkSigninCode {
  code: string;
  expiresAt: string;
  /**
   * How long it stays readable, counted by the SERVER. The page counts down from this, not from `expiresAt` against its own
   * clock, so a laptop whose clock is wrong cannot keep a code on screen past the server's window.
   */
  expiresInMs: number;
}
