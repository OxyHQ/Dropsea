/**
 * The person's backups, where the platform makes them (`PlatformFiles.backups`): where they are
 * kept, followed while something shows them, so Browse Versions… and Browse Backups appear as a
 * backup disk is set up and go when the last is removed; an item's versions; what a folder held in
 * a backup.
 */
import {
  type PlatformBackup,
  type PlatformFileBackups,
  usePlatformFiles,
} from '@oxy.so/bloom/platform-surface';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { hasBackups } from '@/lib/backups';
import { hasLocalFiles } from '@/lib/local-files';

const STATE_KEY = ['platform-backups'] as const;

/** The platform's backups, where it makes them for this device's files; null elsewhere. */
export function usePlatformBackups(): PlatformFileBackups | null {
  const backups = usePlatformFiles()?.backups ?? null;
  return hasLocalFiles() ? backups : null;
}

/**
 * The platform's backups and where they are kept, followed while the caller is shown:
 * `isAvailable` once at least one place keeps them.
 */
export function useBackups() {
  const backups = usePlatformBackups();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: STATE_KEY,
    queryFn: async () => {
      if (!backups) throw new Error('Dropsea asked for backups the platform does not make');
      try {
        return await backups.state();
      } catch (error) {
        console.warn('Dropsea could not ask where the backups are kept', { error });
        throw error;
      }
    },
    enabled: backups !== null,
    // The platform says when it changes.
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  useEffect(() => {
    if (!backups) return undefined;
    return backups.watch(() => {
      queryClient.invalidateQueries({ queryKey: STATE_KEY });
    });
  }, [backups, queryClient]);
  const isAvailable = backups !== null && hasBackups(state.data);
  return {
    backups: isAvailable ? backups : null,
    state: state.data ?? null,
    isAvailable,
    /** Still asking where the backups are kept. */
    isPending: backups !== null && state.isPending,
  };
}

/** An item's versions, newest first, asked afresh each time they are shown. */
export function useVersions(backups: PlatformFileBackups | null, uri: string | null) {
  return useQuery({
    queryKey: ['backup-versions', uri],
    queryFn: async () => {
      if (!backups || !uri) throw new Error('Dropsea asked for versions with no backups');
      try {
        return await backups.versions(uri);
      } catch (error) {
        console.warn('Dropsea could not list an item’s versions', { uri, error });
        throw error;
      }
    },
    enabled: backups !== null && uri !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/** What a folder held in a backup. */
export function useBackupContents(
  backups: PlatformFileBackups | null,
  backup: PlatformBackup | null,
  folderUri: string,
) {
  return useQuery({
    queryKey: ['backup-contents', backup?.destination, backup?.id, folderUri],
    queryFn: async () => {
      if (!backups || !backup) throw new Error('Dropsea asked what a folder held with no backup');
      try {
        return await backups.contents(backup, folderUri);
      } catch (error) {
        console.warn('Dropsea could not list a folder as a backup held it', {
          folderUri,
          backup,
          error,
        });
        throw error;
      }
    },
    enabled: backups !== null && backup !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 60_000,
    retry: false,
  });
}
