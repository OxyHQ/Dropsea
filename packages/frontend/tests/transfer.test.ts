import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Directory, File, pathsAt, trashAt } from './node-file-system';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dropsea-transfer-'));
const trashFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'dropsea-transfer-trash-'));

mock.module('expo-file-system', () => ({ Directory, File, Paths: pathsAt(root) }));
mock.module('expo', () => ({
  requireOptionalNativeModule: (name: string) => (name === 'FileSystem' ? {} : null),
}));

const local = await import('@/lib/local-files');
const transfer = await import('@/lib/transfer');
const operations = await import('@/lib/operations');

type ClashAnswer = import('@/lib/transfer').ClashAnswer;
type ClashQuestion = import('@/lib/transfer').ClashQuestion;

function write(relative: string, content = 'x') {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function uri(relative: string): string {
  return encodeURI(`file://${path.join(root, relative)}`);
}

function names(relative: string): string[] {
  return fs.readdirSync(path.join(root, relative)).sort();
}

/** The items of a folder named `which`, in that order, as a drop gives them. */
function itemsOf(folder: string, which: readonly string[]) {
  const items = local.listFolder(uri(folder));
  return which.flatMap((name) => items.filter((item) => item.name === name));
}

/** Answers each clash in turn from `answers`, keeping the questions asked. */
function answering(answers: readonly ClashAnswer[]) {
  const asked: ClashQuestion[] = [];
  const ask = async (question: ClashQuestion) => {
    asked.push(question);
    const answer = answers[asked.length - 1];
    if (!answer) throw new Error(`No answer for “${question.clash.item.name}”`);
    return answer;
  };
  return { asked, ask };
}

/** Plans and runs a transfer of `which` from `from` into `into`, as a drop would. */
async function relocate(
  which: readonly string[],
  from: string,
  into: string,
  relocation: 'copy' | 'move',
  answers: readonly ClashAnswer[] = [],
) {
  const { asked, ask } = answering(answers);
  const steps = await transfer.planTransfer(
    itemsOf(from, which),
    local.listFolder(uri(into)),
    relocation,
    true,
    ask,
  );
  const result = steps
    ? await transfer.runTransfer({
        steps,
        folderUri: uri(into),
        relocation,
        trash: trashAt(trashFolder),
        isStopped: () => false,
        onProgress: () => undefined,
      })
    : null;
  return { asked, steps, result };
}

beforeEach(() => {
  for (const folder of [root, trashFolder]) {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.mkdirSync(folder);
  }
  write('notes.txt', 'new notes');
  write('plan.txt', 'new plan');
  write('Pictures/photo.jpg', 'new photo');
  write('Documents/notes.txt', 'old notes');
  write('Documents/plan.txt', 'old plan');
  write('Documents/Pictures/old.jpg', 'old photo');
  write('Documents/report.txt', 'report');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(trashFolder, { recursive: true, force: true });
});

describe('a name taken, as Finder asks', () => {
  test('each clash is asked about before anything moves, with how many come after it', async () => {
    const { asked } = await relocate(['notes.txt', 'plan.txt'], '.', 'Documents', 'move', [
      { choice: 'keep-both', isForAll: false },
      { choice: 'keep-both', isForAll: false },
    ]);
    expect(
      asked.map((question) => [question.clash.item.name, question.remaining, question.relocation]),
    ).toEqual([
      ['notes.txt', 1, 'move'],
      ['plan.txt', 0, 'move'],
    ]);
    expect(asked.every((question) => question.clash.canReplace)).toBe(true);
  });

  test('Keep Both takes the first number free, before the extension; a folder after its name', async () => {
    write('Documents/notes 2.txt', 'older notes');
    const { result } = await relocate(['notes.txt', 'Pictures'], '.', 'Documents', 'copy', [
      { choice: 'keep-both', isForAll: true },
    ]);
    expect(result?.outcomes.every((outcome) => outcome.ok)).toBe(true);
    expect(names('Documents')).toEqual([
      'Pictures',
      'Pictures 2',
      'notes 2.txt',
      'notes 3.txt',
      'notes.txt',
      'plan.txt',
      'report.txt',
    ]);
    expect(read('Documents/notes 3.txt')).toBe('new notes');
    expect(read('Documents/notes.txt')).toBe('old notes');
    expect(read('Documents/Pictures 2/photo.jpg')).toBe('new photo');
    // A copy keeps the originals.
    expect(names('.')).toEqual(['Documents', 'Pictures', 'notes.txt', 'plan.txt']);
  });

  test('Replace puts the item there in the Trash first, then the item takes its place', async () => {
    const { result } = await relocate(['notes.txt'], '.', 'Documents', 'move', [
      { choice: 'replace', isForAll: false },
    ]);
    expect(read('Documents/notes.txt')).toBe('new notes');
    expect(names('.')).toEqual(['Documents', 'Pictures', 'plan.txt']);
    expect(result?.replaced).toEqual([uri('Documents/notes.txt')]);
    const [trashed] = fs.readdirSync(trashFolder);
    expect(trashed?.endsWith('notes.txt')).toBe(true);
    expect(fs.readFileSync(path.join(trashFolder, trashed ?? ''), 'utf8')).toBe('old notes');
  });

  test('Replace for a folder replaces the whole folder', async () => {
    await relocate(['Pictures'], '.', 'Documents', 'move', [
      { choice: 'replace', isForAll: false },
    ]);
    expect(names('Documents/Pictures')).toEqual(['photo.jpg']);
    expect(fs.readdirSync(trashFolder)).toHaveLength(1);
  });

  test('Stop does nothing at all, even after earlier answers', async () => {
    const { steps, result } = await relocate(['notes.txt', 'plan.txt'], '.', 'Documents', 'move', [
      { choice: 'replace', isForAll: false },
      { choice: 'stop', isForAll: false },
    ]);
    expect(steps).toBeNull();
    expect(result).toBeNull();
    expect(read('Documents/notes.txt')).toBe('old notes');
    expect(names('.')).toEqual(['Documents', 'Pictures', 'notes.txt', 'plan.txt']);
    expect(fs.readdirSync(trashFolder)).toEqual([]);
  });

  test('Apply to All answers every clash after it', async () => {
    const { asked } = await relocate(
      ['notes.txt', 'plan.txt', 'Pictures'],
      '.',
      'Documents',
      'move',
      [{ choice: 'replace', isForAll: true }],
    );
    expect(asked).toHaveLength(1);
    expect(read('Documents/notes.txt')).toBe('new notes');
    expect(read('Documents/plan.txt')).toBe('new plan');
    expect(names('Documents/Pictures')).toEqual(['photo.jpg']);
    expect(fs.readdirSync(trashFolder)).toHaveLength(3);
  });

  test('an item is never offered to replace itself, nor a folder that holds it', async () => {
    // A copy into its own folder: the item itself is there.
    const own = await relocate(['notes.txt'], '.', '.', 'copy', [
      { choice: 'keep-both', isForAll: false },
    ]);
    expect(own.asked[0]?.clash.canReplace).toBe(false);
    expect(read('notes 2.txt')).toBe('new notes');
    // A Pictures inside Documents/Pictures dragged onto Documents would replace the folder that
    // holds it.
    write('Documents/Pictures/Pictures/deep.jpg', 'deep');
    const holding = await relocate(['Pictures'], 'Documents/Pictures', 'Documents', 'move', [
      { choice: 'keep-both', isForAll: false },
    ]);
    expect(holding.asked[0]?.clash.canReplace).toBe(false);
    expect(names('Documents')).toContain('Pictures 2');
    expect(names('Documents/Pictures 2')).toEqual(['deep.jpg']);
  });

  test('Apply to All with Replace still asks about a clash Replace is not offered for', async () => {
    write('Documents/Pictures/Pictures/deep.jpg', 'deep');
    write('Documents/Pictures/report.txt', 'other report');
    const { asked } = await relocate(
      ['report.txt', 'Pictures'],
      'Documents/Pictures',
      'Documents',
      'move',
      [
        { choice: 'replace', isForAll: true },
        { choice: 'keep-both', isForAll: false },
      ],
    );
    expect(asked.map((question) => question.clash.item.name)).toEqual(['report.txt', 'Pictures']);
    expect(read('Documents/report.txt')).toBe('other report');
    expect(names('Documents')).toContain('Pictures 2');
  });

  test('without a Trash, Replace is not offered', async () => {
    const { asked, ask } = answering([{ choice: 'stop', isForAll: false }]);
    await transfer.planTransfer(
      itemsOf('.', ['notes.txt']),
      local.listFolder(uri('Documents')),
      'move',
      false,
      ask,
    );
    expect(asked[0]?.clash.canReplace).toBe(false);
  });
});

describe('progress that can be stopped', () => {
  test('is told after each item, by the bytes, a folder counting as the files’ average', () => {
    const items = itemsOf('.', ['notes.txt', 'plan.txt', 'Pictures']);
    expect(transfer.transferWeights(items)).toEqual(
      items.map((item) => (item.isFolder ? 8.5 : (item.size ?? 0))),
    );
  });

  test('goes item by item, by their bytes, and a stop ends it before the next item', async () => {
    write('big.bin', 'b'.repeat(90));
    write('small.bin', 'b'.repeat(10));
    write('last.bin', 'b'.repeat(100));
    const items = itemsOf('.', ['small.bin', 'big.bin', 'last.bin']);
    const steps = await transfer.planTransfer(items, [], 'copy', true, async () => {
      throw new Error('Nothing clashes');
    });
    if (!steps) throw new Error('No steps');
    const told: { done: number; total: number; fraction: number }[] = [];
    const result = await transfer.runTransfer({
      steps,
      folderUri: uri('Documents'),
      relocation: 'copy',
      trash: null,
      isStopped: () => told.length === 2,
      onProgress: (progress) => told.push(progress),
    });
    expect(told).toEqual([
      { done: 1, total: 3, fraction: 0.05 },
      { done: 2, total: 3, fraction: 0.5 },
    ]);
    expect(result.isStopped).toBe(true);
    // What was done stays, and is what Undo takes back.
    expect(names('Documents').filter((name) => name.endsWith('.bin'))).toEqual([
      'big.bin',
      'small.bin',
    ]);
    expect(result.relocated.map((done) => path.basename(decodeURI(done.to)))).toEqual([
      'small.bin',
      'big.bin',
    ]);
  });
});

describe('the window’s moves and copies', () => {
  test('ask through the window’s alert, and go one after another', async () => {
    const seen: string[] = [];
    const first = operations.transferFiles({
      items: itemsOf('.', ['notes.txt']),
      folderUri: uri('Documents'),
      folderName: 'Documents',
      relocation: 'copy',
      trash: trashAt(trashFolder),
    });
    const second = operations.transferFiles({
      items: itemsOf('.', ['plan.txt']),
      folderUri: uri('Pictures'),
      folderName: 'Pictures',
      relocation: 'move',
      trash: trashAt(trashFolder),
    });
    second.then(() => seen.push('second'));
    // The first waits on its clash; the second has not started.
    await Bun.sleep(10);
    expect(names('Documents')).not.toContain('notes 2.txt');
    expect(names('Pictures')).toEqual(['photo.jpg']);
    operations.answerClash({ choice: 'keep-both', isForAll: false });
    await first;
    seen.push('first');
    await second;
    expect(seen).toEqual(['first', 'second']);
    expect(names('Documents')).toContain('notes 2.txt');
    expect(names('Pictures')).toEqual(['photo.jpg', 'plan.txt']);
  });
});
