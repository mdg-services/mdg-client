import type { Conversation } from '@dk/shared/types';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export function useMyConversation() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['conversation', 'mine'],
    enabled: !!token,
    queryFn: () => api.get<Conversation>('/v1/conversations/mine'),
    staleTime: 60_000,
  });
}
