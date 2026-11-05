/**
 * What Edit › Undo and Redo take back and do again in this window, as Finder's do: the moves of
 * items, the latest last. Each is the items' URIs before and after it. A new move forgets what was
 * undone; an undo or a redo that does part of a move keeps only that part.
 */
import { useSyncExternalStore } from 'react';
import { type LocalOutcome, type Moved, moveEach } from '@/lib/local-files';
import { parentUri } from '@/lib/local-places';

/** The move an Undo would take back and the one a Redo would do again, if any. */
export interface History {
  undo: readonly Moved[] | null;
  redo: readonly Moved[] | null;
}

const undos: (readonly Moved[])[] = [];
const redos: (readonly Moved[])[] = [];
let snapshot: History = { undo: null, redo: null };
const listeners = new Set<() => void>();

function publish() {
  snapshot = { undo: undos.at(-1) ?? null, redo: redos.at(-1) ?? null };
  for (const listener of listeners) listener();
}

/** A move the person made: what Undo takes back next. */
export function recordMove(moves: readonly Moved[]): void {
  if (moves.length === 0) return;
  undos.push(moves);
  redos.length = 0;
  publish();
}

/** What an Undo or a Redo did: what came of each item, and the moves it made. */
export interface Replayed {
  outcomes: LocalOutcome[];
  moved: Moved[];
}

/** Moves each item of `moves` from where it is (`from`) into the folder of its `to`. */
function replay(moves: readonly Moved[]): Promise<Replayed> {
  return moveEach(moves.map(({ from, to }) => ({ uri: from, into: parentUri(to) })));
}

/** Moves the other way: each item from where it went to where it was. */
function reversed(moves: readonly Moved[]): Moved[] {
  return moves.map(({ from, to }) => ({ from: to, to: from }));
}

/**
 * Edit › Undo: the latest move taken back, each item into the folder it came from (never over an
 * item there now), and what was taken back kept for Redo. Null when there is nothing to undo.
 */
export async function undoMove(): Promise<Replayed | null> {
  const moves = undos.pop();
  if (!moves) return null;
  publish();
  const done = await replay(reversed(moves));
  if (done.moved.length > 0) {
    redos.push(reversed(done.moved));
    publish();
  }
  return done;
}

/** Edit › Redo: the latest move undone made again, kept for Undo. Null when there is none. */
export async function redoMove(): Promise<Replayed | null> {
  const moves = redos.pop();
  if (!moves) return null;
  publish();
  const done = await replay(moves);
  if (done.moved.length > 0) {
    undos.push(done.moved);
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
