/**
 * A move or a copy of items into a folder, as Finder does one (OxyOS ADR 0047, decisions 15 and
 * 16). Before anything moves the names it would take are checked, and each clash is asked about:
 * Keep Both (the item goes under the first number free, `notes 2.txt`), Stop (nothing is done)
 * or Replace (the item there goes to the Trash first, so it can be put back, then the item takes
 * its place), with Apply to All for the clashes after it. Then the items go one by one, the
 * progress told by their bytes, and a stop asked for between two items ends it there: the item
 * going finishes (the file service moves or copies an item in one call), no other starts, and what
 * was done stays.
 */
import type { LocalItem } from '@/lib/items';
import {
  type LocalOutcome,
  type Relocated,
  type Relocation,
  relocateItem,
} from '@/lib/local-files';
import { isWithinUri } from '@/lib/local-places';
import { freeFileName, freeName } from '@/lib/names';
import type { TrashFiles } from '@/lib/undo';

/** An item going whose name an item in the folder already has. */
export interface Clash {
  item: LocalItem;
  existing: LocalItem;
  /**
   * Whether Replace is offered: not for the item itself (a copy into its own folder), nor for a
   * folder that holds the item (it would go to the Trash with the item in it), nor where the
   * platform has no Trash to put the item there in.
   */
  canReplace: boolean;
}

/** What the alert asks: a clash, of a move or a copy, and how many more clashes come after it. */
export interface ClashQuestion {
  clash: Clash;
  relocation: Relocation;
  remaining: number;
}

export type ClashChoice = 'keep-both' | 'stop' | 'replace';

export interface ClashAnswer {
  choice: ClashChoice;
  /** Apply to All: the same answer for every clash after this one. */
  isForAll: boolean;
}

/** One item of a transfer: where it goes, under which name, and what it replaces, if anything. */
export interface TransferStep {
  item: LocalItem;
  name: string;
  replacing: LocalItem | null;
}

/** The names a folder's items have, folded as names are compared (case aside). */
function foldedNames(items: readonly LocalItem[]): Map<string, LocalItem> {
  return new Map(items.map((item) => [item.name.toLowerCase(), item]));
}

/**
 * The steps of a move or a copy of `items` into a folder holding `existing`, asking `ask` about
 * each clash in the items' order (Apply to All answering the rest, but for a Replace not offered
 * there, which is asked on its own). Null when the person answered Stop: nothing is done.
 */
export async function planTransfer(
  items: readonly LocalItem[],
  existing: readonly LocalItem[],
  relocation: Relocation,
  canTrash: boolean,
  ask: (question: ClashQuestion) => Promise<ClashAnswer>,
): Promise<TransferStep[] | null> {
  const there = foldedNames(existing);
  const clashes: Clash[] = items.flatMap((item) => {
    const found = there.get(item.name.toLowerCase());
    if (!found) return [];
    const canReplace = canTrash && !isWithinUri(item.uri, found.uri);
    return [{ item, existing: found, canReplace }];
  });
  // The names taken as the steps are planned: those there, but for what is replaced, and those
  // the items before took.
  const taken = new Set(there.keys());
  const choices = new Map<LocalItem, ClashChoice>();
  let forAll: ClashChoice | null = null;
  for (const [index, clash] of clashes.entries()) {
    let choice: ClashChoice | null = forAll === 'replace' && !clash.canReplace ? null : forAll;
    if (choice === null) {
      const answer = await ask({ clash, relocation, remaining: clashes.length - index - 1 });
      if (answer.isForAll) forAll = answer.choice;
      choice = answer.choice;
    }
    if (choice === 'stop') return null;
    choices.set(clash.item, choice === 'replace' && !clash.canReplace ? 'keep-both' : choice);
  }
  const steps: TransferStep[] = [];
  for (const item of items) {
    const clash = clashes.find((each) => each.item === item);
    const isReplacing = clash !== undefined && choices.get(item) === 'replace';
    if (isReplacing) {
      steps.push({ item, name: item.name, replacing: clash.existing });
      continue;
    }
    const names = [...taken];
    const name = item.isFolder ? freeName(item.name, names) : freeFileName(item.name, names);
    taken.add(name.toLowerCase());
    steps.push({ item, name, replacing: null });
  }
  return steps;
}

/** How far a transfer has come: the items done of all of them, and its share by their bytes. */
export interface TransferProgress {
  done: number;
  total: number;
  fraction: number;
}

/**
 * Each item's share of a transfer, by its bytes: a file's size; a folder's, whose size is not
 * read (it would mean walking everything in it), the files' average, so it counts once done.
 */
export function transferWeights(items: readonly LocalItem[]): number[] {
  const sizes = items.flatMap((item) => (!item.isFolder && item.size !== null ? [item.size] : []));
  const average = sizes.length > 0 ? sizes.reduce((sum, size) => sum + size, 0) / sizes.length : 1;
  return items.map((item) =>
    Math.max(1, !item.isFolder && item.size !== null ? item.size : average),
  );
}

/** What a transfer did: what came of each step, what it moved or copied, and whether it was stopped. */
export interface TransferResult {
  outcomes: LocalOutcome[];
  relocated: Relocated[];
  /** The items replaced, in the Trash now. */
  replaced: string[];
  isStopped: boolean;
}

export interface TransferRun {
  steps: readonly TransferStep[];
  folderUri: string;
  relocation: Relocation;
  /** The platform's Trash, for what a step replaces. */
  trash: TrashFiles | null;
  /** Whether the person asked to stop: read before each item starts. */
  isStopped: () => boolean;
  onProgress: (progress: TransferProgress) => void;
}

/** Does the steps one by one, telling the progress after each, until done or stopped. */
export async function runTransfer({
  steps,
  folderUri,
  relocation,
  trash,
  isStopped,
  onProgress,
}: TransferRun): Promise<TransferResult> {
  const weights = transferWeights(steps.map((step) => step.item));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const result: TransferResult = { outcomes: [], relocated: [], replaced: [], isStopped: false };
  let doneWeight = 0;
  for (const [index, step] of steps.entries()) {
    if (isStopped()) {
      result.isStopped = true;
      break;
    }
    const outcome = await runStep(step, folderUri, relocation, trash, result);
    result.outcomes.push(outcome);
    if (outcome.ok) result.relocated.push({ from: step.item.uri, to: outcome.uri });
    doneWeight += weights[index] ?? 0;
    onProgress({ done: index + 1, total: steps.length, fraction: doneWeight / total });
  }
  return result;
}

async function runStep(
  step: TransferStep,
  folderUri: string,
  relocation: Relocation,
  trash: TrashFiles | null,
  result: TransferResult,
): Promise<LocalOutcome> {
  const { item, replacing } = step;
  if (replacing) {
    if (!trash) return { key: item.key, ok: false, problem: 'unavailable' };
    const [trashed] = await trash([replacing.uri]);
    if (!trashed) return { key: item.key, ok: false, problem: 'io' };
    if (!trashed.ok) return { key: item.key, ok: false, problem: trashed.error };
    result.replaced.push(replacing.uri);
  }
  return relocateItem(item, folderUri, step.name, relocation);
}
