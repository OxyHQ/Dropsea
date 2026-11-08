/**
 * Browse Versions…, a Mac's: an item's versions in the person's backups by date, newest first,
 * each with what it held and the disk that keeps it; the one chosen previewed beside the list (got
 * back into Dropsea's cache, never over the item); and Restore (where it is, asking Keep Both or
 * Replace as Time Machine does) or Restore To… (a folder the person chooses), its progress shown
 * and stoppable. Restored, the window shows the item selected where it now is.
 */
import type {
  PlatformBackupsState,
  PlatformFileBackups,
  PlatformFileVersion,
} from '@oxy.so/bloom/platform-surface';
import { Button } from '@oxy.so/bloom/button';
import { Dialog } from '@oxy.so/bloom/dialog';
import { toast } from '@oxy.so/bloom/toast';
import { Text } from '@oxy.so/bloom/typography';
import { useQuery } from '@tanstack/react-query';
import { Directory, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  BackupRow,
  PeriodHeading,
  RestoreProgressRow,
  useBackupDate,
} from '@/components/BackupParts';
import { ItemFacts } from '@/components/ItemFacts';
import { ItemIcon } from '@/components/ItemIcon';
import { PictureOrText } from '@/components/PreviewDialog';
import { RestoreAlert } from '@/components/RestoreAlert';
import { useVersions } from '@/hooks/use-backups';
import { useLocale } from '@/hooks/use-locale';
import { useRestore } from '@/hooks/use-restore';
import { backupKey, destinationOf, versionGroups } from '@/lib/backups';
import { formatSize } from '@/lib/format';
import { type LocalItem, localItem } from '@/lib/items';
import { kindOf } from '@/lib/kinds';
import { pickFolder } from '@/lib/pick-folder';

/** The largest version previewed: one larger is shown by its icon and facts. */
const PREVIEW_MAX_BYTES = 20 * 1000 * 1000;

/** Where versions are got back to be previewed: Dropsea's cache, emptied as the window closes. */
function previewsFolder(): Directory {
  return new Directory(Paths.cache, 'backup-previews');
}

/** A version's own folder among the previews. */
function previewFolder(version: PlatformFileVersion): Directory {
  const name = `${version.backup.destination}-${version.backup.id}`.replace(/[^\w.-]/g, '_');
  return new Directory(previewsFolder(), name);
}

/** The version, as an item the preview and its facts show. */
function versionItem(item: LocalItem, version: PlatformFileVersion, uri: string): LocalItem {
  return localItem({
    uri,
    name: item.name,
    isDirectory: version.isDirectory,
    size: version.size,
    modifiedAt: version.lastModified,
  });
}

function VersionPreview({
  backups,
  item,
  version,
}: {
  backups: PlatformFileBackups;
  item: LocalItem;
  version: PlatformFileVersion;
}) {
  const { strings } = useLocale();
  const kind = kindOf({ name: item.name, isFolder: version.isDirectory, mime: null });
  const canShow =
    (kind === 'image' || kind === 'text' || kind === 'code') &&
    version.size !== null &&
    version.size <= PREVIEW_MAX_BYTES;
  const copy = useQuery({
    queryKey: ['backup-preview', backupKey(version.backup), item.uri],
    queryFn: async () => {
      const folder = previewFolder(version);
      if (folder.exists) folder.delete();
      folder.create({ intermediates: true });
      try {
        return (await backups.restore(version.backup, item.uri, { to: folder.uri })).uri;
      } catch (error) {
        console.warn('Dropsea could not get a version back to preview it', {
          uri: item.uri,
          backup: version.backup,
          error,
        });
        throw error;
      }
    },
    enabled: canShow,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  });
  const shown = versionItem(item, version, copy.data ?? item.uri);
  return (
    <View className="flex-1 items-center gap-4 p-2" testID="version-preview">
      {canShow && copy.data ? (
        <PictureOrText item={shown} />
      ) : (
        <ItemIcon kind={kind} size={128} thumbnailUrl={null} />
      )}
      <ItemFacts item={shown} origin={null} />
      {!canShow || copy.isError ? (
        <Text variant="caption-1-regular" className="text-text-secondary">
          {version.isDirectory ? strings.backups.folderVersion : strings.backups.noPreview}
        </Text>
      ) : null}
    </View>
  );
}

export function VersionsDialog({
  backups,
  state,
  item,
  onRestored,
  onClose,
}: {
  backups: PlatformFileBackups;
  state: PlatformBackupsState | null;
  item: LocalItem;
  /** The item restored: where it is now. */
  onRestored: (uri: string) => void;
  onClose: () => void;
}) {
  const { strings, locale } = useLocale();
  const dateOf = useBackupDate();
  const versions = useVersions(backups, item.uri);
  const restoring = useRestore(backups, state);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const all = versions.data ?? [];
  const chosen = all.find((version) => backupKey(version.backup) === chosenKey) ?? all[0] ?? null;
  const isBusy = restoring.progress !== null || restoring.question !== null;

  // The versions got back to be previewed go as the window closes.
  useEffect(
    () => () => {
      try {
        const folder = previewsFolder();
        if (folder.exists) folder.delete();
      } catch (error) {
        console.warn('Dropsea could not remove the versions it previewed', { error });
      }
    },
    [],
  );

  const restoreInto = async (toFolderUri: string | null) => {
    if (!chosen) return;
    const [restored] = await restoring.restore(
      chosen.backup,
      [{ uri: item.uri, name: item.name, isDirectory: item.isFolder }],
      toFolderUri,
    );
    if (restored) onRestored(restored);
  };
  const run = (work: () => Promise<void>) => {
    work().catch((error: unknown) => {
      console.warn('Dropsea could not restore a version', { uri: item.uri, error });
      toast.error(strings.backups.couldNotRestore(item.name));
    });
  };

  const now = new Date().setHours(0, 0, 0, 0);
  return (
    <>
      <Dialog
        open
        onClose={() => {
          if (!isBusy) onClose();
        }}
        title={strings.backups.versionsTitle(item.name)}
        maxWidth={760}
        testID="versions"
      >
        <View className="h-96 flex-row gap-4 pt-2">
          <ScrollView
            className="w-64 shrink-0 rounded-lg border border-border"
            accessibilityRole="list"
            accessibilityLabel={strings.backups.versions}
            testID="versions-list"
          >
            {versions.isPending ? (
              <Text variant="caption-1-regular" className="p-3 text-text-secondary">
                {strings.backups.looking}
              </Text>
            ) : versions.isError ? (
              <Text variant="caption-1-regular" className="p-3 text-text-secondary">
                {strings.backups.couldNotRead}
              </Text>
            ) : all.length === 0 ? (
              <Text variant="caption-1-regular" className="p-3 text-text-secondary">
                {strings.backups.noVersions(item.name)}
              </Text>
            ) : (
              versionGroups(all, now).map((group) => (
                <View key={group.key}>
                  <PeriodHeading period={group.period} />
                  {group.entries.map((version) => {
                    const key = backupKey(version.backup);
                    const destination =
                      destinationOf(state, version.backup)?.name ??
                      strings.backups.unknownDestination;
                    const size =
                      version.size === null
                        ? null
                        : formatSize(version.size, strings.units, locale);
                    return (
                      <BackupRow
                        key={key}
                        date={dateOf(version.backup.time)}
                        detail={strings.backups.onDestination(size, destination)}
                        isSelected={chosen !== null && backupKey(chosen.backup) === key}
                        onPress={() => setChosenKey(key)}
                        testID="version"
                      />
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
          <View
            className="flex-1"
            accessibilityRole="summary"
            accessibilityLabel={strings.backups.preview}
          >
            {chosen ? (
              <VersionPreview
                key={backupKey(chosen.backup)}
                backups={backups}
                item={item}
                version={chosen}
              />
            ) : null}
          </View>
        </View>
        {/* A Mac's sheet: Restore To… at its leading edge (or the restore's progress while one
            runs), Done and the default Restore at its trailing edge. */}
        <View className="flex-row items-center gap-2 pt-4">
          {restoring.progress ? (
            <View className="flex-1">
              <RestoreProgressRow progress={restoring.progress} onStop={restoring.stop} />
            </View>
          ) : (
            <>
              <Button
                appearance="outline"
                tone="neutral"
                disabled={chosen === null || isBusy}
                onPress={() =>
                  run(async () => {
                    const folder = await pickFolder();
                    if (folder) await restoreInto(folder);
                  })
                }
                testID="versions-restore-to"
              >
                {strings.backups.restoreTo}
              </Button>
              <View className="flex-1" />
            </>
          )}
          <Button
            appearance="outline"
            tone="neutral"
            disabled={isBusy}
            onPress={onClose}
            testID="versions-done"
          >
            {strings.backups.done}
          </Button>
          <Button
            disabled={chosen === null || isBusy}
            onPress={() => run(() => restoreInto(null))}
            testID="versions-restore"
          >
            {strings.backups.restore}
          </Button>
        </View>
      </Dialog>
      <RestoreAlert question={restoring.question} onAnswer={restoring.answer} />
    </>
  );
}
