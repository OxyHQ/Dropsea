import { describe, expect, test } from 'bun:test';
import { canMoveInto, dropAction, dropFolderFor, filesDrop } from '@/lib/drop';
import type { LocalPlace } from '@/lib/local-places';
import { cloud, folder, local } from './fixtures';

const HOME = 'file:///home/ada';
const PLACES: LocalPlace[] = [
  { kind: 'home', name: 'ada', uri: `${HOME}/` },
  { kind: 'desktop', name: 'Desktop', uri: `${HOME}/Desktop/` },
  { kind: 'documents', name: 'Documents', uri: `${HOME}/Documents/` },
  { kind: 'downloads', name: 'Downloads', uri: `${HOME}/Downloads/` },
  { kind: 'pictures', name: 'Pictures', uri: `${HOME}/Pictures/` },
  { kind: 'music', name: 'Music', uri: `${HOME}/Music/` },
  { kind: 'videos', name: 'Videos', uri: `${HOME}/Videos/` },
];

describe('dropping', () => {
  test('moves items only into a folder that is not one of them, inside one, or where they are', () => {
    const documents = folder('file:///home/ada/Documents');
    expect(canMoveInto([local('a.txt')], 'file:///home/ada/Documents')).toBe(true);
    expect(canMoveInto([documents], 'file:///home/ada/Documents')).toBe(false);
    expect(canMoveInto([documents], 'file:///home/ada/Documents/Taxes')).toBe(false);
    expect(
      canMoveInto(
        [local('a.txt', { uri: 'file:///home/ada/Documents/a.txt' })],
        'file:///home/ada/Documents/',
      ),
    ).toBe(false);
    expect(canMoveInto([], 'file:///home/ada/Documents')).toBe(false);
  });

  test('onto a folder moves local items, never cloud ones', () => {
    expect(
      dropAction([local('a.txt')], { kind: 'folder', uri: 'file:///home/ada/Documents' }),
    ).toBe('move');
    expect(
      dropAction([cloud('a.txt')], { kind: 'folder', uri: 'file:///home/ada/Documents' }),
    ).toBeNull();
  });

  test('onto Oxy Files uploads local files, but not folders', () => {
    expect(dropAction([local('a.txt'), local('b.png')], { kind: 'cloud' })).toBe('upload');
    expect(dropAction([folder('file:///home/ada/Documents')], { kind: 'cloud' })).toBeNull();
    expect(dropAction([cloud('a.txt')], { kind: 'cloud' })).toBeNull();
  });

  test('onto an album adds photos from either place, and nothing else', () => {
    const album = { kind: 'album', albumId: 'al1' } as const;
    expect(dropAction([local('a.jpg'), cloud('b.png', { mime: 'image/png' })], album)).toBe(
      'add-to-album',
    );
    expect(dropAction([local('a.jpg'), local('notes.md')], album)).toBeNull();
    expect(dropAction([], album)).toBeNull();
  });

  test('files dropped from another application go into the folder dropped on, else the folder shown', () => {
    const documents = folder('file:///home/ada/Documents');
    const home = { kind: 'folder' as const, uri: 'file:///home/ada' };
    expect(dropFolderFor(home, documents)).toBe('file:///home/ada/Documents');
    expect(dropFolderFor(home, local('a.txt'))).toBe('file:///home/ada');
    expect(dropFolderFor(home, null)).toBe('file:///home/ada');
    expect(dropFolderFor({ kind: 'trash' }, null)).toBeNull();
    expect(dropFolderFor({ kind: 'cloud' }, cloud('a.txt'))).toBeNull();
    expect(dropFolderFor({ kind: 'photos' }, documents)).toBe('file:///home/ada/Documents');
  });

  test('a drop on one of the dropped items, or inside one, moves nothing (5 November 2026)', () => {
    // The home selected whole (Select All) and its Pictures pressed, the press moved a few
    // points and released over Pictures itself: everything shown was dropped on Pictures, and
    // all but Pictures went into it. A drop on what is dragged drops nothing, as Finder's.
    const everything = [
      'Desktop/',
      'Documents/',
      'Downloads/',
      'Music/',
      'Pictures/',
      'Public/',
      'Templates/',
      'Videos/',
      'Oxy/',
      'servers/',
      'node_modules/',
      'package.json',
      'probar-oxyos.sh',
    ].map((name) => `${HOME}/${name}`);
    for (const action of ['move', 'copy'] as const) {
      expect(filesDrop(everything, `${HOME}/Pictures/`, action, PLACES)).toEqual({
        kind: 'into-itself',
      });
      expect(filesDrop(everything, `${HOME}/Oxy`, action, PLACES)).toEqual({
        kind: 'into-itself',
      });
      expect(filesDrop(everything, `${HOME}/Pictures/Screenshots`, action, PLACES)).toEqual({
        kind: 'into-itself',
      });
    }
    // Spelled with escapes, or without the folder's slash, it is the same folder.
    expect(filesDrop([`${HOME}/My%20Photos/`], `${HOME}/My Photos`, 'move', PLACES)).toEqual({
      kind: 'into-itself',
    });
  });

  test("a move holding one of the platform's places moves nothing, and names it; a copy goes", () => {
    const dropped = [`${HOME}/notes.txt`, `${HOME}/Documents`];
    expect(filesDrop(dropped, `${HOME}/Oxy/`, 'move', PLACES)).toEqual({
      kind: 'place',
      place: PLACES[2],
    });
    expect(filesDrop([`${HOME}`], 'file:///media/ada/USB/', 'move', PLACES)).toEqual({
      kind: 'place',
      place: PLACES[0],
    });
    expect(filesDrop(dropped, 'file:///media/ada/USB/', 'copy', PLACES)).toEqual({ kind: 'go' });
    expect(filesDrop([`${HOME}/notes.txt`], `${HOME}/Pictures/`, 'move', PLACES)).toEqual({
      kind: 'go',
    });
  });
});
