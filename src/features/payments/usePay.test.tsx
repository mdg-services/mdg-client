import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/lib/api';
import type * as ApiModule from '@/lib/api';
import { useLangStore } from '@/store/lang';
import { makeCheckout, makePaidPayment, makePayment } from '@/test/payments';
import { makeTestQueryClient, renderHookWithProviders, resetStores, signIn } from '@/test/utils';
import type { DealerPayment } from '@dk/shared/types';

import type * as CheckoutModule from './checkout';
import { CheckoutError, loadCheckoutScript, openCheckout } from './checkout';
import { CONFIRM_MAX_MS, CONFIRM_POLL_MS, usePay } from './usePay';

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});
vi.mock('./checkout', async (orig) => {
  const actual = await orig<typeof CheckoutModule>();
  return { ...actual, loadCheckoutScript: vi.fn(), openCheckout: vi.fn() };
});

const POPUP_RESULT = {
  razorpayOrderId: 'order_Qx12AbCdEf',
  razorpayPaymentId: 'pay_Qx12AbCdEfGh34',
  razorpaySignature: 'a'.repeat(64),
};

/** What each of the three routes answers; every test sets the ones it uses. */
const server = {
  checkout: vi.fn<() => unknown>(),
  verify: vi.fn<() => unknown>(),
  refresh: vi.fn<() => unknown>(),
};

/** Make a route answer with a row, or fail with an ApiError. */
const answers = (row: DealerPayment) => () => Promise.resolve(row);
const fails = (status: number, code: string) => () =>
  Promise.reject(new ApiError(status, code, `${code} (server text)`));
const networkDown = () => Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Network error'));

beforeEach(() => {
  signIn({ dealerId: 'd1' });
  useLangStore.setState({ lang: 'en', explicit: true });

  vi.mocked(loadCheckoutScript).mockResolvedValue(undefined);
  vi.mocked(openCheckout).mockResolvedValue(POPUP_RESULT);
  server.checkout.mockImplementation(() => Promise.resolve(makeCheckout()));

  vi.mocked(api.post).mockImplementation(((path: string) => {
    if (path.endsWith('/checkout')) return server.checkout();
    if (path.endsWith('/verify')) return server.verify();
    if (path.endsWith('/refresh')) return server.refresh();
    return Promise.reject(new Error(`unexpected POST ${path}`));
  }) as typeof api.post);
});

afterEach(() => {
  vi.useRealTimers();
  resetStores();
});

function setup() {
  const queryClient = makeTestQueryClient();
  const hook = renderHookWithProviders(() => usePay('p1'), { queryClient });
  return { ...hook, queryClient };
}

/** Tap Pay and let everything that does not need a timer run. */
async function tapPay(result: { current: ReturnType<typeof usePay> }) {
  await act(async () => {
    await result.current.pay();
  });
}

describe('usePay — the happy path', () => {
  it('asks for an order, opens the pop-up, verifies it, and is done when the server says paid', async () => {
    server.verify.mockImplementation(answers(makePaidPayment({ id: 'p1' })));
    const { result } = setup();

    await tapPay(result);

    expect(result.current.phase).toEqual({ name: 'done' });
    expect(api.post).toHaveBeenNthCalledWith(1, '/v1/payments/me/p1/checkout');
    expect(openCheckout).toHaveBeenCalledWith(makeCheckout());
    expect(api.post).toHaveBeenNthCalledWith(2, '/v1/payments/me/p1/verify', POPUP_RESULT);
    expect(await screen.findByText('Payment received. Thank you.')).toBeInTheDocument();
  });

  // The browser names WHICH payment. The amount is the server's, every time.
  it('never sends an amount to the server', async () => {
    server.verify.mockImplementation(answers(makePaidPayment({ id: 'p1' })));
    const { result } = setup();

    await tapPay(result);

    for (const call of vi.mocked(api.post).mock.calls) {
      expect(JSON.stringify(call[1] ?? {}).toLowerCase()).not.toContain('amount');
    }
  });

  it('shows the paid row in the caches at once', async () => {
    const paid = makePaidPayment({ id: 'p1' });
    server.verify.mockImplementation(answers(paid));
    const { result, queryClient } = setup();
    queryClient.setQueryData(['payments', 'list'], { items: [makePayment({ id: 'p1' })] });

    await tapPay(result);

    expect(queryClient.getQueryData(['payments', 'one', 'p1'])).toEqual(paid);
    expect(queryClient.getQueryData(['payments', 'list'])).toEqual({ items: [paid] });
  });

  it('ignores a second tap while the first is still going', async () => {
    server.verify.mockImplementation(answers(makePaidPayment({ id: 'p1' })));
    const { result } = setup();

    await act(async () => {
      await Promise.all([result.current.pay(), result.current.pay()]);
    });

    expect(server.checkout).toHaveBeenCalledTimes(1);
    expect(openCheckout).toHaveBeenCalledTimes(1);
  });
});

describe('usePay — waiting for the server to be sure', () => {
  // Only the clock: React's own scheduling must keep running for `act` to settle.
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));

  /**
   * Tap Pay without waiting for it to end, so the test can move the clock. The
   * promise comes back inside an object: returning it bare from an async
   * function would make the caller wait for it too.
   */
  async function startPay(result: { current: ReturnType<typeof usePay> }) {
    let finished: Promise<void> = Promise.resolve();
    await act(async () => {
      finished = result.current.pay();
      await vi.advanceTimersByTimeAsync(0);
    });
    return { finished };
  }

  it('asks again every 5 seconds when verify says it is not paid yet, and stops when it is', async () => {
    server.verify.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    server.refresh
      .mockImplementationOnce(answers(makePayment({ id: 'p1', status: 'processing' })))
      .mockImplementation(answers(makePaidPayment({ id: 'p1' })));
    const { result } = setup();

    const { finished } = await startPay(result);
    expect(result.current.phase).toEqual({ name: 'confirming' });
    expect(server.refresh).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIRM_POLL_MS);
    });
    expect(server.refresh).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toEqual({ name: 'confirming' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIRM_POLL_MS);
      await finished;
    });
    expect(server.refresh).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toEqual({ name: 'done' });

    // Nothing more once it is paid.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIRM_MAX_MS);
    });
    expect(server.refresh).toHaveBeenCalledTimes(2);
  });

  // The server allows 30 checkout / verify / refresh calls per user per 10 minutes
  // (mdg-backend payments router). A normal pay and confirm, even twice in a row
  // after closing the pop-up once, has to stay under that.
  it('keeps two full waits inside the server rate limit of 30 calls per 10 minutes', () => {
    const perAttempt = 1 /* checkout */ + 1 /* verify */ + CONFIRM_MAX_MS / CONFIRM_POLL_MS;
    expect(perAttempt * 2).toBeLessThan(30);
    // And never faster than the server's own 5-second refresh throttle.
    expect(CONFIRM_POLL_MS).toBeGreaterThanOrEqual(5_000);
  });

  it('after a minute without an answer says it is being confirmed — not paid, not failed', async () => {
    server.verify.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    server.refresh.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    const { result } = setup();

    const { finished } = await startPay(result);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIRM_MAX_MS - 1);
    });
    expect(result.current.phase).toEqual({ name: 'confirming' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await finished;
    });
    expect(result.current.phase).toEqual({ name: 'slow' });
    // 5 s, 10 s … 60 s.
    expect(server.refresh).toHaveBeenCalledTimes(CONFIRM_MAX_MS / CONFIRM_POLL_MS);
  });

  // The pop-up said success. If our own server could not be reached at that
  // moment the money may well have moved: that is "being confirmed", not "failed".
  it('keeps waiting when verify itself could not be reached', async () => {
    server.verify.mockImplementation(networkDown);
    server.refresh.mockImplementation(answers(makePaidPayment({ id: 'p1' })));
    const { result } = setup();

    const { finished } = await startPay(result);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIRM_POLL_MS);
      await finished;
    });

    expect(result.current.phase).toEqual({ name: 'done' });
  });

  it('keeps asking through a dropped connection', async () => {
    server.verify.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    server.refresh
      .mockImplementationOnce(networkDown)
      .mockImplementationOnce(fails(500, 'INTERNAL'))
      .mockImplementation(answers(makePaidPayment({ id: 'p1' })));
    const { result } = setup();

    const { finished } = await startPay(result);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIRM_POLL_MS * 3);
      await finished;
    });

    expect(result.current.phase).toEqual({ name: 'done' });
    expect(server.refresh).toHaveBeenCalledTimes(3);
  });

  it('stops asking at once when the server says too many requests', async () => {
    server.verify.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    server.refresh.mockImplementation(fails(429, 'RATE_LIMITED'));
    const { result } = setup();

    const { finished } = await startPay(result);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIRM_POLL_MS);
      await finished;
    });

    expect(result.current.phase).toEqual({ name: 'slow' });
    expect(server.refresh).toHaveBeenCalledTimes(1);
  });

  it('stops asking when the dealer leaves the screen', async () => {
    server.verify.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    server.refresh.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    const { result, unmount } = setup();

    const { finished } = await startPay(result);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIRM_POLL_MS);
    });
    expect(server.refresh).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONFIRM_MAX_MS);
      await finished;
    });
    expect(server.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('usePay — when it does not go through', () => {
  it('says the pop-up was not completed when it is closed and nothing was paid', async () => {
    vi.mocked(openCheckout).mockRejectedValue(
      new CheckoutError('dismissed', 'closed', { failed: false, lastFailure: null }),
    );
    server.refresh.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    const { result } = setup();

    await tapPay(result);

    expect(result.current.phase).toEqual({ name: 'failed', key: 'payments.err.notCompleted' });
    // It looked once before saying so, and never tried to verify a payment it did not get.
    expect(server.refresh).toHaveBeenCalledTimes(1);
    expect(server.verify).not.toHaveBeenCalled();
  });

  // Razorpay's text is English; the dealer gets our phrase for what it means.
  it('puts Razorpay’s reason into the dealer’s own words, never as Razorpay wrote it', async () => {
    vi.mocked(openCheckout).mockRejectedValue(
      new CheckoutError('dismissed', 'closed', {
        failed: true,
        lastFailure: 'Your card was declined by the bank',
      }),
    );
    server.refresh.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    const { result } = setup();

    await tapPay(result);

    expect(result.current.phase).toEqual({
      name: 'failed',
      key: 'payments.err.failedWith',
      vars: { reason: 'the bank did not accept it' },
    });
    expect(JSON.stringify(result.current.phase)).not.toContain('declined by the bank');
  });

  it('shows nothing of a reason it cannot place', async () => {
    vi.mocked(openCheckout).mockRejectedValue(
      new CheckoutError('dismissed', 'closed', {
        failed: true,
        lastFailure: 'BAD_REQUEST_ERROR: odd thing',
      }),
    );
    server.refresh.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    const { result } = setup();

    await tapPay(result);

    expect(result.current.phase).toEqual({ name: 'failed', key: 'payments.err.failed' });
  });

  it('says a try failed even when Razorpay gave no reason', async () => {
    vi.mocked(openCheckout).mockRejectedValue(
      new CheckoutError('dismissed', 'closed', { failed: true, lastFailure: null }),
    );
    server.refresh.mockImplementation(answers(makePayment({ id: 'p1', status: 'due' })));
    const { result } = setup();

    await tapPay(result);

    expect(result.current.phase).toEqual({ name: 'failed', key: 'payments.err.failed' });
  });

  // They paid in their UPI app and shut the pop-up before it called back.
  it('is done when the pop-up was closed but the server finds the money', async () => {
    vi.mocked(openCheckout).mockRejectedValue(new CheckoutError('dismissed', 'closed'));
    server.refresh.mockImplementation(answers(makePaidPayment({ id: 'p1' })));
    const { result } = setup();

    await tapPay(result);

    expect(result.current.phase).toEqual({ name: 'done' });
  });

  it('says the payment cannot be paid any more on a 409, and reads the rows again', async () => {
    server.checkout.mockImplementation(fails(409, 'PAYMENT_NOT_PAYABLE'));
    const { result, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await tapPay(result);

    expect(result.current.phase).toEqual({ name: 'failed', key: 'payments.err.notPayable' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['payments'] });
    expect(openCheckout).not.toHaveBeenCalled();
  });

  it('says payments are not switched on yet on a 503', async () => {
    server.checkout.mockImplementation(fails(503, 'PAYMENTS_NOT_CONFIGURED'));
    const { result } = setup();

    await tapPay(result);

    expect(result.current.phase).toEqual({ name: 'failed', key: 'payments.err.notConfigured' });
  });

  // A 503 that is not "keys are off" is a busy server, and passes.
  it.each(['RAZORPAY_UNREACHABLE', 'PAYMENT_PROVIDER_ERROR', 'HTTP_503'])(
    'says to try again in a minute on a 503 %s, not that payments are off',
    async (code) => {
      server.checkout.mockImplementation(fails(503, code));
      const { result } = setup();

      await tapPay(result);

      expect(result.current.phase).toEqual({ name: 'failed', key: 'payments.err.provider' });
    },
  );

  it('says the window did not load when Razorpay’s script cannot be fetched', async () => {
    vi.mocked(loadCheckoutScript).mockRejectedValue(new CheckoutError('script', 'offline'));
    const { result } = setup();

    await tapPay(result);

    expect(result.current.phase).toEqual({ name: 'failed', key: 'payments.err.script' });
    expect(openCheckout).not.toHaveBeenCalled();
  });

  it('says the window could not open when the pop-up throws', async () => {
    vi.mocked(openCheckout).mockRejectedValue(new CheckoutError('invalid', 'boom'));
    const { result } = setup();

    await tapPay(result);

    expect(result.current.phase).toEqual({ name: 'failed', key: 'payments.err.window' });
  });

  it('does not keep waiting when the server refuses the signature', async () => {
    server.verify.mockImplementation(fails(400, 'BAD_SIGNATURE'));
    const { result } = setup();

    await tapPay(result);

    expect(result.current.phase).toEqual({ name: 'failed', key: 'payments.err.badSignature' });
    expect(server.refresh).not.toHaveBeenCalled();
  });

  it('lets the dealer try again after a failure', async () => {
    server.checkout.mockImplementationOnce(networkDown);
    server.verify.mockImplementation(answers(makePaidPayment({ id: 'p1' })));
    const { result } = setup();

    await tapPay(result);
    expect(result.current.phase).toMatchObject({ name: 'failed', key: 'common.networkError' });

    await tapPay(result);
    expect(result.current.phase).toEqual({ name: 'done' });
  });
});
