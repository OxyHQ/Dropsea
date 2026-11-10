/**
 * Edit › Undo and Redo of what the person did to their files, as Finder's (ADR 0002): a window's
 * own history of moves, copies and duplicates, renames, new folders, Move to Trash and Put Back,
 * and tag changes, each a step however many items it took. Undo takes the latest step back, Redo
 * does it again; a new step forgets what was undone. Deleting for good is no step: it cannot be
 * undone, and the window asks first.
 *
 * Every item of a step is an entry saying where things are now: an item moved or renamed from
 * one URI to another, one that came to be (a copy, a duplicate, a new folder, an item put back),
 * one in the Trash and where it was, an Oxy Files asset put in its trash or taken out, and an
 * item's tags before and after. Each entry has one opposite, so Undo is the step's entries taken
 * the other way, and what that did is what Redo takes the other way again. A copy is undone into
 * the Trash, never deleted.
 *
 * Undo first checks that the world is still as the step left it, for every entry: the item where
 * it went, the place it goes back to there and its name free there, its tags as the step left
 * them. If anything differs, nothing is touched and the step stays, to be undone once the person
 * has cleared the way. An entry the file system then refuses (another program raced it) stops the
 * rest, and what was already taken back is done again, so a step is undone whole or not at all.
 * Nothing is ever put over an item: the platform refuses to replace one.
 */
import type {
  PlatformFileOutcome,
  PlatformFileTags,
  PlatformTrashedItem,
} from '@oxy.so/bloom/platform-surface';
import { useSyncExternalStore } from 'react';
import { folderExists, itemsAtUris, namesIn, relocateItem, renameItem } from '@/lib/local-files';
import { isSameUri, parentUri, uriName } from '@/lib/local-places';
import { nameProblem } from '@/lib/names';
import type { FileProblem, Strings } from '@/lib/strings';
import { type ItemTag, isSameTag } from '@/lib/tags';

/** Puts items in the platform's Trash (`usePlatformFiles().trash`). */
export type TrashFiles = (uris: readonly string[]) => Promise<readonly PlatformFileOutcome[]>;

/** The most steps a window's history keeps; the oldest are forgotten past it. */
export const UNDO_LIMIT = 100;

/** What the person did, as the Edit menu names it. */
export type UndoAction =
  | 'move'
  | 'copy'
  | 'duplicate'
  | 'rename'
  | 'new-folder'
  | 'trash'
  | 'put-back'
  | 'tags';

/** An item whose tags changed: a file on this device or an Oxy Files asset. */
export type TagTarget = { kind: 'file'; uri: string } | { kind: 'asset'; assetId: string };

/** Where one item of a step is now, and how it got there. */
export type UndoEntry =
  /** Moved from one folder to another (its name may have changed: Keep Both). */
  | { kind: 'moved'; from: string; to: string }
  /** Renamed where it is. */
  | { kind: 'renamed'; from: string; to: string }
  /** Came to be at `uri`: a copy, a duplicate, a new folder, an item put back. */
  | { kind: 'created'; uri: string }
  /** In the platform's Trash at `trash`, from `from`. */
  | { kind: 'trashed'; from: string; trash: string }
  /** An Oxy Files asset in its trash, or out of it. */
  | { kind: 'asset-trashed'; assetId: string; name: string }
  | { kind: 'asset-restored'; assetId: string; name: string }
  /** An item's tags, as they were and as they are. */
  | {
      kind: 'tagged';
      target: TagTarget;
      name: string;
      before: readonly ItemTag[];
      after: readonly ItemTag[];
    };

/** A step of the history: what the person did, the first item's name, and an entry for each item. */
export interface UndoStep {
  action: UndoAction;
  /** The first item's name as the person acted on it: “Undo Move “Facturas””. */
  name: string;
  entries: readonly UndoEntry[];
}

/** A step as the Edit menu names it: “Move “Facturas””, “Move 3 Items”. */
export function stepName(step: UndoStep, strings: Strings): string {
  return strings.undo.step(strings.undo.actions[step.action], step.entries.length, step.name);
}

/** The step an Undo would take back and the one a Redo would do again, if any. */
export interface UndoState {
  undo: UndoStep | null;
  redo: UndoStep | null;
}

/** Why an Undo or a Redo did nothing. */
export type UndoProblem =
  /** The item is not where the step left it (`name` is its name there). */
  | { kind: 'gone'; name: string }
  /** An item of that name is where it would go. */
  | { kind: 'taken'; name: string }
  /** The folder it would go into is not there. */
  | { kind: 'folder-gone'; name: string }
  /** Its tags changed since. */
  | { kind: 'tags-changed'; name: string }
  /** The file system, the platform or Oxy Files refused. */
  | { kind: 'file'; name: string; problem: FileProblem };

/** What an Undo or a Redo came to. */
export type Replayed =
  | {
      ok: true;
      step: UndoStep;
      /** Each of this device's items the step brought back or put somewhere, where it is now. */
      placed: string[];
      /** Every folder whose items changed. */
      folders: string[];
    }
  | {
      ok: false;
      step: UndoStep;
      problem: UndoProblem;
      /** Nothing changed: the step is as it was. Else part of it was done and could not be taken back. */
      isUnchanged: boolean;
      /** Every folder whose items changed for a moment, or for good. */
      folders: string[];
    };

/** Oxy Files: its trash, and Dropsea's tags of its assets where this build has its backend. */
export interface CloudUndo {
  trash(assetId: string): Promise<unknown>;
  restore(assetId: string): Promise<unknown>;
  tags: {
    /** Each asset's tags' names; an asset with none left out. */
    of(assetIds: readonly string[]): Promise<Readonly<Record<string, readonly string[]>>>;
    change(
      assetIds: readonly string[],
      add: readonly string[],
      remove: readonly string[],
    ): Promise<unknown>;
  } | null;
}

/**
 * What a history acts through: the platform's Trash and its tags on files (`usePlatformFiles`),
 * each null where the platform has none, and Oxy Files, null signed out. This device's items move
 * and are renamed through `expo-file-system`, the platform's file service.
 */
export interface UndoPlatform {
  trash: {
    trash: TrashFiles;
    trashed(): Promise<readonly PlatformTrashedItem[]>;
    restore(uris: readonly string[]): Promise<readonly PlatformFileOutcome[]>;
  } | null;
  tags: Pick<PlatformFileTags, 'ofItems' | 'change'> | null;
  cloud: CloudUndo | null;
}

/** The names `folderUri` holds now, but `except` (an item renamed in it, whose own name it keeps). */
function otherNamesIn(folderUri: string, except: string | null): string[] {
  const names = namesIn(folderUri);
  return except === null ? names : names.filter((name) => name !== except);
}

function tagNames(tags: readonly ItemTag[]): string[] {
  return tags.map((tag) => tag.name);
}

/** Whether two lists hold the same tags, case and order aside. */
function isSameTags(first: readonly string[], second: readonly string[]): boolean {
  return (
    first.length === second.length &&
    first.every((name) => second.some((other) => isSameTag(name, other))) &&
    second.every((name) => first.some((other) => isSameTag(name, other)))
  );
}

/** The tags of `from` not in `other`. */
function tagsMissingFrom(from: readonly ItemTag[], other: readonly ItemTag[]): ItemTag[] {
  return from.filter((tag) => !other.some((each) => isSameTag(each.name, tag.name)));
}

/** The name an entry's item has as the step left it, for what is said about it. */
function entryName(entry: UndoEntry): string {
  switch (entry.kind) {
    case 'moved':
    case 'renamed':
      return uriName(entry.to);
    case 'created':
      return uriName(entry.uri);
    case 'trashed':
      return uriName(entry.from);
    case 'asset-trashed':
    case 'asset-restored':
    case 'tagged':
      return entry.name;
  }
}

/**
 * Whether the world is as the entries left it, so taking each the other way would do what the step
 * says: the first difference, or null.
 */
async function check(
  entries: readonly UndoEntry[],
  platform: UndoPlatform,
): Promise<UndoProblem | null> {
  let inTrash: readonly PlatformTrashedItem[] | null = null;
  /** The names each folder would hold, as the entries before this one would leave them. */
  const claimed = new Map<string, string[]>();
  const isFree = (folderUri: string, name: string, except: string | null) => {
    const taken = [...otherNamesIn(folderUri, except), ...(claimed.get(folderUri) ?? [])];
    if (nameProblem(name, taken) === 'taken') return false;
    claimed.set(folderUri, [...(claimed.get(folderUri) ?? []), name]);
    return true;
  };
  const fileTags = entries.flatMap((entry) =>
    entry.kind === 'tagged' && entry.target.kind === 'file'
      ? [{ entry, uri: entry.target.uri }]
      : [],
  );
  const assetTags = entries.flatMap((entry) =>
    entry.kind === 'tagged' && entry.target.kind === 'asset'
      ? [{ entry, assetId: entry.target.assetId }]
      : [],
  );
  for (const entry of entries) {
    const name = entryName(entry);
    switch (entry.kind) {
      case 'moved':
      case 'renamed': {
        if (itemsAtUris([entry.to]).length === 0) return { kind: 'gone', name };
        const folder = parentUri(entry.from);
        if (!folderExists(folder)) return { kind: 'folder-gone', name: uriName(folder) };
        const except = entry.kind === 'renamed' ? uriName(entry.to) : null;
        if (!isFree(folder, uriName(entry.from), except)) {
          return { kind: 'taken', name: uriName(entry.from) };
        }
        break;
      }
      case 'created':
        if (!platform.trash) return { kind: 'file', name, problem: 'unavailable' };
        if (itemsAtUris([entry.uri]).length === 0) return { kind: 'gone', name };
        break;
      case 'trashed': {
        if (!platform.trash) return { kind: 'file', name, problem: 'unavailable' };
        inTrash ??= await platform.trash.trashed();
        if (!inTrash.some((item) => isSameUri(item.uri, entry.trash)))
          return { kind: 'gone', name };
        const folder = parentUri(entry.from);
        if (!folderExists(folder)) return { kind: 'folder-gone', name: uriName(folder) };
        if (!isFree(folder, name, null)) return { kind: 'taken', name };
        break;
      }
      case 'asset-trashed':
      case 'asset-restored':
        if (!platform.cloud) return { kind: 'file', name, problem: 'unavailable' };
        break;
      case 'tagged':
        break;
    }
  }
  if (fileTags.length > 0) {
    if (!platform.tags) {
      return { kind: 'file', name: fileTags[0]?.entry.name ?? '', problem: 'unavailable' };
    }
    const now = await platform.tags.ofItems(fileTags.map(({ uri }) => uri));
    for (const [index, { entry }] of fileTags.entries()) {
      const tags = now[index];
      if (!tags) return { kind: 'gone', name: entry.name };
      if (!isSameTags(tagNames(tags), tagNames(entry.after))) {
        return { kind: 'tags-changed', name: entry.name };
      }
    }
  }
  if (assetTags.length > 0) {
    const cloudTags = platform.cloud?.tags;
    if (!cloudTags) {
      return { kind: 'file', name: assetTags[0]?.entry.name ?? '', problem: 'unavailable' };
    }
    const now = await cloudTags.of(assetTags.map(({ assetId }) => assetId));
    for (const { entry, assetId } of assetTags) {
      if (!isSameTags(now[assetId] ?? [], tagNames(entry.after))) {
        return { kind: 'tags-changed', name: entry.name };
      }
    }
  }
  return null;
}

/** One entry taken the other way: the entry that says where the item is then, or why not. */
async function reverseEntry(
  entry: UndoEntry,
  platform: UndoPlatform,
): Promise<{ ok: true; entry: UndoEntry } | { ok: false; problem: UndoProblem }> {
  const name = entryName(entry);
  const failed = (problem: FileProblem) =>
    ({ ok: false, problem: { kind: 'file', name, problem } }) as const;
  const platformOutcome = (outcomes: readonly PlatformFileOutcome[]) => {
    const [outcome] = outcomes;
    if (!outcome) return failed('io');
    return outcome.ok ? { ok: true as const, uri: outcome.result } : failed(outcome.error);
  };
  try {
    switch (entry.kind) {
      case 'moved': {
        const [item] = itemsAtUris([entry.to]);
        if (!item) return { ok: false, problem: { kind: 'gone', name } };
        const outcome = await relocateItem(
          item,
          parentUri(entry.from),
          uriName(entry.from),
          'move',
        );
        if (!outcome.ok) {
          return outcome.problem === 'exists'
            ? { ok: false, problem: { kind: 'taken', name: uriName(entry.from) } }
            : failed(outcome.problem);
        }
        return { ok: true, entry: { kind: 'moved', from: entry.to, to: outcome.uri } };
      }
      case 'renamed': {
        const [item] = itemsAtUris([entry.to]);
        if (!item) return { ok: false, problem: { kind: 'gone', name } };
        const change = renameItem(item, parentUri(entry.to), uriName(entry.from));
        if (!change.ok) {
          return change.why.kind === 'name'
            ? { ok: false, problem: { kind: 'taken', name: uriName(entry.from) } }
            : failed(change.why.problem);
        }
        return { ok: true, entry: { kind: 'renamed', from: entry.to, to: change.item.uri } };
      }
      case 'created': {
        if (!platform.trash) return failed('unavailable');
        const done = platformOutcome(await platform.trash.trash([entry.uri]));
        if (!done.ok) return done;
        return { ok: true, entry: { kind: 'trashed', from: entry.uri, trash: done.uri } };
      }
      case 'trashed': {
        if (!platform.trash) return failed('unavailable');
        const done = platformOutcome(await platform.trash.restore([entry.trash]));
        if (!done.ok) {
          return done.problem.kind === 'file' && done.problem.problem === 'exists'
            ? { ok: false, problem: { kind: 'taken', name } }
            : done;
        }
        return { ok: true, entry: { kind: 'created', uri: done.uri } };
      }
      case 'asset-trashed':
        if (!platform.cloud) return failed('unavailable');
        await platform.cloud.restore(entry.assetId);
        return { ok: true, entry: { ...entry, kind: 'asset-restored' } };
      case 'asset-restored':
        if (!platform.cloud) return failed('unavailable');
        await platform.cloud.trash(entry.assetId);
        return { ok: true, entry: { ...entry, kind: 'asset-trashed' } };
      case 'tagged': {
        const add = tagsMissingFrom(entry.before, entry.after);
        const remove = tagNames(tagsMissingFrom(entry.after, entry.before));
        const back = { ...entry, before: entry.after, after: entry.before };
        if (entry.target.kind === 'file') {
          if (!platform.tags) return failed('unavailable');
          const done = platformOutcome(
            await platform.tags.change([entry.target.uri], { add, remove }),
          );
          return done.ok ? { ok: true, entry: back } : done;
        }
        const cloudTags = platform.cloud?.tags;
        if (!cloudTags) return failed('unavailable');
        await cloudTags.change([entry.target.assetId], tagNames(add), remove);
        return { ok: true, entry: back };
      }
    }
  } catch (error) {
    // Oxy Files and the platform's tags answer a refusal by throwing: said, and the rest stops.
    console.warn('Dropsea could not take an item of a step back', { entry, error });
    return failed('io');
  }
}

/** Every folder an entry's item was or is in, for the views that show them. */
function foldersOf(entry: UndoEntry): string[] {
  switch (entry.kind) {
    case 'moved':
    case 'renamed':
      return [parentUri(entry.from), parentUri(entry.to)];
    case 'created':
      return [parentUri(entry.uri)];
    case 'trashed':
      return [parentUri(entry.from)];
    case 'tagged':
      return entry.target.kind === 'file' ? [parentUri(entry.target.uri)] : [];
    case 'asset-trashed':
    case 'asset-restored':
      return [];
  }
}

/** Where an entry puts this device's item, to select it there; null for one gone to the Trash or Oxy Files'. */
function placedUri(entry: UndoEntry): string | null {
  switch (entry.kind) {
    case 'moved':
    case 'renamed':
      return entry.to;
    case 'created':
      return entry.uri;
    case 'tagged':
      return entry.target.kind === 'file' ? entry.target.uri : null;
    case 'trashed':
    case 'asset-trashed':
    case 'asset-restored':
      return null;
  }
}

/** Entries taken the other way, one by one, until one fails: what was done, and the failure. */
async function reverseAll(
  entries: readonly UndoEntry[],
  platform: UndoPlatform,
): Promise<{ done: UndoEntry[]; problem: UndoProblem | null }> {
  const done: UndoEntry[] = [];
  for (const entry of entries) {
    const result = await reverseEntry(entry, platform);
    if (!result.ok) return { done, problem: result.problem };
    done.push(result.entry);
  }
  return { done, problem: null };
}

/**
 * A window's history (ADR 0002): what Edit › Undo takes back and Redo does again, kept while the
 * window is open, through focus changes, and gone with it.
 */
export class UndoHistory {
  private readonly undos: UndoStep[] = [];
  private readonly redos: UndoStep[] = [];
  private state: UndoState = { undo: null, redo: null };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly limit: number = UNDO_LIMIT) {}

  private publish(): void {
    this.state = { undo: this.undos.at(-1) ?? null, redo: this.redos.at(-1) ?? null };
    for (const listener of this.listeners) listener();
  }

  /**
   * What the person did, an entry for each item and `name` the first's as they acted on it: Undo
   * takes it back next, and what was undone can no longer be redone.
   */
  record(action: UndoAction, name: string, entries: readonly UndoEntry[]): void {
    if (entries.length === 0) return;
    this.undos.push({ action, name, entries });
    if (this.undos.length > this.limit) this.undos.splice(0, this.undos.length - this.limit);
    this.redos.length = 0;
    this.publish();
  }

  /**
   * Edit › Undo: the latest step taken back, whole or not at all. Null with nothing to undo. The
   * caller runs it in the window's turn of file changes (`inTurn`), never beside another.
   */
  undo(platform: UndoPlatform): Promise<Replayed | null> {
    return this.replay(this.undos, this.redos, platform);
  }

  /** Edit › Redo: the latest step undone done again, whole or not at all. Null with nothing to redo. */
  redo(platform: UndoPlatform): Promise<Replayed | null> {
    return this.replay(this.redos, this.undos, platform);
  }

  /** Takes the latest step of `from` the other way and keeps it on `to`. */
  private async replay(
    from: UndoStep[],
    to: UndoStep[],
    platform: UndoPlatform,
  ): Promise<Replayed | null> {
    const step = from.at(-1);
    if (!step) return null;
    const problem = await check(step.entries, platform);
    if (problem) return { ok: false, step, problem, isUnchanged: true, folders: [] };
    from.pop();
    const { done, problem: failure } = await reverseAll(step.entries, platform);
    if (!failure) {
      to.push({ ...step, entries: done });
      this.publish();
      return {
        ok: true,
        step,
        placed: done.flatMap((entry) => {
          const uri = placedUri(entry);
          return uri ? [uri] : [];
        }),
        folders: [...new Set(done.flatMap(foldersOf))],
      };
    }
    // Part was done before the file system refused the rest: that part is done again, so the step
    // stays as it was, whole. Should even that fail, what stayed taken back is the other list's.
    const back = await reverseAll(done, platform);
    const stillDone = done.slice(back.done.length);
    if (stillDone.length > 0) {
      console.warn('Dropsea could not do again what part of a step had taken back', back.problem);
      to.push({ ...step, entries: stillDone });
    }
    from.push({ ...step, entries: [...back.done, ...step.entries.slice(done.length)] });
    this.publish();
    return {
      ok: false,
      step,
      problem: failure,
      isUnchanged: stillDone.length === 0,
      folders: [...new Set([...done, ...back.done].flatMap(foldersOf))],
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): UndoState => this.state;
}

/** A history's latest steps, for the Edit menu. */
export function useUndoState(history: UndoHistory): UndoState {
  return useSyncExternalStore(history.subscribe, history.getState, history.getState);
}
