import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Directory, File, pathsAt } from './node-file-system';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dropsea-local-files-'));

mock.module('expo-file-system', () => ({ Directory, File, Paths: pathsAt(root) }));
mock.module('expo', () => ({
  requireOptionalNativeModule: (name: string) => (name === 'FileSystem' ? {} : null),
}));

const local = await import('@/lib/local-files');

function write(relative: string, content = 'x') {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function uri(relative: string): string {
  return encodeURI(`file://${path.join(root, relative)}`);
}

function names(relative: string): string[] {
  return local
    .listFolder(uri(relative))
    .map((item) => item.name)
    .sort();
}

beforeEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root);
  write('Documents/report.pdf', 'pdf!');
  write('Documents/Taxes 2026/receipt.png');
  write('notes.md', 'hello');
  write('.env');
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('files on this device', () => {
  test('are available where the platform implements expo-file-system', () => {
    expect(local.hasLocalFiles()).toBe(true);
    expect(local.deviceFolderUri()).toBe(`${encodeURI(`file://${root}`)}/`);
  });

  test('are listed with their kind of entry, size, date and whether hidden', () => {
    const items = local.listFolder(local.deviceFolderUri());
    const byName = new Map(items.map((item) => [item.name, item]));
    expect([...byName.keys()].sort()).toEqual(['.env', 'Documents', 'notes.md']);
    expect(byName.get('notes.md')).toMatchObject({
      source: 'local',
      isFolder: false,
      size: 5,
      isHidden: false,
    });
    expect(byName.get('Documents')).toMatchObject({ isFolder: true, size: null });
    expect(byName.get('.env')?.isHidden).toBe(true);
    expect(byName.get('notes.md')?.modifiedAt).toBeGreaterThan(0);
  });

  test("are listed with each folder's own date, never asking it for its info, which walks everything inside it", () => {
    for (let index = 0; index < 50; index++) write(`node_modules/package-${index}/index.js`);
    const info = spyOn(Directory.prototype, 'info');
    try {
      const items = local.listFolder(local.deviceFolderUri());
      expect(items.find((item) => item.name === 'node_modules')).toMatchObject({
        isFolder: true,
        size: null,
        modifiedAt: fs.statSync(path.join(root, 'node_modules')).mtimeMs,
      });
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });

  test('take a new folder only under a free, valid name', () => {
    const made = local.createFolder(uri(''), 'Projects');
    expect(made.ok).toBe(true);
    expect(names('')).toContain('Projects');
    expect(local.createFolder(uri(''), 'documents')).toEqual({
      ok: false,
      why: { kind: 'name', problem: 'taken' },
    });
    expect(local.createFolder(uri(''), 'a/b')).toEqual({
      ok: false,
      why: { kind: 'name', problem: 'slash' },
    });
  });

  test('are renamed, never over another item', () => {
    const [notes] = local.listFolder(uri('')).filter((item) => item.name === 'notes.md');
    if (!notes) throw new Error('notes.md is missing');
    expect(local.renameItem(notes, uri(''), 'Documents')).toEqual({
      ok: false,
      why: { kind: 'name', problem: 'taken' },
    });
    const renamed = local.renameItem(notes, uri(''), 'Notes.md');
    expect(renamed.ok && renamed.item.name).toBe('Notes.md');
    expect(names('')).toEqual(['.env', 'Documents', 'Notes.md']);
  });

  test('move into a folder each on its own, one whose name is taken there refused', async () => {
    write('Documents/notes.md', 'other');
    write('todo.txt');
    const items = local
      .listFolder(uri(''))
      .filter((item) => item.name === 'notes.md' || item.name === 'todo.txt');
    const outcomes = await local.moveItems(items, uri('Documents'));
    expect(outcomes.find((outcome) => outcome.key.endsWith('notes.md'))).toMatchObject({
      ok: false,
      problem: 'exists',
    });
    expect(outcomes.find((outcome) => outcome.key.endsWith('todo.txt'))).toMatchObject({
      ok: true,
    });
    expect(names('Documents')).toEqual(['Taxes 2026', 'notes.md', 'report.pdf', 'todo.txt']);
    expect(fs.readFileSync(path.join(root, 'Documents/notes.md'), 'utf8')).toBe('other');
  });

  test('are deleted for good, an item already gone said to be gone', () => {
    const items = local.listFolder(uri('Documents'));
    fs.rmSync(path.join(root, 'Documents/report.pdf'));
    const outcomes = local.deleteItems(items);
    expect(outcomes.find((outcome) => outcome.key.endsWith('report.pdf'))).toMatchObject({
      ok: false,
      problem: 'not-found',
    });
    expect(outcomes.find((outcome) => outcome.key.includes('Taxes'))).toMatchObject({ ok: true });
    expect(names('Documents')).toEqual([]);
  });

  test('download into a folder under the free name given, with their progress', async () => {
    const fractions: number[] = [];
    const item = await local.downloadInto(
      'https://cloud.example/a',
      uri('Documents'),
      'report 2.pdf',
      (fraction) => fractions.push(fraction),
    );
    expect(item.name).toBe('report 2.pdf');
    expect(fractions).toEqual([0.5, 1]);
    expect(fs.readFileSync(path.join(root, 'Documents/report.pdf'), 'utf8')).toBe('pdf!');
  });

  test('tell a watcher when what a folder holds changes', async () => {
    let changes = 0;
    const stop = local.watchFolder(uri(''), () => changes++);
    write('new.txt');
    await new Promise((resolve) => setTimeout(resolve, 100));
    stop();
    expect(changes).toBeGreaterThan(0);
  });

  test('read as text for a preview, cut at the limit', async () => {
    const [notes] = local.listFolder(uri('')).filter((item) => item.name === 'notes.md');
    if (!notes) throw new Error('notes.md is missing');
    expect(await local.readText(notes, 3)).toBe('hel');
  });
});
