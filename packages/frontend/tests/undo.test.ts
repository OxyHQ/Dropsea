import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PlatformFileTag, PlatformTagChange } from '@oxy.so/bloom/platform-surface';
import { Directory, File, pathsAt, platformTrashAt } from './node-file-system';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dropsea-undo-'));
const trashFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'dropsea-undo-trash-'));

mock.module('expo-file-system', () => ({ Directory, File, Paths: pathsAt(root) }));
mock.module('expo', () => ({
  requireOptionalNativeModule: (name: string) => (name === 'FileSystem' ? {} : null),
}));

const local = await import('@/lib/local-files');
const undo = await import('@/lib/undo');
const { stringsFor } = await import('@/lib/strings');

type UndoHistory = InstanceType<typeof undo.UndoHistory>;
type UndoPlatform = Parameters<UndoHistory['undo']>[0];

function write(relative: string, content = 'x') {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function uri(relative: string): string {
  return encodeURI(`file://${path.join(root, relative)}`);
}

function folderUri(relative: string): string {
  return `${uri(relative).replace(/\/+$/, '')}/`;
}

function names(relative: string): string[] {
  return fs.readdirSync(path.join(root, relative)).sort();
}

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function trashNames(): string[] {
  return fs
    .readdirSync(trashFolder)
    .map((name) => name.replace(/^\d+ /, ''))
    .sort();
}

/** The platform's tags of files, kept in memory by path: what `usePlatformFiles().tags` answers. */
function memoryTags() {
  const byPath = new Map<string, PlatformFileTag[]>();
  const key = (itemUri: string) => decodeURI(itemUri.replace(/^file:\/\//, '')).replace(/\/+$/, '');
  return {
    set(itemUri: string, tags: readonly string[]) {
      byPath.set(
        key(itemUri),
        tags.map((name) => ({ name, color: null })),
      );
    },
    names(itemUri: string): string[] {
      return (byPath.get(key(itemUri)) ?? []).map((tag) => tag.name);
    },
    async ofItems(uris: readonly string[]) {
      return uris.map((each) => (fs.existsSync(key(each)) ? (byPath.get(key(each)) ?? []) : null));
    },
    async change(uris: readonly string[], change: PlatformTagChange) {
      return uris.map((each) => {
        if (!fs.existsSync(key(each))) {
          return { uri: each, ok: false as const, error: 'not-found' as const };
        }
        const removed = (change.remove ?? []).map((name) => name.toLowerCase());
        const kept = (byPath.get(key(each)) ?? []).filter(
          (tag) => !removed.includes(tag.name.toLowerCase()),
        );
        for (const tag of change.add ?? []) {
          if (!kept.some((other) => other.name.toLowerCase() === tag.name.toLowerCase())) {
            kept.push(tag);
          }
        }
        byPath.set(key(each), kept);
        return { uri: each, ok: true as const, result: each };
      });
    },
  };
}

/** Oxy Files as Undo reaches it: each asset in its trash or not, and Dropsea's tags of it. */
function memoryCloud() {
  const trashed = new Set<string>();
  const tags = new Map<string, string[]>();
  return {
    trashed,
    tags,
    cloud: {
      async trash(assetId: string) {
        trashed.add(assetId);
      },
      async restore(assetId: string) {
        if (!trashed.has(assetId)) throw new Error(`${assetId} is not in the trash`);
        trashed.delete(assetId);
      },
      tags: {
        async of(assetIds: readonly string[]) {
          return Object.fromEntries(
            assetIds.flatMap((id) => (tags.has(id) ? [[id, tags.get(id) ?? []]] : [])),
          );
        },
        async change(
          assetIds: readonly string[],
          add: readonly string[],
          remove: readonly string[],
        ) {
          for (const id of assetIds) {
            const kept = (tags.get(id) ?? []).filter((name) => !remove.includes(name));
            tags.set(id, [...kept, ...add.filter((name) => !kept.includes(name))]);
          }
        },
      },
    },
  };
}

let trash = platformTrashAt(trashFolder);
let tags = memoryTags();
let cloud = memoryCloud();
let platform: UndoPlatform;
let history: UndoHistory;

beforeEach(() => {
  for (const folder of [root, trashFolder]) {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(folder);
  }
  trash = platformTrashAt(trashFolder);
  tags = memoryTags();
  cloud = memoryCloud();
  platform = { trash, tags, cloud: cloud.cloud };
  history = new undo.UndoHistory();
  write('Facturas/enero.pdf', 'enero');
  write('Pictures/474350.jpg');
  write('notes.txt', 'notes');
  write('plan.txt', 'plan');
});

/** The items of `from` named `which`, in that order. */
function itemsNamed(which: readonly string[], from: string) {
  const items = local.listFolder(uri(from));
  return which.flatMap((name) => items.filter((item) => item.name === name));
}

/** Moves the items of `from` named `which` into `into` as Dropsea does, recorded as the person's move. */
async function move(which: readonly string[], from: string, into: string) {
  const items = itemsNamed(which, from);
  const entries = [];
  for (const item of items) {
    const outcome = await local.relocateItem(item, uri(into), item.name, 'move');
    if (outcome.ok) entries.push({ kind: 'moved' as const, from: item.uri, to: outcome.uri });
  }
  history.record('move', items[0]?.name ?? '', entries);
}

/** Puts the items of `from` named `which` in the Trash, recorded as the person's Move to Trash. */
async function moveToTrash(which: readonly string[], from = '.') {
  const items = itemsNamed(which, from);
  const outcomes = await trash.trash(items.map((item) => item.uri));
  history.record(
    'trash',
    items[0]?.name ?? '',
    outcomes.flatMap((outcome, index) => {
      const item = items[index];
      return outcome.ok && item
        ? [{ kind: 'trashed' as const, from: item.uri, trash: outcome.result }]
        : [];
    }),
  );
}

const english = stringsFor('en');
const spanish = stringsFor('es');

function menuTitles(state = history.getState()) {
  return {
    undo: state.undo ? english.undo.undo(undo.stepName(state.undo, english)) : english.menus.undo,
    redo: state.redo ? english.undo.redo(undo.stepName(state.redo, english)) : english.menus.redo,
  };
}

describe('the Edit menu names the step, as Finder: “Undo Move of “Facturas””', () => {
  test('one item by its name, several by how many, plain Undo with none, in English and Spanish', async () => {
    expect(menuTitles()).toEqual({ undo: 'Undo', redo: 'Redo' });
    await move(['Facturas'], '.', 'Pictures');
    expect(menuTitles()).toEqual({ undo: 'Undo Move of “Facturas”', redo: 'Redo' });
    const step = history.getState().undo;
    if (!step) throw new Error('the move is not undoable');
    expect(spanish.undo.undo(undo.stepName(step, spanish))).toBe('Deshacer el traslado de «Facturas»');

    await history.undo(platform);
    expect(menuTitles()).toEqual({ undo: 'Undo', redo: 'Redo Move of “Facturas”' });
    const redo = history.getState().redo;
    if (!redo) throw new Error('the move is not redoable');
    expect(spanish.undo.redo(undo.stepName(redo, spanish))).toBe('Rehacer el traslado de «Facturas»');

    await move(['notes.txt', 'plan.txt', 'Facturas'], '.', 'Pictures');
    expect(menuTitles()).toEqual({ undo: 'Undo Move of 3 Items', redo: 'Redo' });
    const batch = history.getState().undo;
    if (!batch) throw new Error('the batch is not undoable');
    expect(spanish.undo.undo(undo.stepName(batch, spanish))).toBe('Deshacer el traslado de 3 elementos');
  });

  test('what the screen reader says once done names the step the same way', () => {
    const each = new undo.UndoHistory();
    each.record('copy', 'notes.txt', [{ kind: 'created', uri: uri('notes 2.txt') }]);
    const step = each.getState().undo;
    if (!step) throw new Error('the copy is not undoable');
    expect(english.undo.undone(undo.stepName(step, english))).toBe('Undone: Copy of “notes.txt”');
    expect(spanish.undo.undone(undo.stepName(step, spanish))).toBe(
      'Deshecho: la copia de «notes.txt»',
    );
  });

  test('each action has its own name', () => {
    const named = (action: Parameters<UndoHistory['record']>[0]) => {
      const each = new undo.UndoHistory();
      each.record(action, 'Facturas', [{ kind: 'created', uri: folderUri('Facturas') }]);
      const step = each.getState().undo;
      return step ? [undo.stepName(step, english), undo.stepName(step, spanish)] : null;
    };
    expect(named('copy')).toEqual(['Copy of “Facturas”', 'la copia de «Facturas»']);
    expect(named('duplicate')).toEqual(['Duplicate of “Facturas”', 'el duplicado de «Facturas»']);
    expect(named('rename')).toEqual(['Rename of “Facturas”', 'el cambio de nombre de «Facturas»']);
    expect(named('new-folder')).toEqual(['New Folder of “Facturas”', 'la creación de «Facturas»']);
    expect(named('trash')).toEqual([
      'Move to Trash of “Facturas”',
      'el traslado a la papelera de «Facturas»',
    ]);
    expect(named('put-back')).toEqual(['Put Back of “Facturas”', 'la devolución de «Facturas»']);
    expect(named('tags')).toEqual(['Change Tags of “Facturas”', 'el cambio de etiquetas de «Facturas»']);
  });
});

describe('Undo and Redo of moves', () => {
  test('a batch is one step: undone whole, redone whole, each once', async () => {
    await move(['Facturas', 'notes.txt', 'plan.txt'], '.', 'Pictures');
    expect(names('Pictures')).toEqual(['474350.jpg', 'Facturas', 'notes.txt', 'plan.txt']);

    const undone = await history.undo(platform);
    expect(undone).toMatchObject({ ok: true, step: { action: 'move', name: 'Facturas' } });
    expect(undone?.ok === true && undone.placed).toEqual([
      folderUri('Facturas'),
      uri('notes.txt'),
      uri('plan.txt'),
    ]);
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'notes.txt', 'plan.txt']);
    expect(names('Pictures')).toEqual(['474350.jpg']);
    expect(read('Facturas/enero.pdf')).toBe('enero');
    expect(await history.undo(platform)).toBeNull();

    await history.redo(platform);
    expect(names('Pictures')).toEqual(['474350.jpg', 'Facturas', 'notes.txt', 'plan.txt']);
    expect(await history.redo(platform)).toBeNull();
    await history.undo(platform);
    expect(names('Pictures')).toEqual(['474350.jpg']);
  });

  test('steps are undone the latest first, and a new step forgets what was undone', async () => {
    await move(['notes.txt'], '.', 'Facturas');
    await move(['plan.txt'], '.', 'Pictures');
    await history.undo(platform);
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'plan.txt']);
    expect(names('Facturas')).toEqual(['enero.pdf', 'notes.txt']);
    await move(['plan.txt'], '.', 'Facturas');
    expect(history.getState().redo).toBeNull();
    await history.undo(platform);
    await history.undo(platform);
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'notes.txt', 'plan.txt']);
  });

  test('a name taken where an item would go back stops the whole step: nothing moves, nothing is replaced', async () => {
    await move(['notes.txt', 'plan.txt'], '.', 'Pictures');
    write('plan.txt', 'a new plan');
    const undone = await history.undo(platform);
    expect(undone).toMatchObject({
      ok: false,
      problem: { kind: 'taken', name: 'plan.txt' },
      isUnchanged: true,
    });
    expect(names('Pictures')).toEqual(['474350.jpg', 'notes.txt', 'plan.txt']);
    expect(read('plan.txt')).toBe('a new plan');
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'plan.txt']);
    // The step stays: once the way is clear, Undo takes it back.
    expect(menuTitles().undo).toBe('Undo Move 2 Items');
    fs.rmSync(path.join(root, 'plan.txt'));
    expect(await history.undo(platform)).toMatchObject({ ok: true });
    expect(read('plan.txt')).toBe('plan');
  });

  test('a name taken that differs only in case is taken, as the file systems that fold case have it', async () => {
    await move(['notes.txt'], '.', 'Pictures');
    write('NOTES.txt', 'another');
    expect(await history.undo(platform)).toMatchObject({
      ok: false,
      problem: { kind: 'taken', name: 'notes.txt' },
    });
    expect(names('Pictures')).toContain('notes.txt');
  });

  test('an item gone from where it went is said to be gone, and the others stay too', async () => {
    await move(['notes.txt', 'plan.txt'], '.', 'Pictures');
    fs.rmSync(path.join(root, 'Pictures/plan.txt'));
    expect(await history.undo(platform)).toMatchObject({
      ok: false,
      problem: { kind: 'gone', name: 'plan.txt' },
    });
    expect(names('Pictures')).toEqual(['474350.jpg', 'notes.txt']);
  });

  test('a folder gone that an item would go back into is said', async () => {
    await move(['enero.pdf'], 'Facturas', '.');
    fs.rmSync(path.join(root, 'Facturas'), { recursive: true });
    expect(await history.undo(platform)).toMatchObject({
      ok: false,
      problem: { kind: 'folder-gone', name: 'Facturas' },
    });
    expect(names('.')).toContain('enero.pdf');
  });
});

describe('Undo and Redo of Move to Trash', () => {
  test('Undo puts the items back where they were, Redo puts them in the Trash again', async () => {
    await moveToTrash(['Facturas', 'notes.txt']);
    expect(names('.')).toEqual(['Pictures', 'plan.txt']);
    expect(menuTitles().undo).toBe('Undo Move to Trash 2 Items');

    const undone = await history.undo(platform);
    expect(undone?.ok === true && undone.placed).toEqual([folderUri('Facturas'), uri('notes.txt')]);
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'notes.txt', 'plan.txt']);
    expect(read('Facturas/enero.pdf')).toBe('enero');
    expect(trashNames()).toEqual([]);

    await history.redo(platform);
    expect(names('.')).toEqual(['Pictures', 'plan.txt']);
    expect(trashNames()).toEqual(['Facturas', 'notes.txt']);
    // Taken back again, from where Redo put them this time.
    await history.undo(platform);
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'notes.txt', 'plan.txt']);
  });

  test('an item emptied from the Trash since cannot be put back: the step stays untouched', async () => {
    await moveToTrash(['notes.txt', 'plan.txt']);
    const [first] = fs.readdirSync(trashFolder).sort();
    fs.rmSync(path.join(trashFolder, first ?? ''));
    expect(await history.undo(platform)).toMatchObject({
      ok: false,
      problem: { kind: 'gone', name: 'notes.txt' },
    });
    expect(names('.')).toEqual(['Facturas', 'Pictures']);
  });

  test('an item of the same name where it was is never replaced', async () => {
    await moveToTrash(['notes.txt']);
    write('notes.txt', 'new notes');
    expect(await history.undo(platform)).toMatchObject({
      ok: false,
      problem: { kind: 'taken', name: 'notes.txt' },
    });
    expect(read('notes.txt')).toBe('new notes');
    expect(trashNames()).toEqual(['notes.txt']);
  });

  test('items put back by hand since are said to be gone from the Trash', async () => {
    await moveToTrash(['notes.txt']);
    const [trashed] = await trash.trashed();
    await trash.restore([trashed?.uri ?? '']);
    expect(await history.undo(platform)).toMatchObject({ ok: false, problem: { kind: 'gone' } });
  });

  test('without a Trash nothing is undone, and says why', async () => {
    await moveToTrash(['notes.txt']);
    expect(await history.undo({ ...platform, trash: null })).toMatchObject({
      ok: false,
      problem: { kind: 'file', problem: 'unavailable' },
    });
  });

  test('this device’s items and Oxy Files’ assets put in the Trash together are one step', async () => {
    const items = local.listFolder(uri('.')).filter((item) => item.name === 'notes.txt');
    const outcomes = await trash.trash(items.map((item) => item.uri));
    const [outcome] = outcomes;
    if (!outcome?.ok) throw new Error('notes.txt did not go to the Trash');
    await cloud.cloud.trash('asset-1');
    history.record('trash', 'notes.txt', [
      { kind: 'trashed', from: uri('notes.txt'), trash: outcome.result },
      { kind: 'asset-trashed', assetId: 'asset-1', name: 'beach.png' },
    ]);
    expect(menuTitles().undo).toBe('Undo Move to Trash 2 Items');
    expect(await history.undo(platform)).toMatchObject({ ok: true });
    expect(names('.')).toContain('notes.txt');
    expect(cloud.trashed.has('asset-1')).toBe(false);
    await history.redo(platform);
    expect(names('.')).not.toContain('notes.txt');
    expect(cloud.trashed.has('asset-1')).toBe(true);
  });
});

describe('Undo and Redo of renames', () => {
  test('Undo gives the item its name back, Redo the new one', async () => {
    const [notes] = local.listFolder(uri('.')).filter((item) => item.name === 'notes.txt');
    if (!notes) throw new Error('notes.txt is missing');
    const change = local.renameItem(notes, uri('.'), 'ideas.txt');
    if (!change.ok) throw new Error('notes.txt was not renamed');
    history.record('rename', 'notes.txt', [
      { kind: 'renamed', from: notes.uri, to: change.item.uri },
    ]);
    expect(menuTitles().undo).toBe('Undo Rename “notes.txt”');

    const undone = await history.undo(platform);
    expect(undone?.ok === true && undone.placed).toEqual([uri('notes.txt')]);
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'notes.txt', 'plan.txt']);
    expect(read('notes.txt')).toBe('notes');
    await history.redo(platform);
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'ideas.txt', 'plan.txt']);
  });

  test('a rename of the case alone is undone', async () => {
    const [notes] = local.listFolder(uri('.')).filter((item) => item.name === 'notes.txt');
    if (!notes) throw new Error('notes.txt is missing');
    const change = local.renameItem(notes, uri('.'), 'Notes.txt');
    if (!change.ok) throw new Error('notes.txt was not renamed');
    history.record('rename', 'notes.txt', [
      { kind: 'renamed', from: notes.uri, to: change.item.uri },
    ]);
    expect(await history.undo(platform)).toMatchObject({ ok: true });
    expect(names('.')).toContain('notes.txt');
  });

  test('the old name taken since stops it', async () => {
    const [notes] = local.listFolder(uri('.')).filter((item) => item.name === 'notes.txt');
    if (!notes) throw new Error('notes.txt is missing');
    const change = local.renameItem(notes, uri('.'), 'ideas.txt');
    if (!change.ok) throw new Error('notes.txt was not renamed');
    history.record('rename', 'notes.txt', [
      { kind: 'renamed', from: notes.uri, to: change.item.uri },
    ]);
    write('notes.txt', 'other');
    expect(await history.undo(platform)).toMatchObject({
      ok: false,
      problem: { kind: 'taken', name: 'notes.txt' },
    });
    expect(read('ideas.txt')).toBe('notes');
    expect(read('notes.txt')).toBe('other');
  });
});

describe('Undo and Redo of what came to be: copies, duplicates and new folders', () => {
  test('Undo Copy puts the copies in the Trash, never deleting them, the originals kept; Redo puts them back', async () => {
    const items = local
      .listFolder(uri('.'))
      .filter((item) => ['Facturas', 'notes.txt'].includes(item.name));
    const outcomes = await local.relocateItems(items, uri('Pictures'), 'copy');
    history.record(
      'copy',
      'Facturas',
      outcomes.flatMap((outcome) =>
        outcome.ok ? [{ kind: 'created' as const, uri: outcome.uri }] : [],
      ),
    );
    expect(names('Pictures')).toEqual(['474350.jpg', 'Facturas', 'notes.txt']);

    expect(await history.undo(platform)).toMatchObject({ ok: true, placed: [] });
    expect(names('Pictures')).toEqual(['474350.jpg']);
    expect(trashNames()).toEqual(['Facturas', 'notes.txt']);
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'notes.txt', 'plan.txt']);

    await history.redo(platform);
    expect(names('Pictures')).toEqual(['474350.jpg', 'Facturas', 'notes.txt']);
    expect(read('Pictures/Facturas/enero.pdf')).toBe('enero');
    expect(trashNames()).toEqual([]);
  });

  test('Undo Duplicate puts the duplicate in the Trash', async () => {
    const [notes] = local.listFolder(uri('.')).filter((item) => item.name === 'notes.txt');
    if (!notes) throw new Error('notes.txt is missing');
    const outcome = await local.relocateItem(notes, uri('.'), 'notes copy.txt', 'copy');
    if (!outcome.ok) throw new Error('notes.txt was not duplicated');
    history.record('duplicate', 'notes.txt', [{ kind: 'created', uri: outcome.uri }]);
    expect(menuTitles().undo).toBe('Undo Duplicate “notes.txt”');
    await history.undo(platform);
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'notes.txt', 'plan.txt']);
    expect(trashNames()).toEqual(['notes copy.txt']);
  });

  test('Undo New Folder puts it in the Trash with what it holds now; Redo brings it back', async () => {
    const made = local.createFolder(uri('.'), 'untitled folder');
    if (!made.ok) throw new Error('no folder was made');
    history.record('new-folder', 'untitled folder', [{ kind: 'created', uri: made.item.uri }]);
    write('untitled folder/draft.txt', 'draft');
    await history.undo(platform);
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'notes.txt', 'plan.txt']);
    const redone = await history.redo(platform);
    expect(redone?.ok === true && redone.placed).toEqual([folderUri('untitled folder')]);
    expect(read('untitled folder/draft.txt')).toBe('draft');
  });

  test('a copy gone since is said to be gone', async () => {
    history.record('copy', 'notes.txt', [{ kind: 'created', uri: uri('Pictures/notes.txt') }]);
    expect(await history.undo(platform)).toMatchObject({
      ok: false,
      problem: { kind: 'gone', name: 'notes.txt' },
    });
  });
});

describe('Undo and Redo of tags', () => {
  test('Undo gives each item its tags back, Redo the new ones', async () => {
    tags.set(uri('notes.txt'), ['Red']);
    tags.set(uri('plan.txt'), ['Red', 'Work']);
    history.record('tags', 'notes.txt', [
      {
        kind: 'tagged',
        target: { kind: 'file', uri: uri('notes.txt') },
        name: 'notes.txt',
        before: [],
        after: [{ name: 'Red', color: 'red' }],
      },
      {
        kind: 'tagged',
        target: { kind: 'file', uri: uri('plan.txt') },
        name: 'plan.txt',
        before: [{ name: 'Work', color: null }],
        after: [
          { name: 'Red', color: 'red' },
          { name: 'Work', color: null },
        ],
      },
    ]);
    expect(menuTitles().undo).toBe('Undo Change Tags 2 Items');
    await history.undo(platform);
    expect(tags.names(uri('notes.txt'))).toEqual([]);
    expect(tags.names(uri('plan.txt'))).toEqual(['Work']);
    await history.redo(platform);
    expect(tags.names(uri('notes.txt'))).toEqual(['Red']);
    expect(tags.names(uri('plan.txt'))).toEqual(['Work', 'Red']);
  });

  test('tags changed since stop it, every item’s tags left as they are', async () => {
    tags.set(uri('notes.txt'), ['Red']);
    tags.set(uri('plan.txt'), ['Blue']);
    history.record('tags', 'notes.txt', [
      {
        kind: 'tagged',
        target: { kind: 'file', uri: uri('notes.txt') },
        name: 'notes.txt',
        before: [],
        after: [{ name: 'Red', color: null }],
      },
      {
        kind: 'tagged',
        target: { kind: 'file', uri: uri('plan.txt') },
        name: 'plan.txt',
        before: [],
        after: [{ name: 'Red', color: null }],
      },
    ]);
    expect(await history.undo(platform)).toMatchObject({
      ok: false,
      problem: { kind: 'tags-changed', name: 'plan.txt' },
    });
    expect(tags.names(uri('notes.txt'))).toEqual(['Red']);
    expect(tags.names(uri('plan.txt'))).toEqual(['Blue']);
  });

  test('an Oxy Files asset’s tags are given back through Dropsea’s backend', async () => {
    cloud.tags.set('asset-1', ['Holiday', 'Green']);
    history.record('tags', 'beach.png', [
      {
        kind: 'tagged',
        target: { kind: 'asset', assetId: 'asset-1' },
        name: 'beach.png',
        before: [{ name: 'Holiday', color: null }],
        after: [
          { name: 'Holiday', color: null },
          { name: 'Green', color: null },
        ],
      },
    ]);
    await history.undo(platform);
    expect(cloud.tags.get('asset-1')).toEqual(['Holiday']);
  });
});

describe('a step undone whole or not at all', () => {
  test('a refusal partway takes back what was done, and the step stays', async () => {
    await moveToTrash(['notes.txt', 'plan.txt']);
    const [, second] = await trash.trashed().then((items) => items.map((item) => item.uri).sort());
    const refusing: UndoPlatform = {
      ...platform,
      trash: {
        ...trash,
        restore: async (uris) =>
          uris[0] === second
            ? [{ uri: uris[0] ?? '', ok: false, error: 'denied' }]
            : trash.restore(uris),
      },
    };
    const undone = await history.undo(refusing);
    expect(undone).toMatchObject({
      ok: false,
      problem: { kind: 'file', problem: 'denied', name: 'plan.txt' },
      isUnchanged: true,
    });
    expect(names('.')).toEqual(['Facturas', 'Pictures']);
    expect(trashNames()).toEqual(['notes.txt', 'plan.txt']);
    expect(menuTitles().undo).toBe('Undo Move to Trash 2 Items');
    expect(await history.undo(platform)).toMatchObject({ ok: true });
    expect(names('.')).toEqual(['Facturas', 'Pictures', 'notes.txt', 'plan.txt']);
  });
});

describe('a window’s history', () => {
  test('keeps its latest steps, the oldest forgotten past its limit', async () => {
    history = new undo.UndoHistory(2);
    await move(['notes.txt'], '.', 'Pictures');
    await move(['plan.txt'], '.', 'Pictures');
    await move(['Facturas'], '.', 'Pictures');
    await history.undo(platform);
    await history.undo(platform);
    expect(await history.undo(platform)).toBeNull();
    expect(names('Pictures')).toEqual(['474350.jpg', 'notes.txt']);
  });

  test('is its own: another window’s Undo takes back nothing of it', async () => {
    const other = new undo.UndoHistory();
    await move(['notes.txt'], '.', 'Pictures');
    expect(await other.undo(platform)).toBeNull();
    expect(names('Pictures')).toContain('notes.txt');
  });

  test('a step with no items is none', () => {
    history.record('move', '', []);
    expect(history.getState()).toEqual({ undo: null, redo: null });
  });
});
