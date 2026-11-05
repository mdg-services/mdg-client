import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { duOtpKey, invalidateDuOtp } from '@/hooks/api/useDuOtp';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';
import type { DuOtpAckView } from '@dk/shared/types';

/**
 * Keep the DU OTP box live. When an event appears on IndianOil's portal, the owner
 * answers a step on another phone, a submit starts or finishes, or the certificate
 * fetch moves, the server says so and the box's view is asked for again.
 *
 * The payload only names the outlet; what changed is read from the server, never
 * from the event. Only this user's own outlet matters, so another outlet's event
 * (an admin socket hears all of them) asks for nothing. After a reconnect the app
 * may have missed an update, so it asks then too.
 *
 * Asking is cheap when no box is on screen: with nobody reading the view, the
 * cache entry is only marked out of date and nothing is fetched.
 *
 * Mounted once in the app frame, beside the setup cards' own.
 */
export function useDuOtpSocket() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);

  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const refresh = () => invalidateDuOtp(qc);
    const onChanged = (payload: { dealerId: string }) => {
      // The user's own outlet; failing that, the one the box already drew.
      const mine = dealerId ?? qc.getQueryData<DuOtpAckView>(duOtpKey)?.dealerId ?? null;
      if (mine && payload.dealerId !== mine) return;
      refresh();
    };

    const offReconnect = onSocketReconnect(socket, refresh);
    socket.on('duOtp:changed', onChanged);
    return () => {
      offReconnect();
      socket.off('duOtp:changed', onChanged);
    };
  }, [token, dealerId, qc]);
}
