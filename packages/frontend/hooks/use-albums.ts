import type { Album } from '@dropsea/shared-types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useViewer } from '@/hooks/use-viewer';
import { getAlbum, listAlbumItems, listAlbums } from '@/lib/dropsea-api';

/** The query key of a person's albums, which a change to any album invalidates. */
export function albumsKey(userId: string | null) {
  return ['albums', userId] as const;
}

export function useAlbums() {
  const { userId, isSignedIn } = useViewer();
  return useQuery({
    queryKey: albumsKey(userId),
    queryFn: listAlbums,
    enabled: isSignedIn,
  });
}

export function useAlbum(albumId: string) {
  const { userId, isSignedIn } = useViewer();
  return useQuery({
    queryKey: [...albumsKey(userId), albumId],
    queryFn: () => getAlbum(albumId),
    enabled: isSignedIn,
  });
}

/** An album's photos, newest first, a page at a time. */
export function useAlbumItems(albumId: string) {
  const { userId, isSignedIn } = useViewer();
  return useInfiniteQuery({
    queryKey: [...albumsKey(userId), albumId, 'items'],
    queryFn: ({ pageParam }) => listAlbumItems(albumId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: isSignedIn,
  });
}

/** The album an id names among the person's albums, for a name shown before its own request answers. */
export function albumNamed(albums: readonly Album[] | undefined, albumId: string): Album | null {
  return albums?.find((album) => album.id === albumId) ?? null;
}
