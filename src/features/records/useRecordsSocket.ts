import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { getSocket } from '@/lib/socket';
import { onSocketReconnect } from '@/lib/socketReconnect';
import { useAuthStore } from '@/store/auth';
import type { DealerRecord } from '@dk/shared/types';

/**
 * Listens for `record:new` socket events and refreshes the records shelf.
 * Shows a gentle toast so the dealer knows a new report has arrived.
 */
export function useRecordsSocket() {
  const qc = useQueryClient();
  const toast = useToast();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const onNewRecord = (_payload: { record: DealerRecord }) => {
      void qc.invalidateQueries({ queryKey: ['records'] });
      toast.info('A new report is ready', {
        description: 'Open Reports to view it.',
      });
    };

    // On a RE-connect, refresh the shelf to catch any record:new events that
    // fired while the socket was down. Skipped on the first connect (the initial
    // query covers it). Backs up refetchOnReconnect for socket-only drops where
    // the network never went offline.
    const offReconnect = onSocketReconnect(socket, () => {
      void qc.invalidateQueries({ queryKey: ['records'] });
    });

    socket.on('record:new', onNewRecord);
    return () => {
      socket.off('record:new', onNewRecord);
      offReconnect();
    };
  }, [token, qc, toast]);
}
