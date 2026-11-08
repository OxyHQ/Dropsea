/**
 * The person's backups, where the platform makes them (OxyOS's, its ADR 0059): when Dropsea shows
 * anything of them, how their versions and backups are grouped by date, what a restore asks when a
 * name is taken, and what a failure says. Dropsea never asks which platform it runs on: it shows
 * backups where the platform's files have them and at least one place keeps them, and nothing of
 * them anywhere else (the web, a phone, a computer whose backups were never set up).
 */
import type {
  PlatformBackup,
  PlatformBackupDestination,
  PlatformBackupsState,
  PlatformFileVersion,
} from '@oxy.so/bloom/platform-surface';
import type { Item, LocalItem } from '@/lib/items';
import { type LocalPlace, placeOf } from '@/lib/local-places';
import { type DatePeriod, datePeriod } from '@/lib/sorting';

/** Whether the platform keeps backups here: at least one place they are kept. */
export function hasBackups(state: PlatformBackupsState | null | undefined): boolean {
  return (state?.destinations.length ?? 0) > 0;
}

/**
 * Whether an item's versions can be browsed: an item of this device's own files, outside the
 * volumes (a USB stick is not backed up; the backups are of the person's home).
 */
export function canBrowseVersions(item: Item, places: readonly LocalPlace[]): item is LocalItem {
  return item.source === 'local' && placeOf(item.uri, places)?.kind !== 'volume';
}

/** Whether a folder's backups can be browsed: one of this device's, outside the volumes. */
export function canBrowseBackups(folderUri: string, places: readonly LocalPlace[]): boolean {
  const place = placeOf(folderUri, places);
  return place !== null && place.kind !== 'volume';
}

/** The destination that keeps a backup, as the state names it. */
export function destinationOf(
  state: PlatformBackupsState | null | undefined,
  backup: PlatformBackup,
): PlatformBackupDestination | null {
  return state?.destinations.find((destination) => destination.id === backup.destination) ?? null;
}

/** A backup's own key: the same backup on the same destination. */
export function backupKey(backup: PlatformBackup): string {
  return `${backup.destination}\n${backup.id}`;
}

/** Versions (or backups) under one date heading, newest first. */
export interface VersionGroup<T> {
  key: string;
  period: DatePeriod;
  entries: T[];
}

/**
 * Versions grouped as Finder groups by date (today, yesterday, the previous 7 and 30 days, each
 * earlier month of this year, then each year), newest first within and across the groups.
 */
export function groupByPeriod<T>(
  entries: readonly T[],
  timeOf: (entry: T) => number,
  now: number,
): VersionGroup<T>[] {
  const sorted = [...entries].sort((first, second) => timeOf(second) - timeOf(first));
  const groups: VersionGroup<T>[] = [];
  for (const entry of sorted) {
    const period = datePeriod(timeOf(entry), now);
    const key = JSON.stringify(period);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, period, entries: [entry] });
  }
  return groups;
}

/** The versions of a file grouped by date, as the Versions window lists them. */
export function versionGroups(
  versions: readonly PlatformFileVersion[],
  now: number,
): VersionGroup<PlatformFileVersion>[] {
  return groupByPeriod(versions, (version) => version.backup.time, now);
}

/** An item to restore, and where it goes by its own name. */
export interface RestoreRequest {
  /** Where it was (and may still be): what the platform restores it by. */
  uri: string;
  name: string;
  isDirectory: boolean;
}

/** What the person answers when a name is taken: keep both, replace, or stop everything. */
export type RestoreChoice = 'keep-both' | 'replace' | 'stop';

/** What the restore alert asks: a name taken, and how many more come after it. */
export interface RestoreQuestion {
  name: string;
  isDirectory: boolean;
  remaining: number;
}

export interface RestoreAnswer {
  choice: RestoreChoice;
  /** Apply to All: the same answer for every taken name after this one. */
  isForAll: boolean;
}

/** One item to restore, and whether it replaces the one of its name there. */
export interface RestoreStep {
  request: RestoreRequest;
  replace: boolean;
}

/**
 * The steps of a restore of `requests` into a folder holding items named `taken` (as the file
 * system names them: exactly), asking `ask` about each name taken, in order, Apply to All answering
 * the rest. Null when the person answered Stop: nothing is restored.
 */
export async function planRestore(
  requests: readonly RestoreRequest[],
  taken: ReadonlySet<string>,
  ask: (question: RestoreQuestion) => Promise<RestoreAnswer>,
): Promise<RestoreStep[] | null> {
  const clashing = requests.filter((request) => taken.has(request.name));
  const choices = new Map<RestoreRequest, RestoreChoice>();
  let forAll: RestoreChoice | null = null;
  for (const [index, request] of clashing.entries()) {
    let choice = forAll;
    if (choice === null) {
      const answer = await ask({
        name: request.name,
        isDirectory: request.isDirectory,
        remaining: clashing.length - index - 1,
      });
      if (answer.isForAll) forAll = answer.choice;
      choice = answer.choice;
    }
    if (choice === 'stop') return null;
    choices.set(request, choice);
  }
  return requests.map((request) => ({ request, replace: choices.get(request) === 'replace' }));
}

/**
 * Why a backup's question or restore failed, from the error's `code` (Bloom's
 * `PlatformBackupError`), for the words the person reads.
 */
export type BackupProblem =
  | 'unavailable'
  | 'not-permitted'
  | 'not-found'
  | 'refused'
  | 'denied'
  | 'cancelled'
  | 'io';

const PROBLEMS: readonly BackupProblem[] = [
  'unavailable',
  'not-permitted',
  'not-found',
  'refused',
  'denied',
  'cancelled',
];

export function backupProblem(error: unknown): BackupProblem {
  const code: unknown = error instanceof Error ? Reflect.get(error, 'code') : null;
  return PROBLEMS.find((problem) => problem === code) ?? 'io';
}
