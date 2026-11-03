/**
 * Dropsea — Postgres schema.
 *
 * Dropsea stores no bytes: an item points at an Oxy Files asset by id. What it
 * keeps beside the id is what a page of photos needs without a call per photo
 * (size, mime, seed colours, capture time), copied when the item is added.
 *
 * `generatedId()`/`createdAt()`/`updatedAt()` from `@oxy.so/db`, snake_case
 * columns through `DATABASE_CASING`, and a real foreign key with an explicit
 * `ON DELETE` for every relation, as in Willo and Mention.
 */

import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { createdAt, generatedId, timestamptz, updatedAt } from '@oxy.so/db';

/**
 * `albums` — a person's named collection. `owner_user_id` is the Oxy user id;
 * Dropsea has no users table of its own.
 *
 * `cover_item_id` names one of the album's own items. It carries no foreign
 * key (the two tables would reference each other); `albums.service.ts` checks
 * it belongs to the album when it is set and clears it in the same
 * transaction that removes that item. A null cover means "the newest item",
 * which the API resolves, so a fresh album needs no write to have one.
 */
export const albums = pgTable(
  'albums',
  {
    id: generatedId(),
    ownerUserId: text().notNull(),
    name: text().notNull(),
    coverItemId: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('albums_owner_user_id_idx').on(t.ownerUserId, t.createdAt),
    check('albums_name_length_check', sql`char_length(${t.name}) between 1 and 200`),
  ],
);

/**
 * `album_items` — one asset in one album. The same asset in two albums is two
 * rows; the same asset twice in one album is refused (`unique` below), so
 * adding a batch again is idempotent.
 *
 * `seeds` are `#rrggbb` strings, best first (`@oxy.so/bloom/color-engine`).
 * `taken_at` is the photo's EXIF `DateTimeOriginal` when it has one: Oxy Files
 * does not keep a capture time.
 */
export const albumItems = pgTable(
  'album_items',
  {
    id: generatedId(),
    albumId: text()
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    assetId: text().notNull(),
    mime: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    seeds: text().array().notNull().default(sql`'{}'::text[]`),
    takenAt: timestamptz(),
    addedAt: createdAt(),
  },
  (t) => [
    unique('album_items_album_asset_unique').on(t.albumId, t.assetId),
    // The page query: an album's items, newest first. Ids are uuidv7, ordered
    // by when the row was made, so the id alone is the cursor.
    index('album_items_album_id_idx').on(t.albumId, t.id),
    check('album_items_size_check', sql`${t.width} > 0 and ${t.height} > 0`),
  ],
);
