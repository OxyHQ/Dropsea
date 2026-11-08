import { Redirect, useLocalSearchParams } from 'expo-router';
import { BackupsBrowser } from '@/components/BackupsBrowser';
import { usePlatformBackups } from '@/hooks/use-backups';
import { useLocalPlaces } from '@/hooks/use-local-places';
import { backupsFolderFromParams, hrefFor } from '@/lib/routes';

/**
 * A folder as it was in the person's backups (`dropsea://backups?uri=…`), or the home's
 * (`dropsea://backups`, what the platform's menu bar item opens). Where the platform makes no
 * backups the link opens the folder itself.
 */
export default function BackupsScreen() {
  const params = useLocalSearchParams();
  const backups = usePlatformBackups();
  const { places, isLoading } = useLocalPlaces();
  if (isLoading) return null;
  const folder =
    backupsFolderFromParams(params) ?? places.find((place) => place.kind === 'home')?.uri ?? null;
  if (!folder) return <Redirect href="/" />;
  if (!backups) return <Redirect href={hrefFor({ kind: 'folder', uri: folder })} />;
  // Each folder entered is its own: what was chosen and selected in one does not carry over.
  return <BackupsBrowser key={folder} folderUri={folder} />;
}
