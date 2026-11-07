import { Button } from '@oxy.so/bloom/button';
import type { DropTargetDragEvent, DropTargetDropEvent } from '@oxy.so/bloom/drop-zone';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@oxy.so/bloom/dropdown-menu';
import {
  RiAddLine,
  RiCloudLine,
  RiComputerLine,
  RiDeleteBinLine,
  RiDownloadLine,
  RiFileTextLine,
  RiFilmLine,
  RiGalleryLine,
  RiHardDrive2Line,
  RiHomeLine,
  RiImageLine,
  RiMoreLine,
  RiMusic2Line,
  RiPriceTag3Line,
  RiSmartphoneLine,
} from '@oxy.so/bloom/icons';
import { usePlatformFiles } from '@oxy.so/bloom/platform-surface';
import type { SidebarIcon, SidebarTree, SidebarTreeItemDrop } from '@oxy.so/bloom/sidebar';
import { View } from 'react-native';
import { TagMark } from '@/components/TagMark';
import { useAlbums } from '@/hooks/use-albums';
import { useLocale } from '@/hooks/use-locale';
import { useSpringLoading } from '@/hooks/use-spring-loading';
import { useTagDefinitions } from '@/hooks/use-tag-definitions';
import { useViewer } from '@/hooks/use-viewer';
import { type Location, locationKey } from '@/lib/items';
import type { LocalPlace } from '@/lib/local-places';
import { favouriteTags, updatedDefinition, type TagDefinition } from '@/lib/tags';

const DROP_ACCEPT = ['files'] as const;
const PLACE_ACTIONS = ['move', 'copy'] as const;
/** The Trash takes files as Move to Trash does: moved, never copied. */
const TRASH_ACTIONS = ['move'] as const;
/**
 * A tag takes files as a copy: nothing moves, and a copy is the action no source answers by
 * deleting what it dragged.
 */
const TAG_ACTIONS = ['copy'] as const;

/** What files dropped on the sidebar do. */
export interface SidebarDrops {
  /** Into a place's folder, moved or copied as the drop says. */
  onDropFiles: (uris: readonly string[], folderUri: string, action: 'copy' | 'move') => void;
  /** Into the Trash. */
  onTrashFiles: (uris: readonly string[]) => void;
  /** A place held under a drag springs open in the window. */
  onSpringOpen: (location: Location) => void;
  /** Onto a tag: they take it, as on Finder's sidebar. */
  onTagFiles: (uris: readonly string[], tag: TagDefinition) => void;
}

/** The `file://` URIs a drop brings. */
function droppedUris({ data }: DropTargetDropEvent): string[] {
  return data.files.flatMap((file) => (file.uri ? [file.uri] : []));
}

const PLACE_ICONS: Record<LocalPlace['kind'], SidebarIcon> = {
  home: RiHomeLine,
  desktop: RiComputerLine,
  documents: RiFileTextLine,
  downloads: RiDownloadLine,
  pictures: RiImageLine,
  music: RiMusic2Line,
  videos: RiFilmLine,
  volume: RiHardDrive2Line,
  device: RiSmartphoneLine,
};

/**
 * The sidebar, as Finder's: Favourites (the home and its standard folders, or
 * this device's folder), Oxy (Oxy Files and Photos), the albums, Locations
 * (the volumes and the Trash) and Tags (the person's favourite tags, each the
 * place of every item with it). Each row's key is the location it
 * opens. As the file chooser it holds the places on this device alone, where
 * what can be chosen is: Oxy Files, Photos, the albums and the Trash hold no
 * file the asking application could open.
 *
 * With `drops`, files dropped on a place go into it, on the Trash into the
 * Trash and on a tag take the tag, and a place held under a drag springs open,
 * as Finder's sidebar (OxyOS ADR 0047, decisions 12 and 14; Dropsea ADR 0001).
 */
export function useSidebarTree(
  places: readonly LocalPlace[],
  onNewAlbum: () => void,
  onAllTags: () => void,
  drops: SidebarDrops | null,
): { tree: SidebarTree[]; locations: ReadonlyMap<string, Location> } {
  const { strings } = useLocale();
  const { isSignedIn } = useViewer();
  const albums = useAlbums();
  const { definitions, save: saveDefinitions } = useTagDefinitions();
  const isChooser = usePlatformFiles()?.chooser !== undefined;
  const locations = new Map<string, Location>();
  const { spring } = useSpringLoading((key) => {
    const location = locations.get(key);
    if (location) drops?.onSpringOpen(location);
  });
  const row = (
    location: Location,
    label: string,
    icon: SidebarIcon,
    drop?: SidebarTreeItemDrop,
  ) => {
    const key = locationKey(location);
    locations.set(key, location);
    return drop ? { key, label, icon, drop } : { key, label, icon };
  };
  /** A place's row takes files into its folder, and springs open held under a drag. */
  const placeDrop = (place: LocalPlace): SidebarTreeItemDrop | undefined => {
    if (!drops) return undefined;
    const key = locationKey({ kind: 'folder', uri: place.uri });
    const hover = (event: DropTargetDragEvent) => spring.hover(event.action ? key : null);
    return {
      accept: DROP_ACCEPT,
      actions: PLACE_ACTIONS,
      folder: place.uri,
      onDragEnter: hover,
      onDragOver: hover,
      onDragLeave: () => spring.leave(key),
      onDrop: (event) => {
        spring.cancel();
        const uris = droppedUris(event);
        if (uris.length === 0 || event.action === 'link') return;
        drops.onDropFiles(uris, place.uri, event.action);
      },
    };
  };
  const trashDrop: SidebarTreeItemDrop | undefined = drops
    ? {
        accept: DROP_ACCEPT,
        actions: TRASH_ACTIONS,
        onDrop: (event) => {
          const uris = droppedUris(event);
          if (uris.length > 0) drops.onTrashFiles(uris);
        },
      }
    : undefined;

  const favourites = places.filter((place) => place.kind !== 'volume');
  const volumes = places.filter((place) => place.kind === 'volume');
  const tree: SidebarTree[] = [];
  if (favourites.length > 0) {
    tree.push({
      key: 'favourites',
      label: strings.sections.favourites,
      items: favourites.map((place) =>
        row(
          { kind: 'folder', uri: place.uri },
          place.name,
          PLACE_ICONS[place.kind],
          placeDrop(place),
        ),
      ),
    });
  }
  if (isChooser) {
    if (volumes.length > 0) {
      tree.push({
        key: 'locations',
        label: strings.sections.locations,
        items: volumes.map((place) =>
          row({ kind: 'folder', uri: place.uri }, place.name, PLACE_ICONS.volume),
        ),
      });
    }
    return { tree, locations };
  }
  tree.push({
    key: 'oxy',
    label: strings.sections.oxy,
    items: [
      row({ kind: 'cloud' }, strings.cloud, RiCloudLine),
      row({ kind: 'photos' }, strings.photos, RiImageLine),
    ],
  });
  if (isSignedIn) {
    tree.push({
      key: 'albums',
      label: strings.sections.albums,
      actions: (
        <Button
          size="xs"
          iconOnly
          appearance="plain"
          tone="neutral"
          leadingIcon={RiAddLine}
          accessibilityLabel={strings.menus.newAlbum}
          onPress={onNewAlbum}
          testID="new-album"
        />
      ),
      loading: albums.isPending,
      error: albums.isError ? strings.couldNotLoad : undefined,
      emptyLabel: strings.empty.albums,
      items: [
        row({ kind: 'albums' }, strings.albums, RiGalleryLine),
        ...(albums.data ?? []).map((album) =>
          row({ kind: 'album', albumId: album.id }, album.name, RiGalleryLine),
        ),
      ],
    });
  }
  tree.push({
    key: 'locations',
    label: strings.sections.locations,
    items: [
      ...volumes.map((place) =>
        row({ kind: 'folder', uri: place.uri }, place.name, PLACE_ICONS.volume, placeDrop(place)),
      ),
      row({ kind: 'trash' }, strings.trash, RiDeleteBinLine, trashDrop),
    ],
  });
  const sidebarTags = favouriteTags(definitions);
  if (definitions.length > 0) {
    tree.push({
      key: 'tags',
      label: strings.tags.section,
      items: [
        ...sidebarTags.map((tag) => {
          const location: Location = { kind: 'tag', name: tag.name };
          const key = locationKey(location);
          locations.set(key, location);
          return {
            key,
            label: tag.name,
            // Finder's menu of a sidebar tag: out of the sidebar, or every tag in Settings.
            actionsVisibility: 'hover' as const,
            actions: (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xs"
                    iconOnly
                    appearance="plain"
                    tone="neutral"
                    leadingIcon={RiMoreLine}
                    accessibilityLabel={strings.tags.options(tag.name)}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onPress={() => {
                      saveDefinitions(
                        updatedDefinition(definitions, tag.name, { isFavourite: false }),
                      ).catch((error: unknown) =>
                        console.warn('Dropsea could not take a tag out of the sidebar', error),
                      );
                    }}
                  >
                    {strings.tags.removeFromSidebar}
                  </DropdownMenuItem>
                  <DropdownMenuItem onPress={onAllTags}>{strings.tags.allTags}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
            ...(drops
              ? {
                  drop: {
                    accept: DROP_ACCEPT,
                    actions: TAG_ACTIONS,
                    onDrop: (event: DropTargetDropEvent) => {
                      const uris = droppedUris(event);
                      if (uris.length > 0) drops.onTagFiles(uris, tag);
                    },
                  } satisfies SidebarTreeItemDrop,
                }
              : null),
            // The tag's colour in the icon's box, as Finder's sidebar marks it.
            leading: (
              <View className="h-5 w-5 items-center justify-center">
                <TagMark color={tag.color} />
              </View>
            ),
          };
        }),
        // Every tag, the sidebar's or not, to show, order and change: Settings › Tags.
        {
          key: 'all-tags',
          label: strings.tags.allTags,
          icon: RiPriceTag3Line,
          onPress: onAllTags,
        },
      ],
    });
  }
  return { tree, locations };
}
