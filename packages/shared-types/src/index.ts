/**
 * Dropsea API shapes — what the backend returns and accepts, shared with every
 * client. Types only: nothing here runs.
 *
 * Every file is an Oxy Files asset. An item carries its `assetId`, never a
 * URL: a client resolves it with its own session (`oxy.assets.urls`), so a
 * private photo is only ever readable by someone Oxy allows.
 */

export interface Album {
  id: string;
  name: string;
  /** The item shown for the album; `null` until it has one. */
  coverItemId: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumItem {
  id: string;
  albumId: string;
  /** The Oxy Files asset id. */
  assetId: string;
  mime: string;
  /** Size in pixels as a viewer sees it (EXIF orientation applied), read from the photo when it was added. */
  width: number;
  height: number;
  /**
   * Seed colours worked out from the photo, best first, as `#rrggbb`: `[0]`
   * is a Bloom theme seed, `[1]` and `[2]` can pin its secondary and tertiary
   * accents. Empty for a file with no image to read.
   */
  seeds: string[];
  /** When the photo was taken (EXIF `DateTimeOriginal`), or `null` when it does not say. */
  takenAt: string | null;
  addedAt: string;
}

export interface CreateAlbumRequest {
  name: string;
}

export interface UpdateAlbumRequest {
  name?: string;
  coverItemId?: string | null;
}

export interface AddAlbumItemsRequest {
  /** Assets already uploaded with `oxy.assets.upload` and linked to Dropsea. */
  assetIds: string[];
}

export interface AddAlbumItemsResponse {
  items: AlbumItem[];
  /**
   * Ids Dropsea could not add: not an image, not the caller's, or not linked to
   * Dropsea. One answer for all three, so a caller cannot probe other people's
   * files.
   */
  rejectedAssetIds: string[];
}

export interface AlbumItemsPage {
  items: AlbumItem[];
  /** Pass as `?cursor=` for the next page; `null` on the last one. */
  nextCursor: string | null;
}

/**
 * Tags on cloud files — the person's Finder-style tags on their Oxy Files
 * assets, under `/file-tags`. Only names live here: a tag's colour, order and
 * place in the sidebar are the person's preferences, kept apart.
 *
 * A tag name is trimmed, 1 to 255 UTF-8 bytes, with no `,` and no line break
 * (as on a local file's `user.xdg.tags`). Names compare case aside: "Work" and
 * "work" are one tag, and a file keeps the spelling it got first.
 */

/** Each asset's tag names in that file's order, by asset id. An asset with no tags is left out. */
export type FileTagsByAsset = Record<string, string[]>;

/** `POST /file-tags/lookup`: at most 500 ids. */
export interface LookupFileTagsRequest {
  assetIds: string[];
}

/** What `POST /file-tags/lookup` and `POST /file-tags/change` return. */
export interface FileTagsResponse {
  tags: FileTagsByAsset;
}

/**
 * `GET /file-tags?name=&cursor=&limit=`: the person's assets tagged `name`,
 * case aside, most recently tagged first. `limit` is 1 to 500, 100 by default.
 */
export interface TaggedAssetsPage {
  assetIds: string[];
  /** Pass as `?cursor=` for the next page; `null` on the last one. */
  nextCursor: string | null;
}

/** A name on the person's assets and how many assets carry it, spelled as it was first put on. */
export interface FileTagName {
  name: string;
  count: number;
}

/** `GET /file-tags/names`: every name on the person's assets, by name. */
export interface FileTagNamesResponse {
  names: FileTagName[];
}

/**
 * `POST /file-tags/change`, in one transaction: each name of `remove` comes off
 * (case aside), then each of `add` goes on after the asset's last tag, in
 * order and once; a name an asset already has keeps its spelling and place.
 * A name in both lists comes off and goes back on, last. At most 500 ids
 * and 50 names in each list; at least one name in all.
 */
export interface ChangeFileTagsRequest {
  assetIds: string[];
  add?: string[];
  remove?: string[];
}

/**
 * `POST /file-tags/rename`: every asset's `from` (case aside) becomes `to`, in
 * its place; an asset that already has `to` just loses `from`. `to` may be
 * `from` spelled another way.
 */
export interface RenameFileTagRequest {
  from: string;
  to: string;
}

/** `POST /file-tags/remove-name`: the tag comes off every asset. */
export interface RemoveFileTagNameRequest {
  name: string;
}

/** `POST /file-tags/forget`: the tags of assets deleted for good. At most 500 ids. */
export interface ForgetFileTagsRequest {
  assetIds: string[];
}

/**
 * What the writes over every asset return: for a rename or a removal, how many
 * assets had the name; for `forget`, how many tags went.
 */
export interface FileTagsCountResponse {
  count: number;
}
