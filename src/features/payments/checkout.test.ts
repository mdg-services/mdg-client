import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeCheckout } from '@/test/payments';

import {
  CHECKOUT_SCRIPT_URL,
  CheckoutError,
  brandColor,
  loadCheckoutScript,
  openCheckout,
  resetCheckoutScript,
} from './checkout';

/** The script tag the loader added, if any. */
function scriptTags(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT_URL}"]`),
  );
}

/** A stand-in for Razorpay's constructor that the test can drive by hand. */
class FakeRazorpay {
  static instances: FakeRazorpay[] = [];
  static throwOnOpen: Error | null = null;
  readonly listeners: Record<string, (r: unknown) => void> = {};
  readonly open = vi.fn(() => {
    if (FakeRazorpay.throwOnOpen) throw FakeRazorpay.throwOnOpen;
  });
  constructor(readonly options: Record<string, any>) {
    FakeRazorpay.instances.push(this);
  }
  on(event: string, cb: (r: unknown) => void) {
    this.listeners[event] = cb;
  }
}

function installRazorpay() {
  (window as unknown as { Razorpay?: unknown }).Razorpay = FakeRazorpay;
}

function lastInstance(): FakeRazorpay {
  const inst = FakeRazorpay.instances[FakeRazorpay.instances.length - 1];
  if (!inst) throw new Error('Razorpay was never constructed');
  return inst;
}

const SUCCESS = {
  razorpay_order_id: 'order_Qx12AbCdEf',
  razorpay_payment_id: 'pay_Qx12AbCdEfGh34',
  razorpay_signature: 'a'.repeat(64),
};

beforeEach(() => {
  FakeRazorpay.instances = [];
  FakeRazorpay.throwOnOpen = null;
});

afterEach(() => {
  resetCheckoutScript();
  delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  document.documentElement.style.removeProperty('--color-brand');
  vi.useRealTimers();
});

describe('loadCheckoutScript', () => {
  it('adds Razorpay’s script once and resolves when it has put Razorpay on the page', async () => {
    const first = loadCheckoutScript();
    const second = loadCheckoutScript();

    expect(second).toBe(first);
    expect(scriptTags()).toHaveLength(1);

    installRazorpay();
    scriptTags()[0]!.dispatchEvent(new Event('load'));
    await expect(first).resolves.toBeUndefined();

    // Loaded for good: asking again adds nothing.
    await loadCheckoutScript();
    expect(scriptTags()).toHaveLength(1);
  });

  it('does not add a script when Razorpay is already on the page', async () => {
    installRazorpay();
    await loadCheckoutScript();
    expect(scriptTags()).toHaveLength(0);
  });

  it('fails when the script cannot be fetched, and the next tap starts a fresh try', async () => {
    const first = loadCheckoutScript();
    scriptTags()[0]!.dispatchEvent(new Event('error'));

    await expect(first).rejects.toMatchObject({ name: 'CheckoutError', kind: 'script' });
    // The dead tag is gone, so it cannot be mistaken for a loaded one.
    expect(scriptTags()).toHaveLength(0);

    const retry = loadCheckoutScript();
    expect(scriptTags()).toHaveLength(1);
    installRazorpay();
    scriptTags()[0]!.dispatchEvent(new Event('load'));
    await expect(retry).resolves.toBeUndefined();
  });

  it('fails when the script loads but Razorpay never appears (a blocker answered with nothing)', async () => {
    const pending = loadCheckoutScript();
    scriptTags()[0]!.dispatchEvent(new Event('load'));
    await expect(pending).rejects.toMatchObject({ kind: 'script' });
    expect(scriptTags()).toHaveLength(0);
  });

  it('gives up after thirty seconds of nothing', async () => {
    vi.useFakeTimers();
    const pending = loadCheckoutScript();
    const settled = expect(pending).rejects.toMatchObject({ kind: 'script' });
    await vi.advanceTimersByTimeAsync(30_000);
    await settled;
    expect(scriptTags()).toHaveLength(0);
  });
});

describe('openCheckout', () => {
  beforeEach(() => installRazorpay());

  it('opens the pop-up with exactly what the server returned', async () => {
    const checkout = makeCheckout();
    const pending = openCheckout(checkout);
    const popup = lastInstance();

    expect(popup.open).toHaveBeenCalledTimes(1);
    expect(popup.options).toMatchObject({
      key: 'rzp_test_abc123',
      order_id: 'order_Qx12AbCdEf',
      amount: 499900,
      currency: 'INR',
      name: 'MDG Services',
      description: 'Dealer Kavach — Nov 2026',
      prefill: { name: 'Ramesh Kumar', contact: '9876543210' },
    });
    // A missing email is left out, not sent as null.
    expect(popup.options.prefill).not.toHaveProperty('email');
    expect(popup.options.modal.confirm_close).toBe(true);

    popup.options.handler(SUCCESS);
    await pending;
  });

  it('takes the amount from the server’s paise and from nowhere else', async () => {
    const pending = openCheckout(makeCheckout({ amountPaise: 123456 }));
    expect(lastInstance().options.amount).toBe(123456);
    lastInstance().options.handler(SUCCESS);
    await pending;
  });

  it('refuses to open for an amount that is not whole paise', async () => {
    await expect(openCheckout(makeCheckout({ amountPaise: 4999.5 }))).rejects.toMatchObject({
      kind: 'invalid',
    });
    await expect(openCheckout(makeCheckout({ amountPaise: 0 }))).rejects.toMatchObject({
      kind: 'invalid',
    });
    expect(FakeRazorpay.instances).toHaveLength(0);
  });

  it('colours the pop-up with the brand token', async () => {
    document.documentElement.style.setProperty('--color-brand', '#1d4ed8');
    const pending = openCheckout(makeCheckout());
    expect(lastInstance().options.theme).toEqual({ color: '#1d4ed8' });
    lastInstance().options.handler(SUCCESS);
    await pending;
  });

  it('resolves with the three values, named the way the verify call wants them', async () => {
    const pending = openCheckout(makeCheckout());
    lastInstance().options.handler(SUCCESS);

    await expect(pending).resolves.toEqual({
      razorpayOrderId: 'order_Qx12AbCdEf',
      razorpayPaymentId: 'pay_Qx12AbCdEfGh34',
      razorpaySignature: 'a'.repeat(64),
    });
  });

  it('rejects as dismissed when the dealer closes the pop-up, with nothing failed', async () => {
    const pending = openCheckout(makeCheckout());
    lastInstance().options.modal.ondismiss();

    const err = (await pending.catch((e: unknown) => e)) as CheckoutError;
    expect(err).toBeInstanceOf(CheckoutError);
    expect(err).toMatchObject({ kind: 'dismissed', failed: false, lastFailure: null });
  });

  it('reports a failed try as it happens, and remembers the last reason if the dealer gives up', async () => {
    const onFailed = vi.fn();
    const pending = openCheckout(makeCheckout(), onFailed);
    const popup = lastInstance();

    popup.listeners['payment.failed']!({
      error: { code: 'BAD_REQUEST_ERROR', description: 'Payment was cancelled by the customer' },
    });
    expect(onFailed).toHaveBeenCalledWith('Payment was cancelled by the customer');

    popup.listeners['payment.failed']!({
      error: { description: 'Your card was declined by the bank' },
    });
    popup.options.modal.ondismiss();

    await expect(pending).rejects.toMatchObject({
      kind: 'dismissed',
      failed: true,
      lastFailure: 'Your card was declined by the bank',
    });
    expect(onFailed).toHaveBeenCalledTimes(2);
  });

  it('knows a try failed even when Razorpay gives no reason', async () => {
    const onFailed = vi.fn();
    const pending = openCheckout(makeCheckout(), onFailed);
    lastInstance().listeners['payment.failed']!({ error: {} });
    lastInstance().options.modal.ondismiss();

    expect(onFailed).toHaveBeenCalledWith(null);
    await expect(pending).rejects.toMatchObject({ failed: true, lastFailure: null });
  });

  it('a failed try does not end it: a later success in the same pop-up still resolves', async () => {
    const pending = openCheckout(makeCheckout());
    const popup = lastInstance();
    popup.listeners['payment.failed']!({ error: { description: 'UPI request expired' } });
    popup.options.handler(SUCCESS);

    await expect(pending).resolves.toMatchObject({ razorpayPaymentId: 'pay_Qx12AbCdEfGh34' });
    // Closing afterwards changes nothing.
    popup.options.modal.ondismiss();
  });

  it('rejects when the success message is missing its signature', async () => {
    const pending = openCheckout(makeCheckout());
    lastInstance().options.handler({ ...SUCCESS, razorpay_signature: undefined });
    await expect(pending).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('rejects when the pop-up throws as it opens', async () => {
    FakeRazorpay.throwOnOpen = new Error('boom');
    await expect(openCheckout(makeCheckout())).rejects.toMatchObject({
      kind: 'invalid',
      message: 'boom',
    });
  });

  it('rejects as a script failure when Razorpay was never loaded', async () => {
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
    await expect(openCheckout(makeCheckout())).rejects.toMatchObject({ kind: 'script' });
  });
});

describe('brandColor', () => {
  it('reads the app’s brand token', () => {
    document.documentElement.style.setProperty('--color-brand', '#18181B');
    expect(brandColor()).toBe('#18181b');
  });

  it('falls back to the brand’s near-black when the token is missing', () => {
    expect(brandColor()).toBe('#18181b');
  });

  // The token turns near-white in the dark theme; white text on that is unreadable.
  it('does not paint the pop-up’s button in a light colour', () => {
    document.documentElement.style.setProperty('--color-brand', '#fafafa');
    expect(brandColor()).toBe('#18181b');
  });
});
