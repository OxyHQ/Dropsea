import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Directory, File, pathsAt, trashAt } from './node-file-system';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dropsea-undo-'));
const trashFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'dropsea-undo-trash-'));
const trash = trashAt(trashFolder);

mock.module('expo-file-system', () => ({ Directory, File, Paths: pathsAt(root) }));
mock.module('expo', () => ({
  requireOptionalNativeModule: (name: string) => (name === 'FileSystem' ? {} : null),
}));

const local = await import('@/lib/local-files');
const undo = await import('@/lib/undo');

function write(relative: string, content = 'x') {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function uri(relative: string): string {
  return encodeURI(`file://${path.join(root, relative)}`);
}

function names(relative: string): string[] {
  return fs.readdirSync(path.join(root, relative)).sort();
}

/** Moves the items of `from` named `which` into `into`, recorded as the person's move. */
async function move(which: readonly string[], from: string, into: string) {
  const items = local.listFolder(uri(from)).filter((item) => which.includes(item.name));
  const outcomes = await local.relocateItems(items, uri(into), 'move');
  undo.recordChange('move', local.relocationsDone(items, outcomes));
  return outcomes;
}

beforeEach(async () => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root);
  // The history the test before left, forgotten: with its items gone, nothing it holds moves.
  while ((await undo.undoChange(trash)) !== null) {}
  while ((await undo.redoChange()) !== null) {}
  write('Pictures/474350.jpg');
  write('Oxy/README.md');
  write('notes.txt', 'notes');
  write('plan.txt', 'plan');
});

describe('Undo and Redo of moves, as Finder', () => {
  test('Undo takes the latest move back, Redo makes it again, and each only once', async () => {
    await move(['Oxy', 'notes.txt', 'plan.txt'], '.', 'Pictures');
    expect(names('Pictures')).toEqual(['474350.jpg', 'Oxy', 'notes.txt', 'plan.txt']);

    const undone = await undo.undoChange(trash);
    expect(undone?.outcomes.every((outcome) => outcome.ok)).toBe(true);
    expect(names('.')).toEqual(['Oxy', 'Pictures', 'notes.txt', 'plan.txt']);
    expect(names('Pictures')).toEqual(['474350.jpg']);
    expect(fs.readFileSync(path.join(root, 'Oxy/README.md'), 'utf8')).toBe('x');
    expect(await undo.undoChange(trash)).toBeNull();

    await undo.redoChange();
    expect(names('Pictures')).toEqual(['474350.jpg', 'Oxy', 'notes.txt', 'plan.txt']);
    expect(await undo.redoChange()).toBeNull();

    await undo.undoChange(trash);
    expect(names('Pictures')).toEqual(['474350.jpg']);
  });

  test('several moves are undone the latest first', async () => {
    await move(['notes.txt'], '.', 'Oxy');
    await move(['plan.txt'], '.', 'Pictures');
    await undo.undoChange(trash);
    expect(names('.')).toEqual(['Oxy', 'Pictures', 'plan.txt']);
    expect(names('Oxy')).toEqual(['README.md', 'notes.txt']);
    await undo.undoChange(trash);
    expect(names('.')).toEqual(['Oxy', 'Pictures', 'notes.txt', 'plan.txt']);
  });

  test('a new move forgets what was undone', async () => {
    await move(['notes.txt'], '.', 'Oxy');
    await undo.undoChange(trash);
    await move(['plan.txt'], '.', 'Pictures');
    expect(await undo.redoChange()).toBeNull();
  });

  test('an item whose name is taken where it came from stays, and the rest go back', async () => {
    await move(['notes.txt', 'plan.txt'], '.', 'Pictures');
    write('notes.txt', 'a new one');
    const undone = await undo.undoChange(trash);
    expect(undone?.outcomes.find((outcome) => !outcome.ok)).toMatchObject({ problem: 'exists' });
    expect(fs.readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('a new one');
    expect(names('Pictures')).toEqual(['474350.jpg', 'notes.txt']);
    expect(names('.')).toContain('plan.txt');
    // Redo makes again only what was undone.
    await undo.redoChange();
    expect(names('Pictures')).toEqual(['474350.jpg', 'notes.txt', 'plan.txt']);
  });

  test('an item gone since is said to be gone', async () => {
    await move(['notes.txt'], '.', 'Pictures');
    fs.rmSync(path.join(root, 'Pictures/notes.txt'));
    const undone = await undo.undoChange(trash);
    expect(undone?.outcomes).toEqual([
      { key: uri('Pictures/notes.txt'), ok: false, problem: 'not-found' },
    ]);
    expect(await undo.redoChange()).toBeNull();
  });

  test('an item whose folder is gone stays where it is, said to be not found', async () => {
    await move(['README.md'], 'Oxy', '.');
    fs.rmSync(path.join(root, 'Oxy'), { recursive: true });
    const undone = await undo.undoChange(trash);
    expect(undone?.outcomes).toEqual([{ key: uri('README.md'), ok: false, problem: 'not-found' }]);
    expect(names('.')).toContain('README.md');
  });
});

describe('Undo and Redo of copies, as Finder', () => {
  /** Copies the items of `from` named `which` into `into`, recorded as the person's copy. */
  async function copy(which: readonly string[], from: string, into: string) {
    const items = local.listFolder(uri(from)).filter((item) => which.includes(item.name));
    const outcomes = await local.relocateItems(items, uri(into), 'copy');
    undo.recordChange('copy', local.relocationsDone(items, outcomes));
    return outcomes;
  }

  test('Undo puts the copies in the Trash, the originals kept; Redo copies again', async () => {
    await copy(['Oxy', 'notes.txt'], '.', 'Pictures');
    expect(names('Pictures')).toEqual(['474350.jpg', 'Oxy', 'notes.txt']);

    const undone = await undo.undoChange(trash);
    expect(undone?.trashed).toHaveLength(2);
    expect(names('Pictures')).toEqual(['474350.jpg']);
    expect(names('.')).toEqual(['Oxy', 'Pictures', 'notes.txt', 'plan.txt']);
    expect(fs.readdirSync(trashFolder).some((name) => name.endsWith(' notes.txt'))).toBe(true);

    await undo.redoChange();
    expect(names('Pictures')).toEqual(['474350.jpg', 'Oxy', 'notes.txt']);
    expect(fs.readFileSync(path.join(root, 'Pictures/Oxy/README.md'), 'utf8')).toBe('x');
    expect(names('.')).toEqual(['Oxy', 'Pictures', 'notes.txt', 'plan.txt']);

    await undo.undoChange(trash);
    expect(names('Pictures')).toEqual(['474350.jpg']);
  });

  test('a copy under another name (Keep Both) is undone and redone under that name', async () => {
    const [notes] = local.listFolder(uri('.')).filter((item) => item.name === 'notes.txt');
    if (!notes) throw new Error('notes.txt is missing');
    const outcome = await local.relocateItem(notes, uri('.'), 'notes 2.txt', 'copy');
    undo.recordChange('copy', local.relocationsDone([notes], [outcome]));
    expect(names('.')).toEqual(['Oxy', 'Pictures', 'notes 2.txt', 'notes.txt', 'plan.txt']);
    await undo.undoChange(trash);
    expect(names('.')).toEqual(['Oxy', 'Pictures', 'notes.txt', 'plan.txt']);
    await undo.redoChange();
    expect(names('.')).toEqual(['Oxy', 'Pictures', 'notes 2.txt', 'notes.txt', 'plan.txt']);
  });

  test('a move under another name goes back under its own', async () => {
    const [plan] = local.listFolder(uri('.')).filter((item) => item.name === 'plan.txt');
    if (!plan) throw new Error('plan.txt is missing');
    const outcome = await local.relocateItem(plan, uri('Pictures'), 'plan 2.txt', 'move');
    undo.recordChange('move', local.relocationsDone([plan], [outcome]));
    expect(names('Pictures')).toEqual(['474350.jpg', 'plan 2.txt']);
    await undo.undoChange(trash);
    expect(names('.')).toEqual(['Oxy', 'Pictures', 'notes.txt', 'plan.txt']);
    expect(names('Pictures')).toEqual(['474350.jpg']);
  });

  test('without a Trash, a copy is not undone, and says why', async () => {
    await copy(['notes.txt'], '.', 'Pictures');
    const undone = await undo.undoChange(null);
    expect(undone?.outcomes).toEqual([
      { key: uri('Pictures/notes.txt'), ok: false, problem: 'unavailable' },
    ]);
    expect(names('Pictures')).toEqual(['474350.jpg', 'notes.txt']);
  });
});
