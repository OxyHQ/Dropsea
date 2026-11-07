/**
 * The person's tags on their Oxy Files assets (Finder-style tags). Every
 * function takes the caller's Oxy user id and reads or writes that person's
 * rows only, so another person's tags are never seen, counted or changed.
 *
 * "Case aside" is Postgres's `lower()`, through the generated `name_key`
 * column (`db/schema.ts`): no comparison folds case in JavaScript, so there is
 * one definition of it.
 *
 * Every write is one transaction that first takes the owner's advisory lock
 * (`lockOwner`). There is no parent row to lock with `SELECT … FOR UPDATE`;
 * the lock is the serialization point instead, so two of one person's changes
 * never both read the same last `position`, and a rename never meets a tag
 * another request added a moment earlier.
 */

import type { FileTagName, FileTagsByAsset, TaggedAssetsPage } from '@dropsea/shared-types';
import { and, asc, count, desc, eq, exists, inArray, lt, max, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { type Database, getDb } from '../db/postgres';
import { fileTags } from '../db/schema';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Most assets one request may name; a client with more sends several. */
export const MAX_ASSETS_PER_REQUEST = 500;
/** Most names one change may add, and separately remove. */
export const MAX_NAMES_PER_CHANGE = 50;
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

/**
 * Rows per `insert`: one change can tag 500 assets with 50 names, and one
 * statement may bind at most 65,535 parameters (five per row here).
 */
const INSERT_BATCH_ROWS = 1000;

/** `lower()` of a bound name, the value `name_key` is compared with. */
function nameKeyOf(name: string) {
  return sql`lower(${name}::text)`;
}

/** Holds the owner's advisory lock until the transaction ends. */
async function lockOwner(tx: Transaction, userId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`dropsea.file_tags:${userId}`}::text, 0))`,
  );
}

/** Each asset's tags in its order; assets with none are left out. */
async function readTags(
  executor: Database | Transaction,
  userId: string,
  assetIds: readonly string[],
): Promise<FileTagsByAsset> {
  const tags: FileTagsByAsset = {};
  if (assetIds.length === 0) return tags;
  const rows = await executor
    .select({ assetId: fileTags.assetId, name: fileTags.name })
    .from(fileTags)
    .where(and(eq(fileTags.ownerUserId, userId), inArray(fileTags.assetId, [...assetIds])))
    .orderBy(asc(fileTags.assetId), asc(fileTags.position));
  for (const row of rows) {
    const names = tags[row.assetId];
    if (names) names.push(row.name);
    else tags[row.assetId] = [row.name];
  }
  return tags;
}

/** The tags of the caller's assets, each in its order; assets without tags are left out. */
export async function lookupTags(
  userId: string,
  assetIds: readonly string[],
): Promise<FileTagsByAsset> {
  return readTags(getDb(), userId, [...new Set(assetIds)]);
}

/** One page of the caller's assets tagged `name`, case aside, most recently tagged first. */
export async function listTaggedAssets(
  userId: string,
  name: string,
  page: { cursor?: string; limit?: number },
): Promise<TaggedAssetsPage> {
  const limit = Math.min(Math.max(page.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  // One row past the page says whether another page follows. Ids are uuidv7,
  // ordered by when the tag was put on, so the id alone is the cursor.
  const rows = await getDb()
    .select({ id: fileTags.id, assetId: fileTags.assetId })
    .from(fileTags)
    .where(
      and(
        eq(fileTags.ownerUserId, userId),
        eq(fileTags.nameKey, nameKeyOf(name)),
        page.cursor ? lt(fileTags.id, page.cursor) : undefined,
      ),
    )
    .orderBy(desc(fileTags.id))
    .limit(limit + 1);
  const assets = rows.slice(0, limit);
  const last = assets.at(-1);
  return {
    assetIds: assets.map((row) => row.assetId),
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}

/**
 * Every name on the caller's assets, case aside, with how many assets carry
 * it, by name. A name spelled two ways on two files is one entry, spelled as
 * it was first put on.
 */
export async function listTagNames(userId: string): Promise<FileTagName[]> {
  return getDb()
    .select({
      name: sql<string>`(array_agg(${fileTags.name} order by ${fileTags.id}))[1]`,
      count: count(),
    })
    .from(fileTags)
    .where(eq(fileTags.ownerUserId, userId))
    .groupBy(fileTags.nameKey)
    .orderBy(asc(fileTags.nameKey));
}

/**
 * Change tags on the caller's assets: each name of `remove` comes off, case
 * aside, then each name of `add` goes on after the asset's last tag, in order
 * and once (a name the asset already has, case aside, keeps its spelling and
 * place). Returns the assets' tags afterwards; assets left without any are left
 * out. A name in both lists comes off and goes back on, last.
 */
export async function changeTags(
  userId: string,
  assetIds: readonly string[],
  change: { add: readonly string[]; remove: readonly string[] },
): Promise<FileTagsByAsset> {
  const assets = [...new Set(assetIds)];
  if (assets.length === 0) return {};
  return getDb().transaction(async (tx) => {
    await lockOwner(tx, userId);

    if (change.remove.length > 0) {
      await tx
        .delete(fileTags)
        .where(
          and(
            eq(fileTags.ownerUserId, userId),
            inArray(fileTags.assetId, assets),
            inArray(fileTags.nameKey, sql`(${sql.join(change.remove.map(nameKeyOf), sql`, `)})`),
          ),
        );
    }

    if (change.add.length > 0) {
      const lastPositions = await tx
        .select({ assetId: fileTags.assetId, position: max(fileTags.position) })
        .from(fileTags)
        .where(and(eq(fileTags.ownerUserId, userId), inArray(fileTags.assetId, assets)))
        .groupBy(fileTags.assetId);
      const nextPosition = new Map(
        lastPositions.map((row) => [row.assetId, (row.position ?? -1) + 1]),
      );
      // A name the asset already has, or one repeated in `add` (case aside),
      // collides with the name key and is skipped, leaving an unused position:
      // order is all a position says, so a gap is harmless. That is the only
      // key a new row can collide with: positions are past the last one read
      // under the owner's lock, and ids are fresh. (drizzle cannot name a
      // generated column as the conflict target, hence no target.)
      const rows = assets.flatMap((assetId) => {
        const first = nextPosition.get(assetId) ?? 0;
        return change.add.map((name, index) => ({
          ownerUserId: userId,
          assetId,
          name,
          position: first + index,
        }));
      });
      for (let start = 0; start < rows.length; start += INSERT_BATCH_ROWS) {
        await tx
          .insert(fileTags)
          .values(rows.slice(start, start + INSERT_BATCH_ROWS))
          .onConflictDoNothing();
      }
    }

    return readTags(tx, userId, assets);
  });
}

/**
 * Rename a tag on every one of the caller's assets: `from` (case aside)
 * becomes `to`, in its place. An asset that already has `to` just loses
 * `from`. `to` may be `from` spelled another way, which respells it. Returns
 * how many assets had `from`.
 */
export async function renameTag(userId: string, from: string, to: string): Promise<number> {
  return getDb().transaction(async (tx) => {
    await lockOwner(tx, userId);
    const other = alias(fileTags, 'other');
    const merged = await tx
      .delete(fileTags)
      .where(
        and(
          eq(fileTags.ownerUserId, userId),
          eq(fileTags.nameKey, nameKeyOf(from)),
          exists(
            tx
              .select({ id: other.id })
              .from(other)
              .where(
                and(
                  eq(other.ownerUserId, fileTags.ownerUserId),
                  eq(other.assetId, fileTags.assetId),
                  eq(other.nameKey, nameKeyOf(to)),
                  // The row itself, when `to` is `from` respelled.
                  ne(other.id, fileTags.id),
                ),
              ),
          ),
        ),
      )
      .returning({ id: fileTags.id });
    const renamed = await tx
      .update(fileTags)
      .set({ name: to })
      .where(and(eq(fileTags.ownerUserId, userId), eq(fileTags.nameKey, nameKeyOf(from))))
      .returning({ id: fileTags.id });
    return merged.length + renamed.length;
  });
}

/** Take a tag (case aside) off every one of the caller's assets; how many had it. */
export async function removeTagName(userId: string, name: string): Promise<number> {
  return getDb().transaction(async (tx) => {
    await lockOwner(tx, userId);
    const removed = await tx
      .delete(fileTags)
      .where(and(eq(fileTags.ownerUserId, userId), eq(fileTags.nameKey, nameKeyOf(name))))
      .returning({ id: fileTags.id });
    return removed.length;
  });
}

/** Forget every tag of assets the caller deleted for good; how many tags went. */
export async function forgetAssets(userId: string, assetIds: readonly string[]): Promise<number> {
  const assets = [...new Set(assetIds)];
  if (assets.length === 0) return 0;
  return getDb().transaction(async (tx) => {
    await lockOwner(tx, userId);
    const removed = await tx
      .delete(fileTags)
      .where(and(eq(fileTags.ownerUserId, userId), inArray(fileTags.assetId, assets)))
      .returning({ id: fileTags.id });
    return removed.length;
  });
}
