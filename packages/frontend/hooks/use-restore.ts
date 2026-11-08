/**
 * Restoring items from a backup, as Time Machine does: where they were (or into a folder the
 * person chose), a name taken there asked about first (Keep Both, Replace, or Stop, with Apply to
 * All), then each item, its progress told and stoppable. What fails is said in words, and logged.
 */
import type {
  PlatformBackup,
  PlatformBackupsState,
  PlatformFileBackups,
} from '@oxy.so/bloom/platform-surface';
import { toast } from '@oxy.so/bloom/toast';
import { Directory } from 'expo-file-system';
import { useRef, useState } from 'react';
import { useLocale } from '@/hooks/use-locale';
import {
  type BackupProblem,
  backupProblem,
  destinationOf,
  planRestore,
  type RestoreAnswer,
  type RestoreQuestion,
  type RestoreRequest,
} from '@/lib/backups';
import { refreshFolder } from '@/lib/folder-store';
import { listFolder } from '@/lib/local-files';
import { parentUri } from '@/lib/local-places';
import type { Strings } from '@/lib/strings';

/** A restore going: the item, how many in all, and its share written (null while unknown). */
export interface RestoreProgress {
  name: string;
  count: number;
  fraction: number | null;
}

/** What a problem with a backup says, naming the disk or the share that keeps it. */
export function backupProblemText(
  problem: BackupProblem,
  backup: PlatformBackup | null,
  state: PlatformBackupsState | null,
  strings: Strings,
): string {
  const words = strings.backups.problems;
  switch (problem) {
    case 'unavailable': {
      const destination = backup ? destinationOf(state, backup) : null;
      const name = destination?.name ?? strings.backups.unknownDestination;
      return destination?.kind === 'share' ? words.share(name) : words.disk(name);
    }
    case 'cancelled':
      return '';
    default:
      return words[problem];
  }
}

/** The names a folder holds now, exactly as the file system has them; none for one not there. */
function namesIn(folderUri: string): Set<string> {
  if (!new Directory(folderUri).exists) return new Set();
  return new Set(listFolder(folderUri).map((item) => item.name));
}

export function useRestore(
  backups: PlatformFileBackups | null,
  state: PlatformBackupsState | null,
) {
  const { strings } = useLocale();
  const [question, setQuestion] = useState<RestoreQuestion | null>(null);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const answering = useRef<((answer: RestoreAnswer) => void) | null>(null);
  const stopping = useRef<AbortController | null>(null);

  const ask = (asked: RestoreQuestion) =>
    new Promise<RestoreAnswer>((resolve) => {
      answering.current = resolve;
      setQuestion(asked);
    });

  /** The person's answer to the name taken. */
  const answer = (given: RestoreAnswer) => {
    const resolve = answering.current;
    answering.current = null;
    setQuestion(null);
    resolve?.(given);
  };

  /** Stops the restore going: the item being written is left out, nothing half written stays. */
  const stop = () => stopping.current?.abort();

  /**
   * Restores `requests` from `backup` where they were, or into `toFolderUri`: the URIs they have
   * now, in order (none for one that failed or was stopped). Stop answered to a taken name
   * restores nothing.
   */
  const restore = async (
    backup: PlatformBackup,
    requests: readonly RestoreRequest[],
    toFolderUri: string | null,
  ): Promise<string[]> => {
    if (!backups || requests.length === 0) return [];
    const folders = new Set(requests.map((request) => toFolderUri ?? parentUri(request.uri)));
    const taken = new Set<string>();
    for (const folder of folders) {
      for (const name of namesIn(folder)) taken.add(name);
    }
    const steps = await planRestore(requests, taken, ask);
    if (!steps) return [];
    const controller = new AbortController();
    stopping.current = controller;
    const restored: string[] = [];
    let skipped = 0;
    try {
      for (const { request, replace } of steps) {
        if (controller.signal.aborted) break;
        const folder = toFolderUri ?? parentUri(request.uri);
        setProgress({ name: request.name, count: steps.length, fraction: null });
        try {
          // A folder gone since the backup comes back with it, as Time Machine brings it back.
          const into = new Directory(folder);
          if (!into.exists) into.create({ intermediates: true, idempotent: true });
          const done = await backups.restore(backup, request.uri, {
            to: toFolderUri ?? undefined,
            replace,
            signal: controller.signal,
            onProgress: ({ bytesWritten, totalBytes }) =>
              setProgress({
                name: request.name,
                count: steps.length,
                fraction: totalBytes ? bytesWritten / totalBytes : null,
              }),
          });
          restored.push(done.uri);
          skipped += done.skipped;
          refreshFolder(folder);
        } catch (error) {
          const problem = backupProblem(error);
          if (problem === 'cancelled') break;
          console.warn('Dropsea could not restore an item from a backup', {
            uri: request.uri,
            backup,
            toFolderUri,
            error,
          });
          const why = backupProblemText(problem, backup, state, strings);
          toast.error(
            problem === 'unavailable'
              ? why
              : `${strings.backups.couldNotRestore(request.name)} ${why}`,
          );
          if (problem === 'unavailable') break;
        }
      }
    } finally {
      stopping.current = null;
      setProgress(null);
    }
    if (skipped > 0) toast.warning(strings.backups.skipped(skipped));
    return restored;
  };

  return { question, progress, answer, stop, restore };
}
