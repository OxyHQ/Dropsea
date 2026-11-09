import type { Album } from '@dropsea/shared-types';
import { useAlbumActions } from '@/hooks/use-album-actions';
import { useFileActions } from '@/hooks/use-file-actions';
import { useFileDrops } from '@/hooks/use-file-drops';
import { useLocale } from '@/hooks/use-locale';
import { canTag, type TagChange, useTagActions } from '@/hooks/use-tag-actions';
import { useTransfers } from '@/hooks/use-transfers';
import { useViewer } from '@/hooks/use-viewer';
import type { Selection } from '@/lib/selection';
import { canBrowseBackups, canBrowseVersions } from '@/lib/backups';
import { dropAction, dropFolderFor } from '@/lib/drop';
import {
  type AlbumPhoto,
  type Item,
  isContainer,
  itemKind,
  type LocalItem,
  type Location,
  type TrashItem,
} from '@/lib/items';
import { HAS_DROPSEA_BACKEND } from '@/lib/dropsea-api';
import { hasLocalFiles } from '@/lib/local-files';
import { folderName, isSameUri, type LocalPlace, uriName } from '@/lib/local-places';
import { downloadableOf } from '@/lib/transfers';
import { favouriteTags, type ItemTag, tagState, toggledTag } from '@/lib/tags';
import { type Change, useHistory } from '@/lib/undo';

/** Something the person can do now, from a menu, a key or a screen reader. */
export interface Command {
  isEnabled: boolean;
  run: () => void;
}

/** What asks the person first, because it cannot be undone. */
export type ConfirmRequest =
  | { kind: 'empty-trash' }
  | { kind: 'erase'; items: readonly TrashItem[] }
  | { kind: 'delete-for-good'; items: readonly LocalItem[] }
  | { kind: 'delete-album'; album: Album };

export interface CommandContext {
  location: Location;
  /** The items shown, in their order. */
  shown: readonly Item[];
  selected: readonly Item[];
  places: readonly LocalPlace[];
  albums: readonly Album[];
  /** The album the window shows, when it shows one. */
  album: Album | null;
  navigate: (location: Location) => void;
  preview: (item: Item) => void;
  startRename: (item: LocalItem) => void;
  confirm: (request: ConfirmRequest) => void;
  renameAlbum: (album: Album) => void;
  newAlbum: () => void;
  setSelection: (selection: Selection) => void;
  selectAll: () => void;
  /** Each item's tags, as the place read them. */
  tagsOf: (item: Item) => readonly ItemTag[];
  /** Opens the Tags… panel for items. */
  editTags: (items: readonly Item[]) => void;
  /** Opens Get Info for items. */
  getInfo: (items: readonly Item[]) => void;
  /** Opens an item's versions in the person's backups; null where there are none to browse. */
  browseVersions: ((item: LocalItem) => void) | null;
  /** Shows a folder as it was in the person's backups; null where there are none to browse. */
  browseBackups: ((folderUri: string) => void) | null;
}

function isLocal(item: Item): item is LocalItem {
  return item.source === 'local';
}

function isTrash(item: Item): item is TrashItem {
  return item.source === 'local-trash' || item.source === 'cloud-trash';
}

function isAlbumPhoto(item: Item): item is AlbumPhoto {
  return item.source === 'album-photo';
}

/** Where downloads go by default: the Downloads folder where the platform has one, else this device's. */
function defaultDownloadPlace(places: readonly LocalPlace[]): LocalPlace | null {
  return (
    places.find((place) => place.kind === 'downloads') ??
    places.find((place) => place.kind === 'device') ??
    null
  );
}

/** A change's name in the Edit menu: a move's or a copy's, of its one item or of how many. */
function changeName(
  change: Change,
  names: Record<Change['relocation'], (count: number, item: string) => string>,
): string {
  return names[change.relocation](change.items.length, uriName(change.items[0]?.to ?? ''));
}

function command(isEnabled: boolean, run: () => void): Command {
  return { isEnabled, run: () => (isEnabled ? run() : undefined) };
}

/**
 * Runs an action whose parts tell the person what failed themselves; logs
 * anything that escaped them, with what was being done.
 */
function runAsync(action: string, work: () => Promise<unknown>): void {
  work().catch((error: unknown) => console.warn(`Dropsea could not ${action}`, error));
}

/**
 * Everything the window can do for its location and selection, each enabled
 * or not, for the menu bar, the context menus, the keys and the screen
 * reader's actions alike.
 */
export function useCommands(context: CommandContext) {
  // Each part read on its own: what is made of one (a command's run) is kept
  // while that part stays the same. Read from `context`, a new object at every
  // render, everything made of it was new at every click.
  const {
    location,
    shown,
    selected,
    places,
    albums,
    album,
    navigate,
    preview,
    startRename,
    confirm,
    renameAlbum,
    newAlbum,
    setSelection,
    selectAll,
    tagsOf,
    editTags,
    getInfo,
    browseVersions,
    browseBackups,
  } = context;
  const fileActions = useFileActions();
  const fileDrops = useFileDrops(places);
  const transfers = useTransfers();
  const albumActions = useAlbumActions();
  const { isSignedIn, signIn } = useViewer();
  const { strings } = useLocale();
  const history = useHistory();
  const tagActions = useTagActions();

  const isInTrash = location.kind === 'trash';
  const isInFolder = location.kind === 'folder';
  const first = selected[0] ?? null;
  const localSelected = selected.filter(isLocal);
  // The platform's places (the home, its standard folders, a volume) stay where they are, as a
  // Mac's home folders do: never renamed, moved or put in the Trash.
  const isPlace = (item: Item) =>
    isLocal(item) && places.some((place) => isSameUri(place.uri, item.uri));
  const hasPlaceSelected = localSelected.some(isPlace);
  const isAllLocal = selected.length > 0 && localSelected.length === selected.length;
  const isAllCloud = selected.length > 0 && selected.every((item) => item.source === 'cloud');
  const downloadables = selected.flatMap((item) => {
    const downloadable = downloadableOf(item);
    return downloadable ? [downloadable] : [];
  });
  const isAllDownloadable = selected.length > 0 && downloadables.length === selected.length;
  const isAllUploadable = isSignedIn && isAllLocal && localSelected.every((item) => !item.isFolder);
  const photos = selected.filter(
    (item) => (item.source === 'local' || item.source === 'cloud') && itemKind(item) === 'image',
  );
  const isAllPhotos = isSignedIn && selected.length > 0 && photos.length === selected.length;
  const downloadPlace = defaultDownloadPlace(places);
  const albumSelected =
    first?.source === 'album' ? albums.find((each) => each.id === first.albumId) : null;
  const shownAlbum = album ?? (selected.length === 1 ? (albumSelected ?? null) : null);

  // Tags change on files of this device and Oxy Files' assets, never on albums or in a Trash.
  const isAllTaggable = selected.length > 0 && selected.every(canTag);
  const selectedTags = selected.map(tagsOf);
  const changeTags = (change: TagChange) =>
    runAsync('change tags', () => tagActions.change(selected, change));

  const open = (item: Item) => {
    if (item.source === 'local' && item.isFolder) navigate({ kind: 'folder', uri: item.uri });
    else if (item.source === 'album') navigate({ kind: 'album', albumId: item.albumId });
    else preview(item);
  };

  return {
    open: command(first !== null, () => {
      if (first) open(first);
    }),
    openItem: open,
    preview: command(first !== null && !isContainer(first), () => {
      if (first) preview(first);
    }),
    rename: command(
      isInFolder && selected.length === 1 && first !== null && isLocal(first) && !isPlace(first),
      () => {
        if (first && isLocal(first)) startRename(first);
      },
    ),
    newFolder: command(isInFolder, () => {
      if (location.kind !== 'folder') return;
      const made = fileActions.newFolder(location.uri);
      if (!made) return;
      setSelection({ keys: [made.key], anchor: made.key, focus: made.key });
      startRename(made);
    }),
    newAlbum: command(isSignedIn && HAS_DROPSEA_BACKEND, newAlbum),
    /** Into the Trash: the platform's for this device's items, Oxy Files' for its own. */
    moveToTrash: command(
      !isInTrash &&
        (isAllCloud || (isAllLocal && !hasPlaceSelected && fileActions.hasPlatformTrash)),
      () => runAsync('move items to the Trash', () => fileActions.moveToTrash(selected)),
    ),
    /** Deleting for good, where this device's items have no Trash to go to. */
    deleteForGood: command(isAllLocal && !hasPlaceSelected && !fileActions.hasPlatformTrash, () =>
      confirm({ kind: 'delete-for-good', items: localSelected }),
    ),
    hasPlatformTrash: fileActions.hasPlatformTrash,
    putBack: command(isInTrash && selected.length > 0, () =>
      runAsync('put items back', () => fileActions.putBack(selected.filter(isTrash))),
    ),
    eraseNow: command(isInTrash && selected.length > 0, () =>
      confirm({ kind: 'erase', items: selected.filter(isTrash) }),
    ),
    emptyTrash: command(
      (fileActions.hasPlatformTrash || isSignedIn) && (!isInTrash || shown.length > 0),
      () => confirm({ kind: 'empty-trash' }),
    ),
    upload: command(isAllUploadable, () =>
      runAsync('upload items', () => transfers.uploadLocal(localSelected)),
    ),
    uploadPicked: command(isSignedIn && !hasLocalFiles(), () =>
      runAsync('upload picked files', () => transfers.uploadPicked()),
    ),
    download: command(isAllDownloadable, () =>
      runAsync('download items', () => transfers.download(downloadables, downloadPlace)),
    ),
    downloadTo: places
      .filter((place) => place.kind !== 'volume' || hasLocalFiles())
      .map((place) => ({
        place,
        command: command(isAllDownloadable && hasLocalFiles(), () =>
          runAsync('download items', () => transfers.download(downloadables, place)),
        ),
      })),
    addToAlbum: albums.map((target) => ({
      album: target,
      command: command(isAllPhotos && target.id !== album?.id, () =>
        runAsync('add photos to an album', () => albumActions.add(target, photos)),
      ),
    })),
    removeFromAlbum: command(location.kind === 'album' && selected.length > 0, () =>
      runAsync('remove photos from an album', () =>
        albumActions.removePhotos(selected.filter(isAlbumPhoto)),
      ),
    ),
    renameAlbum: command(shownAlbum !== null, () => {
      if (shownAlbum) renameAlbum(shownAlbum);
    }),
    deleteAlbum: command(shownAlbum !== null, () => {
      if (shownAlbum) confirm({ kind: 'delete-album', album: shownAlbum });
    }),
    /** Edit › Undo and Redo: the latest move or copy taken back, or made again, as Finder's. */
    undo: command(history.undo !== null, () => runAsync('undo a change', () => fileActions.undo())),
    undoName: history.undo
      ? changeName(history.undo, { move: strings.menus.undoMove, copy: strings.menus.undoCopy })
      : strings.menus.undo,
    redo: command(history.redo !== null, () => runAsync('redo a change', () => fileActions.redo())),
    redoName: history.redo
      ? changeName(history.redo, { move: strings.menus.redoMove, copy: strings.menus.redoCopy })
      : strings.menus.redo,
    selectAll: command(shown.length > 0, selectAll),
    signIn: command(!isSignedIn, signIn),

    /** File › Tags…: the selection's tags in a panel, to add, remove and type. */
    editTags: command(isAllTaggable, () => editTags(selected)),
    /** File › Get Info: the selection's facts and tags. */
    getInfo: command(selected.length > 0, () => getInfo(selected)),
    /** Whether the person's backups can be browsed here at all: their rows show only then. */
    hasBackups: browseVersions !== null || browseBackups !== null,
    /** File › Browse Versions…: the one item selected, as the person's backups held it. */
    browseVersions: command(
      browseVersions !== null &&
        selected.length === 1 &&
        first !== null &&
        canBrowseVersions(first, places),
      () => {
        if (first && isLocal(first)) browseVersions?.(first);
      },
    ),
    /** File › Browse Backups: the folder shown, as it was. */
    browseBackups: command(
      browseBackups !== null &&
        location.kind === 'folder' &&
        canBrowseBackups(location.uri, places),
      () => {
        if (location.kind === 'folder') browseBackups?.(location.uri);
      },
    ),
    /**
     * The person's favourite tags, as the context menu's dots and the keyboard offer them: each
     * on all the selection, on none or on some, and choosing it puts it on all or takes it off all.
     */
    tagChoices: favouriteTags(tagActions.definitions).map((definition) => ({
      definition,
      state: tagState(selectedTags, definition.name),
      command: command(isAllTaggable, () =>
        changeTags(toggledTag(selectedTags, { name: definition.name, color: definition.color })),
      ),
    })),
    /** Every tag off the selection, as Finder's Control-0. */
    removeAllTags: command(isAllTaggable && selectedTags.some((tags) => tags.length > 0), () =>
      changeTags({ remove: [...new Set(selectedTags.flat().map((tag) => tag.name))] }),
    ),
    changeTags: (items: readonly Item[], change: TagChange) =>
      runAsync('change tags', () => tagActions.change(items, change)),

    /** Dropping dragged items on an item: into a folder, into an album. */
    canDrop: (dragged: readonly Item[], target: Item) => {
      if (target.source === 'local' && target.isFolder) {
        return (
          !dragged.some(isPlace) &&
          dropAction(dragged, { kind: 'folder', uri: target.uri }) !== null
        );
      }
      if (target.source === 'album' && isSignedIn) {
        return dropAction(dragged, { kind: 'album', albumId: target.albumId }) !== null;
      }
      return false;
    },
    drop: (dragged: readonly Item[], target: Item) => {
      if (target.source === 'local' && target.isFolder) {
        runAsync('move items', () =>
          fileActions.moveInto(dragged.filter(isLocal), {
            uri: target.uri,
            name: folderName(target.uri, places),
          }),
        );
      } else if (target.source === 'album') {
        const targetAlbum = albums.find((each) => each.id === target.albumId);
        if (targetAlbum)
          runAsync('add photos to an album', () => albumActions.add(targetAlbum, dragged));
      }
    },

    /**
     * Files dropped on the items from any application, Dropsea among them (`DropZone`): into the
     * folder dropped on, else into the folder shown; nowhere else takes them (`useFileDrops`).
     */
    dropFolderFor: (target: Item | null): string | null => dropFolderFor(location, target),
    dropFiles: fileDrops.dropFiles,

    /** Confirmed requests. */
    confirmed: (request: ConfirmRequest) => {
      switch (request.kind) {
        case 'empty-trash':
          runAsync('empty the Trash', () => fileActions.emptyTrash());
          break;
        case 'erase':
          runAsync('delete items', () => fileActions.eraseNow(request.items));
          break;
        case 'delete-for-good':
          fileActions.deleteForGood(request.items);
          break;
        case 'delete-album':
          runAsync('delete an album', async () => {
            await albumActions.remove(request.album);
            if (location.kind === 'album' && location.albumId === request.album.id) {
              navigate({ kind: 'albums' });
            }
          });
          break;
      }
    },
    renameAlbumTo: (target: Album, name: string) =>
      runAsync('rename an album', () => albumActions.rename(target, name)),
    renameLocal: fileActions.rename,
  };
}

export type Commands = ReturnType<typeof useCommands>;
