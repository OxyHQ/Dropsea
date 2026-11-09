import { toast } from '@oxy.so/bloom/toast';
import type { Album } from '@dropsea/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { albumsKey } from '@/hooks/use-albums';
import { useLocale } from '@/hooks/use-locale';
import { useTransfers } from '@/hooks/use-transfers';
import { useViewer } from '@/hooks/use-viewer';
import { DROPSEA_APPLICATION_ID } from '@/lib/config';
import type { AlbumPhoto, Item, LocalItem } from '@/lib/items';
import { oxyServices } from '@/lib/oxy';
import {
  addAlbumItems,
  createAlbum,
  deleteAlbum,
  listAlbumItems,
  removeAlbumItem,
  updateAlbum,
} from '@/lib/dropsea-api';

/** Photos added in one request, as Dropsea's backend takes them. */
const ADD_BATCH_SIZE = 100;

/** The link that says an album uses a photo: what lets Dropsea read it, and the person's to take back. */
function albumLink(albumId: string) {
  return { app: DROPSEA_APPLICATION_ID, entityType: 'album', entityId: albumId };
}

/**
 * Albums and what is in them. A photo joins an album as Dropsea's rules say:
 * the person's own client uploads it (from this device) and links it to
 * Dropsea, and only then asks the backend to add it; leaving an album unlinks it.
 */
export function useAlbumActions() {
  const queryClient = useQueryClient();
  const { strings } = useLocale();
  const { userId } = useViewer();
  const transfers = useTransfers();
  const refreshAlbums = () => queryClient.invalidateQueries({ queryKey: albumsKey(userId) });

  const unlinkAll = async (albumId: string, assetIds: readonly string[]) => {
    const results = await Promise.allSettled(
      assetIds.map((assetId) => oxyServices.assets.unlink(assetId, albumLink(albumId))),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn('Dropsea could not unlink a photo from an album', {
          albumId,
          assetId: assetIds[index],
          error: result.reason,
        });
      }
    });
  };

  return {
    async create(name: string): Promise<Album | null> {
      try {
        const album = await createAlbum({ name });
        await refreshAlbums();
        return album;
      } catch (error) {
        console.warn('Dropsea could not make an album', { name, error });
        toast.error(strings.couldNotChange);
        return null;
      }
    },

    async rename(album: Album, name: string): Promise<void> {
      try {
        await updateAlbum(album.id, { name });
      } catch (error) {
        console.warn('Dropsea could not rename an album', { albumId: album.id, error });
        toast.error(strings.couldNotChange);
      }
      await refreshAlbums();
    },

    /** Deletes an album; its photos stay in Oxy Files, no longer linked to it. */
    async remove(album: Album): Promise<void> {
      try {
        const assetIds: string[] = [];
        let cursor: string | null = null;
        do {
          const page = await listAlbumItems(album.id, cursor, 'person');
          assetIds.push(...page.items.map((item) => item.assetId));
          cursor = page.nextCursor;
        } while (cursor);
        await deleteAlbum(album.id);
        await unlinkAll(album.id, assetIds);
      } catch (error) {
        console.warn('Dropsea could not delete an album', { albumId: album.id, error });
        toast.error(strings.couldNotChange);
      }
      await refreshAlbums();
    },

    /** Adds photos from this device (uploaded first) or Oxy Files to an album. */
    async add(album: Album, items: readonly Item[]): Promise<void> {
      const local = items.filter((item): item is LocalItem => item.source === 'local');
      const uploaded = local.length > 0 ? await transfers.uploadLocal(local) : [];
      const assetIds = [
        ...uploaded,
        ...items.flatMap((item) => (item.source === 'cloud' ? [item.assetId] : [])),
      ];
      if (assetIds.length === 0) return;
      try {
        const linked = await Promise.allSettled(
          assetIds.map((assetId) => oxyServices.assets.link(assetId, albumLink(album.id))),
        );
        const linkedIds = assetIds.filter((_, index) => linked[index]?.status === 'fulfilled');
        linked.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.warn('Dropsea could not link a photo to an album', {
              assetId: assetIds[index],
              error: result.reason,
            });
          }
        });
        let added = 0;
        let rejected = assetIds.length - linkedIds.length;
        for (let start = 0; start < linkedIds.length; start += ADD_BATCH_SIZE) {
          const response = await addAlbumItems(
            album.id,
            linkedIds.slice(start, start + ADD_BATCH_SIZE),
          );
          added += response.items.length;
          rejected += response.rejectedAssetIds.length;
          await unlinkAll(album.id, response.rejectedAssetIds);
        }
        if (added > 0) toast.success(strings.transfers.addedToAlbum(added, album.name));
        if (rejected > 0) toast.warning(strings.transfers.rejected(rejected));
      } catch (error) {
        console.warn('Dropsea could not add photos to an album', { albumId: album.id, error });
        toast.error(strings.couldNotChange);
      }
      await refreshAlbums();
    },

    async removePhotos(photos: readonly AlbumPhoto[]): Promise<void> {
      const results = await Promise.allSettled(
        photos.map((photo) => removeAlbumItem(photo.albumId, photo.itemId)),
      );
      const removed = photos.filter((_, index) => results[index]?.status === 'fulfilled');
      if (removed.length < photos.length) toast.error(strings.couldNotChange);
      for (const photo of removed) await unlinkAll(photo.albumId, [photo.assetId]);
      await refreshAlbums();
    },
  };
}
