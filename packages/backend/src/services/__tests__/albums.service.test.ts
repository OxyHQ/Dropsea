/**
 * Runs against a REAL Postgres: set DATABASE_URL (see `.env.example`) and run
 * `bun run db:migrate` first. `bun run db:up` starts one locally.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { closePostgres, connectPostgres, getDb } from '../../db/postgres';
import { albums } from '../../db/schema';
import { BadRequestError, NotFoundError } from '../../errors';
import {
  addItems,
  createAlbum,
  deleteAlbum,
  getAlbum,
  listAlbums,
  listItems,
  removeItem,
  updateAlbum,
} from '../albums.service';
import type { PhotoFacts, PhotoSource } from '../photos.service';

beforeAll(async () => {
  await connectPostgres();
});

afterAll(async () => {
  await closePostgres();
});

/** A user id no other test shares, so tests never see each other's rows. */
const newUser = (): string => `user-${crypto.randomUUID()}`;

function photo(assetId: string): PhotoFacts {
  return {
    assetId,
    mime: 'image/jpeg',
    width: 4032,
    height: 3024,
    seeds: ['#cc210c', '#bbe8fc', '#aeaf3d'],
    takenAt: new Date('2016-05-16T17:12:48Z'),
  };
}

/**
 * A fake Oxy Files: knows which asset ids each user owns and linked to Dropsea,
 * and records what it was asked to read.
 */
function fakePhotos(readable: Record<string, string[]>): PhotoSource & { reads: string[][] } {
  const reads: string[][] = [];
  return {
    reads,
    async read(userId, assetIds) {
      reads.push(assetIds);
      const own = new Set(readable[userId] ?? []);
      return assetIds.filter((assetId) => own.has(assetId)).map(photo);
    },
  };
}

async function cleanUp(userId: string): Promise<void> {
  // ON DELETE CASCADE takes the items with each album.
  await getDb().delete(albums).where(eq(albums.ownerUserId, userId));
}

describe('albums', () => {
  test('a new album is listed for its owner only, empty and with no cover', async () => {
    const owner = newUser();
    const stranger = newUser();
    try {
      const album = await createAlbum(owner, 'AI ART');
      expect(album).toMatchObject({ name: 'AI ART', itemCount: 0, coverItemId: null });
      expect((await listAlbums(owner)).map((entry) => entry.id)).toEqual([album.id]);
      expect(await listAlbums(stranger)).toEqual([]);
    } finally {
      await cleanUp(owner);
    }
  });

  test("someone else's album answers exactly like a missing one", async () => {
    const owner = newUser();
    const stranger = newUser();
    try {
      const album = await createAlbum(owner, 'Gallery');
      const missing = crypto.randomUUID();
      for (const albumId of [album.id, missing]) {
        await expect(getAlbum(stranger, albumId)).rejects.toBeInstanceOf(NotFoundError);
        await expect(updateAlbum(stranger, albumId, { name: 'Mine' })).rejects.toBeInstanceOf(
          NotFoundError,
        );
        await expect(deleteAlbum(stranger, albumId)).rejects.toBeInstanceOf(NotFoundError);
        await expect(listItems(stranger, albumId, {})).rejects.toBeInstanceOf(NotFoundError);
        await expect(addItems(stranger, albumId, ['a'], fakePhotos({}))).rejects.toBeInstanceOf(
          NotFoundError,
        );
      }
      expect((await getAlbum(owner, album.id)).name).toBe('Gallery');
    } finally {
      await cleanUp(owner);
    }
  });
});

describe('items', () => {
  test('adds the photos Oxy Files lets Dropsea read and rejects the rest without a reason', async () => {
    const owner = newUser();
    try {
      const album = await createAlbum(owner, 'Gallery');
      const photos = fakePhotos({ [owner]: ['mine-1', 'mine-2'] });
      const result = await addItems(owner, album.id, ['mine-1', 'theirs', 'mine-2'], photos);

      expect(result.items.map((item) => item.assetId).sort()).toEqual(['mine-1', 'mine-2']);
      expect(result.rejectedAssetIds).toEqual(['theirs']);
      expect(result.items[0]).toMatchObject({
        width: 4032,
        height: 3024,
        seeds: ['#cc210c', '#bbe8fc', '#aeaf3d'],
        takenAt: '2016-05-16T17:12:48.000Z',
      });
      expect((await getAlbum(owner, album.id)).itemCount).toBe(2);
    } finally {
      await cleanUp(owner);
    }
  });

  test('adding a photo already in the album returns its item and reads nothing again', async () => {
    const owner = newUser();
    try {
      const album = await createAlbum(owner, 'Gallery');
      const photos = fakePhotos({ [owner]: ['mine-1', 'mine-2'] });
      const first = await addItems(owner, album.id, ['mine-1'], photos);
      const again = await addItems(owner, album.id, ['mine-1', 'mine-2', 'mine-1'], photos);

      expect(photos.reads).toEqual([['mine-1'], ['mine-2']]);
      expect(again.items.map((item) => item.assetId).sort()).toEqual(['mine-1', 'mine-2']);
      expect(again.items.find((item) => item.assetId === 'mine-1')?.id).toBe(first.items[0]?.id);
      expect((await getAlbum(owner, album.id)).itemCount).toBe(2);
    } finally {
      await cleanUp(owner);
    }
  });

  test('pages walk every item once, newest first', async () => {
    const owner = newUser();
    try {
      const album = await createAlbum(owner, 'Gallery');
      const assetIds = Array.from({ length: 7 }, (_, index) => `photo-${index}`);
      const photos = fakePhotos({ [owner]: assetIds });
      // One at a time, so each gets a later id than the one before.
      for (const assetId of assetIds) {
        await addItems(owner, album.id, [assetId], photos);
        await Bun.sleep(2);
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await listItems(owner, album.id, { cursor, limit: 3 });
        seen.push(...page.items.map((item) => item.assetId));
        cursor = page.nextCursor ?? undefined;
        pages += 1;
      } while (cursor);

      expect(pages).toBe(3);
      expect(seen).toEqual([...assetIds].reverse());
    } finally {
      await cleanUp(owner);
    }
  });

  test('the cover is the newest item until one is chosen, and falls back when it is removed', async () => {
    const owner = newUser();
    try {
      const album = await createAlbum(owner, 'Gallery');
      const photos = fakePhotos({ [owner]: ['first', 'second'] });
      const [first] = (await addItems(owner, album.id, ['first'], photos)).items;
      await Bun.sleep(2);
      const [second] = (await addItems(owner, album.id, ['second'], photos)).items;
      if (!first || !second) throw new Error('both photos should have been added');

      expect((await getAlbum(owner, album.id)).coverItemId).toBe(second.id);
      expect((await updateAlbum(owner, album.id, { coverItemId: first.id })).coverItemId).toBe(
        first.id,
      );

      await removeItem(owner, album.id, first.id);
      expect((await getAlbum(owner, album.id)).coverItemId).toBe(second.id);
      await expect(removeItem(owner, album.id, first.id)).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await cleanUp(owner);
    }
  });

  test("the cover cannot be another album's item", async () => {
    const owner = newUser();
    try {
      const album = await createAlbum(owner, 'Gallery');
      const other = await createAlbum(owner, 'AI ART');
      const photos = fakePhotos({ [owner]: ['elsewhere'] });
      const [elsewhere] = (await addItems(owner, other.id, ['elsewhere'], photos)).items;
      if (!elsewhere) throw new Error('the photo should have been added');

      await expect(
        updateAlbum(owner, album.id, { coverItemId: elsewhere.id }),
      ).rejects.toBeInstanceOf(BadRequestError);
    } finally {
      await cleanUp(owner);
    }
  });
});
