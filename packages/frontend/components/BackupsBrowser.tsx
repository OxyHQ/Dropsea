/**
 * Browse Backups, Time Machine's “Enter Time Machine” done in the window: the folder as it was at
 * a backup, its items as that backup held them (those no longer in the folder said so), and the
 * backups beside it as a timeline, newest first and chosen; folders opened at the same backup;
 * the selection restored where it was (a name taken there asked about: Keep Both or Replace, Apply
 * to All) or into a folder the person chooses; Done goes back to the folder as it is now. Restored,
 * the window shows the folder now with what came back selected.
 */
import { Button } from '@oxy.so/bloom/button';
import { ButtonGroup, ButtonGroupItem } from '@oxy.so/bloom/button-group';
import { EmptyState } from '@oxy.so/bloom/empty-state';
import { RiArrowLeftSLine, RiArrowRightSLine, RiHistoryLine } from '@oxy.so/bloom/icons';
import { Item } from '@oxy.so/bloom/item';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from '@oxy.so/bloom/menubar';
import { PageHeader } from '@oxy.so/bloom/page-header';
import type { PlatformBackupItem } from '@oxy.so/bloom/platform-surface';
import { usePlatformMenuBar } from '@oxy.so/bloom/platform-surface';
import { Screen } from '@oxy.so/bloom/screen';
import { toast } from '@oxy.so/bloom/toast';
import { Text } from '@oxy.so/bloom/typography';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  BackupRow,
  PeriodHeading,
  RestoreProgressRow,
  useBackupDate,
} from '@/components/BackupParts';
import { ItemIcon } from '@/components/ItemIcon';
import { RestoreAlert } from '@/components/RestoreAlert';
import { useBackupContents, useBackups, useVersions } from '@/hooks/use-backups';
import { useLocalFolder } from '@/hooks/use-local-folder';
import { useLocalPlaces } from '@/hooks/use-local-places';
import { useLocale } from '@/hooks/use-locale';
import { useRestore } from '@/hooks/use-restore';
import { backupKey, destinationOf, groupByPeriod } from '@/lib/backups';
import { formatDate, formatSize } from '@/lib/format';
import { kindOf } from '@/lib/kinds';
import { folderName, isSameUri, isWithinUri, parentUri } from '@/lib/local-places';
import { compareNames } from '@/lib/names';
import { pickFolder } from '@/lib/pick-folder';
import { hrefFor } from '@/lib/routes';

const TIMELINE_WIDTH = 240;
const ICON_SIZE = 28;

/** Leaves the backups for the folder as it is now: back where the window came from, if it did. */
function leave(folderUri: string) {
  if (router.canGoBack()) router.back();
  else router.replace(hrefFor({ kind: 'folder', uri: folderUri }));
}

export function BackupsBrowser({ folderUri }: { folderUri: string }) {
  const { strings, locale } = useLocale();
  const { places } = useLocalPlaces();
  const { backups, state, isAvailable, isPending } = useBackups();
  const dateOf = useBackupDate();
  const platformMenuBar = usePlatformMenuBar();
  // The folder shown: the one the backups were entered at, or one opened inside it.
  const [folder, setFolder] = useState(folderUri);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const timeline = useVersions(backups, folderUri);
  const backupsHeld = (timeline.data ?? []).filter((version) => version.isDirectory);
  const chosen =
    backupsHeld.find((version) => backupKey(version.backup) === chosenKey) ??
    backupsHeld[0] ??
    null;
  const contents = useBackupContents(backups, chosen?.backup ?? null, folder);
  const live = useLocalFolder(folder);
  const restoring = useRestore(backups, state);
  const isBusy = restoring.progress !== null || restoring.question !== null;

  const liveNames = new Set(live.status === 'ready' ? live.items.map((item) => item.name) : []);
  const items = [...(contents.data ?? [])].sort((first, second) => {
    if (first.isDirectory !== second.isDirectory) return first.isDirectory ? -1 : 1;
    return compareNames(first.name, second.name);
  });
  const chosenItems = items.filter((item) => selected.includes(item.uri));
  const title = strings.backups.backupsTitle(folderName(folder, places));

  const choose = (key: string) => {
    setChosenKey(key);
    setSelected([]);
  };
  const open = (item: PlatformBackupItem) => {
    setFolder(item.uri);
    setSelected([]);
  };
  const toggle = (item: PlatformBackupItem) =>
    setSelected((current) =>
      current.includes(item.uri)
        ? current.filter((uri) => uri !== item.uri)
        : [...current, item.uri],
    );
  const restoreInto = async (toFolderUri: string | null) => {
    if (!chosen || chosenItems.length === 0) return;
    const restored = await restoring.restore(
      chosen.backup,
      chosenItems.map((item) => ({
        uri: item.uri,
        name: item.name,
        isDirectory: item.isDirectory,
      })),
      toFolderUri,
    );
    const [first] = restored;
    if (!first) return;
    if (restored.length > 1) toast.success(strings.backups.restoredItems(restored.length));
    // Time Machine leaves for the folder as it is now, showing what came back.
    router.replace(
      hrefFor({ kind: 'folder', uri: toFolderUri ?? parentUri(first), select: first }),
    );
  };
  const run = (work: () => Promise<void>) => {
    work().catch((error: unknown) => {
      console.warn('Dropsea could not restore from a backup', { folder, error });
      toast.error(strings.couldNotChange);
    });
  };
  const restoreHere = () => run(() => restoreInto(null));
  const restoreTo = () =>
    run(async () => {
      const into = await pickFolder(folderUri);
      if (into) await restoreInto(into);
    });
  const canRestore = chosen !== null && chosenItems.length > 0 && !isBusy;
  const enclosing =
    !isSameUri(folder, folderUri) && isWithinUri(folder, folderUri) ? parentUri(folder) : null;

  const menus = (
    <Menubar>
      <MenubarMenu value="file">
        <MenubarTrigger>{strings.menus.file}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem disabled={!canRestore} onPress={restoreHere}>
            {strings.backups.restore}
          </MenubarItem>
          <MenubarItem disabled={!canRestore} onPress={restoreTo}>
            {strings.backups.restoreTo}
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem disabled={isBusy} onPress={() => leave(folderUri)}>
            {strings.backups.done}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu value="edit">
        <MenubarTrigger>{strings.menus.edit}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem
            action="selectAll"
            disabled={items.length === 0}
            onPress={() => setSelected(items.map((item) => item.uri))}
          >
            {strings.menus.selectAll}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu value="go">
        <MenubarTrigger>{strings.menus.go}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem
            shortcut="Mod+ArrowUp"
            disabled={enclosing === null}
            onPress={() => {
              if (enclosing) setFolder(enclosing);
            }}
          >
            {strings.backups.enclosing}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );

  const body = (() => {
    if (!isAvailable || timeline.isError) {
      return isPending || timeline.isPending ? null : (
        <EmptyState
          variant="compact"
          icon={RiHistoryLine}
          title={
            timeline.isError
              ? strings.backups.couldNotRead
              : strings.backups.noBackups(folderName(folderUri, places))
          }
          testID="backups-none"
        />
      );
    }
    if (timeline.isPending) {
      return (
        <Text variant="caption-1-regular" className="p-4 text-text-secondary">
          {strings.backups.looking}
        </Text>
      );
    }
    if (backupsHeld.length === 0) {
      return (
        <EmptyState
          variant="compact"
          icon={RiHistoryLine}
          title={strings.backups.noBackups(folderName(folderUri, places))}
          testID="backups-none"
        />
      );
    }
    return (
      <View className="flex-1 flex-row">
        <ScrollView
          className="flex-1"
          accessibilityRole="list"
          accessibilityLabel={title}
          testID="backup-items"
        >
          {contents.isError ? (
            <EmptyState
              variant="compact"
              icon={RiHistoryLine}
              title={strings.backups.notInBackup}
              testID="backup-folder-missing"
            />
          ) : contents.data && items.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={RiHistoryLine}
              title={strings.backups.emptyFolder}
              testID="backup-folder-empty"
            />
          ) : (
            items.map((item) => {
              const isGone = !liveNames.has(item.name);
              const facts = [
                item.lastModified === null
                  ? null
                  : formatDate(item.lastModified, Date.now(), locale, strings),
                item.size === null ? null : formatSize(item.size, strings.units, locale),
                isGone ? strings.backups.notHereNow : null,
              ].filter((fact): fact is string => fact !== null);
              return (
                <Item
                  key={item.uri}
                  size="sm"
                  title={item.name}
                  subtitle={facts.join(' · ')}
                  selected={selected.includes(item.uri)}
                  role="option"
                  accessibilityLabel={item.name}
                  onPress={() => toggle(item)}
                  leading={
                    <ItemIcon
                      kind={kindOf({ name: item.name, isFolder: item.isDirectory, mime: null })}
                      size={ICON_SIZE}
                      thumbnailUrl={null}
                    />
                  }
                  trailing={
                    item.isDirectory ? (
                      <Button
                        size="xs"
                        iconOnly
                        appearance="plain"
                        tone="neutral"
                        leadingIcon={RiArrowRightSLine}
                        accessibilityLabel={strings.backups.open(item.name)}
                        onPress={() => open(item)}
                        testID="backup-open-folder"
                      />
                    ) : undefined
                  }
                  testID="backup-item"
                />
              );
            })
          )}
        </ScrollView>
        <ScrollView
          className="border-l border-border"
          style={{ width: TIMELINE_WIDTH, flexGrow: 0 }}
          accessibilityRole="list"
          accessibilityLabel={strings.backups.timeline}
          testID="backup-timeline"
        >
          {groupByPeriod(
            backupsHeld,
            (version) => version.backup.time,
            new Date().setHours(0, 0, 0, 0),
          ).map((group) => (
            <View key={group.key}>
              <PeriodHeading period={group.period} />
              {group.entries.map((version) => {
                const key = backupKey(version.backup);
                return (
                  <BackupRow
                    key={key}
                    date={dateOf(version.backup.time)}
                    detail={
                      destinationOf(state, version.backup)?.name ??
                      strings.backups.unknownDestination
                    }
                    isSelected={chosen !== null && backupKey(chosen.backup) === key}
                    onPress={() => choose(key)}
                    testID="backup"
                  />
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  })();

  return (
    <Screen
      testID="backups"
      scroll="none"
      header={
        <PageHeader
          testID="backups-toolbar"
          onBack={null}
          scrim="none"
          leading={
            <ButtonGroup accessibilityLabel={strings.backups.timeline}>
              <ButtonGroupItem
                iconOnly
                leadingIcon={RiArrowLeftSLine}
                accessibilityLabel={strings.backups.enclosing}
                disabled={enclosing === null}
                onPress={() => {
                  if (enclosing) setFolder(enclosing);
                }}
                testID="backups-enclosing"
              />
            </ButtonGroup>
          }
          title={title}
          actions={() => (
            <Button
              appearance="outline"
              tone="neutral"
              disabled={isBusy}
              onPress={() => leave(folderUri)}
              testID="backups-done"
            >
              {strings.backups.done}
            </Button>
          )}
        />
      }
      bottomBar={
        <View className="flex-row items-center gap-2 border-t border-border px-3 py-2">
          <View className="flex-1">
            {restoring.progress ? (
              <RestoreProgressRow progress={restoring.progress} onStop={restoring.stop} />
            ) : contents.data ? (
              // Counted once the backup's items are known, as the folder's status bar is: while
              // Dropsea looks there are not none, and the reader would say so.
              <Text
                variant="caption-1-regular"
                className="text-text-secondary"
                accessibilityLiveRegion="polite"
                testID="backups-status"
              >
                {chosenItems.length > 0
                  ? strings.selected(chosenItems.length, items.length)
                  : strings.items(items.length)}
              </Text>
            ) : null}
          </View>
          <Button
            appearance="outline"
            tone="neutral"
            disabled={!canRestore}
            onPress={restoreTo}
            testID="backups-restore-to"
          >
            {strings.backups.restoreTo}
          </Button>
          <Button disabled={!canRestore} onPress={restoreHere} testID="backups-restore">
            {strings.backups.restore}
          </Button>
        </View>
      }
    >
      {platformMenuBar ? menus : null}
      {body}
      <RestoreAlert question={restoring.question} onAnswer={restoring.answer} />
    </Screen>
  );
}
