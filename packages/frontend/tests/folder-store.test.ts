import { afterAll, describe, expect, mock, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Directory, File, pathsAt } from './node-file-system';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dropsea-folder-store-'));
mock.module('expo-file-system', () => ({ Directory, File, Paths: pathsAt(root) }));
// The store lists folders through lib/local-files, which asks `expo` whether the platform has
// files; Expo's own module would load React Native, which Bun cannot parse.
mock.module('expo', () => ({
  requireOptionalNativeModule: (name: string) => (name === 'FileSystem' ? {} : null),
}));

const store = await import('@/lib/folder-store');
const uri = (relative: string) => encodeURI(`file://${path.join(root, relative)}`);
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the folder store', () => {
  test('lists a folder, follows it while shown, and keeps its state while nothing changed', async () => {
    fs.mkdirSync(path.join(root, 'Shown'));
    fs.writeFileSync(path.join(root, 'Shown/a.txt'), 'a');
    let told = 0;
    const stop = store.subscribeFolder(uri('Shown'), () => told++);
    const first = store.getFolderState(uri('Shown'));
    expect(first.status === 'ready' && first.items.map((item) => item.name)).toEqual(['a.txt']);
    // Written with its slash, it is the same folder.
    expect(store.getFolderState(`${uri('Shown')}/`)).toBe(first);
    store.refreshFolder(uri('Shown'));
    expect(store.getFolderState(uri('Shown'))).toBe(first);
    fs.writeFileSync(path.join(root, 'Shown/b.txt'), 'b');
    await settle();
    expect(told).toBeGreaterThan(0);
    const next = store.getFolderState(uri('Shown'));
    expect(next.status === 'ready' && next.items.map((item) => item.name).sort()).toEqual([
      'a.txt',
      'b.txt',
    ]);
    stop();
  });

  test('lists a folder once as a view first shows it: its draw reads it, its subscription only watches', () => {
    fs.mkdirSync(path.join(root, 'Once'));
    fs.writeFileSync(path.join(root, 'Once/a.txt'), 'a');
    const list = spyOn(Directory.prototype, 'list');
    try {
      const first = store.getFolderState(uri('Once'));
      const stop = store.subscribeFolder(uri('Once'), () => {});
      expect(list).toHaveBeenCalledTimes(1);
      expect(store.getFolderState(uri('Once'))).toBe(first);
      stop();
    } finally {
      list.mockRestore();
    }
  });

  test('lists a folder again, once, when a view shows it after nothing followed it', () => {
    fs.mkdirSync(path.join(root, 'Again'));
    fs.writeFileSync(path.join(root, 'Again/a.txt'), 'a');
    store.subscribeFolder(uri('Again'), () => {})();
    fs.writeFileSync(path.join(root, 'Again/b.txt'), 'b');
    const list = spyOn(Directory.prototype, 'list');
    try {
      store.getFolderState(uri('Again'));
      const stop = store.subscribeFolder(uri('Again'), () => {});
      expect(list).toHaveBeenCalledTimes(1);
      const state = store.getFolderState(uri('Again'));
      expect(state.status === 'ready' && state.items.map((item) => item.name).sort()).toEqual([
        'a.txt',
        'b.txt',
      ]);
      stop();
    } finally {
      list.mockRestore();
    }
  });

  test('keeps the items a changed folder still holds as they were', () => {
    fs.mkdirSync(path.join(root, 'Kept'));
    fs.writeFileSync(path.join(root, 'Kept/a.txt'), 'a');
    const stop = store.subscribeFolder(uri('Kept'), () => {});
    const before = store.getFolderState(uri('Kept'));
    fs.writeFileSync(path.join(root, 'Kept/b.txt'), 'b');
    store.refreshFolder(uri('Kept'));
    const after = store.getFolderState(uri('Kept'));
    if (before.status !== 'ready' || after.status !== 'ready')
      throw new Error('Kept is not listed');
    expect(after.items).toHaveLength(2);
    expect(after.items.find((item) => item.name === 'a.txt')).toBe(before.items[0]);
    stop();
  });

  test('says a folder that went is missing', async () => {
    fs.mkdirSync(path.join(root, 'Gone'));
    const stop = store.subscribeFolder(uri('Gone'), () => {});
    fs.rmSync(path.join(root, 'Gone'), { recursive: true });
    store.refreshFolder(uri('Gone'));
    expect(store.getFolderState(uri('Gone'))).toEqual({ status: 'missing' });
    stop();
  });
});
