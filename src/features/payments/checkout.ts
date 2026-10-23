import type { VerifyCheckoutInput } from '@dk/shared/schemas';
import type { PaymentCheckout } from '@dk/shared/types';

/**
 * Razorpay's pop-up, as little of it as this app needs (ADR 0022 §4).
 *
 * Nothing here is the Razorpay SDK — there is no package for it. The browser
 * loads Razorpay's own script, which puts a `Razorpay` constructor on `window`,
 * and the three types below say only the part of it that we call. That keeps
 * the dealer's first download unchanged: the script is fetched when a dealer is
 * about to pay, never before.
 *
 * WHAT THIS FILE DOES NOT DO. It never chooses an amount. Every number in the
 * options comes from the `PaymentCheckout` the server returned for this payment,
 * and the pop-up's own success message is a HINT, not proof — the caller posts
 * it to the server, which checks the signature and asks Razorpay itself
 * (ADR §2 rules 2 and 3).
 */

export const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/** How long to wait for the script on a bad link before saying it did not load. */
const LOAD_TIMEOUT_MS = 30_000;

/** The brand's own near-black, used when the live token cannot be read. */
const BRAND_FALLBACK = '#18181b';

/** What the pop-up's success handler is given. Razorpay's own key names. */
interface RazorpaySuccess {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}

/** What `payment.failed` is given. `description` is Razorpay's plain reason. */
interface RazorpayFailed {
  error?: { code?: string; description?: string; reason?: string };
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; contact?: string; email?: string };
  theme?: { color: string };
  modal?: { ondismiss?: () => void; confirm_close?: boolean };
  handler: (response: RazorpaySuccess) => void;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: RazorpayFailed) => void) => void;
}

declare global {
  interface Window {
    /** Present once Razorpay's checkout script has loaded. */
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

/**
 * Why the pop-up did not give us a payment.
 *
 *  - `script`    Razorpay's script would not load (offline, blocked, too slow).
 *  - `dismissed` the dealer closed the pop-up. `failed` is true when a try had
 *                already failed inside it (a declined card, a cancelled UPI
 *                request), and `lastFailure` is Razorpay's reason for the last one.
 *  - `invalid`   the pop-up refused to open or answered with something unusable.
 */
export type CheckoutErrorKind = 'script' | 'dismissed' | 'invalid';

export class CheckoutError extends Error {
  readonly kind: CheckoutErrorKind;
  readonly failed: boolean;
  readonly lastFailure: string | null;

  constructor(
    kind: CheckoutErrorKind,
    message: string,
    detail: { failed?: boolean; lastFailure?: string | null } = {},
  ) {
    super(message);
    this.name = 'CheckoutError';
    this.kind = kind;
    this.failed = detail.failed ?? false;
    this.lastFailure = detail.lastFailure ?? null;
  }
}

// One load for the whole session. A failed load clears it, so the next tap on
// Pay tries again instead of replaying the same failure for ever.
let scriptPromise: Promise<void> | null = null;

/**
 * Load Razorpay's checkout script, once. Safe to call as often as you like: the
 * same promise comes back until a load fails.
 */
export function loadCheckoutScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new CheckoutError('script', 'No browser to load the script into'));
  }
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    const timer: { id?: ReturnType<typeof window.setTimeout> } = {};
    const fail = (why: string) => {
      if (timer.id !== undefined) window.clearTimeout(timer.id);
      el.remove();
      scriptPromise = null;
      reject(new CheckoutError('script', why));
    };
    el.src = CHECKOUT_SCRIPT_URL;
    el.async = true;
    el.onload = () => {
      if (timer.id !== undefined) window.clearTimeout(timer.id);
      // Loaded but nothing on `window`: an ad blocker or a proxy that answered
      // with an empty file. Same outcome for the dealer as a failed load.
      if (window.Razorpay) resolve();
      else fail('The checkout script loaded but did not start');
    };
    el.onerror = () => fail('The checkout script could not be loaded');
    timer.id = window.setTimeout(
      () => fail('The checkout script took too long to load'),
      LOAD_TIMEOUT_MS,
    );
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/** Forget the cached load and remove the script tag. For tests only. */
export function resetCheckoutScript(): void {
  scriptPromise = null;
  document.querySelectorAll(`script[src="${CHECKOUT_SCRIPT_URL}"]`).forEach((el) => el.remove());
}

/**
 * The pop-up's accent colour, read from the app's own brand token so the two
 * never drift apart. Razorpay paints its button in this colour with white text,
 * so a light value (the token inverts to near-white in the dark theme) would
 * leave the label unreadable — that case, and an unreadable token, fall back to
 * the brand's near-black.
 */
export function brandColor(): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim();
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(raw);
    if (m) {
      const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h as string, 16));
      // Perceived brightness, 0–255. White text needs a dark button.
      const brightness = (299 * (r as number) + 587 * (g as number) + 114 * (b as number)) / 1000;
      if (brightness < 140) return raw.toLowerCase();
    }
  } catch {
    // A styleless page (some test and preview contexts) is not worth a failed payment.
  }
  return BRAND_FALLBACK;
}

/**
 * Open the pop-up for one payment and wait for how it ends.
 *
 * Resolves with the three values Razorpay hands back after a successful payment,
 * named the way `POST /payments/me/:id/verify` expects them. Rejects with a
 * `CheckoutError` when the dealer closes the pop-up (`dismissed`) or it cannot
 * open (`invalid`).
 *
 * A FAILED TRY DOES NOT END IT. Razorpay keeps the pop-up open after a declined
 * card or a cancelled UPI request so the dealer can try another way, and the
 * same pop-up may still end in a success. So `payment.failed` is reported
 * through `onFailed` as it happens and only remembered for the rejection if the
 * dealer then gives up.
 *
 * `loadCheckoutScript()` must have resolved first.
 */
export function openCheckout(
  checkout: PaymentCheckout,
  onFailed?: (description: string | null) => void,
): Promise<VerifyCheckoutInput> {
  return new Promise<VerifyCheckoutInput>((resolve, reject) => {
    const Razorpay = typeof window === 'undefined' ? undefined : window.Razorpay;
    if (!Razorpay) {
      reject(new CheckoutError('script', 'The checkout script is not loaded'));
      return;
    }
    // A defensive floor, not a second source of truth: the amount is the
    // server's, and a value that is not whole paise could only be a bug.
    if (!Number.isInteger(checkout.amountPaise) || checkout.amountPaise <= 0) {
      reject(new CheckoutError('invalid', 'The payment has no valid amount'));
      return;
    }

    let settled = false;
    let failed = false;
    let lastFailure: string | null = null;

    const prefill: NonNullable<RazorpayOptions['prefill']> = {};
    if (checkout.prefill.name) prefill.name = checkout.prefill.name;
    if (checkout.prefill.contact) prefill.contact = checkout.prefill.contact;
    if (checkout.prefill.email) prefill.email = checkout.prefill.email;

    try {
      const instance = new Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: checkout.amountPaise,
        currency: checkout.currency,
        name: checkout.name,
        description: checkout.description,
        prefill,
        theme: { color: brandColor() },
        modal: {
          // A UPI request is answered in another app; a stray tap outside the
          // pop-up while waiting would otherwise throw the whole attempt away.
          confirm_close: true,
          ondismiss: () => {
            if (settled) return;
            settled = true;
            reject(
              new CheckoutError('dismissed', 'The payment window was closed', {
                failed,
                lastFailure,
              }),
            );
          },
        },
        handler: (response) => {
          if (settled) return;
          settled = true;
          const { razorpay_order_id: orderId, razorpay_payment_id: paymentId } = response;
          const signature = response.razorpay_signature;
          if (!orderId || !paymentId || !signature) {
            reject(new CheckoutError('invalid', 'The payment window answered without a receipt'));
            return;
          }
          resolve({
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            razorpaySignature: signature,
          });
        },
      });
      instance.on('payment.failed', (response) => {
        failed = true;
        lastFailure =
          response?.error?.description?.trim() || response?.error?.reason?.trim() || null;
        onFailed?.(lastFailure);
      });
      instance.open();
    } catch (err) {
      if (settled) return;
      settled = true;
      reject(
        new CheckoutError(
          'invalid',
          err instanceof Error ? err.message : 'The payment window could not open',
        ),
      );
    }
  });
}
