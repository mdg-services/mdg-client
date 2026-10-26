import * as React from 'react';

import { useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useT, type MessageKey, type TVars } from '@/lib/i18n';
import type { VerifyCheckoutInput } from '@dk/shared/schemas';
import type { DealerPayment } from '@dk/shared/types';

import { usePaymentCache, useRefreshPayment, useStartCheckout, useVerifyPayment } from './api';
import { CheckoutError, loadCheckoutScript, openCheckout } from './checkout';
import { failureReasonKey, paymentErrorKey } from './errors';
import { hasReceipt } from './paymentView';

/**
 * How often, and for how long, to ask the server whether the money has arrived.
 *
 * Five seconds, not less: the server looks at Razorpay at most once per 5 s per
 * payment anyway (a faster ask only gets the row back unchanged), and every ask
 * counts against the 30-per-10-minutes limit on checkout, verify and refresh. One
 * full wait is then at most 12 asks + checkout + verify = 14, so a dealer who
 * closes the pop-up and pays again straight away still stays under it.
 */
export const CONFIRM_POLL_MS = 5_000;
export const CONFIRM_MAX_MS = 60_000;

/**
 * Where one tap on Pay has got to.
 *
 *  - `starting`    asking the server for an order and loading Razorpay's script
 *  - `open`        Razorpay's pop-up is on screen
 *  - `checking`    the pop-up was closed; asking the server whether anything went through
 *  - `confirming`  the pop-up said it was paid; waiting for the server to be sure
 *  - `slow`        a minute passed and the server is still not sure — the money is
 *                  not lost, the webhook or the 10-minute check will settle it
 *  - `done`        paid, as the server reports it
 *  - `failed`      it did not happen; `key` says why in the dealer's words
 */
export type PayPhase =
  | { name: 'idle' }
  | { name: 'starting' }
  | { name: 'open' }
  | { name: 'checking' }
  | { name: 'confirming' }
  | { name: 'slow' }
  | { name: 'done' }
  | { name: 'failed'; key: MessageKey; vars?: TVars };

/** True while a tap on Pay is being worked on, so the button cannot be tapped twice. */
export function isBusy(phase: PayPhase): boolean {
  return (
    phase.name === 'starting' ||
    phase.name === 'open' ||
    phase.name === 'checking' ||
    phase.name === 'confirming'
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Pay one payment in the browser: order → pop-up → verify → wait for the server
 * to be sure (ADR 0022 §4).
 *
 * THE POP-UP'S "SUCCESS" IS A HINT. After it, the server checks the signature
 * and asks Razorpay itself, and until the row says it is paid we do not say it
 * is. If that takes more than a minute the dealer is told it is being
 * confirmed — never "paid" and never "failed", because the money may well have
 * left their account and the server will find it (webhook, or the check that
 * runs every ten minutes).
 *
 * A failed `verify` is treated the same way unless the server refused the
 * signature outright: the dealer may have paid, and a dropped connection at that
 * moment must not turn into "payment failed".
 */
export function usePay(paymentId: string) {
  const toast = useToast();
  const t = useT();
  const cache = usePaymentCache();
  const { mutateAsync: startCheckout } = useStartCheckout();
  const { mutateAsync: verifyPayment } = useVerifyPayment();
  const { mutateAsync: refreshPayment } = useRefreshPayment();

  const [phase, setPhaseState] = React.useState<PayPhase>({ name: 'idle' });
  const alive = React.useRef(true);
  const running = React.useRef(false);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setPhase = React.useCallback((next: PayPhase) => {
    if (alive.current) setPhaseState(next);
  }, []);

  /**
   * Ask the server until the row is paid, or a minute is up. `first` is the row
   * `verify` returned, when it did.
   *
   * Errors in the loop are swallowed on purpose: a dropped connection or a 5xx
   * says nothing about the payment. A 4xx (rate limit, signed out, gone) will
   * not get better by asking again, so it ends the wait early.
   */
  const waitForServer = React.useCallback(
    async (first: DealerPayment | null): Promise<'paid' | 'slow' | 'cancelled' | 'left'> => {
      if (first) {
        cache.put(first);
        if (hasReceipt(first.status)) return 'paid';
        if (first.status === 'cancelled') return 'cancelled';
      }
      const deadline = Date.now() + CONFIRM_MAX_MS;
      do {
        await sleep(CONFIRM_POLL_MS);
        if (!alive.current) return 'left';
        try {
          const row = await refreshPayment(paymentId);
          cache.put(row);
          if (hasReceipt(row.status)) return 'paid';
          if (row.status === 'cancelled') return 'cancelled';
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) return 'slow';
        }
      } while (Date.now() < deadline);
      return 'slow';
    },
    [cache, paymentId, refreshPayment],
  );

  const finish = React.useCallback(
    (outcome: 'paid' | 'slow' | 'cancelled' | 'left') => {
      if (outcome === 'left') return;
      cache.invalidateAll();
      if (outcome === 'paid') {
        setPhase({ name: 'done' });
        toast.success(t('payments.paidNow'));
      } else if (outcome === 'cancelled') {
        setPhase({ name: 'failed', key: 'payments.err.notPayable' });
      } else {
        setPhase({ name: 'slow' });
      }
    },
    [cache, setPhase, t, toast],
  );

  /** The pop-up was closed without a payment. Look once before saying so. */
  const afterDismiss = React.useCallback(
    async (err: CheckoutError) => {
      setPhase({ name: 'checking' });
      let row: DealerPayment | null = null;
      try {
        row = await refreshPayment(paymentId);
        cache.put(row);
      } catch {
        // Could not look. The words below are still true of what we know.
      }
      if (row && hasReceipt(row.status)) return finish('paid');
      if (row && row.status === 'processing') {
        setPhase({ name: 'confirming' });
        return finish(await waitForServer(row));
      }
      cache.invalidateAll();
      // Razorpay's own words are English and for developers: only our phrase for
      // what they mean is shown, and none at all when we cannot place them.
      const reasonKey = err.failed ? failureReasonKey(err.lastFailure) : null;
      if (reasonKey) {
        setPhase({
          name: 'failed',
          key: 'payments.err.failedWith',
          vars: { reason: t(reasonKey) },
        });
      } else if (err.failed) {
        setPhase({ name: 'failed', key: 'payments.err.failed' });
      } else {
        setPhase({ name: 'failed', key: 'payments.err.notCompleted' });
      }
    },
    [cache, finish, paymentId, refreshPayment, setPhase, t, waitForServer],
  );

  const pay = React.useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      setPhase({ name: 'starting' });
      const checkout = await startCheckout(paymentId);
      await loadCheckoutScript();
      if (!alive.current) return;

      setPhase({ name: 'open' });
      let result: VerifyCheckoutInput;
      try {
        result = await openCheckout(checkout);
      } catch (err) {
        if (err instanceof CheckoutError && err.kind === 'dismissed') {
          await afterDismiss(err);
          return;
        }
        throw err;
      }

      setPhase({ name: 'confirming' });
      let row: DealerPayment | null = null;
      try {
        row = await verifyPayment({ id: paymentId, body: result });
      } catch (err) {
        // Only a refusal of the signature is final. Anything else may be a
        // payment that went through while our connection did not.
        if (err instanceof ApiError && err.code === 'BAD_SIGNATURE') throw err;
      }
      finish(await waitForServer(row));
    } catch (err) {
      // A 409 means the row is no longer what the screen shows (paid on
      // another phone, or withdrawn): show it as it is now.
      if (err instanceof ApiError && err.status === 409) cache.invalidateAll();
      setPhase({ name: 'failed', key: paymentErrorKey(err) });
    } finally {
      running.current = false;
    }
  }, [
    afterDismiss,
    cache,
    finish,
    paymentId,
    setPhase,
    startCheckout,
    verifyPayment,
    waitForServer,
  ]);

  return { phase, pay };
}
