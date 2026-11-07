import { describe, expect, test } from 'bun:test';
import type { AssetRecord } from '@oxy.so/core';
import {
  albumEntry,
  albumPhoto,
  assetIdOf,
  cloudItem,
  cloudTrashItem,
  isContainer,
  isVisualMedia,
  itemDate,
  itemKind,
  localItem,
  localTrashItem,
  locationKey,
  sameLocation,
} from '@/lib/items';
import { kindOf, mimeForName } from '@/lib/kinds';
import { local } from './fixtures';

function asset(facts: Partial<AssetRecord>): AssetRecord {
  return {
    id: 'a1',
    sha256: 'hash',
    size: 2048,
    mime: 'image/jpeg',
    ext: 'jpg',
    status: 'active',
    usageCount: 0,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-02T10:00:00.000Z',
    links: [],
    variants: [],
    ...facts,
  };
}

describe('kinds', () => {
  test('come from folders first, then the MIME type, then the extension', () => {
    expect(kindOf({ name: 'Docs', isFolder: true, mime: null })).toBe('folder');
    expect(kindOf({ name: 'a.JPG', isFolder: false, mime: null })).toBe('image');
    expect(kindOf({ name: 'noext', isFolder: false, mime: 'video/mp4' })).toBe('video');
    expect(kindOf({ name: 'main.rs', isFolder: false, mime: null })).toBe('code');
    expect(kindOf({ name: 'notes.md', isFolder: false, mime: 'text/x-markdown' })).toBe('text');
    expect(kindOf({ name: '.bashrc', isFolder: false, mime: null })).toBe('file');
    expect(kindOf({ name: 'archive.tar.gz', isFolder: false, mime: null })).toBe('archive');
    expect(kindOf({ name: 'x', isFolder: false, mime: 'application/pdf' })).toBe('pdf');
    // The type Oxy Files read from the bytes wins over a name that says otherwise.
    expect(kindOf({ name: 'photo.txt', isFolder: false, mime: 'image/png' })).toBe('image');
  });

  test('give an upload its MIME type from its name', () => {
    expect(mimeForName('IMG_0001.JPG')).toBe('image/jpeg');
    expect(mimeForName('clip.mov')).toBe('video/quicktime');
    expect(mimeForName('unknown.blob')).toBe('application/octet-stream');
  });
});

describe('items', () => {
  test('from this device keep their URI as their key, and dot files are hidden', () => {
    const item = localItem({
      uri: 'file:///home/ada/.env',
      name: '.env',
      isDirectory: false,
      size: 3,
      modifiedAt: 5,
    });
    expect(item.key).toBe('file:///home/ada/.env');
    expect(item.isHidden).toBe(true);
    const directory = localItem({
      uri: 'file:///home/ada/Docs',
      name: 'Docs',
      isDirectory: true,
      size: 4096,
      modifiedAt: 5,
    });
    expect(directory.size).toBeNull();
    expect(isContainer(directory)).toBe(true);
  });

  test('from Oxy Files are named as uploaded, else by id and extension, with their thumbnail', () => {
    const named = cloudItem(
      asset({ originalName: 'Beach.jpg', variants: [{ type: 'thumb', key: 'k' }] }),
    );
    expect(named).toMatchObject({
      key: 'oxy:a1',
      name: 'Beach.jpg',
      size: 2048,
      hasThumbnail: true,
    });
    expect(named.modifiedAt).toBe(Date.parse('2026-03-02T10:00:00.000Z'));
    expect(cloudItem(asset({ originalName: '  ' })).name).toBe('a1.jpg');
    expect(cloudItem(asset({})).hasThumbnail).toBe(false);
    expect(isContainer(named)).toBe(false);
    expect(assetIdOf(named)).toBe('a1');
  });

  test('in the Trash carry when they went there, and are dated by it', () => {
    const fromCloud = cloudTrashItem(asset({ trashedAt: '2026-04-01T00:00:00.000Z' }));
    expect(itemDate(fromCloud)).toBe(Date.parse('2026-04-01T00:00:00.000Z'));
    const fromDevice = localTrashItem({
      uri: 'file:///home/ada/.local/share/Trash/files/a.txt',
      name: 'a.txt',
      isDirectory: false,
      originalUri: 'file:///home/ada/a.txt',
      deletedAt: 7,
      size: 1,
      lastModified: 2,
      tags: [
        { name: 'Red', color: 'red' },
        { name: 'From a Mac', color: null },
      ],
    });
    expect(fromDevice).toMatchObject({
      key: fromDevice.uri,
      originalUri: 'file:///home/ada/a.txt',
      // The Trash keeps an item's tags.
      tags: [
        { name: 'Red', color: 'red' },
        { name: 'From a Mac', color: null },
      ],
    });
    expect(itemDate(fromDevice)).toBe(7);
    expect(assetIdOf(fromDevice)).toBeNull();
  });

  test('of albums are containers named by their names, photos by when they were taken', () => {
    const album = albumEntry({
      id: 'al1',
      name: 'Summer',
      coverItemId: null,
      itemCount: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(album).toMatchObject({ key: 'album:al1', name: 'Summer', itemCount: 3 });
    expect(itemKind(album)).toBe('album');
    expect(isContainer(album)).toBe(true);
    const item = {
      id: 'it1',
      albumId: 'al1',
      assetId: 'a1',
      mime: 'image/jpeg',
      width: 4000,
      height: 3000,
      seeds: ['#336699'],
      addedAt: '2026-01-05T00:00:00.000Z',
    };
    const taken = albumPhoto(
      { ...item, takenAt: '2025-07-01T12:00:00.000Z' },
      (time) => `day ${time}`,
    );
    expect(taken.name).toBe(`day ${Date.parse('2025-07-01T12:00:00.000Z')}`);
    const untaken = albumPhoto({ ...item, takenAt: null }, (time) => `day ${time}`);
    expect(untaken.modifiedAt).toBe(Date.parse('2026-01-05T00:00:00.000Z'));
    expect(itemKind(taken)).toBe('image');
  });

  test('that are photos and videos are what Photos shows', () => {
    expect(isVisualMedia(local('a.heic'))).toBe(true);
    expect(isVisualMedia(local('clip.mp4'))).toBe(true);
    expect(isVisualMedia(local('notes.md'))).toBe(false);
  });
});

describe('locations', () => {
  test('are equal when they name the same place', () => {
    expect(sameLocation({ kind: 'trash' }, { kind: 'trash' })).toBe(true);
    expect(sameLocation({ kind: 'album', albumId: 'a' }, { kind: 'album', albumId: 'b' })).toBe(
      false,
    );
    expect(locationKey({ kind: 'folder', uri: 'file:///x' })).toBe('folder:file:///x');
  });
});
