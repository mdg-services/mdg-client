import type {
  DealerAutopay,
  DealerAutopayStatus,
  DealerPayment,
  GstDocumentSummary,
  PaymentCheckout,
} from '@dk/shared/types';

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
    invoice: null,
    creditNotes: [],
    autopayOn: null,
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

/**
 * The GST invoice of the ₹4,999 payment, issued the moment it was paid, for an
 * outlet in our own state: ₹4,236.44 of value + CGST and SGST of ₹381.28 each.
 * The figures are written out, not worked out, so a change to the shared split
 * shows up as a failing test instead of as two matching mistakes.
 */
export function makeInvoice(overrides: Partial<GstDocumentSummary> = {}): GstDocumentSummary {
  return {
    id: 'g1',
    kind: 'invoice',
    number: 'MDG/26-27/00001',
    issuedAt: '2026-10-05T09:50:30.000Z',
    taxablePaise: 423644,
    cgstPaise: 38128,
    sgstPaise: 38128,
    igstPaise: 0,
    roundOffPaise: 0,
    totalPaise: 499900,
    againstNumber: null,
    ...overrides,
  };
}

/** The same invoice for an outlet in another state: ₹4,236.44 + IGST ₹762.56. */
export function makeInterStateInvoice(
  overrides: Partial<GstDocumentSummary> = {},
): GstDocumentSummary {
  return makeInvoice({ cgstPaise: 0, sgstPaise: 0, igstPaise: 76256, ...overrides });
}

/**
 * The credit note for a ₹500 refund of that invoice. ₹500 does not split
 * evenly, so rounding leaves a paisa over: a Round off line of −₹0.01.
 */
export function makeCreditNote(overrides: Partial<GstDocumentSummary> = {}): GstDocumentSummary {
  return {
    id: 'g2',
    kind: 'credit_note',
    number: 'MDGCN/26-27/0001',
    issuedAt: '2026-10-12T05:30:00.000Z',
    taxablePaise: 42373,
    cgstPaise: 3814,
    sgstPaise: 3814,
    igstPaise: 0,
    roundOffPaise: -1,
    totalPaise: 50000,
    againstNumber: 'MDG/26-27/00001',
    ...overrides,
  };
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

/**
 * The owner's autopay as `GET /payments/me/autopay` returns it: on, ₹3,540 a
 * month (₹3,000 + 18% GST) for pump 15E, next taken on 24 Nov, paid till 24 Nov,
 * outside the first month.
 */
export function makeAutopay(overrides: Partial<DealerAutopay> = {}): DealerAutopay {
  return {
    state: 'on',
    outletCode: '15E',
    amountPaise: 354000,
    nextDebitOn: '2026-11-24',
    paidThrough: '2026-11-24',
    debitInProgress: false,
    stoppedAt: null,
    firstMonthRefundable: false,
    ...overrides,
  };
}

/** The same, wrapped the way the API answers (an autopay, or null for nothing to show). */
export function makeAutopayStatus(
  overrides: Partial<DealerAutopay> | null = {},
): DealerAutopayStatus {
  return { autopay: overrides === null ? null : makeAutopay(overrides) };
}
