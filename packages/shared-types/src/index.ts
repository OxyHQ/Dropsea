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
