import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api, type ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { VerifyCheckoutInput } from '@dk/shared/schemas';
import type {
  DealerPayment,
  DealerPaymentsList,
  GstDocumentDownload,
  PaymentCheckout,
} from '@dk/shared/types';

/**
 * The dealer's side of the payments API (ADR 0022 §6). Every route is scoped to
 * the signed-in outlet by the server, and a payment of another outlet is a 404.
 * Nothing here sends an amount: the dealer names WHICH payment, and the server
 * reads the amount off its own row.
 */

export const paymentsQueryKey = ['payments'] as const;
export const paymentsListQueryKey = [...paymentsQueryKey, 'list'] as const;
export const paymentQueryKey = (id: string) => [...paymentsQueryKey, 'one', id] as const;

const base = (id: string) => `/v1/payments/me/${encodeURIComponent(id)}`;

/**
 * Every payment of this outlet, newest first.
 *
 * `staleTime: 0` where the app default is two minutes: a payment can be paid
 * from a link on another phone while this screen sits in the background, and a
 * list that still says "Due" for a payment that was paid a minute ago is worse
 * than one more small request.
 */
export function usePaymentsList() {
  const token = useAuthStore((s) => s.token);
  return useQuery<DealerPaymentsList>({
    queryKey: paymentsListQueryKey,
    enabled: !!token,
    staleTime: 0,
    queryFn: () => api.get<DealerPaymentsList>('/v1/payments/me'),
  });
}

/** One payment, for its own screen and its receipt. */
export function usePayment(id: string | undefined) {
  const token = useAuthStore((s) => s.token);
  return useQuery<DealerPayment>({
    queryKey: paymentQueryKey(id ?? ''),
    enabled: !!token && !!id,
    staleTime: 0,
    queryFn: () => api.get<DealerPayment>(base(id as string)),
  });
}

/**
 * Put a payment the server just returned into the caches, so the list and the
 * detail screen show it at once rather than after the next refetch. `put` only
 * writes; the confirming loop calls it every few seconds, and a list refetch
 * each time would be twenty requests for nothing. `invalidateAll` is the one
 * read-everything-again, for when the loop ends or a 409 says the row changed
 * in a way we did not see.
 */
export function usePaymentCache() {
  const qc = useQueryClient();
  return React.useMemo(
    () => ({
      put(row: DealerPayment) {
        qc.setQueryData<DealerPayment>(paymentQueryKey(row.id), row);
        qc.setQueryData<DealerPaymentsList>(paymentsListQueryKey, (old) =>
          old ? { ...old, items: old.items.map((p) => (p.id === row.id ? row : p)) } : old,
        );
      },
      invalidateAll() {
        void qc.invalidateQueries({ queryKey: paymentsQueryKey });
      },
    }),
    [qc],
  );
}

/** Ask for a Razorpay order for this payment (409 `PAYMENT_NOT_PAYABLE` unless due). */
export function useStartCheckout() {
  return useMutation<PaymentCheckout, ApiError, string>({
    mutationFn: (id) => api.post<PaymentCheckout>(`${base(id)}/checkout`),
  });
}

/** Hand the pop-up's three values to the server, which checks them with Razorpay. */
export function useVerifyPayment() {
  return useMutation<DealerPayment, ApiError, { id: string; body: VerifyCheckoutInput }>({
    mutationFn: ({ id, body }) => api.post<DealerPayment>(`${base(id)}/verify`, body),
  });
}

/** Ask the server to look at Razorpay again. It answers at most once per 5 s per row. */
export function useRefreshPayment() {
  return useMutation<DealerPayment, ApiError, string>({
    mutationFn: (id) => api.post<DealerPayment>(`${base(id)}/refresh`),
  });
}

/**
 * A short-lived link to the PDF of one GST invoice or credit note of this
 * payment (ADR 0022 §11), with the file name to save it under. Asked for at the
 * moment of the tap, never kept: the link expires within minutes, and the
 * server checks every time that the document belongs to this outlet's payment.
 *
 * This is a read of something already paid for — not a way to pay — so it is
 * not behind `canPayHere()`.
 */
export function fetchGstDocumentLink(
  paymentId: string,
  documentId: string,
): Promise<GstDocumentDownload> {
  return api.get<GstDocumentDownload>(`${base(paymentId)}/documents/${encodeURIComponent(documentId)}`);
}
