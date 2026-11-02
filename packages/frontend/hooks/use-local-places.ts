import { usePlatformFiles } from '@oxy.so/bloom/platform-surface';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocale } from '@/hooks/use-locale';
import { deviceFolderUri, hasLocalFiles } from '@/lib/local-files';
import type { LocalPlace } from '@/lib/local-places';

const PLACES_KEY = ['platform-places'] as const;

/**
 * The places on this device: the platform's (the home, its standard folders,
 * the volumes), following them as volumes come and go; or, where the platform
 * has none, the folder `expo-file-system` gives Dropsea. Empty where this
 * platform has no files of its own (a browser).
 */
export function useLocalPlaces(): { places: readonly LocalPlace[]; isLoading: boolean } {
  const files = usePlatformFiles();
  const { strings } = useLocale();
  const queryClient = useQueryClient();
  const isAvailable = hasLocalFiles();
  const query = useQuery({
    queryKey: PLACES_KEY,
    queryFn: async () => {
      if (!files) return [];
      return files.places();
    },
    enabled: isAvailable && files !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (!files) return undefined;
    return files.watchPlaces(() => {
      queryClient.invalidateQueries({ queryKey: PLACES_KEY });
    });
  }, [files, queryClient]);

  if (!isAvailable) return { places: [], isLoading: false };
  if (!files) {
    return {
      places: [{ kind: 'device', name: strings.places.device, uri: deviceFolderUri() }],
      isLoading: false,
    };
  }
  const places = (query.data ?? []).map((place) => ({
    kind: place.kind,
    // The standard folders in the person's language; the home and the volumes by their own names.
    name:
      place.kind === 'home' || place.kind === 'volume' ? place.name : strings.places[place.kind],
    uri: place.uri,
  }));
  return { places, isLoading: query.isPending };
}
