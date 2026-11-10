/**
 * The window's moves and copies of files as they go (OxyOS ADR 0047, decisions 15 and 16): one at
 * a time, in the order they were asked for; the clash being asked about, for the window's alert;
 * and the progress of one not done within half a second, for its status bar, with its stop.
 */
import { useSyncExternalStore } from 'react';
import type { LocalItem } from '@/lib/items';
import { listFolder, type Relocation } from '@/lib/local-files';
import {
  type ClashAnswer,
  type ClashQuestion,
  planTransfer,
  runTransfer,
  type TransferResult,
} from '@/lib/transfer';
import type { TrashFiles } from '@/lib/undo';

/** A move or a copy not done within this long shows its progress. */
export const PROGRESS_DELAY_MS = 500;

/** A move or a copy going, as the status bar says it: “Copying 3 items to Documents”. */
export interface OperationProgress {
  relocation: Relocation;
  count: number;
  folderName: string;
  /** Its share done, by the items' bytes. */
  fraction: number;
  /** Stop was pressed: the item going finishes, and no other starts. */
  isStopping: boolean;
}

export interface Operations {
  /** The clash the alert asks about now. */
  question: ClashQuestion | null;
  /** The progress of the move or copy going, once it has taken half a second. */
  progress: OperationProgress | null;
}

/** What to move or copy, where. */
export interface OperationRequest {
  items: readonly LocalItem[];
  folderUri: string;
  /** The folder's name as the window shows it (a place's own name). */
  folderName: string;
  relocation: Relocation;
  /** The platform's Trash, for what Replace replaces; null where there is none. */
  trash: TrashFiles | null;
}

let snapshot: Operations = { question: null, progress: null };
const listeners = new Set<() => void>();
let pendingAnswer: ((answer: ClashAnswer) => void) | null = null;
let isStopRequested = false;
let queue: Promise<unknown> = Promise.resolve();

function publish(next: Operations) {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** The person's answer to the clash asked about. */
export function answerClash(answer: ClashAnswer): void {
  const resolve = pendingAnswer;
  if (!resolve) return;
  pendingAnswer = null;
  publish({ ...snapshot, question: null });
  resolve(answer);
}

/** The status bar's stop: the move or copy going ends after the item it is on. */
export function stopOperation(): void {
  const { progress } = snapshot;
  if (!progress) return;
  isStopRequested = true;
  publish({ ...snapshot, progress: { ...progress, isStopping: true } });
}

function ask(question: ClashQuestion): Promise<ClashAnswer> {
  return new Promise((resolve) => {
    pendingAnswer = resolve;
    publish({ ...snapshot, question });
  });
}

async function run(request: OperationRequest): Promise<TransferResult | null> {
  const { items, folderUri, folderName, relocation, trash } = request;
  const steps = await planTransfer(items, listFolder(folderUri), relocation, trash !== null, ask);
  if (!steps || steps.length === 0) return null;
  isStopRequested = false;
  let fraction = 0;
  let isShown = false;
  const showProgress = () =>
    publish({
      ...snapshot,
      progress: {
        relocation,
        count: steps.length,
        folderName,
        fraction,
        isStopping: isStopRequested,
      },
    });
  const timer = setTimeout(() => {
    isShown = true;
    showProgress();
  }, PROGRESS_DELAY_MS);
  try {
    return await runTransfer({
      steps,
      folderUri,
      relocation,
      trash,
      isStopped: () => isStopRequested,
      onProgress: (progress) => {
        fraction = progress.fraction;
        if (isShown) showProgress();
      },
    });
  } finally {
    clearTimeout(timer);
    isStopRequested = false;
    publish({ ...snapshot, progress: null });
  }
}

/**
 * Moves or copies items into a folder, after the moves and copies asked for before it: the clashes
 * asked about first, then each item, its progress shown after half a second. What it did, or null
 * when nothing was (Stop answered to a clash).
 */
export function transferFiles(request: OperationRequest): Promise<TransferResult | null> {
  return inTurn(() => run(request));
}

/**
 * Runs a change to files after those asked for before it, and before any asked for after: the
 * window's moves, copies, duplicates, Undo and Redo, one at a time.
 */
export function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work);
  // The next waits for this one to end, however it ends; the caller hears how.
  queue = next.catch(() => undefined);
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Operations {
  return snapshot;
}

/** The window's moves and copies, for its alert and its status bar. */
export function useOperations(): Operations {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
