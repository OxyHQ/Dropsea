import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { BackendError } from '@/lib/backend-link';
import { dropseaBackend } from '@/lib/dropsea-api';

/** Whether a query failed because Dropsea's backend could not be reached. */
function isUnreachable(error: unknown): boolean {
  return error instanceof BackendError && error.reason === 'unreachable';
}

/**
 * Dropsea's React Query client, given to `OxyProvider`, which persists and
 * restores it. A request to Dropsea's backend is never retried here: its link
 * (`lib/dropsea-api`) keeps the one schedule every request to it follows.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 60_000,
      retry: (failureCount, error) => !(error instanceof BackendError) && failureCount < 2,
    },
    mutations: { networkMode: 'offlineFirst' },
  },
});

// When the backend's link says to try again, what is on screen and failed for want of the backend
// loads again. A load already under way is joined, never cancelled for another.
dropseaBackend.onRetryDue(() => {
  queryClient
    .refetchQueries(
      { type: 'active', predicate: (query) => isUnreachable(query.state.error) },
      { cancelRefetch: false },
    )
    .catch((error: unknown) =>
      console.warn('Dropsea could not load again what failed for want of its backend', error),
    );
});

// The window back at the front (OxyProvider follows the app's state) and the network coming back
// (OxyProvider follows the device's connectivity) bring the backend's next try forward.
focusManager.subscribe((isFocused) => {
  if (isFocused) dropseaBackend.resume();
});
onlineManager.subscribe((isOnline) => {
  if (isOnline) dropseaBackend.resume();
});
