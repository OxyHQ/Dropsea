/**
 * What this device's folders hold, kept for the views that show them and
 * read with `useSyncExternalStore`. A folder is listed once when a view first
 * shows it, again when a view shows it after nothing followed it for a while
 * (it may have changed meanwhile), and whenever the file system says it
 * changed (`Directory.watch`, whose events come coalesced) or Dropsea changed it;
 * its state keeps its identity while what it holds is the same, so a burst of
 * watched changes redraws nothing.
 */
import type { LocalItem } from '@/lib/items';
import { folderExists, listFolder, watchFolder } from '@/lib/local-files';
import { normalizeUri } from '@/lib/local-places';

export type FolderState =
  | { status: 'ready'; items: readonly LocalItem[] }
  /** The folder is not there (gone, or never was). */
  | { status: 'missing' }
  /** It is there but cannot be read. */
  | { status: 'unreadable' };

interface Folder {
  /** The URI it is read at, as the first view to show it wrote it. */
  uri: string;
  state: FolderState;
  /**
   * Whether `state` may be behind the folder: nothing has followed it since it
   * was read. A folder read for a view's first draw is current; the view's
   * subscription starts watching it without listing it a second time.
   */
  isStale: boolean;
  listeners: Set<() => void>;
  stopWatching: (() => void) | null;
}

/** By normalized URI, so a folder written with or without its slash or escapes is one folder. */
const folders = new Map<string, Folder>();

function read(uri: string): FolderState {
  try {
    return { status: 'ready', items: listFolder(uri) };
  } catch (error) {
    if (!folderExists(uri)) return { status: 'missing' };
    console.warn('Dropsea could not list a folder', { uri, error });
    return { status: 'unreadable' };
  }
}

function isSameItem(first: LocalItem, second: LocalItem): boolean {
  return (
    first.uri === second.uri &&
    first.name === second.name &&
    first.isFolder === second.isFolder &&
    first.size === second.size &&
    first.modifiedAt === second.modifiedAt
  );
}

function isSameState(first: FolderState, second: FolderState): boolean {
  if (first.status !== 'ready' || second.status !== 'ready') return first.status === second.status;
  if (first.items.length !== second.items.length) return false;
  return first.items.every((item, index) => {
    const other = second.items[index];
    return other !== undefined && isSameItem(item, other);
  });
}

/**
 * A new listing keeping the items it shares with the one before as the same
 * objects: a file added to a folder draws that file, and moves the ones after
 * it, rather than drawing every item again.
 */
function keepingKnownItems(next: FolderState, previous: FolderState): FolderState {
  if (next.status !== 'ready' || previous.status !== 'ready') return next;
  const known = new Map(previous.items.map((item) => [item.uri, item]));
  return {
    status: 'ready',
    items: next.items.map((item) => {
      const before = known.get(item.uri);
      return before && isSameItem(before, item) ? before : item;
    }),
  };
}

function folderAt(uri: string): Folder {
  const key = normalizeUri(uri);
  const known = folders.get(key);
  if (known) return known;
  const folder: Folder = {
    uri,
    state: read(uri),
    isStale: false,
    listeners: new Set(),
    stopWatching: null,
  };
  folders.set(key, folder);
  return folder;
}

function update(folder: Folder): void {
  const next = read(folder.uri);
  if (isSameState(folder.state, next)) return;
  folder.state = keepingKnownItems(next, folder.state);
  for (const listener of folder.listeners) listener();
}

export function getFolderState(uri: string): FolderState {
  return folderAt(uri).state;
}

/**
 * Follows a folder while anything shows it. A platform that cannot watch it
 * still shows Dropsea's own changes, which call `refreshFolder`.
 */
export function subscribeFolder(uri: string, listener: () => void): () => void {
  const folder = folderAt(uri);
  folder.listeners.add(listener);
  if (folder.listeners.size === 1) {
    if (folder.isStale) update(folder);
    folder.isStale = false;
    try {
      folder.stopWatching = watchFolder(folder.uri, () => update(folder));
    } catch (error) {
      console.warn('Dropsea cannot watch a folder; it shows its own changes only', { uri, error });
    }
  }
  return () => {
    folder.listeners.delete(listener);
    if (folder.listeners.size > 0) return;
    folder.stopWatching?.();
    folder.stopWatching = null;
    folder.isStale = true;
  };
}

/** Lists a folder again after Dropsea changed it. */
export function refreshFolder(uri: string): void {
  const folder = folders.get(normalizeUri(uri));
  if (folder) update(folder);
}
