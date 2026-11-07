/**
 * The person's files on this device, through `expo-file-system`, the one API
 * every platform Dropsea runs on implements for its own files (OxyOS, iOS,
 * Android). Where none does (a browser), `hasLocalFiles()` is false and
 * nothing here is called.
 *
 * A change never replaces an item: a name already taken in the folder is
 * refused before the file system is asked. (A drop's Replace puts the item
 * there in the Trash first, `lib/transfer`.)
 */
import { requireOptionalNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';
import { type LocalItem, localItem } from '@/lib/items';
import { parentUri, uriName } from '@/lib/local-places';
import { type NameProblem, nameProblem } from '@/lib/names';
import type { FileProblem } from '@/lib/strings';

/** The platform implements `expo-file-system` (its native module is there); it never changes while Dropsea runs. */
const IS_AVAILABLE = requireOptionalNativeModule('FileSystem') !== null;

/** Whether this platform has files of its own that Dropsea can browse. */
export function hasLocalFiles(): boolean {
  return IS_AVAILABLE;
}

/** The folder `expo-file-system` gives Dropsea on this device, for a platform with no places of its own. */
export function deviceFolderUri(): string {
  return Paths.document.uri;
}

/** What came of one item of a change to several. */
export type LocalOutcome =
  | { key: string; ok: true; uri: string }
  | { key: string; ok: false; problem: FileProblem };

function entryAt(item: Pick<LocalItem, 'uri' | 'isFolder'>): Directory | File {
  return item.isFolder ? new Directory(item.uri) : new File(item.uri);
}

/**
 * A folder's own date (an item added, removed or renamed in it), from one look
 * at it, where the platform publishes it: OxyOS does, as `lastModified`, the
 * name a file's date has. Expo's Android and iOS modules keep the same date for
 * every path but publish it for files alone, so there a folder has none.
 */
function folderDate(folder: Directory): number | null {
  const date: unknown = Reflect.get(folder, 'lastModified');
  return typeof date === 'number' ? date : null;
}

/**
 * An entry as an item, each from one look at it. A folder is never asked for
 * its `info()`: expo-file-system answers it by walking everything inside (its
 * `size` is the sum of every file below it, on Android, iOS and OxyOS alike),
 * so a listing that asked each of its folders read the whole tree under it,
 * seconds for a home with a `node_modules`. A folder's size is not shown, as in
 * Finder's list.
 */
function itemOf(entry: Directory | File): LocalItem {
  if (entry instanceof Directory) {
    return localItem({
      uri: entry.uri,
      name: entry.name,
      isDirectory: true,
      size: null,
      modifiedAt: folderDate(entry),
    });
  }
  const info = entry.info();
  return localItem({
    uri: entry.uri,
    name: entry.name,
    isDirectory: false,
    size: typeof info.size === 'number' ? info.size : null,
    modifiedAt: info.modificationTime ?? null,
  });
}

/** The code `expo-file-system` throws a refusal of the platform's with (Android's, as OxyOS's). */
const REFUSED_CODE = 'ERR_INVALID_PERMISSION';

/**
 * Why the file system refused: the item went, the platform keeps it as it is (the home's
 * standard folders, say), or something else it said.
 */
function problemOf(error: unknown, entry: Directory | File, action: string): FileProblem {
  console.warn(`Dropsea could not ${action}`, { uri: entry.uri, error });
  if (!entry.exists) return 'not-found';
  return error instanceof Error && Reflect.get(error, 'code') === REFUSED_CODE ? 'refused' : 'io';
}

/** A folder's items. Throws when the folder cannot be read (gone, or not allowed). */
export function listFolder(uri: string): LocalItem[] {
  return new Directory(uri).list().map(itemOf);
}

/** Whether a folder is there. */
export function folderExists(uri: string): boolean {
  return new Directory(uri).exists;
}

function namesIn(folderUri: string): string[] {
  return new Directory(folderUri).list().map((entry) => entry.name);
}

/** Why a new folder or a rename did not happen: the name, or the file system. */
export type ChangeProblem =
  | { kind: 'name'; problem: NameProblem }
  | { kind: 'file'; problem: FileProblem };

export type LocalChange = { ok: true; item: LocalItem } | { ok: false; why: ChangeProblem };

export function createFolder(parentUri: string, name: string): LocalChange {
  const parent = new Directory(parentUri);
  const problem = nameProblem(name, namesIn(parentUri));
  if (problem) return { ok: false, why: { kind: 'name', problem } };
  try {
    return { ok: true, item: itemOf(parent.createDirectory(name)) };
  } catch (error) {
    return { ok: false, why: { kind: 'file', problem: problemOf(error, parent, 'make a folder') } };
  }
}

export function renameItem(item: LocalItem, folderUri: string, name: string): LocalChange {
  const entry = entryAt(item);
  const others = namesIn(folderUri).filter((other) => other !== item.name);
  const problem = nameProblem(name, others);
  if (problem) return { ok: false, why: { kind: 'name', problem } };
  try {
    entry.rename(name);
    return { ok: true, item: itemOf(entry) };
  } catch (error) {
    return { ok: false, why: { kind: 'file', problem: problemOf(error, entry, 'rename an item') } };
  }
}

/** A move or a copy of items, as Finder's drop does one. */
export type Relocation = 'copy' | 'move';

/**
 * Moves or copies one item into a folder under `name` (its own, or the free one Keep Both gave
 * it), never over an item there: one there by then is refused. Its outcome, with where it went.
 */
export async function relocateItem(
  item: LocalItem,
  folderUri: string,
  name: string,
  relocation: Relocation,
): Promise<LocalOutcome> {
  const entry = entryAt(item);
  // A folder goes to a folder not there yet, as it; a file to a file, as it (the file service's
  // rules, OxyOS's as Android's).
  const target = item.isFolder ? new Directory(folderUri, name) : new File(folderUri, name);
  if (new Directory(folderUri, name).exists || new File(folderUri, name).exists) {
    return { key: item.key, ok: false, problem: 'exists' };
  }
  try {
    if (relocation === 'move') {
      await entry.move(target);
      return { key: item.key, ok: true, uri: entry.uri };
    }
    await entry.copy(target);
    return { key: item.key, ok: true, uri: target.uri };
  } catch (error) {
    return {
      key: item.key,
      ok: false,
      problem: problemOf(error, entry, relocation === 'move' ? 'move an item' : 'copy an item'),
    };
  }
}

/**
 * Moves or copies items into a folder, each on its own and under its own name: one that would
 * replace an item there is refused. One outcome per item, in their order.
 */
export async function relocateItems(
  items: readonly LocalItem[],
  folderUri: string,
  relocation: Relocation,
): Promise<LocalOutcome[]> {
  const taken = namesIn(folderUri);
  const outcomes: LocalOutcome[] = [];
  for (const item of items) {
    if (nameProblem(item.name, taken) === 'taken') {
      outcomes.push({ key: item.key, ok: false, problem: 'exists' });
      continue;
    }
    const outcome = await relocateItem(item, folderUri, item.name, relocation);
    if (outcome.ok) taken.push(item.name);
    outcomes.push(outcome);
  }
  return outcomes;
}

/** An item moved or copied: its URI before (the original's, for a copy), and after (the copy's). */
export interface Relocated {
  from: string;
  to: string;
}

/** What `relocateItems` did, of `items` (in the order it was given them) to their outcomes. */
export function relocationsDone(
  items: readonly LocalItem[],
  outcomes: readonly LocalOutcome[],
): Relocated[] {
  return items.flatMap((item, index) => {
    const outcome = outcomes[index];
    return outcome?.ok ? [{ from: item.uri, to: outcome.uri }] : [];
  });
}

/**
 * Moves or copies the item at each `from` to its `to` (into that folder, under that name), as Undo
 * and Redo do a change again, never over an item there: what came of each, and what was done. An
 * item no longer there, or whose folder is no longer there, is not found.
 */
export async function relocateEach(
  requests: readonly Relocated[],
  relocation: Relocation,
): Promise<{ outcomes: LocalOutcome[]; done: Relocated[] }> {
  const outcomes: LocalOutcome[] = [];
  const done: Relocated[] = [];
  for (const { from, to } of requests) {
    const into = parentUri(to);
    const name = uriName(to);
    const [item] = itemsAtUris([from]);
    if (!item || !folderExists(into)) {
      outcomes.push({ key: from, ok: false, problem: 'not-found' });
      continue;
    }
    if (nameProblem(name, namesIn(into)) === 'taken') {
      outcomes.push({ key: item.key, ok: false, problem: 'exists' });
      continue;
    }
    const outcome = await relocateItem(item, into, name, relocation);
    outcomes.push(outcome);
    if (outcome.ok) done.push({ from: item.uri, to: outcome.uri });
  }
  return { outcomes, done };
}

/**
 * The items at `file://` URIs dropped on Dropsea (by another application or Dropsea itself), each
 * from one look at it; a URI that names nothing there now is passed over.
 */
export function itemsAtUris(uris: readonly string[]): LocalItem[] {
  return uris.flatMap((uri) => {
    try {
      const folder = new Directory(uri);
      if (folder.exists) return [itemOf(folder)];
      const file = new File(uri);
      return file.exists ? [itemOf(file)] : [];
    } catch {
      return [];
    }
  });
}

/** Deletes items for good: for a platform with no Trash, after the person confirmed it. */
export function deleteItems(items: readonly LocalItem[]): LocalOutcome[] {
  return items.map((item) => {
    const entry = entryAt(item);
    try {
      entry.delete();
      return { key: item.key, ok: true, uri: item.uri };
    } catch (error) {
      return { key: item.key, ok: false, problem: problemOf(error, entry, 'delete an item') };
    }
  });
}

/** Calls `onChange` when what a folder holds changes; returns the function that stops it. */
export function watchFolder(uri: string, onChange: () => void): () => void {
  const subscription = new Directory(uri).watch(onChange);
  return () => subscription.remove();
}

/** Downloads a URL into a new file of a folder, never over an item there (the name is free). */
export async function downloadInto(
  url: string,
  folderUri: string,
  fileName: string,
  onProgress: (fraction: number) => void,
): Promise<LocalItem> {
  const file = await File.downloadFileAsync(url, new File(folderUri, fileName), {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) onProgress(bytesWritten / totalBytes);
    },
  });
  return itemOf(file);
}

/** Whether the platform shows a file itself (Quick Look on iOS), and doing so. */
export async function previewOnPlatform(item: LocalItem): Promise<boolean> {
  const file = new File(item.uri);
  if (!(await file.canPreview())) return false;
  await file.preview();
  return true;
}

/** A text file's first characters, for a preview. */
export async function readText(item: LocalItem, limit: number): Promise<string> {
  const text = await new File(item.uri).text();
  return text.slice(0, limit);
}
