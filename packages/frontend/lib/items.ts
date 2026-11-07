/**
 * What Dropsea shows: items from the person's own files on this device, from
 * Oxy Files and from their albums, in one shape the views, the selection and
 * the menus share; and the places a window can be (its locations).
 */
import type { AssetRecord } from '@oxy.so/core';
import type { PlatformTrashedItem } from '@oxy.so/bloom/platform-surface';
import type { Album, AlbumItem } from '@dropsea/shared-types';
import { kindOf } from '@/lib/kinds';
import { type ItemTag, isTagColor, tagKey } from '@/lib/tags';

/** What every item has, whatever its source. */
interface ItemFacts {
  /** Unique among every item Dropsea shows: a local item's URI, else its source's prefix and id. */
  key: string;
  name: string;
  isFolder: boolean;
  /** Bytes; null where the source does not say (a folder). */
  size: number | null;
  /** When its content last changed, in milliseconds since the epoch; null where unknown. */
  modifiedAt: number | null;
  /** Its name begins with a dot. */
  isHidden: boolean;
  mime: string | null;
}

/** A file or folder on this device, through `expo-file-system`. */
export interface LocalItem extends ItemFacts {
  source: 'local';
  /** Its `file://` URI. */
  uri: string;
}

/** A file in Oxy Files: an asset, which has no folder and no name of its own to change. */
export interface CloudItem extends ItemFacts {
  source: 'cloud';
  assetId: string;
  /** Oxy Files keeps a small rendition of it (`thumb`). */
  hasThumbnail: boolean;
}

/** A photo in one of the person's albums: an Oxy Files asset Dropsea points at. */
export interface AlbumPhoto extends ItemFacts {
  source: 'album-photo';
  albumId: string;
  itemId: string;
  assetId: string;
  width: number;
  height: number;
  seeds: readonly string[];
}

/** An album, shown among the albums as a folder is among files. */
export interface AlbumEntry extends ItemFacts {
  source: 'album';
  albumId: string;
  itemCount: number;
}

/** An item in the platform's Trash, from this device's files. */
export interface LocalTrashItem extends ItemFacts {
  source: 'local-trash';
  /** Its URI in the Trash: what putting it back and erasing it take. */
  uri: string;
  /** Where it was; null when the Trash no longer says. */
  originalUri: string | null;
  deletedAt: number | null;
  /** Its tags, as the Trash keeps them on it. */
  tags: readonly ItemTag[];
}

/** A file in Oxy Files' trash. */
export interface CloudTrashItem extends ItemFacts {
  source: 'cloud-trash';
  assetId: string;
  deletedAt: number | null;
}

export type Item =
  | LocalItem
  | CloudItem
  | AlbumPhoto
  | AlbumEntry
  | LocalTrashItem
  | CloudTrashItem;

export type TrashItem = LocalTrashItem | CloudTrashItem;

/** A place a window shows. */
export type Location =
  | {
      kind: 'folder';
      uri: string;
      /** An item in it to select as the window arrives there, by its URI: a reveal ("Show in Dropsea"). */
      select?: string;
    }
  | { kind: 'cloud' }
  | { kind: 'photos' }
  | { kind: 'albums' }
  | { kind: 'album'; albumId: string }
  | { kind: 'trash' }
  /** Every item with a tag, on this device and in Oxy Files, as Finder's sidebar tags show them. */
  | { kind: 'tag'; name: string };

/** A string that names a location, equal for equal locations. */
export function locationKey(location: Location): string {
  switch (location.kind) {
    case 'folder':
      return `folder:${location.uri}`;
    case 'album':
      return `album:${location.albumId}`;
    case 'tag':
      return `tag:${tagKey(location.name)}`;
    default:
      return location.kind;
  }
}

export function sameLocation(first: Location, second: Location): boolean {
  return locationKey(first) === locationKey(second);
}

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

/** A local item from what `expo-file-system` says of it. */
export function localItem(entry: {
  uri: string;
  name: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: number | null;
}): LocalItem {
  return {
    source: 'local',
    key: entry.uri,
    uri: entry.uri,
    name: entry.name,
    isFolder: entry.isDirectory,
    size: entry.isDirectory ? null : entry.size,
    modifiedAt: entry.modifiedAt,
    isHidden: entry.name.startsWith('.'),
    mime: null,
  };
}

/** The name Oxy Files gives an asset: the one it was uploaded with, else its id and extension. */
function assetName(asset: AssetRecord): string {
  const original = asset.originalName?.trim();
  if (original) return original;
  return asset.ext ? `${asset.id}.${asset.ext.replace(/^\./, '')}` : asset.id;
}

export function cloudItem(asset: AssetRecord): CloudItem {
  const name = assetName(asset);
  return {
    source: 'cloud',
    key: `oxy:${asset.id}`,
    assetId: asset.id,
    name,
    isFolder: false,
    size: asset.size,
    modifiedAt: timeOf(asset.updatedAt) ?? timeOf(asset.createdAt),
    isHidden: false,
    mime: asset.mime,
    hasThumbnail: asset.variants.some((variant) => variant.type === 'thumb'),
  };
}

export function cloudTrashItem(asset: AssetRecord): CloudTrashItem {
  return {
    source: 'cloud-trash',
    key: `oxy-trash:${asset.id}`,
    assetId: asset.id,
    name: assetName(asset),
    isFolder: false,
    size: asset.size,
    modifiedAt: timeOf(asset.updatedAt),
    isHidden: false,
    mime: asset.mime,
    deletedAt: timeOf(asset.trashedAt),
  };
}

export function localTrashItem(trashed: PlatformTrashedItem): LocalTrashItem {
  return {
    source: 'local-trash',
    key: trashed.uri,
    uri: trashed.uri,
    name: trashed.name,
    isFolder: trashed.isDirectory,
    size: trashed.size,
    modifiedAt: trashed.lastModified,
    isHidden: trashed.name.startsWith('.'),
    mime: null,
    originalUri: trashed.originalUri,
    deletedAt: trashed.deletedAt,
    tags: trashed.tags.map((tag) => ({
      name: tag.name,
      color: isTagColor(tag.color) ? tag.color : null,
    })),
  };
}

export function albumEntry(album: Album): AlbumEntry {
  return {
    source: 'album',
    key: `album:${album.id}`,
    albumId: album.id,
    name: album.name,
    isFolder: false,
    size: null,
    modifiedAt: timeOf(album.updatedAt),
    isHidden: false,
    mime: null,
    itemCount: album.itemCount,
  };
}

/**
 * A photo of an album. Dropsea keeps no name for it (the item points at an
 * asset), so it is named as Photos names one, by when it was taken: `nameFor`
 * writes that date in the person's language.
 */
export function albumPhoto(item: AlbumItem, nameFor: (time: number) => string): AlbumPhoto {
  const takenAt = timeOf(item.takenAt);
  const addedAt = timeOf(item.addedAt);
  const when = takenAt ?? addedAt ?? 0;
  return {
    source: 'album-photo',
    key: `album-item:${item.id}`,
    albumId: item.albumId,
    itemId: item.id,
    assetId: item.assetId,
    name: nameFor(when),
    isFolder: false,
    size: null,
    modifiedAt: when || null,
    isHidden: false,
    mime: item.mime,
    width: item.width,
    height: item.height,
    seeds: item.seeds,
  };
}

/** The item's kind, albums included. */
export function itemKind(item: Item) {
  return kindOf({ ...item, isAlbum: item.source === 'album' });
}

/** The date a list shows and sorts by: when it went to the Trash there, else when it last changed. */
export function itemDate(item: Item): number | null {
  if (item.source === 'local-trash' || item.source === 'cloud-trash') return item.deletedAt;
  return item.modifiedAt;
}

/** Whether a window can open it as a place: a folder or an album. */
export function isContainer(item: Item): boolean {
  return (item.source === 'local' && item.isFolder) || item.source === 'album';
}

/** A photo or a video, as Photos shows them. */
export function isVisualMedia(item: {
  name: string;
  isFolder: boolean;
  mime: string | null;
}): boolean {
  const kind = kindOf(item);
  return kind === 'image' || kind === 'video';
}

/** The Oxy Files asset behind an item, if it has one. */
export function assetIdOf(item: Item): string | null {
  switch (item.source) {
    case 'cloud':
    case 'cloud-trash':
    case 'album-photo':
      return item.assetId;
    default:
      return null;
  }
}
