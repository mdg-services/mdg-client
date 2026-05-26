import { QueryClient } from '@tanstack/react-query';

const isDev = import.meta.env.DEV;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: !isDev,
    },
    mutations: { retry: 0 },
  },
});
