import { RiGalleryLine } from '@oxy.so/bloom/icons';
import { Browser } from '@/components/Browser';
import { useAlbums } from '@/hooks/use-albums';
import { useLocale } from '@/hooks/use-locale';
import { useViewer } from '@/hooks/use-viewer';
import { dropseaBackend, HAS_DROPSEA_BACKEND } from '@/lib/dropsea-api';
import { albumEntry } from '@/lib/items';

/** The person's albums, each opened as a folder is. */
export default function AlbumsScreen() {
  const { strings } = useLocale();
  const { isSignedIn, isResolving } = useViewer();
  const albums = useAlbums();
  return (
    <Browser
      listing={{
        location: { kind: 'albums' },
        title: strings.albums,
        items: (albums.data ?? []).map(albumEntry),
        status: !isSignedIn
          ? isResolving
            ? 'loading'
            : 'signed-out'
          : !HAS_DROPSEA_BACKEND
            ? 'unavailable'
            : albums.isPending
              ? 'loading'
              : albums.isError
                ? 'error'
                : 'ready',
        layout: 'files',
        empty: { icon: RiGalleryLine, title: strings.empty.albums, hint: strings.empty.albumsHint },
        onRetry: () => {
          dropseaBackend.retryNow();
          albums.refetch();
        },
      }}
    />
  );
}
