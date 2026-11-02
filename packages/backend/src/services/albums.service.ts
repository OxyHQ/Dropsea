/**
 * Albums and their items. Every function takes the caller's Oxy user id and
 * answers `NotFoundError` for an album that does not exist and for one that is
 * someone else's alike, so an id reveals nothing about another person.
 */

import type { Album, AlbumItem, AlbumItemsPage } from '@dropsea/shared-types';
import { and, count, desc, eq, inArray, lt, max } from 'drizzle-orm';
import { getDb } from '../db/postgres';
import { albumItems, albums } from '../db/schema';
import { BadRequestError, NotFoundError } from '../errors';
import type { PhotoSource } from './photos.service';

type AlbumRow = typeof albums.$inferSelect;
type AlbumItemRow = typeof albumItems.$inferSelect;

/** Most items one request may add; a client with more sends several. */
export const MAX_ITEMS_PER_ADD = 100;
export const DEFAULT_PAGE_SIZE = 60;
export const MAX_PAGE_SIZE = 200;

function toAlbum(row: AlbumRow, itemCount: number, newestItemId: string | null): Album {
  return {
    id: row.id,
    name: row.name,
    coverItemId: row.coverItemId ?? newestItemId,
    itemCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAlbumItem(row: AlbumItemRow): AlbumItem {
  return {
    id: row.id,
    albumId: row.albumId,
    assetId: row.assetId,
    mime: row.mime,
    width: row.width,
    height: row.height,
    seeds: row.seeds,
    takenAt: row.takenAt ? row.takenAt.toISOString() : null,
    addedAt: row.addedAt.toISOString(),
  };
}

async function ownedAlbum(userId: string, albumId: string): Promise<AlbumRow> {
  const [row] = await getDb()
    .select()
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.ownerUserId, userId)));
  if (!row) throw new NotFoundError('Album not found.');
  return row;
}

/** Item count and newest item of each album, keyed by album id. */
async function albumStats(
  albumIds: string[],
): Promise<Map<string, { itemCount: number; newestItemId: string | null }>> {
  if (albumIds.length === 0) return new Map();
  // Ids are uuidv7, ordered by creation, so the greatest id is the newest item.
  const rows = await getDb()
    .select({ albumId: albumItems.albumId, itemCount: count(), newestItemId: max(albumItems.id) })
    .from(albumItems)
    .where(inArray(albumItems.albumId, albumIds))
    .groupBy(albumItems.albumId);
  return new Map(
    rows.map((row) => [row.albumId, { itemCount: row.itemCount, newestItemId: row.newestItemId }]),
  );
}

async function withStats(row: AlbumRow): Promise<Album> {
  const stats = (await albumStats([row.id])).get(row.id);
  return toAlbum(row, stats?.itemCount ?? 0, stats?.newestItemId ?? null);
}

/** The caller's albums, newest first. */
export async function listAlbums(userId: string): Promise<Album[]> {
  const rows = await getDb()
    .select()
    .from(albums)
    .where(eq(albums.ownerUserId, userId))
    .orderBy(desc(albums.createdAt), desc(albums.id));
  const stats = await albumStats(rows.map((row) => row.id));
  return rows.map((row) => {
    const entry = stats.get(row.id);
    return toAlbum(row, entry?.itemCount ?? 0, entry?.newestItemId ?? null);
  });
}

export async function getAlbum(userId: string, albumId: string): Promise<Album> {
  return withStats(await ownedAlbum(userId, albumId));
}

export async function createAlbum(userId: string, name: string): Promise<Album> {
  const [row] = await getDb().insert(albums).values({ ownerUserId: userId, name }).returning();
  if (!row) throw new Error('Inserting an album returned no row.');
  return toAlbum(row, 0, null);
}

/**
 * Rename an album or choose its cover. A cover must be one of the album's own
 * items; `null` goes back to the newest item.
 */
export async function updateAlbum(
  userId: string,
  albumId: string,
  changes: { name?: string; coverItemId?: string | null },
): Promise<Album> {
  await ownedAlbum(userId, albumId);
  if (changes.coverItemId) {
    const [item] = await getDb()
      .select({ id: albumItems.id })
      .from(albumItems)
      .where(and(eq(albumItems.id, changes.coverItemId), eq(albumItems.albumId, albumId)));
    if (!item) throw new BadRequestError('The cover must be an item of this album.');
  }
  const [row] = await getDb()
    .update(albums)
    .set({
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.coverItemId !== undefined ? { coverItemId: changes.coverItemId } : {}),
    })
    .where(eq(albums.id, albumId))
    .returning();
  if (!row) throw new NotFoundError('Album not found.');
  return withStats(row);
}

/**
 * Delete an album and its items. The photos stay in Oxy Files: the person's
 * client unlinks them from Dropsea, since the link is theirs.
 */
export async function deleteAlbum(userId: string, albumId: string): Promise<void> {
  await ownedAlbum(userId, albumId);
  await getDb().delete(albums).where(eq(albums.id, albumId));
}

/** One page of an album's items, newest first. */
export async function listItems(
  userId: string,
  albumId: string,
  page: { cursor?: string; limit?: number },
): Promise<AlbumItemsPage> {
  await ownedAlbum(userId, albumId);
  const limit = Math.min(Math.max(page.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  // One row past the page says whether another page follows.
  const rows = await getDb()
    .select()
    .from(albumItems)
    .where(
      and(
        eq(albumItems.albumId, albumId),
        page.cursor ? lt(albumItems.id, page.cursor) : undefined,
      ),
    )
    .orderBy(desc(albumItems.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(toAlbumItem),
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}

/**
 * Add photos the caller has uploaded and linked to Dropsea. Adding one already
 * in the album returns its existing item, so a retried request is harmless.
 * An id that is not the caller's own readable image comes back in
 * `rejectedAssetIds`, with no reason.
 */
export async function addItems(
  userId: string,
  albumId: string,
  assetIds: string[],
  photos: PhotoSource,
): Promise<{ items: AlbumItem[]; rejectedAssetIds: string[] }> {
  await ownedAlbum(userId, albumId);
  const requested = [...new Set(assetIds)];
  if (requested.length > MAX_ITEMS_PER_ADD) {
    throw new BadRequestError(`At most ${MAX_ITEMS_PER_ADD} photos can be added at once.`);
  }

  const present = await getDb()
    .select({ assetId: albumItems.assetId })
    .from(albumItems)
    .where(and(eq(albumItems.albumId, albumId), inArray(albumItems.assetId, requested)));
  const presentIds = new Set(present.map((row) => row.assetId));
  const toRead = requested.filter((assetId) => !presentIds.has(assetId));

  const facts = toRead.length > 0 ? await photos.read(userId, toRead) : [];
  if (facts.length > 0) {
    await getDb()
      .insert(albumItems)
      .values(
        facts.map((photo) => ({
          albumId,
          assetId: photo.assetId,
          mime: photo.mime,
          width: photo.width,
          height: photo.height,
          seeds: photo.seeds,
          takenAt: photo.takenAt,
        })),
      )
      // A concurrent add of the same photo already wrote it: keep that row.
      .onConflictDoNothing({ target: [albumItems.albumId, albumItems.assetId] });
    await getDb().update(albums).set({ updatedAt: new Date() }).where(eq(albums.id, albumId));
  }

  const readIds = new Set(facts.map((photo) => photo.assetId));
  const accepted = requested.filter((assetId) => presentIds.has(assetId) || readIds.has(assetId));
  const rows =
    accepted.length > 0
      ? await getDb()
          .select()
          .from(albumItems)
          .where(and(eq(albumItems.albumId, albumId), inArray(albumItems.assetId, accepted)))
          .orderBy(desc(albumItems.id))
      : [];
  return {
    items: rows.map(toAlbumItem),
    rejectedAssetIds: requested.filter((assetId) => !accepted.includes(assetId)),
  };
}

/** Take one item out of an album; if it was the cover, the newest item is again. */
export async function removeItem(userId: string, albumId: string, itemId: string): Promise<void> {
  await ownedAlbum(userId, albumId);
  await getDb().transaction(async (tx) => {
    const removed = await tx
      .delete(albumItems)
      .where(and(eq(albumItems.id, itemId), eq(albumItems.albumId, albumId)))
      .returning({ id: albumItems.id });
    if (removed.length === 0) throw new NotFoundError('Item not found.');
    await tx
      .update(albums)
      .set({ coverItemId: null })
      .where(and(eq(albums.id, albumId), eq(albums.coverItemId, itemId)));
  });
}
