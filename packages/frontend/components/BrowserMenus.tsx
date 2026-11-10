/**
 * The window's menus, as ADR 0027 lists them: File, Edit, View and Go, with
 * their shortcuts. Where the platform has a menu bar of its own (OxyOS's top
 * bar) Bloom's `Menubar` describes them to it; elsewhere it draws them in the
 * window.
 */
import { useAppShell } from '@oxy.so/bloom/app-shell';
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@oxy.so/bloom/menubar';
import { type PlatformEditing, usePlatformEditing } from '@oxy.so/bloom/platform-surface';
import { useCallback, useSyncExternalStore } from 'react';
import type { ViewMode } from '@/components/BrowserProvider';
import type { Commands } from '@/hooks/use-commands';
import { useLocale } from '@/hooks/use-locale';
import type { Location } from '@/lib/items';
import type { LocalPlace } from '@/lib/local-places';
import type { Strings } from '@/lib/strings';
import type { Grouping, SortColumn, SortOrder } from '@/lib/sorting';
import { KEYBOARD_TAG_COUNT } from '@/lib/tags';

const SORT_COLUMNS: readonly SortColumn[] = ['name', 'kind', 'date', 'size', 'tags'];

function isViewMode(value: string): value is ViewMode {
  return value === 'icons' || value === 'list';
}

function isSortColumn(value: string): value is SortColumn {
  return SORT_COLUMNS.some((column) => column === value);
}

/** View › Group By's choices, in Finder's order. */
export const GROUPINGS: readonly Grouping[] = ['none', 'kind', 'date', 'tags'];

export function isGrouping(value: string): value is Grouping {
  return GROUPINGS.some((grouping) => grouping === value);
}

/** A grouping's name in the menus: its column's, the Trash's dates being when items went there. */
export function groupingName(grouping: Grouping, strings: Strings, isInTrash: boolean): string {
  switch (grouping) {
    case 'none':
      return strings.noGroups;
    case 'date':
      return isInTrash ? strings.columns.deleted : strings.columns.date;
    case 'kind':
    case 'tags':
      return strings.columns[grouping];
  }
}

const subscribeNowhere = () => () => undefined;

/**
 * Whether a text field has the keys (the rename, the search): Undo and Redo are its own then, so
 * they say no move, as a Mac's Edit menu names the first responder's undo.
 */
function useIsFieldEditing(editing: PlatformEditing | null): boolean {
  const subscribe = useCallback(
    (listener: () => void) => (editing ? editing.subscribe(listener) : subscribeNowhere()),
    [editing],
  );
  return useSyncExternalStore(
    subscribe,
    () => editing?.getState() != null,
    () => false,
  );
}

export function BrowserMenus({
  commands,
  location,
  places,
  viewMode,
  onViewMode,
  order,
  onSortColumn,
  grouping,
  onGrouping,
  isShowingHidden,
  onShowingHidden,
  isPreviewShown,
  onPreviewShown,
  isPathBarShown,
  onPathBarShown,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onEnclosing,
  onGo,
  onSettings,
}: {
  commands: Commands;
  location: Location;
  places: readonly LocalPlace[];
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  order: SortOrder;
  onSortColumn: (column: SortColumn) => void;
  /** What the items are grouped by; null where they never are (Photos and the albums). */
  grouping: Grouping | null;
  onGrouping: (grouping: Grouping) => void;
  isShowingHidden: boolean;
  onShowingHidden: (isShowing: boolean) => void;
  isPreviewShown: boolean;
  onPreviewShown: (isShown: boolean) => void;
  isPathBarShown: boolean;
  onPathBarShown: (isShown: boolean) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onEnclosing: (() => void) | null;
  onGo: (location: Location) => void;
  /** Dropsea's settings (its Tags). */
  onSettings: () => void;
}) {
  const { strings } = useLocale();
  const { navigationDock } = useAppShell();
  const isFieldEditing = useIsFieldEditing(usePlatformEditing());
  const isInTrash = location.kind === 'trash';
  const home = places.find((place) => place.kind === 'home');
  return (
    <Menubar>
      <MenubarMenu value="file">
        <MenubarTrigger>{strings.menus.file}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem
            shortcut="Mod+Shift+N"
            disabled={!commands.newFolder.isEnabled}
            onPress={commands.newFolder.run}
          >
            {strings.menus.newFolder}
          </MenubarItem>
          <MenubarItem
            shortcut="Mod+Alt+N"
            disabled={!commands.newAlbum.isEnabled}
            onPress={commands.newAlbum.run}
          >
            {strings.menus.newAlbum}
          </MenubarItem>
          <MenubarItem
            shortcut="Mod+O"
            disabled={!commands.open.isEnabled}
            onPress={commands.open.run}
          >
            {strings.menus.open}
          </MenubarItem>
          <MenubarItem
            shortcut="Mod+Y"
            disabled={!commands.preview.isEnabled}
            onPress={commands.preview.run}
          >
            {strings.menus.preview}
          </MenubarItem>
          <MenubarItem
            shortcut="Mod+I"
            disabled={!commands.getInfo.isEnabled}
            onPress={commands.getInfo.run}
          >
            {strings.getInfo}
          </MenubarItem>
          {commands.hasBackups ? (
            <>
              <MenubarItem
                disabled={!commands.browseVersions.isEnabled}
                onPress={commands.browseVersions.run}
              >
                {strings.backups.browseVersions}
              </MenubarItem>
              <MenubarItem
                disabled={!commands.browseBackups.isEnabled}
                onPress={commands.browseBackups.run}
              >
                {strings.backups.browseBackups}
              </MenubarItem>
            </>
          ) : null}
          <MenubarSeparator />
          {/* Finder's tags in the File menu: its first seven favourites on Control-1 to Control-7
              and Control-0 for none, here Mod+Alt (Ctrl is the applications' ⌘ on OxyOS, and
              Ctrl+1 and Ctrl+2 are the views). */}
          <MenubarSub>
            <MenubarSubTrigger disabled={!commands.editTags.isEnabled}>
              {strings.tags.section}
            </MenubarSubTrigger>
            <MenubarSubContent>
              {commands.tagChoices.map(({ definition, state, command }, index) => (
                <MenubarCheckboxItem
                  key={definition.name}
                  checked={state === 'on'}
                  disabled={!command.isEnabled}
                  onCheckedChange={command.run}
                  shortcut={index < KEYBOARD_TAG_COUNT ? `Mod+Alt+${index + 1}` : undefined}
                >
                  {definition.name}
                </MenubarCheckboxItem>
              ))}
              <MenubarItem
                shortcut="Mod+Alt+0"
                disabled={!commands.removeAllTags.isEnabled}
                onPress={commands.removeAllTags.run}
              >
                {strings.tags.removeAll}
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled={!commands.editTags.isEnabled} onPress={commands.editTags.run}>
                {strings.tags.menu}
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          {isInTrash ? (
            <>
              <MenubarItem disabled={!commands.putBack.isEnabled} onPress={commands.putBack.run}>
                {strings.menus.putBack}
              </MenubarItem>
              <MenubarItem
                shortcut="Mod+Alt+Backspace"
                disabled={!commands.eraseNow.isEnabled}
                onPress={commands.eraseNow.run}
              >
                {strings.menus.deleteImmediately}
              </MenubarItem>
            </>
          ) : (
            <>
              <MenubarItem disabled={!commands.rename.isEnabled} onPress={commands.rename.run}>
                {strings.menus.rename}
              </MenubarItem>
              <MenubarItem
                shortcut="Mod+D"
                disabled={!commands.duplicate.isEnabled}
                onPress={commands.duplicate.run}
              >
                {strings.menus.duplicate}
              </MenubarItem>
              {commands.hasPlatformTrash || !commands.deleteForGood.isEnabled ? (
                <MenubarItem
                  shortcut="Mod+Backspace"
                  disabled={!commands.moveToTrash.isEnabled}
                  onPress={commands.moveToTrash.run}
                >
                  {strings.menus.moveToTrash}
                </MenubarItem>
              ) : (
                <MenubarItem
                  shortcut="Mod+Backspace"
                  disabled={!commands.deleteForGood.isEnabled}
                  onPress={commands.deleteForGood.run}
                >
                  {strings.menus.deleteForGood}
                </MenubarItem>
              )}
            </>
          )}
          <MenubarSeparator />
          <MenubarItem disabled={!commands.upload.isEnabled} onPress={commands.upload.run}>
            {strings.menus.upload}
          </MenubarItem>
          {commands.uploadPicked.isEnabled ? (
            <MenubarItem shortcut="Mod+U" onPress={commands.uploadPicked.run}>
              {strings.menus.uploadFiles}
            </MenubarItem>
          ) : null}
          <MenubarItem disabled={!commands.download.isEnabled} onPress={commands.download.run}>
            {strings.menus.download}
          </MenubarItem>
          {commands.downloadTo.length > 0 ? (
            <MenubarSub>
              <MenubarSubTrigger disabled={!commands.download.isEnabled}>
                {strings.menus.downloadTo}
              </MenubarSubTrigger>
              <MenubarSubContent>
                {commands.downloadTo.map(({ place, command }) => (
                  <MenubarItem key={place.uri} disabled={!command.isEnabled} onPress={command.run}>
                    {place.name}
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
          ) : null}
          {commands.addToAlbum.length > 0 ? (
            <MenubarSub>
              <MenubarSubTrigger
                disabled={!commands.addToAlbum.some(({ command }) => command.isEnabled)}
              >
                {strings.menus.addToAlbum}
              </MenubarSubTrigger>
              <MenubarSubContent>
                {commands.addToAlbum.map(({ album, command }) => (
                  <MenubarItem key={album.id} disabled={!command.isEnabled} onPress={command.run}>
                    {album.name}
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
          ) : null}
          {location.kind === 'album' || location.kind === 'albums' ? (
            <>
              <MenubarSeparator />
              {location.kind === 'album' ? (
                <MenubarItem
                  disabled={!commands.removeFromAlbum.isEnabled}
                  onPress={commands.removeFromAlbum.run}
                >
                  {strings.menus.removeFromAlbum}
                </MenubarItem>
              ) : null}
              <MenubarItem
                disabled={!commands.renameAlbum.isEnabled}
                onPress={commands.renameAlbum.run}
              >
                {strings.menus.renameAlbum}
              </MenubarItem>
              <MenubarItem
                disabled={!commands.deleteAlbum.isEnabled}
                onPress={commands.deleteAlbum.run}
              >
                {strings.menus.deleteAlbum}
              </MenubarItem>
            </>
          ) : null}
          <MenubarSeparator />
          <MenubarItem
            shortcut="Mod+Shift+Backspace"
            disabled={!commands.emptyTrash.isEnabled}
            onPress={commands.emptyTrash.run}
          >
            {strings.menus.emptyTrash}
          </MenubarItem>
          {commands.signIn.isEnabled ? (
            <>
              <MenubarSeparator />
              <MenubarItem onPress={commands.signIn.run}>{strings.menus.signIn}</MenubarItem>
            </>
          ) : null}
          <MenubarSeparator />
          <MenubarItem shortcut="Mod+," onPress={onSettings}>
            {strings.settings}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu value="edit">
        <MenubarTrigger>{strings.menus.edit}</MenubarTrigger>
        <MenubarContent>
          {/* Standard editing actions: a field with the keys takes them (its own undo, its text
              selected), else they are the window's, as a Mac's Edit menu goes to the first
              responder. */}
          <MenubarItem
            action="undo"
            disabled={!commands.undo.isEnabled}
            onPress={commands.undo.run}
          >
            {isFieldEditing ? strings.menus.undo : commands.undoName}
          </MenubarItem>
          <MenubarItem
            action="redo"
            disabled={!commands.redo.isEnabled}
            onPress={commands.redo.run}
          >
            {isFieldEditing ? strings.menus.redo : commands.redoName}
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            action="selectAll"
            disabled={!commands.selectAll.isEnabled}
            onPress={commands.selectAll.run}
          >
            {strings.menus.selectAll}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu value="view">
        <MenubarTrigger>{strings.menus.view}</MenubarTrigger>
        <MenubarContent>
          <MenubarRadioGroup
            value={viewMode}
            onValueChange={(next) => {
              if (isViewMode(next)) onViewMode(next);
            }}
          >
            <MenubarRadioItem value="icons" shortcut="Mod+1">
              {strings.asIcons}
            </MenubarRadioItem>
            <MenubarRadioItem value="list" shortcut="Mod+2">
              {strings.asList}
            </MenubarRadioItem>
          </MenubarRadioGroup>
          <MenubarSeparator />
          <MenubarItem shortcut="Mod+Shift+P" onPress={() => onPreviewShown(!isPreviewShown)}>
            {isPreviewShown ? strings.menus.hidePreview : strings.menus.showPreview}
          </MenubarItem>
          <MenubarItem shortcut="Mod+Alt+P" onPress={() => onPathBarShown(!isPathBarShown)}>
            {isPathBarShown ? strings.menus.hidePathBar : strings.menus.showPathBar}
          </MenubarItem>
          {navigationDock.available ? (
            <>
              <MenubarItem shortcut="Mod+Alt+S" onPress={navigationDock.toggleHidden}>
                {navigationDock.hidden ? strings.menus.showSidebar : strings.menus.hideSidebar}
              </MenubarItem>
              <MenubarSeparator />
            </>
          ) : null}
          {grouping !== null ? (
            <MenubarSub>
              <MenubarSubTrigger>{strings.groupBy}</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarRadioGroup
                  value={grouping}
                  onValueChange={(next) => {
                    if (isGrouping(next)) onGrouping(next);
                  }}
                >
                  {GROUPINGS.map((choice) => (
                    <MenubarRadioItem key={choice} value={choice}>
                      {groupingName(choice, strings, isInTrash)}
                    </MenubarRadioItem>
                  ))}
                </MenubarRadioGroup>
              </MenubarSubContent>
            </MenubarSub>
          ) : null}
          <MenubarSub>
            <MenubarSubTrigger>{strings.menus.sortBy}</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarRadioGroup
                value={order.column}
                onValueChange={(next) => {
                  if (isSortColumn(next)) onSortColumn(next);
                }}
              >
                {SORT_COLUMNS.map((column) => (
                  <MenubarRadioItem key={column} value={column}>
                    {column === 'date' && isInTrash
                      ? strings.columns.deleted
                      : strings.columns[column]}
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={isShowingHidden}
            onCheckedChange={onShowingHidden}
            shortcut="Mod+Shift+."
          >
            {strings.menus.showHidden}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu value="go">
        <MenubarTrigger>{strings.menus.go}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem shortcut="Mod+[" disabled={!canGoBack} onPress={onBack}>
            {strings.back}
          </MenubarItem>
          <MenubarItem shortcut="Mod+]" disabled={!canGoForward} onPress={onForward}>
            {strings.forward}
          </MenubarItem>
          <MenubarItem
            shortcut="Mod+ArrowUp"
            disabled={onEnclosing === null}
            onPress={() => onEnclosing?.()}
          >
            {strings.menus.enclosing}
          </MenubarItem>
          <MenubarSeparator />
          {places.map((place) => (
            <MenubarItem
              key={place.uri}
              shortcut={place === home ? 'Mod+Shift+H' : undefined}
              onPress={() => onGo({ kind: 'folder', uri: place.uri })}
            >
              {place.name}
            </MenubarItem>
          ))}
          <MenubarItem shortcut="Mod+Shift+I" onPress={() => onGo({ kind: 'cloud' })}>
            {strings.cloud}
          </MenubarItem>
          <MenubarItem onPress={() => onGo({ kind: 'photos' })}>{strings.photos}</MenubarItem>
          <MenubarItem onPress={() => onGo({ kind: 'albums' })}>{strings.albums}</MenubarItem>
          <MenubarItem onPress={() => onGo({ kind: 'trash' })}>{strings.trash}</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
