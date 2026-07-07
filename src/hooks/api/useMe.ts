import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { User } from '@dk/shared/types';

export function useMe() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  return useQuery({
    queryKey: ['me'],
    enabled: !!token,
    // The signed-in profile is stable for the whole session; don't re-fetch it
    // on a slow link just because the shell re-rendered.
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const user = await api.get<User>('/v1/me');
      setUser(user);
      return user;
    },
  });
}
