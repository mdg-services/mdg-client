import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { declarationsKey, invalidateDeclarations } from '@/hooks/api/useDeclarations';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';
import type { DeclarationsView } from '@dk/shared/types';

/**
 * Keep the Declarations box live. When a run files the washroom declaration, the
 * owner answers on another phone, or an admin presses a button, the server says so
 * and the box's view is asked for again.
 *
 * The payload only names the outlet; what changed is read from the server, never
 * from the event. Only this user's own outlet matters. After a reconnect the app
 * may have missed an update, so it asks then too. Asking is cheap when no box is
 * on screen: the cache entry is only marked out of date and nothing is fetched.
 *
 * Mounted once in the app frame, beside the Mock Drill box's own.
 */
export function useDeclarationsSocket() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const dealerId = useAuthStore((s) => s.user?.dealerId ?? null);

  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const refresh = () => invalidateDeclarations(qc);
    const onChanged = (payload: { dealerId: string }) => {
      // The user's own outlet; failing that, the one the box already drew.
      const mine = dealerId ?? qc.getQueryData<DeclarationsView>(declarationsKey)?.dealerId ?? null;
      if (mine && payload.dealerId !== mine) return;
      refresh();
    };

    const offReconnect = onSocketReconnect(socket, refresh);
    socket.on('declarations:changed', onChanged);
    return () => {
      offReconnect();
      socket.off('declarations:changed', onChanged);
    };
  }, [token, dealerId, qc]);
}
