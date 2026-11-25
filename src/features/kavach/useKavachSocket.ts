import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { invalidateKavach } from '@/hooks/api/useKavach';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';

/**
 * Keep the Kavach tab live. The server says `kavach:changed` when a check of this outlet opens,
 * is checked, is sent back or closes (ADR 0057). The event names only the outlet; what changed is
 * read from the server. Only this member's own outlet matters, and after a reconnect the app asks
 * again, since it may have missed one. Asking is cheap when no screen is reading: the entry is only
 * marked out of date.
 *
 * Mounted once in the app frame, beside the other boxes' sockets.
 */
export function useKavachSocket() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);

  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const refresh = () => invalidateKavach(qc);
    const onChanged = (payload: { dealerId: string }) => {
      if (dealerId && payload.dealerId !== dealerId) return;
      refresh();
    };

    const offReconnect = onSocketReconnect(socket, refresh);
    socket.on('kavach:changed', onChanged);
    return () => {
      offReconnect();
      socket.off('kavach:changed', onChanged);
    };
  }, [token, dealerId, qc]);
}
