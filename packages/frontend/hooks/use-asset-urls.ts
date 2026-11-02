import { useQueries } from '@tanstack/react-query';
import { useViewer } from '@/hooks/use-viewer';
import { oxyServices } from '@/lib/oxy';

/** Assets resolved in one request. */
const CHUNK_SIZE = 50;
/** Oxy's signed URLs last ten minutes; Dropsea asks again well before. */
const URL_STALE_MS = 4 * 60 * 1000;

export interface AssetUrlRequest {
  assetId: string;
  /** A rendition (`thumb`), or the original. */
  variant?: string;
}

/** The key a request's URL has in `useAssetUrls`' map. */
export function assetUrlKey(request: AssetUrlRequest): string {
  return request.variant ? `${request.assetId}:${request.variant}` : request.assetId;
}

/**
 * URLs for assets, resolved with the person's own session
 * (`oxy.assets.urls`), in chunks so a long library is a few requests: the map
 * from each request's key (`assetId` or `assetId:variant`) to its URL. An
 * asset Oxy will not let them read is absent.
 */
export function useAssetUrls(requests: readonly AssetUrlRequest[]): ReadonlyMap<string, string> {
  const { userId, isSignedIn } = useViewer();
  const chunks: AssetUrlRequest[][] = [];
  for (let start = 0; start < requests.length; start += CHUNK_SIZE) {
    chunks.push(requests.slice(start, start + CHUNK_SIZE));
  }
  return useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: ['asset-urls', userId, chunk.map(assetUrlKey)],
      queryFn: async () => {
        const urls = await oxyServices.assets.urls(
          chunk.map((request) => ({ fileId: request.assetId, variant: request.variant })),
        );
        return chunk.flatMap((request): [string, string][] => {
          const url = urls[request.assetId];
          return url ? [[assetUrlKey(request), url]] : [];
        });
      },
      enabled: isSignedIn,
      staleTime: URL_STALE_MS,
    })),
    combine: (results) => new Map(results.flatMap((result) => result.data ?? [])),
  });
}
