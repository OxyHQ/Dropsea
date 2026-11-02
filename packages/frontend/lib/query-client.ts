import { QueryClient } from '@tanstack/react-query';

/** Dropsea's React Query client, given to `OxyProvider`, which persists and restores it. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'offlineFirst', staleTime: 60_000, retry: 2 },
    mutations: { networkMode: 'offlineFirst' },
  },
});
