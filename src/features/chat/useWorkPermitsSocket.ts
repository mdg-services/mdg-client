import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { invalidateWorkPermits } from '@/hooks/api/useWorkPermits';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';

/**
 * Keep the work-permit box live. When a run issues a permit, the portal moves it
 * a step, or the dealer answers on another phone, the server
 * says so and the view is asked for again.
 *
 * The payload only names the outlet; what changed is read from the server, never
 * from the event. Only this user's own outlet matters. After a reconnect the app
 * may have missed an update, so it asks then too. Asking is cheap when no box is
 * on screen: the cache entry is only marked out of date and nothing is fetched.
 *
 * Mounted once in the app frame, beside the complaints one.
 */
export function useWorkPermitsSocket() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);

  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const refresh = () => invalidateWorkPermits(qc);
    const onChanged = (payload: { dealerId: string }) => {
      if (dealerId && payload.dealerId !== dealerId) return;
      refresh();
    };

    const offReconnect = onSocketReconnect(socket, refresh);
    socket.on('workPermits:changed', onChanged);
    return () => {
      offReconnect();
      socket.off('workPermits:changed', onChanged);
    };
  }, [token, dealerId, qc]);
}
