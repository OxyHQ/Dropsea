import { Button } from '@oxy.so/bloom/button';
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
import type { SidebarIcon, SidebarTree } from '@oxy.so/bloom/sidebar';
import { View } from 'react-native';
import { TagMark } from '@/components/TagMark';
import { useAlbums } from '@/hooks/use-albums';
import { useLocale } from '@/hooks/use-locale';
import { useTagDefinitions } from '@/hooks/use-tag-definitions';
import { useViewer } from '@/hooks/use-viewer';
import { type Location, locationKey } from '@/lib/items';
import type { LocalPlace } from '@/lib/local-places';
import { favouriteTags, updatedDefinition } from '@/lib/tags';

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
 */
export function useSidebarTree(
  places: readonly LocalPlace[],
  onNewAlbum: () => void,
  onAllTags: () => void,
): { tree: SidebarTree[]; locations: ReadonlyMap<string, Location> } {
  const { strings } = useLocale();
  const { isSignedIn } = useViewer();
  const albums = useAlbums();
  const { definitions, save: saveDefinitions } = useTagDefinitions();
  const isChooser = usePlatformFiles()?.chooser !== undefined;
  const locations = new Map<string, Location>();
  const row = (location: Location, label: string, icon: SidebarIcon) => {
    const key = locationKey(location);
    locations.set(key, location);
    return { key, label, icon };
  };

  const favourites = places.filter((place) => place.kind !== 'volume');
  const volumes = places.filter((place) => place.kind === 'volume');
  const tree: SidebarTree[] = [];
  if (favourites.length > 0) {
    tree.push({
      key: 'favourites',
      label: strings.sections.favourites,
      items: favourites.map((place) =>
        row({ kind: 'folder', uri: place.uri }, place.name, PLACE_ICONS[place.kind]),
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
        row({ kind: 'folder', uri: place.uri }, place.name, PLACE_ICONS.volume),
      ),
      row({ kind: 'trash' }, strings.trash, RiDeleteBinLine),
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
