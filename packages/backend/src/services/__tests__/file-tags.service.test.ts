/**
 * Runs against a REAL Postgres: set DATABASE_URL (see `.env.example`) and run
 * `bun run db:migrate` first. `bun run db:up` starts one locally.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { isCheckViolation } from '@oxy.so/db';
import { eq } from 'drizzle-orm';
import { closePostgres, connectPostgres, getDb } from '../../db/postgres';
import { fileTags } from '../../db/schema';
import {
  changeTags,
  forgetAssets,
  listTaggedAssets,
  listTagNames,
  lookupTags,
  removeTagName,
  renameTag,
} from '../file-tags.service';

beforeAll(async () => {
  await connectPostgres();
});

afterAll(async () => {
  await closePostgres();
});

/** A user id no other test shares, so tests never see each other's rows. */
const newUser = (): string => `user-${crypto.randomUUID()}`;

async function cleanUp(...userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await getDb().delete(fileTags).where(eq(fileTags.ownerUserId, userId));
  }
}

/** Every page of `name`, walked with `limit`. */
async function walkTagged(userId: string, name: string, limit: number): Promise<string[][]> {
  const pages: string[][] = [];
  let cursor: string | undefined;
  do {
    const page = await listTaggedAssets(userId, name, { cursor, limit });
    pages.push(page.assetIds);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return pages;
}

describe('changing tags', () => {
  test('adds append in order, once each case aside, keeping the first spelling', async () => {
    const owner = newUser();
    try {
      await changeTags(owner, ['a'], { add: ['Red', 'Work'], remove: [] });
      const tags = await changeTags(owner, ['a', 'b'], {
        add: ['work', 'Blue', 'BLUE', 'red'],
        remove: [],
      });
      expect(tags).toEqual({ a: ['Red', 'Work', 'Blue'], b: ['work', 'Blue', 'red'] });
      expect(await lookupTags(owner, ['b', 'a', 'none'])).toEqual(tags);
    } finally {
      await cleanUp(owner);
    }
  });

  test('removes case aside, keeps the others in place, and drops an asset left bare', async () => {
    const owner = newUser();
    try {
      await changeTags(owner, ['a', 'b'], { add: ['Red', 'Work', 'Blue'], remove: [] });
      await changeTags(owner, ['b'], { add: [], remove: ['red', 'work', 'blue'] });
      const tags = await changeTags(owner, ['a'], { add: ['Green'], remove: ['WORK'] });
      expect(tags).toEqual({ a: ['Red', 'Blue', 'Green'] });
      expect(await lookupTags(owner, ['a', 'b'])).toEqual({ a: ['Red', 'Blue', 'Green'] });
    } finally {
      await cleanUp(owner);
    }
  });

  test('a tag put back after removal goes last', async () => {
    const owner = newUser();
    try {
      await changeTags(owner, ['a'], { add: ['Red', 'Work', 'Blue'], remove: [] });
      await changeTags(owner, ['a'], { add: [], remove: ['Red'] });
      expect(await changeTags(owner, ['a'], { add: ['red'], remove: [] })).toEqual({
        a: ['Work', 'Blue', 'red'],
      });
    } finally {
      await cleanUp(owner);
    }
  });

  test('a name both removed and added comes off first and goes back on last', async () => {
    const owner = newUser();
    try {
      await changeTags(owner, ['a'], { add: ['Red', 'Work', 'Blue'], remove: [] });
      expect(await changeTags(owner, ['a', 'b'], { add: ['work'], remove: ['WORK'] })).toEqual({
        a: ['Red', 'Blue', 'work'],
        b: ['work'],
      });
    } finally {
      await cleanUp(owner);
    }
  });

  test('changes made at the same moment each land, one after another', async () => {
    const owner = newUser();
    try {
      // Twenty changes to one file on twenty connections at once. They can only
      // all succeed in order if each reads the last position after the one
      // before it committed: without the owner's lock, two read the same one
      // and the second insert breaks the position's uniqueness.
      const names = Array.from({ length: 20 }, (_, index) => `Tag ${index}`);
      await Promise.all(names.map((name) => changeTags(owner, ['a'], { add: [name], remove: [] })));
      const tags = (await lookupTags(owner, ['a'])).a ?? [];
      expect([...tags].sort()).toEqual([...names].sort());
    } finally {
      await cleanUp(owner);
    }
  });

  test('tags one change across more assets than one insert holds', async () => {
    const owner = newUser();
    try {
      const assetIds = Array.from({ length: 500 }, (_, index) => `asset-${index}`);
      // 15,000 rows of five parameters: past the 65,535 one statement may bind.
      const names = Array.from(
        { length: 30 },
        (_, index) => `Tag ${String(index).padStart(2, '0')}`,
      );
      const tags = await changeTags(owner, assetIds, { add: names, remove: [] });
      expect(Object.keys(tags)).toHaveLength(500);
      expect(tags['asset-499']).toEqual(names);
      expect(await listTagNames(owner)).toEqual(names.map((name) => ({ name, count: 500 })));
    } finally {
      await cleanUp(owner);
    }
  });

  test("another person's tags are never seen, changed or counted", async () => {
    const owner = newUser();
    const stranger = newUser();
    try {
      await changeTags(owner, ['shared-id'], { add: ['Red', 'Work'], remove: [] });

      expect(await lookupTags(stranger, ['shared-id'])).toEqual({});
      expect(await listTagNames(stranger)).toEqual([]);
      expect((await listTaggedAssets(stranger, 'Red', {})).assetIds).toEqual([]);

      expect(await changeTags(stranger, ['shared-id'], { add: ['Blue'], remove: ['Red'] })).toEqual(
        { 'shared-id': ['Blue'] },
      );
      expect(await renameTag(stranger, 'Work', 'Play')).toBe(0);
      expect(await removeTagName(stranger, 'Red')).toBe(0);
      expect(await forgetAssets(stranger, ['shared-id'])).toBe(1);

      expect(await lookupTags(owner, ['shared-id'])).toEqual({ 'shared-id': ['Red', 'Work'] });
      expect(await listTagNames(owner)).toEqual([
        { name: 'Red', count: 1 },
        { name: 'Work', count: 1 },
      ]);
    } finally {
      await cleanUp(owner, stranger);
    }
  });

  test('the table refuses a name the API would never write', async () => {
    const owner = newUser();
    try {
      for (const name of ['', ' Red', 'Red\t', 'a,b', 'a\nb', 'x'.repeat(256), 'é'.repeat(128)]) {
        const insert = getDb()
          .insert(fileTags)
          .values({ ownerUserId: owner, assetId: 'a', name, position: 0 });
        expect(
          await insert.then(
            () => null,
            (error: unknown) => error,
          ),
        ).toSatisfy((error) => isCheckViolation(error, 'file_tags_name_check'));
      }
      // The longest name allowed: 255 bytes.
      await getDb()
        .insert(fileTags)
        .values({ ownerUserId: owner, assetId: 'a', name: `${'é'.repeat(127)}x`, position: 0 });
    } finally {
      await cleanUp(owner);
    }
  });
});

describe('finding tagged assets', () => {
  test('pages walk every asset with the name once, case aside, most recently tagged first', async () => {
    const owner = newUser();
    try {
      const assetIds = Array.from({ length: 7 }, (_, index) => `photo-${index}`);
      // One at a time, so each tag gets a later id than the one before.
      for (const [index, assetId] of assetIds.entries()) {
        await changeTags(owner, [assetId], { add: [index % 2 ? 'trip' : 'Trip'], remove: [] });
        await Bun.sleep(2);
      }
      await changeTags(owner, ['elsewhere'], { add: ['Other'], remove: [] });

      const pages = await walkTagged(owner, 'TRIP', 3);
      expect(pages.map((page) => page.length)).toEqual([3, 3, 1]);
      expect(pages.flat()).toEqual([...assetIds].reverse());
    } finally {
      await cleanUp(owner);
    }
  });

  test('names count assets case aside, spelled as first put on, by name', async () => {
    const owner = newUser();
    try {
      // The first spelling sorts neither first nor last of the three.
      await changeTags(owner, ['a'], { add: ['wORK'], remove: [] });
      await Bun.sleep(2);
      await changeTags(owner, ['b', 'c'], { add: ['Work', 'Blue'], remove: [] });
      await changeTags(owner, ['d'], { add: ['work'], remove: [] });
      expect(await listTagNames(owner)).toEqual([
        { name: 'Blue', count: 2 },
        { name: 'wORK', count: 4 },
      ]);
    } finally {
      await cleanUp(owner);
    }
  });
});

describe('renaming and removing a name everywhere', () => {
  test('a rename keeps each tag in its place and merges into a file that already has the new name', async () => {
    const owner = newUser();
    try {
      await changeTags(owner, ['a'], { add: ['Red', 'Work', 'Blue'], remove: [] });
      await changeTags(owner, ['b'], { add: ['Projects', 'work'], remove: [] });
      await changeTags(owner, ['c'], { add: ['Green'], remove: [] });

      expect(await renameTag(owner, 'WORK', 'Projects')).toBe(2);
      expect(await lookupTags(owner, ['a', 'b', 'c'])).toEqual({
        a: ['Red', 'Projects', 'Blue'],
        b: ['Projects'],
        c: ['Green'],
      });
      expect((await walkTagged(owner, 'work', 10)).flat()).toEqual([]);
    } finally {
      await cleanUp(owner);
    }
  });

  test('a rename to the same name spelled another way respells it everywhere', async () => {
    const owner = newUser();
    try {
      await changeTags(owner, ['a', 'b'], { add: ['Red', 'work'], remove: [] });
      expect(await renameTag(owner, 'Work', 'WORK')).toBe(2);
      expect(await lookupTags(owner, ['a', 'b'])).toEqual({
        a: ['Red', 'WORK'],
        b: ['Red', 'WORK'],
      });
    } finally {
      await cleanUp(owner);
    }
  });

  test('a name comes off every file, and a forgotten asset loses every tag', async () => {
    const owner = newUser();
    try {
      await changeTags(owner, ['a', 'b', 'c'], { add: ['Red', 'Work'], remove: [] });
      expect(await removeTagName(owner, 'red')).toBe(3);
      expect(await forgetAssets(owner, ['a', 'b', 'gone'])).toBe(2);
      expect(await lookupTags(owner, ['a', 'b', 'c'])).toEqual({ c: ['Work'] });
      expect(await listTagNames(owner)).toEqual([{ name: 'Work', count: 1 }]);
    } finally {
      await cleanUp(owner);
    }
  });
});
