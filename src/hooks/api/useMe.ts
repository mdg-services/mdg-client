import type { User } from '@dk/shared/types';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export function useMe() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  return useQuery({
    queryKey: ['me'],
    enabled: !!token,
    queryFn: async () => {
      const user = await api.get<User>('/v1/me');
      setUser(user);
      return user;
    },
  });
}
