/**
 * What Edit › Undo and Redo take back and do again in this window, as Finder's do: the moves and
 * copies of items, the latest last. Each is the items' URIs before and after it (for a copy, the
 * original's and the copy's). Undo Move takes the items back where they were; Undo Copy puts the
 * copies in the Trash; Redo does each again. A new change forgets what was undone; an undo or a
 * redo that does part of a change keeps only that part. What a change replaced is in the Trash,
 * and stays there through its Undo.
 */
import type { PlatformFileOutcome } from '@oxy.so/bloom/platform-surface';
import { useSyncExternalStore } from 'react';
import {
  type LocalOutcome,
  type Relocated,
  type Relocation,
  relocateEach,
} from '@/lib/local-files';

/** A change Undo can take back: a move or a copy, and each item's URIs before and after it. */
export interface Change {
  relocation: Relocation;
  items: readonly Relocated[];
}

/** The change an Undo would take back and the one a Redo would do again, if any. */
export interface History {
  undo: Change | null;
  redo: Change | null;
}

/** Puts items in the platform's Trash (`usePlatformFiles().trash`): an Undo Copy's way. */
export type TrashFiles = (uris: readonly string[]) => Promise<readonly PlatformFileOutcome[]>;

const undos: Change[] = [];
const redos: Change[] = [];
let snapshot: History = { undo: null, redo: null };
const listeners = new Set<() => void>();

function publish() {
  snapshot = { undo: undos.at(-1) ?? null, redo: redos.at(-1) ?? null };
  for (const listener of listeners) listener();
}

/** A move or a copy the person made: what Undo takes back next. */
export function recordChange(relocation: Relocation, items: readonly Relocated[]): void {
  if (items.length === 0) return;
  undos.push({ relocation, items });
  redos.length = 0;
  publish();
}

/**
 * What an Undo or a Redo did: what came of each item; the items it moved or copied (where each
 * was and is, to show both folders again); and the copies it put in the Trash.
 */
export interface Replayed {
  outcomes: LocalOutcome[];
  relocated: Relocated[];
  trashed: string[];
}

/** Moves or copies each item of `items` from where it is (`from`) to its `to`, name and all. */
async function replay(relocation: Relocation, items: readonly Relocated[]): Promise<Replayed> {
  const { outcomes, done } = await relocateEach(items, relocation);
  return { outcomes, relocated: done, trashed: [] };
}

/** Moves the other way: each item from where it went to where it was. */
function reversed(items: readonly Relocated[]): Relocated[] {
  return items.map(({ from, to }) => ({ from: to, to: from }));
}

/**
 * Edit › Undo: the latest change taken back, and what was taken back kept for Redo. A move's items
 * go back where they came from, under the names they had (never over an item there now); a copy's
 * copies go to the Trash. Null when there is nothing to undo.
 */
export async function undoChange(trash: TrashFiles | null): Promise<Replayed | null> {
  const change = undos.pop();
  if (!change) return null;
  publish();
  if (change.relocation === 'move') {
    const done = await replay('move', reversed(change.items));
    if (done.relocated.length > 0) {
      redos.push({ relocation: 'move', items: reversed(done.relocated) });
      publish();
    }
    return done;
  }
  const copies = change.items.map((item) => item.to);
  if (!trash) {
    return {
      outcomes: copies.map((uri) => ({ key: uri, ok: false, problem: 'unavailable' })),
      relocated: [],
      trashed: [],
    };
  }
  const trashed = await trash(copies);
  const outcomes: LocalOutcome[] = trashed.map((outcome) =>
    outcome.ok
      ? { key: outcome.uri, ok: true, uri: outcome.result }
      : { key: outcome.uri, ok: false, problem: outcome.error },
  );
  const undone = change.items.filter((_, index) => trashed[index]?.ok === true);
  if (undone.length > 0) {
    redos.push({ relocation: 'copy', items: undone });
    publish();
  }
  return { outcomes, relocated: [], trashed: undone.map((item) => item.to) };
}

/** Edit › Redo: the latest change undone made again, kept for Undo. Null when there is none. */
export async function redoChange(): Promise<Replayed | null> {
  const change = redos.pop();
  if (!change) return null;
  publish();
  const done = await replay(change.relocation, change.items);
  if (done.relocated.length > 0) {
    undos.push({ relocation: change.relocation, items: done.relocated });
    publish();
  }
  return done;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): History {
  return snapshot;
}

/** The window's history, for its Edit menu. */
export function useHistory(): History {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
