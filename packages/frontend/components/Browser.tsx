/**
 * One place's pane: the menus, the toolbar, the items and the line under
 * them, and the dialogs that ask before what cannot be undone. Every place
 * (a folder on this device, Oxy Files, Photos, the albums, an album, the
 * Trash) is shown by this one component from its listing; only what the
 * listing holds and what can be done to it differ.
 *
 * As the file chooser (the platform's `files.chooser`) the pane is the open
 * or save panel's: the same toolbar, items and preview, without menus or
 * changes to the items, the items the request cannot take dimmed, and the
 * panel's bar under them; a double click or Return answers with what fits.
 */
import { AlertDialog } from '@oxy.so/bloom/alert-dialog';
import { type AppShellPanelDefinition, AppShellPanels } from '@oxy.so/bloom/app-shell';
import { EmptyState } from '@oxy.so/bloom/empty-state';
import type { BloomIconComponent } from '@oxy.so/bloom/icons';
import { Loading } from '@oxy.so/bloom/loading';
import {
  type PlatformSearchToken,
  usePlatformFiles,
  usePlatformMenuBar,
  usePlatformSearch,
} from '@oxy.so/bloom/platform-surface';
import { Screen } from '@oxy.so/bloom/screen';
import { Text } from '@oxy.so/bloom/typography';
import { useWindowWidthClass } from '@oxy.so/bloom/hooks';
import { useWindow } from '@oxy.so/bloom/window';
import type { Album } from '@dropsea/shared-types';
import { router } from 'expo-router';
import { type ReactNode, useRef, useState } from 'react';
import { View } from 'react-native';
import { AlbumNameDialog } from '@/components/AlbumNameDialog';
import { BrowserMenus } from '@/components/BrowserMenus';
import { useBrowser } from '@/components/BrowserProvider';
import { ChooserBar } from '@/components/ChooserBar';
import { BackgroundMenuRows, ItemMenuRows } from '@/components/ItemMenus';
import { InfoDialog } from '@/components/InfoDialog';
import { ItemsView } from '@/components/ItemsView';
import { PreviewDialog } from '@/components/PreviewDialog';
import { PreviewPane } from '@/components/PreviewPane';
import { SearchScopeBar } from '@/components/SearchScopeBar';
import { SignInPanel } from '@/components/SignInPanel';
import { StatusBar } from '@/components/StatusBar';
import { TagsDialog } from '@/components/TagsDialog';
import { VersionsDialog } from '@/components/VersionsDialog';
import { Toolbar } from '@/components/Toolbar';
import { useAlbums } from '@/hooks/use-albums';
import { type AssetUrlRequest, assetUrlKey, useAssetUrls } from '@/hooks/use-asset-urls';
import { useBackups } from '@/hooks/use-backups';
import { useBrowserKeys } from '@/hooks/use-browser-keys';
import { useItemTags } from '@/hooks/use-item-tags';
import { canTag } from '@/hooks/use-tag-actions';
import { useTagDefinitions } from '@/hooks/use-tag-definitions';
import { type ConfirmRequest, useCommands } from '@/hooks/use-commands';
import { useLocale } from '@/hooks/use-locale';
import { useLocalPlaces } from '@/hooks/use-local-places';
import { useSearchResults } from '@/hooks/use-search-results';
import {
  activateStep,
  type ChooserStep,
  chooserTitle,
  isSelectable,
  openStep,
  saveStep,
} from '@/lib/chooser';
import { answerCancelled, answerChosen } from '@/lib/chooser-answer';
import { refreshFolder } from '@/lib/folder-store';
import { selectionOnArrival } from '@/lib/history';
import { previewOnPlatform } from '@/lib/local-files';
import { type Item, itemKind, type LocalItem, type Location } from '@/lib/items';
import type { ItemsLayout } from '@/lib/items-layout';
import { isSameUri, parentUri, pathParts, uriName } from '@/lib/local-places';
import { useOperations } from '@/lib/operations';
import { backupsHref, hrefFor } from '@/lib/routes';
import { platformSearchQuery, type SearchScope, searchResults, tokenLabel } from '@/lib/search';
import { isSelected, keepShown, type Selection, selectAll } from '@/lib/selection';
import { groupItems, sortBy, sortItems, visibleItems } from '@/lib/sorting';
import { TAG_KEYWORD, tagStyleOf } from '@/lib/tags';

/** A picture larger than this is not decoded for an icon: its kind's glyph is drawn instead. */
const THUMBNAIL_MAX_BYTES = 24 * 1024 * 1024;
/** The preview pane's narrowest and widest, as the person drags its edge. */
const PREVIEW_MIN_WIDTH = 220;
const PREVIEW_MAX_WIDTH = 420;
/** A window this wide draws its menu bar where the platform has none of its own. */
const MENU_BAR_FROM = 640;
const MENU_BAR_WIDTHS = [MENU_BAR_FROM];

/** What a place shows, and how. */
export interface Listing {
  location: Location;
  title: string;
  items: readonly Item[];
  /** `unavailable`: the place needs Dropsea's backend, which this build does not have. */
  status: 'ready' | 'loading' | 'error' | 'signed-out' | 'unavailable';
  layout: ItemsLayout;
  empty: { icon: BloomIconComponent; title: string; hint?: string };
  /** The album the place is, when it is one. */
  album?: Album | null;
  onRetry?: () => void;
  onEndReached?: () => void;
}

/** What a picture in the view is drawn from: a local file itself, or an asset's URL. */
function thumbnailSource(item: Item): { uri: string } | AssetUrlRequest | null {
  const kind = itemKind(item);
  if (kind !== 'image' && kind !== 'video') return null;
  switch (item.source) {
    case 'local':
      return kind === 'image' && item.size !== null && item.size <= THUMBNAIL_MAX_BYTES
        ? { uri: item.uri }
        : null;
    case 'cloud':
      if (item.hasThumbnail) return { assetId: item.assetId, variant: 'thumb' };
      return kind === 'image' && item.size !== null && item.size <= THUMBNAIL_MAX_BYTES
        ? { assetId: item.assetId }
        : null;
    case 'album-photo':
      return { assetId: item.assetId, variant: 'thumb' };
    default:
      return null;
  }
}

/**
 * The menus in the window, where the platform has no menu bar of its own and
 * the window is wide enough: it reads the window's width only at that
 * threshold, so a resize draws nothing until it crosses it.
 */
function InWindowMenus({ children }: { children: ReactNode }) {
  const width = useWindowWidthClass(MENU_BAR_WIDTHS);
  if (width < MENU_BAR_FROM) return null;
  return <View className="flex-row px-2 pb-1">{children}</View>;
}

export function Browser({ listing }: { listing: Listing }) {
  const { location } = listing;
  const browser = useBrowser();
  const { strings, locale } = useLocale();
  const { places } = useLocalPlaces();
  const albums = useAlbums();
  const platformWindow = useWindow();
  const platformMenuBar = usePlatformMenuBar();
  const chooser = usePlatformFiles()?.chooser ?? null;
  const platformSearch = usePlatformSearch();
  const isWindowActive = platformWindow ? platformWindow.active : true;
  const { progress } = useOperations();

  const [rawSelection, setSelection] = useState<Selection>(() =>
    selectionOnArrival(
      listing.items,
      browser.cameFrom,
      location.kind === 'folder' ? (location.select ?? null) : null,
    ),
  );
  const [search, setSearch] = useState('');
  // Rises at each Edit › Find… (the toolbar's search field takes the keyboard).
  const [findRequest, setFindRequest] = useState(0);
  // The search's filters, as tokens, and where it looks: where the platform searches its index.
  const [searchTokens, setSearchTokens] = useState<readonly PlatformSearchToken[]>([]);
  const [searchScope, setSearchScope] = useState<SearchScope>('computer');
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [albumBeingRenamed, setAlbumBeingRenamed] = useState<Album | null>(null);
  // Why something could not be done, in an alert: a name, an Undo or a Redo.
  const [problem, setProblem] = useState<{ title: string; description?: string } | null>(null);
  // The items a Tags… panel or Get Info is open for, by key: they show their tags as they change.
  const [tagsPanelKeys, setTagsPanelKeys] = useState<readonly string[] | null>(null);
  const [infoKeys, setInfoKeys] = useState<readonly string[] | null>(null);
  // The item whose versions are open (Browse Versions…).
  const [versionsOf, setVersionsOf] = useState<LocalItem | null>(null);
  // The person's backups, where the platform makes them and keeps some: never in the chooser.
  const backupsInfo = useBackups();
  const backups = chooser ? null : backupsInfo.backups;
  // The save panel's file of the name typed, asked about before it is replaced.
  const [replacing, setReplacing] = useState<{ uri: string; name: string } | null>(null);
  // The grid's columns, for the arrows: read as a key is pressed, never drawn.
  const columns = useRef(1);
  // The name being typed in place, kept here so a press elsewhere keeps it as
  // Return does (Finder's rename ends either way), and only once.
  const renaming = useRef<{ key: string; text: string } | null>(null);

  // A folder on this device is searched through the platform's index where it
  // has one, as Finder's search asks Spotlight's: the results, from anywhere
  // on the computer or in the folder, are what the pane shows while the field
  // holds words or tokens. Elsewhere (the web, a phone, Oxy Files) the search
  // filters the place's own items by name and tag.
  const folderUri = location.kind === 'folder' ? location.uri : null;
  const searchQuery =
    platformSearch !== null && folderUri !== null
      ? platformSearchQuery({
          text: search,
          tokens: searchTokens,
          scope: searchScope,
          folderUri,
          language: locale,
        })
      : null;
  const found = useSearchResults(platformSearch, searchQuery);
  const isSearching = searchQuery !== null;
  const results = isSearching && found.data ? searchResults(found.data) : [];
  const resultOf = new Map(results.map((result) => [result.item.key, result]));
  const items: readonly Item[] = isSearching ? results.map((result) => result.item) : listing.items;
  const status: Listing['status'] = isSearching
    ? found.isError
      ? 'error'
      : 'ready'
    : listing.status;
  if (found.isError) {
    console.warn('The platform could not search for Dropsea', {
      query: searchQuery,
      error: found.error,
    });
  }

  const viewMode = browser.viewModeFor(location);
  const order = browser.orderFor(location);
  // Results come from many folders: their tags are read item by item.
  const tags = useItemTags(items, isSearching ? null : folderUri);
  const { definitions } = useTagDefinitions();
  const tagStyle = tagStyleOf(definitions);
  // A search finds `tag:Red` in English and in the person's language's own word.
  const tagKeywords = [...new Set([TAG_KEYWORD, strings.tags.keyword])];
  const sorted = sortItems(
    visibleItems(items, isSearching ? '' : search, browser.isShowingHidden, tagKeywords, tags),
    order,
    tags,
  );
  // View › Group By: the sort applies within each group, and the items run group by group, so the
  // selection's order, Shift's range and Select All follow the groups, as Finder's do. Dates fall
  // in periods of days: the day's start is all of now they need.
  const grouping = browser.groupingFor(location);
  const groups = groupItems(sorted, grouping ?? 'none', {
    tags,
    now: new Date().setHours(0, 0, 0, 0),
    kindName: (kind) => strings.kinds[kind],
  });
  const shown = groups ? groups.flatMap((group) => group.items) : sorted;
  const shownKeys = shown.map((item) => item.key);
  // The file chooser selects what the request can take, and the folders it goes into.
  const selectable = chooser ? shown.filter((item) => isSelectable(item, chooser.request)) : shown;
  const selectableKeys = selectable.map((item) => item.key);
  const dimmedKeys = new Set(
    chooser
      ? shown.filter((item) => !isSelectable(item, chooser.request)).map((item) => item.key)
      : [],
  );
  // Items gone, renamed or searched away leave the selection.
  const selection = keepShown(rawSelection, selectableKeys);
  const selected = shown.filter((item) => isSelected(selection, item.key));
  const previewed = selected.length === 1 ? (selected[0] ?? null) : null;
  const handleSelectionChange = (change: (current: Selection) => Selection) =>
    setSelection((current) => change(keepShown(current, selectableKeys)));

  const sources = shown.map((item) => ({ item, source: thumbnailSource(item) }));
  const urlRequests = sources.flatMap(({ source }) =>
    source && 'assetId' in source ? [source] : [],
  );
  const urls = useAssetUrls(urlRequests);
  const thumbnails = new Map<string, string>();
  for (const { item, source } of sources) {
    if (!source) continue;
    const url = 'assetId' in source ? urls.get(assetUrlKey(source)) : source.uri;
    if (url) thumbnails.set(item.key, url);
  }

  const originOf = (item: Item): string => {
    if (isSearching) return resultOf.get(item.key)?.location ?? '';
    if (item.source === 'cloud-trash') return strings.origins.cloud;
    if (item.source !== 'local-trash') return '';
    if (!item.originalUri) return strings.origins.unknown;
    const folder = parentUri(item.originalUri);
    const place = places.find((each) => isSameUri(each.uri, folder));
    return place ? place.name : uriName(folder);
  };

  const preview = (item: Item) => {
    if (item.source === 'local') {
      previewOnPlatform(item).then(
        (isShown) => {
          if (!isShown) setPreviewItem(item);
        },
        (error: unknown) => {
          console.warn('The platform could not preview a file; Dropsea shows it', {
            uri: item.uri,
            error,
          });
          setPreviewItem(item);
        },
      );
      return;
    }
    setPreviewItem(item);
  };

  const commands = useCommands({
    location,
    shown,
    selected,
    places,
    albums: albums.data ?? [],
    album: listing.album ?? null,
    navigate: browser.navigate,
    preview,
    startRename: (item: LocalItem) => startRename(item),
    confirm: setConfirm,
    renameAlbum: setAlbumBeingRenamed,
    newAlbum: () => browser.setNewAlbumOpen(true),
    setSelection: (next) => setSelection(next),
    selectAll: () => setSelection(selectAll(shownKeys)),
    tagsOf: tags.tagsOf,
    editTags: (chosen) => setTagsPanelKeys(chosen.map((item) => item.key)),
    getInfo: (chosen) => setInfoKeys(chosen.map((item) => item.key)),
    browseVersions: backups ? setVersionsOf : null,
    browseBackups: backups ? (uri) => router.push(backupsHref(uri)) : null,
    showProblem: setProblem,
  });
  // A version restored: the window shows it selected where it now is.
  const showRestored = (uri: string) => {
    setVersionsOf(null);
    const folder = parentUri(uri);
    refreshFolder(folder);
    const target = hrefFor({ kind: 'folder', uri: folder, select: uri });
    if (folderUri !== null && isSameUri(folder, folderUri)) router.replace(target);
    else router.push(target);
  };
  const itemsWithKeys = (keys: readonly string[] | null) =>
    keys ? items.filter((item) => keys.includes(item.key)) : [];
  const tagsPanelItems = itemsWithKeys(tagsPanelKeys);
  const infoItems = itemsWithKeys(infoKeys);
  // What the items' actions, the toolbar and the confirmation use, read on
  // their own: the compiler then keeps what is made of them while they stay the
  // same. Read from `commands`, new at every selection, what is made of them
  // was too, and a click drew every item, the toolbar and the closed
  // confirmation again.
  const { hasPlatformTrash, uploadPicked, confirmed } = commands;

  // The file chooser's answers: what its button, a double click and Return do.
  const answer = (uris: readonly string[]) => {
    if (!chooser) return;
    answerChosen(chooser, uris, folderUri).catch((error: unknown) =>
      console.warn('Dropsea could not answer the file chooser', { uris, error }),
    );
  };
  const runStep = (step: ChooserStep) => {
    switch (step.kind) {
      case 'choose':
        answer(step.uris);
        break;
      case 'enter':
        browser.navigate({ kind: 'folder', uri: step.uri });
        break;
      case 'name':
        browser.setSaveName(step.name);
        break;
      case 'none':
        break;
    }
  };
  const save = () => {
    if (!folderUri) return;
    const step = saveStep(
      browser.saveName,
      folderUri,
      listing.items.filter((item): item is LocalItem => item.source === 'local'),
    );
    switch (step.kind) {
      case 'save':
        answer([step.uri]);
        break;
      case 'replace':
        setReplacing({ uri: step.uri, name: browser.saveName });
        break;
      case 'problem':
        setProblem({
          title:
            step.problem === 'folder-taken'
              ? strings.chooser.folderTaken
              : strings.nameProblems[step.problem],
        });
        break;
    }
  };
  const chooserOpenStep = chooser ? openStep(chooser.request, selected, folderUri) : null;
  const isChooserConfirmEnabled =
    chooser?.request.mode === 'save'
      ? folderUri !== null && browser.saveName.trim() !== ''
      : chooserOpenStep !== null && chooserOpenStep.kind !== 'none';
  const confirmChooser = () => {
    if (!isChooserConfirmEnabled) return;
    if (chooser?.request.mode === 'save') save();
    else if (chooserOpenStep) runStep(chooserOpenStep);
  };
  /** A double click, a tap, or a screen reader's activation of an item. */
  const activate = (item: Item) => {
    if (chooser) runStep(activateStep(chooser.request, item));
    else commands.openItem(item);
    // A result opened ranks higher in the platform's next answers.
    const result = resultOf.get(item.key);
    if (result) platformSearch?.used(result.id);
  };

  const startRename = (item: LocalItem) => {
    renaming.current = { key: item.key, text: item.name };
    setRenamingKey(item.key);
  };
  const cancelRename = () => {
    renaming.current = null;
    setRenamingKey(null);
  };
  const commitRename = () => {
    const pending = renaming.current;
    if (!pending) return;
    cancelRename();
    const item = items.find((each) => each.key === pending.key);
    if (item?.source !== 'local' || pending.text === item.name) return;
    const result = commands.renameLocal(item, pending.text);
    if ('item' in result) {
      setSelection({ keys: [result.item.key], anchor: result.item.key, focus: result.item.key });
      return;
    }
    setProblem({
      title:
        result.why.kind === 'name'
          ? strings.nameProblems[result.why.problem]
          : strings.fileProblems[result.why.problem],
    });
  };

  useBrowserKeys({
    isEnabled:
      isWindowActive &&
      confirm === null &&
      replacing === null &&
      problem === null &&
      tagsPanelKeys === null &&
      infoKeys === null,
    viewMode,
    getColumns: () => columns.current,
    // The rows the arrows go down: each group's items the keys can select.
    groupSizes: groups
      ? groups.map((group) => group.items.filter((item) => !dimmedKeys.has(item.key)).length)
      : [selectable.length],
    shown: selectable,
    onSelectionChange: handleSelectionChange,
    commands,
    isPreviewOpen: previewItem !== null,
    onTogglePreview: () => {
      if (previewItem) setPreviewItem(null);
      else commands.preview.run();
    },
    isRenaming: renamingKey !== null,
    onCancelRename: cancelRename,
    chooser: chooser
      ? {
          onActivate: () => {
            if (selected.length === 1 && selected[0]) activate(selected[0]);
          },
          onConfirm: () => {
            if (!isChooserConfirmEnabled) return false;
            confirmChooser();
            return true;
          },
          onCancel: () => answerCancelled(chooser),
        }
      : null,
  });

  const path = location.kind === 'folder' ? pathParts(location.uri, places, strings.computer) : [];
  // A search's path bar is where the result selected is, as Finder's.
  const shownPath = isSearching
    ? previewed?.source === 'local'
      ? pathParts(parentUri(previewed.uri), places, strings.computer)
      : []
    : path;
  const enclosing: Location | null =
    location.kind === 'folder' && path.length > 1
      ? { kind: 'folder', uri: parentUri(location.uri) }
      : location.kind === 'album'
        ? { kind: 'albums' }
        : null;

  const statusText =
    selected.length > 0
      ? strings.selected(selected.length, shown.length)
      : strings.items(shown.length);

  // What a search asked for, said back when it found nothing: the words, else the tokens.
  const searchedFor =
    search.trim() || searchTokens.map((token) => tokenLabel(token, strings.searching)).join(', ');
  const emptyState = isSearching ? (
    // Nothing is said before the first answer: the platform answers in milliseconds.
    found.data ? (
      <EmptyState
        variant="compact"
        icon={listing.empty.icon}
        title={strings.searching.noResults(searchedFor)}
        testID="search-no-results"
      />
    ) : null
  ) : status === 'ready' ? (
    <EmptyState
      variant="compact"
      icon={listing.empty.icon}
      title={search ? strings.empty.noResults(search) : listing.empty.title}
      description={search ? undefined : listing.empty.hint}
    />
  ) : null;
  const retry = isSearching ? () => found.refetch() : listing.onRetry;
  // A search's results are in no one folder: a drop goes into a folder among them, never beside them.
  const searchDropFolderFor = (target: Item | null): string | null =>
    target?.source === 'local' && target.isFolder ? target.uri : null;

  // What assistive technology can do to an item: one list for the items alike,
  // so an item draws again only when its own list changes.
  const openActions = [
    { name: 'activate', label: strings.menus.open },
    { name: 'select', label: strings.select },
  ];
  const trashAction =
    location.kind === 'trash'
      ? { name: 'trash', label: strings.menus.putBack }
      : { name: 'trash', label: strings.menus.moveToTrash };
  const localActions = [
    ...openActions,
    ...(location.kind === 'folder' ? [{ name: 'rename', label: strings.menus.rename }] : []),
    ...(location.kind === 'trash' || hasPlatformTrash ? [trashAction] : []),
  ];
  const cloudActions = [...openActions, trashAction];
  const otherActions = location.kind === 'trash' ? cloudActions : openActions;
  const itemActions = (item: Item) =>
    chooser
      ? openActions
      : item.source === 'local'
        ? localActions
        : item.source === 'cloud'
          ? cloudActions
          : otherActions;

  const body =
    status === 'signed-out' ? (
      <View className="flex-1 justify-center">
        <SignInPanel />
      </View>
    ) : status === 'loading' ? (
      <View className="flex-1 items-center justify-center">
        <Loading />
      </View>
    ) : status === 'unavailable' ? (
      <View className="flex-1 items-center justify-center">
        <EmptyState
          icon={listing.empty.icon}
          title={strings.notAvailableYet.title}
          description={strings.notAvailableYet.hint}
          testID="not-available-yet"
        />
      </View>
    ) : status === 'error' ? (
      <View className="flex-1 items-center justify-center">
        <EmptyState
          title={strings.couldNotLoad}
          action={retry ? { label: strings.retry, onPress: retry } : undefined}
        />
      </View>
    ) : (
      // The items and, while exactly one is selected, its preview beside them,
      // as Finder's preview pane: Bloom's panels, under the toolbar.
      <AppShellPanels
        scope="local"
        testID="browser-panels"
        layout={{
          mode: 'split',
          flow: 'bounded',
          appearance: 'separated',
          widths: { preview: browser.previewWidth },
          onWidthsChange: (widths) =>
            browser.setPreviewWidth(widths.preview ?? browser.previewWidth),
          panels: [
            {
              id: 'items',
              chrome: 'none',
              appearance: 'plain',
              content: (
                <ItemsView
                  items={shown}
                  groups={groups}
                  mode={viewMode}
                  layout={listing.layout}
                  label={listing.title}
                  selection={selection}
                  onSelectionChange={handleSelectionChange}
                  isWindowActive={isWindowActive}
                  thumbnails={thumbnails}
                  tagsOf={tags.tagsOf}
                  tagStyle={tagStyle}
                  renamingKey={renamingKey}
                  onRenameText={(text) => {
                    if (renaming.current) renaming.current.text = text;
                  }}
                  onRenameDone={commitRename}
                  order={order}
                  onSort={(column) => browser.setOrder(location, sortBy(order, column))}
                  dateColumn={
                    location.kind === 'trash'
                      ? 'deleted'
                      : listing.layout === 'photos'
                        ? 'taken'
                        : 'date'
                  }
                  originColumn={
                    isSearching ? 'location' : location.kind === 'trash' ? 'origin' : null
                  }
                  originOf={originOf}
                  onOpen={activate}
                  canDrop={chooser ? () => false : commands.canDrop}
                  onDrop={commands.drop}
                  dropFolderFor={
                    chooser ? undefined : isSearching ? searchDropFolderFor : commands.dropFolderFor
                  }
                  onDropFiles={chooser ? undefined : commands.dropFiles}
                  onSpringOpen={
                    chooser
                      ? undefined
                      : (folder) => {
                          if (folder.source === 'local' && folder.isFolder) {
                            browser.springOpen({ kind: 'folder', uri: folder.uri });
                          }
                        }
                  }
                  onAction={(item, action) => {
                    if (action === 'activate') activate(item);
                    else if (action === 'select') {
                      handleSelectionChange((current) =>
                        isSelected(current, item.key)
                          ? { ...current, keys: current.keys.filter((key) => key !== item.key) }
                          : {
                              keys: [...current.keys, item.key],
                              anchor: item.key,
                              focus: item.key,
                            },
                      );
                    } else if (action === 'rename' && item.source === 'local') {
                      setSelection({ keys: [item.key], anchor: item.key, focus: item.key });
                      startRename(item);
                    } else if (action === 'trash') {
                      setSelection({ keys: [item.key], anchor: item.key, focus: item.key });
                      if (location.kind === 'trash') commands.putBack.run();
                      else commands.moveToTrash.run();
                    }
                  }}
                  itemActions={itemActions}
                  menus={
                    chooser
                      ? null
                      : {
                          item: (item) => <ItemMenuRows item={item} commands={commands} />,
                          background: (
                            <BackgroundMenuRows
                              commands={commands}
                              location={location}
                              viewMode={viewMode}
                              onViewMode={(mode) => browser.setViewMode(location, mode)}
                              grouping={grouping}
                              onGrouping={browser.setGrouping}
                            />
                          ),
                        }
                  }
                  dimmedKeys={dimmedKeys}
                  emptyState={emptyState}
                  onColumnsChange={(next) => {
                    columns.current = next;
                  }}
                  onEndReached={listing.onEndReached}
                />
              ),
            },
            // View > Show Preview, Finder's: the item selected, or what the place holds.
            ...(browser.isPreviewShown
              ? [
                  {
                    id: 'preview',
                    width: browser.previewWidth,
                    minWidth: PREVIEW_MIN_WIDTH,
                    maxWidth: PREVIEW_MAX_WIDTH,
                    resizable: true,
                    resizeLabel: strings.resizePreview,
                    chrome: 'none',
                    appearance: 'plain',
                    scroll: 'panel',
                    content: previewed ? (
                      <PreviewPane
                        key={previewed.key}
                        item={previewed}
                        thumbnailUrl={thumbnails.get(previewed.key) ?? null}
                        origin={originOf(previewed) || null}
                        tags={tags.tagsOf(previewed)}
                        onTagsChange={
                          !chooser && canTag(previewed)
                            ? (change) => commands.changeTags([previewed], change)
                            : null
                        }
                      />
                    ) : (
                      <View
                        className="flex-1 items-center justify-center p-4"
                        testID="preview-none"
                      >
                        <Text variant="body-2-regular" className="text-center text-text-secondary">
                          {selected.length > 1 ? statusText : strings.noSelection}
                        </Text>
                      </View>
                    ),
                  } satisfies AppShellPanelDefinition,
                ]
              : []),
          ],
        }}
      />
    );

  const confirmTitle = (() => {
    if (!confirm) return '';
    switch (confirm.kind) {
      case 'empty-trash':
        return strings.confirm.emptyTrash(location.kind === 'trash' ? items.length : 0);
      case 'erase':
        return strings.confirm.deleteImmediately(confirm.items.length);
      case 'delete-for-good':
        return strings.confirm.deleteForGood(confirm.items.length);
      case 'delete-album':
        return strings.confirm.deleteAlbum(confirm.album.name);
    }
  })();

  // Where the platform has a menu bar the menus are described to it and draw
  // nothing here; elsewhere a wide window draws them above the toolbar.
  const menus = (
    <BrowserMenus
      commands={commands}
      location={location}
      places={places}
      viewMode={viewMode}
      onViewMode={(mode) => browser.setViewMode(location, mode)}
      order={order}
      onSortColumn={(column) =>
        browser.setOrder(location, order.column === column ? order : sortBy(order, column))
      }
      grouping={grouping}
      onGrouping={browser.setGrouping}
      isShowingHidden={browser.isShowingHidden}
      onShowingHidden={browser.setShowingHidden}
      isPreviewShown={browser.isPreviewShown}
      onPreviewShown={browser.setPreviewShown}
      isPathBarShown={browser.isPathBarShown}
      onPathBarShown={browser.setPathBarShown}
      canGoBack={browser.canGoBack}
      canGoForward={browser.canGoForward}
      onBack={browser.goBack}
      onForward={browser.goForward}
      onEnclosing={enclosing ? () => browser.navigate(enclosing) : null}
      onGo={browser.navigate}
      onSettings={() => browser.setSettingsOpen(true)}
      onFind={() => setFindRequest((count) => count + 1)}
    />
  );

  return (
    <Screen
      testID="browser"
      scroll="none"
      header={
        <Toolbar
          title={chooser ? chooserTitle(chooser.request, strings) : listing.title}
          placeName={listing.title}
          viewMode={viewMode}
          onViewMode={(mode) => browser.setViewMode(location, mode)}
          search={search}
          onSearch={setSearch}
          findRequest={findRequest}
          searchTokens={platformSearch !== null && folderUri !== null ? searchTokens : null}
          onSearchTokens={setSearchTokens}
          canGoBack={browser.canGoBack}
          canGoForward={browser.canGoForward}
          onBack={browser.goBack}
          onForward={browser.goForward}
          isPreviewShown={browser.isPreviewShown}
          onPreviewShown={browser.setPreviewShown}
          onUpload={
            !chooser && location.kind === 'cloud' && uploadPicked.isEnabled
              ? uploadPicked.run
              : null
          }
          onTags={!chooser && commands.editTags.isEnabled ? commands.editTags.run : null}
        />
      }
      bottomBar={
        chooser ? (
          <View>
            {status === 'ready' ? (
              // The panel always shows where it is: its title is the asking application's.
              <StatusBar
                text={statusText}
                path={shownPath}
                onPath={(uri) => browser.navigate({ kind: 'folder', uri })}
                drops={null}
                progress={null}
              />
            ) : null}
            <ChooserBar
              mode={chooser.request.mode}
              confirmLabel={
                chooser.request.mode === 'save' ? strings.chooser.save : strings.chooser.open
              }
              isConfirmEnabled={isChooserConfirmEnabled}
              onConfirm={confirmChooser}
              onCancel={() => answerCancelled(chooser)}
              name={browser.saveName}
              onName={browser.setSaveName}
              onNewFolder={
                (chooser.request.mode === 'save' || chooser.request.directory) &&
                commands.newFolder.isEnabled
                  ? commands.newFolder.run
                  : null
              }
            />
          </View>
        ) : status === 'ready' ? (
          <StatusBar
            text={statusText}
            path={browser.isPathBarShown ? shownPath : []}
            onPath={(uri) => browser.navigate({ kind: 'folder', uri })}
            drops={{
              onDropFiles: commands.dropFiles,
              onSpringOpen: (uri) => browser.springOpen({ kind: 'folder', uri }),
            }}
            progress={progress}
          />
        ) : undefined
      }
    >
      {chooser ? null : platformMenuBar ? menus : <InWindowMenus>{menus}</InWindowMenus>}
      {isSearching ? (
        <SearchScopeBar
          scope={searchScope}
          onScope={setSearchScope}
          folderName={listing.title}
          isIndexing={found.data?.indexing === true}
        />
      ) : null}
      {body}
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirm(null);
        }}
        title={confirmTitle}
        description={
          confirm?.kind === 'delete-album'
            ? strings.confirm.deleteAlbumBody
            : strings.confirm.cannotUndo
        }
        confirmLabel={
          confirm?.kind === 'empty-trash'
            ? strings.confirm.emptyTrashAction
            : confirm?.kind === 'delete-album'
              ? strings.confirm.deleteAlbumAction
              : strings.confirm.deleteAction
        }
        cancelLabel={strings.cancel}
        destructive
        onConfirm={() => {
          if (confirm) confirmed(confirm);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
        testID="confirm"
      />
      <AlertDialog
        open={problem !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setProblem(null);
        }}
        title={problem?.title ?? ''}
        description={problem?.description}
        confirmLabel={strings.ok}
        hideCancel
        onConfirm={() => setProblem(null)}
        testID="problem"
      />
      <AlertDialog
        open={replacing !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setReplacing(null);
        }}
        title={replacing ? strings.chooser.replaceTitle(replacing.name) : ''}
        description={strings.chooser.replaceBody(listing.title)}
        confirmLabel={strings.chooser.replace}
        cancelLabel={strings.cancel}
        destructive
        onConfirm={() => {
          if (replacing) answer([replacing.uri]);
          setReplacing(null);
        }}
        onCancel={() => setReplacing(null)}
        testID="replace-confirm"
      />
      {tagsPanelItems.length > 0 ? (
        <TagsDialog
          items={tagsPanelItems}
          tagsOf={tags.tagsOf}
          onChange={(change) => commands.changeTags(tagsPanelItems, change)}
          onClose={() => setTagsPanelKeys(null)}
        />
      ) : null}
      {infoItems.length > 0 ? (
        <InfoDialog
          items={infoItems}
          tagsOf={tags.tagsOf}
          thumbnailUrl={
            infoItems.length === 1 && infoItems[0]
              ? (thumbnails.get(infoItems[0].key) ?? null)
              : null
          }
          originOf={originOf}
          onChange={(change) => commands.changeTags(infoItems, change)}
          onClose={() => setInfoKeys(null)}
        />
      ) : null}
      {versionsOf && backups ? (
        <VersionsDialog
          backups={backups}
          state={backupsInfo.state}
          item={versionsOf}
          onRestored={showRestored}
          onClose={() => setVersionsOf(null)}
        />
      ) : null}
      <PreviewDialog
        item={previewItem}
        origin={previewItem ? originOf(previewItem) || null : null}
        onClose={() => setPreviewItem(null)}
      />
      {albumBeingRenamed ? (
        <AlbumNameDialog
          key={albumBeingRenamed.id}
          isOpen
          title={strings.renameAlbumTitle}
          initialName={albumBeingRenamed.name}
          confirmLabel={strings.save}
          onConfirm={(name) => commands.renameAlbumTo(albumBeingRenamed, name)}
          onClose={() => setAlbumBeingRenamed(null)}
        />
      ) : null}
    </Screen>
  );
}
