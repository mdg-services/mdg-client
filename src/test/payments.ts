import type { DealerPayment, PaymentCheckout } from '@dk/shared/types';

/** A payment as the dealer's API returns it: `due`, ₹4,999, nothing else filled in. */
export function makePayment(overrides: Partial<DealerPayment> = {}): DealerPayment {
  return {
    id: 'p1',
    number: 'MDG-2026-00012',
    title: 'Dealer Kavach — Nov 2026',
    purpose: 'subscription',
    note: null,
    amountPaise: 499900,
    currency: 'INR',
    status: 'due',
    dueDate: '2026-11-05',
    createdAt: '2026-10-20T06:00:00.000Z',
    paidAt: null,
    method: null,
    razorpayPaymentId: null,
    refundedPaise: 0,
    lastFailure: null,
    ...overrides,
  };
}

/** A payment that was paid by UPI at 15:20 IST on 5 Oct 2026. */
export function makePaidPayment(overrides: Partial<DealerPayment> = {}): DealerPayment {
  return makePayment({
    id: 'p2',
    number: 'MDG-2026-00007',
    title: 'Dealer Kavach — Oct 2026',
    status: 'paid',
    paidAt: '2026-10-05T09:50:00.000Z',
    method: 'upi',
    razorpayPaymentId: 'pay_Qx12AbCdEfGh34',
    ...overrides,
  });
}

/** What `POST …/checkout` returns for ₹4,999. */
export function makeCheckout(overrides: Partial<PaymentCheckout> = {}): PaymentCheckout {
  return {
    keyId: 'rzp_test_abc123',
    orderId: 'order_Qx12AbCdEf',
    amountPaise: 499900,
    currency: 'INR',
    name: 'MDG Services',
    description: 'Dealer Kavach — Nov 2026',
    number: 'MDG-2026-00012',
    prefill: { name: 'Ramesh Kumar', contact: '9876543210', email: null },
    ...overrides,
  };
}

/** Mark the page as running inside the Android app's WebView. */
export function enterNativeShell(): void {
  (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
    postMessage: () => undefined,
  };
}

/** Back in an ordinary browser. */
export function leaveNativeShell(): void {
  delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
}
