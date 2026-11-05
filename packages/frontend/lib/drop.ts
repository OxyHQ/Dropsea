/**
 * What dropping dragged items somewhere does, if anything: local items move
 * into a local folder, local files go up to Oxy Files, photos join an album.
 * A target that would do nothing does not light.
 */
import { type Item, itemKind, type LocalItem, type Location } from '@/lib/items';
import { isSameUri, isWithinUri, type LocalPlace, parentUri } from '@/lib/local-places';

export type DropTarget =
  | { kind: 'folder'; uri: string }
  | { kind: 'cloud' }
  | { kind: 'album'; albumId: string };

export type DropAction = 'move' | 'upload' | 'add-to-album';

function isLocal(item: Item): item is LocalItem {
  return item.source === 'local';
}

/**
 * Whether a folder is one of the items at `uris` or inside one: nothing they are goes there, as
 * nothing goes inside itself. A drop there drops nothing, as a drop on what Finder drags does.
 */
export function isWithinAny(folderUri: string, uris: readonly string[]): boolean {
  return uris.some((uri) => isWithinUri(folderUri, uri));
}

/**
 * The first of the items at `uris` that is one of the platform's places (the home, its standard
 * folders, a volume): a place stays where it is, as a Mac's home folders do, so a move that holds
 * one moves nothing.
 */
export function placeAmong(
  uris: readonly string[],
  places: readonly LocalPlace[],
): LocalPlace | null {
  for (const uri of uris) {
    const place = places.find((each) => isSameUri(each.uri, uri));
    if (place) return place;
  }
  return null;
}

/**
 * What files dropped into a folder do (from any application, Dropsea among them): go there (a
 * copy, or a move); nothing, dropped into one of them or inside one, as a drop on what Finder
 * drags does; or nothing for a move holding one of the platform's places, which says why.
 */
export type FilesDrop =
  | { kind: 'go' }
  | { kind: 'into-itself' }
  | { kind: 'place'; place: LocalPlace };

export function filesDrop(
  uris: readonly string[],
  folderUri: string,
  action: 'copy' | 'move',
  places: readonly LocalPlace[],
): FilesDrop {
  if (isWithinAny(folderUri, uris)) return { kind: 'into-itself' };
  const place = action === 'move' ? placeAmong(uris, places) : null;
  return place ? { kind: 'place', place } : { kind: 'go' };
}

/**
 * Whether local items may move into a folder: never into one of them or
 * inside one, and not where they all already are.
 */
export function canMoveInto(items: readonly LocalItem[], folderUri: string): boolean {
  if (items.length === 0) return false;
  if (
    isWithinAny(
      folderUri,
      items.map((item) => item.uri),
    )
  )
    return false;
  return !items.every((item) => isSameUri(parentUri(item.uri), folderUri));
}

/** Whether an item is a photo an album can hold: an image, from this device or Oxy Files. */
function isAlbumPhoto(item: Item): boolean {
  return (item.source === 'local' || item.source === 'cloud') && itemKind(item) === 'image';
}

export function dropAction(items: readonly Item[], target: DropTarget): DropAction | null {
  if (items.length === 0) return null;
  switch (target.kind) {
    case 'folder': {
      if (!items.every(isLocal)) return null;
      const local = items.filter(isLocal);
      return canMoveInto(local, target.uri) ? 'move' : null;
    }
    case 'cloud':
      return items.every((item) => isLocal(item) && !item.isFolder) ? 'upload' : null;
    case 'album':
      return items.every(isAlbumPhoto) ? 'add-to-album' : null;
  }
}

/**
 * Where files dropped from any application (Dropsea among them) go: into the folder of this device
 * dropped on, else into the folder shown; nowhere in Oxy Files, the photos, the albums or the
 * Trash.
 */
export function dropFolderFor(location: Location, target: Item | null): string | null {
  if (target && target.source === 'local' && target.isFolder) return target.uri;
  return location.kind === 'folder' ? location.uri : null;
}
