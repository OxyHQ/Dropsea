/**
 * The window, composed as Oxy's other apps compose theirs (Mention, Inbox) on
 * Bloom's AppShell: the sidebar (Dropsea's mark, Finder's sections, the Oxy
 * account at its foot) and the route's place in one panel, whose own panels
 * hold the items and their preview. Bloom decides the rest: where the
 * platform has windows the sidebar stays in the window at every size (hiding
 * into its edge by its dock, peeking back), the panel's toolbar is the
 * window's title area, and the window is never made smaller than Dropsea's
 * layout holds together at; on a phone the sidebar is the shell's drawer.
 *
 * As the file chooser the window is a sheet of the asking application's
 * window: its sidebar holds the places on this device, always beside the
 * items, with neither Dropsea's mark nor the Oxy account.
 */
import { AppShell } from '@oxy.so/bloom/app-shell';
import { usePlatformFiles } from '@oxy.so/bloom/platform-surface';
import { useWindowSizeLimits } from '@oxy.so/bloom/window';
import { ProfileButton } from '@oxy.so/services/ui/client';
import { Slot, usePathname } from 'expo-router';
import { Image } from 'react-native';
import { AlbumNameDialog } from '@/components/AlbumNameDialog';
import { ClashAlert } from '@/components/ClashAlert';
import { SettingsDialog } from '@/components/SettingsDialog';
import { useBrowser } from '@/components/BrowserProvider';
import { useAlbumActions } from '@/hooks/use-album-actions';
import { useFileDrops } from '@/hooks/use-file-drops';
import { useTagActions } from '@/hooks/use-tag-actions';
import { useLocalTagsFollowed } from '@/hooks/use-item-tags';
import { useLocale } from '@/hooks/use-locale';
import { useLocalPlaces } from '@/hooks/use-local-places';
import { useSidebarTree } from '@/hooks/use-sidebar-tree';
import { useViewer } from '@/hooks/use-viewer';
import { locationKey } from '@/lib/items';
import { itemsAtUris } from '@/lib/local-files';

const DROPSEA_MARK = require('@/assets/images/icon.png');
const SIDEBAR_WIDTH = 220;
/**
 * The smallest window: the sidebar beside a toolbar that still holds its
 * islands (the sidebar's toggle, back and forward, the view and the search's
 * button) over two columns of icons, tall enough for a row of them between
 * the toolbar and the bars under it.
 */
const WINDOW_MIN = { minWidth: 640, minHeight: 400 };
/** The chooser's smallest: the same, with room for its bar of buttons under the items. */
const CHOOSER_MIN = { minWidth: 640, minHeight: 440 };

export function BrowserShell() {
  const {
    location,
    navigate,
    springOpen,
    isNewAlbumOpen,
    setNewAlbumOpen,
    isSettingsOpen,
    setSettingsOpen,
  } = useBrowser();
  const { strings } = useLocale();
  const { places } = useLocalPlaces();
  const fileDrops = useFileDrops(places);
  const tagActions = useTagActions();
  const isChooser = usePlatformFiles()?.chooser !== undefined;
  // The file chooser changes nothing: its places take no drops.
  const { tree, locations } = useSidebarTree(
    places,
    () => setNewAlbumOpen(true),
    () => setSettingsOpen(true),
    isChooser
      ? null
      : {
          onDropFiles: fileDrops.dropFiles,
          onTrashFiles: fileDrops.trashDropped,
          onSpringOpen: springOpen,
          onTagFiles: (uris, tag) => {
            tagActions
              .change(itemsAtUris(uris), { add: [{ name: tag.name, color: tag.color }] })
              .catch((error: unknown) =>
                console.warn('Dropsea could not tag files dropped on a tag', { uris, error }),
              );
          },
        },
  );
  const { isSignedIn } = useViewer();
  const albumActions = useAlbumActions();
  useLocalTagsFollowed();
  const pathname = usePathname();
  useWindowSizeLimits(isChooser ? CHOOSER_MIN : WINDOW_MIN);
  return (
    <>
      <AppShell
        testID="dropsea"
        header={null}
        navigationAlign="content"
        navigationGap={0}
        gutter={8}
        contentMaxWidth="none"
        drawer="reveal"
        // A panel's places are always beside its items, however narrow the sheet.
        {...(isChooser ? { navFrom: 0 } : null)}
        sidebar={{
          surface: 'plain',
          variant: 'panel',
          // Finder's sections are the sidebar's rows: it hides whole (its dock),
          // never shrinks to icons that cannot hold them.
          collapsed: false,
          collapseDisabled: true,
          width: SIDEBAR_WIDTH,
          logo: isChooser
            ? undefined
            : {
                icon: (
                  <Image
                    source={DROPSEA_MARK}
                    className="h-7 w-7 rounded-[7px]"
                    accessible={false}
                  />
                ),
                wordmark: strings.appName,
                onPress: () => {
                  const home = places.find((place) => place.kind === 'home');
                  if (home) navigate({ kind: 'folder', uri: home.uri });
                },
              },
          showSearch: false,
          showThemeToggle: false,
          tree,
          selectedTreeItem: location ? locationKey(location) : undefined,
          onTreeItemPress: (item) => {
            const target = locations.get(item.key);
            if (target) navigate(target);
          },
          footer:
            isSignedIn && !isChooser
              ? ({ collapsed }) => <ProfileButton expanded={!collapsed} placement="up" />
              : undefined,
          dock: { peek: true },
        }}
        panelLayout={{
          mode: 'split',
          flow: 'bounded',
          appearance: 'separated',
          panels: [
            {
              id: 'browser',
              chrome: 'none',
              scroll: 'content',
              // The router's place keeps one host across every layout change.
              keepMounted: true,
              // A place that throws fails inside its panel; going elsewhere recovers it.
              errorBoundary: { resetKey: pathname },
              content: <Slot />,
            },
          ],
        }}
      />
      <ClashAlert />
      {isNewAlbumOpen ? (
        <AlbumNameDialog
          isOpen
          title={strings.menus.newAlbum}
          initialName={strings.untitledAlbum}
          confirmLabel={strings.save}
          onConfirm={(name) => {
            albumActions.create(name).then(
              (album) => {
                if (album) navigate({ kind: 'album', albumId: album.id });
              },
              (error: unknown) => console.warn('Dropsea could not make an album', error),
            );
          }}
          onClose={() => setNewAlbumOpen(false)}
        />
      ) : null}
      <SettingsDialog isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
