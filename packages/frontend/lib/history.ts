/**
 * Where the window was and is, as a browser's history: back and forward. The
 * route says where the window is; this follows it, so a press on Back, the
 * browser's own back and a phone's back gesture all agree.
 */
import { type Item, type Location, sameLocation } from '@/lib/items';
import { isSameUri } from '@/lib/local-places';
import { NO_SELECTION, type Selection, selectOnly } from '@/lib/selection';

export interface History {
  readonly entries: readonly Location[];
  readonly index: number;
}

export function historyAt(location: Location): History {
  return { entries: [location], index: 0 };
}

export function currentLocation(history: History): Location | null {
  return history.entries[history.index] ?? null;
}

export function previousLocation(history: History): Location | null {
  return history.entries[history.index - 1] ?? null;
}

export function nextLocation(history: History): Location | null {
  return history.entries[history.index + 1] ?? null;
}

/** Going somewhere new forgets what was forward; going where it is changes nothing. */
export function go(history: History, location: Location): History {
  const current = currentLocation(history);
  if (current && sameLocation(current, location)) return history;
  const entries = [...history.entries.slice(0, history.index + 1), location];
  return { entries, index: entries.length - 1 };
}

export function canGoBack(history: History): boolean {
  return history.index > 0;
}

export function canGoForward(history: History): boolean {
  return history.index < history.entries.length - 1;
}

/**
 * The history once the window is at `location`, however it got there: a step
 * back or forward when it is the entry before or after, else a new entry.
 */
export function arrive(history: History, location: Location): History {
  const current = currentLocation(history);
  if (current && sameLocation(current, location)) return history;
  const previous = previousLocation(history);
  if (previous && sameLocation(previous, location)) return { ...history, index: history.index - 1 };
  const next = nextLocation(history);
  if (next && sameLocation(next, location)) return { ...history, index: history.index + 1 };
  return go(history, location);
}

/** The window is at `location` instead (a folder that went is left for its parent), with no new entry. */
export function replaceCurrent(history: History, location: Location): History {
  const entries = history.entries.slice();
  entries[history.index] = location;
  return { entries, index: history.index };
}

/**
 * What is selected as the window arrives somewhere: the folder it just left,
 * when that is one of the items here (going up, or back out of it), as Finder
 * selects it, so the keys go on from where the person was; else the item the
 * link that brought it asked for (`select`, a reveal), when it is here.
 */
export function selectionOnArrival(
  items: readonly Item[],
  cameFrom: Location | null,
  select: string | null = null,
): Selection {
  const wanted = [cameFrom?.kind === 'folder' ? cameFrom.uri : null, select];
  for (const uri of wanted) {
    if (uri === null) continue;
    const found = items.find((item) => item.source === 'local' && isSameUri(item.uri, uri));
    if (found) return selectOnly(found.key);
  }
  return NO_SELECTION;
}
