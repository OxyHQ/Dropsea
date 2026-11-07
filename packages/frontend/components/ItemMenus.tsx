/**
 * The context menus: an item's (for the selection it is in) and the
 * background's (for the place itself), with the rows the menu bar has for
 * them.
 */
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuSwatchRow,
} from '@oxy.so/bloom/context-menu';
import { useTheme } from '@oxy.so/bloom/theme';
import type { ViewMode } from '@/components/BrowserProvider';
import type { Commands } from '@/hooks/use-commands';
import { useLocale } from '@/hooks/use-locale';
import type { Item, Location } from '@/lib/items';
import { tagColorValue } from '@/lib/tags';

export function ItemMenuRows({ item, commands }: { item: Item; commands: Commands }) {
  const { strings } = useLocale();
  const theme = useTheme();
  if (item.source === 'local-trash' || item.source === 'cloud-trash') {
    return (
      <>
        <ContextMenuItem onPress={commands.putBack.run}>{strings.menus.putBack}</ContextMenuItem>
        <ContextMenuItem tone="danger" onPress={commands.eraseNow.run}>
          {strings.menus.deleteImmediately}
        </ContextMenuItem>
      </>
    );
  }
  const enabledAlbums = commands.addToAlbum.filter(({ command }) => command.isEnabled);
  const coloured = commands.tagChoices.flatMap((choice) =>
    choice.definition.color ? [{ ...choice, color: choice.definition.color }] : [],
  );
  return (
    <>
      <ContextMenuItem onPress={() => commands.openItem(item)}>
        {strings.menus.open}
      </ContextMenuItem>
      {commands.preview.isEnabled ? (
        <ContextMenuItem onPress={commands.preview.run}>{strings.menus.preview}</ContextMenuItem>
      ) : null}
      <ContextMenuItem onPress={commands.getInfo.run}>{strings.getInfo}</ContextMenuItem>
      <ContextMenuSeparator />
      {commands.rename.isEnabled ? (
        <ContextMenuItem onPress={commands.rename.run}>{strings.menus.rename}</ContextMenuItem>
      ) : null}
      {commands.upload.isEnabled ? (
        <ContextMenuItem onPress={commands.upload.run}>{strings.menus.upload}</ContextMenuItem>
      ) : null}
      {commands.download.isEnabled ? (
        <ContextMenuItem onPress={commands.download.run}>{strings.menus.download}</ContextMenuItem>
      ) : null}
      {commands.download.isEnabled &&
      commands.downloadTo.some(({ command }) => command.isEnabled) ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>{strings.menus.downloadTo}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {commands.downloadTo.map(({ place, command }) => (
              <ContextMenuItem key={place.uri} onPress={command.run}>
                {place.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
      {enabledAlbums.length > 0 ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>{strings.menus.addToAlbum}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {enabledAlbums.map(({ album, command }) => (
              <ContextMenuItem key={album.id} onPress={command.run}>
                {album.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
      {commands.removeFromAlbum.isEnabled ? (
        <ContextMenuItem onPress={commands.removeFromAlbum.run}>
          {strings.menus.removeFromAlbum}
        </ContextMenuItem>
      ) : null}
      {item.source === 'album' ? (
        <>
          <ContextMenuItem onPress={commands.renameAlbum.run}>
            {strings.menus.renameAlbum}
          </ContextMenuItem>
          <ContextMenuItem tone="danger" onPress={commands.deleteAlbum.run}>
            {strings.menus.deleteAlbum}
          </ContextMenuItem>
        </>
      ) : null}
      {commands.editTags.isEnabled ? (
        <>
          <ContextMenuSeparator />
          {/* Finder's row of colour dots: each favourite tag with a colour, on all of the
              selection, on some, or on none; a press puts it on all or takes it off all. */}
          {coloured.length > 0 ? (
            <ContextMenuSwatchRow
              accessibilityLabel={strings.tags.section}
              swatches={coloured.map(({ definition, color, state, command }) => ({
                key: definition.name,
                color: tagColorValue(color, theme.isDark),
                name: definition.name,
                state,
                caption:
                  state === 'on'
                    ? strings.tags.remove(definition.name)
                    : strings.tags.add(definition.name),
                disabled: !command.isEnabled,
              }))}
              onSelect={(key) =>
                coloured.find(({ definition }) => definition.name === key)?.command.run()
              }
            />
          ) : null}
          <ContextMenuItem onPress={commands.editTags.run}>{strings.tags.menu}</ContextMenuItem>
        </>
      ) : null}
      {commands.moveToTrash.isEnabled ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onPress={commands.moveToTrash.run}>
            {strings.menus.moveToTrash}
          </ContextMenuItem>
        </>
      ) : null}
      {commands.deleteForGood.isEnabled ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem tone="danger" onPress={commands.deleteForGood.run}>
            {strings.menus.deleteForGood}
          </ContextMenuItem>
        </>
      ) : null}
    </>
  );
}

export function BackgroundMenuRows({
  commands,
  location,
  viewMode,
  onViewMode,
}: {
  commands: Commands;
  location: Location;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
}) {
  const { strings } = useLocale();
  return (
    <>
      {commands.newFolder.isEnabled ? (
        <ContextMenuItem onPress={commands.newFolder.run}>
          {strings.menus.newFolder}
        </ContextMenuItem>
      ) : null}
      {location.kind === 'albums' && commands.newAlbum.isEnabled ? (
        <ContextMenuItem onPress={commands.newAlbum.run}>{strings.menus.newAlbum}</ContextMenuItem>
      ) : null}
      {location.kind === 'cloud' && commands.uploadPicked.isEnabled ? (
        <ContextMenuItem onPress={commands.uploadPicked.run}>
          {strings.menus.uploadFiles}
        </ContextMenuItem>
      ) : null}
      {location.kind === 'trash' ? (
        <ContextMenuItem
          tone="danger"
          disabled={!commands.emptyTrash.isEnabled}
          onPress={commands.emptyTrash.run}
        >
          {strings.menus.emptyTrash}
        </ContextMenuItem>
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem onPress={() => onViewMode(viewMode === 'icons' ? 'list' : 'icons')}>
        {`${strings.view} ${viewMode === 'icons' ? strings.asList : strings.asIcons}`}
      </ContextMenuItem>
      <ContextMenuItem disabled={!commands.selectAll.isEnabled} onPress={commands.selectAll.run}>
        {strings.menus.selectAll}
      </ContextMenuItem>
    </>
  );
}
