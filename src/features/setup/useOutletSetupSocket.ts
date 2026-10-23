import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { invalidatePortalLogins } from '@/hooks/api/usePortalLogins';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';

import { invalidateOutletSetup } from './useOutletSetup';

/**
 * Keep the setup cards and strip live. When MDG's team does its part (sends the
 * bill, records the payment, starts the services) or the dealer's own save moves
 * the outlet on, the server says so and the view is asked for again. The login
 * box is asked again with it: "the logins are in" is one of the things that moves
 * the stage.
 *
 * The payload only names the outlet; what changed is read from the server, never
 * from the event. Mounted once in the app frame. After a reconnect the app may
 * have missed an update, so it asks then too.
 */
export function useOutletSetupSocket() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const refresh = () => {
      invalidateOutletSetup(qc);
      invalidatePortalLogins(qc);
    };
    const offReconnect = onSocketReconnect(socket, refresh);
    socket.on('outletSetup:changed', refresh);
    return () => {
      offReconnect();
      socket.off('outletSetup:changed', refresh);
    };
  }, [token, qc]);
}
