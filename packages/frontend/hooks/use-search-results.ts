/**
 * What the platform's index finds for a search, as Finder's search window
 * shows it: asked again whenever the index changes (a file saved, renamed,
 * tagged), never by a walk of the disk. The platform answers in milliseconds,
 * so nothing is debounced: each query is its own, an answer for a query since
 * changed is never shown for the new one, and the last answer stays shown
 * until the next arrives, so the results never blink empty between keys.
 */
import type { PlatformSearch, PlatformSearchQuery } from '@oxy.so/bloom/platform-surface';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/** Every search's query, which a change to the index invalidates. */
const SEARCH_KEY = ['platform-search'] as const;

export function useSearchResults(search: PlatformSearch | null, query: PlatformSearchQuery | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!search) return undefined;
    return search.watch(() => {
      queryClient.invalidateQueries({ queryKey: SEARCH_KEY });
    });
  }, [search, queryClient]);
  return useQuery({
    queryKey: [...SEARCH_KEY, query],
    queryFn: () => {
      if (!search || !query) throw new Error('Dropsea asked for a search with nothing to search');
      return search.query(query);
    },
    enabled: search !== null && query !== null,
    placeholderData: keepPreviousData,
    // The index is the truth and says when it changes: an answer is asked
    // afresh each time a search is shown, never kept for later or retried.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}
