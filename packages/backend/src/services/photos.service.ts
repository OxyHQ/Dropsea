/**
 * What Dropsea learns about a photo when it is added: its size, its seed
 * colours and when it was taken. Read once from the bytes in Oxy Files and
 * kept on the item, so a page of photos needs no call per photo and a screen
 * showing one themes itself without reading pixels.
 */

import { Readable } from 'node:stream';
import { hexFromArgb, seedsFromRgbBytes } from '@oxy.so/bloom/color-engine';
import { type OxyServer, readResponseBody } from '@oxy.so/core/server';
import exifReader from 'exif-reader';
import sharp, { type Metadata } from 'sharp';

export interface PhotoFacts {
  assetId: string;
  mime: string;
  width: number;
  height: number;
  seeds: string[];
  takenAt: Date | null;
}

/**
 * Reads the facts of a person's photos. An id that is not theirs, not linked
 * to Dropsea, not an image or not readable is simply absent from the result:
 * one answer for all of them, so a caller cannot tell another person's file
 * from no file.
 */
export interface PhotoSource {
  read(userId: string, assetIds: string[]): Promise<PhotoFacts[]>;
}

/** A thumbnail this size ranks seeds the same as the full photo. */
const SEED_THUMBNAIL_PX = 48;
/** Seeds kept per photo: a theme seed and its secondary and tertiary accents. */
const SEEDS_KEPT = 3;
/** Larger originals are refused rather than downloaded. */
const MAX_PHOTO_BYTES = 100 * 1024 * 1024;
/** Downloads in flight at once for one request. */
const DOWNLOAD_CONCURRENCY = 4;
/**
 * How long one download may take to answer, and then how long its body may
 * take to arrive: a stalled or trickling store cannot hold a request open.
 */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Size, seeds and capture time from a photo's bytes. `null` when the bytes are
 * not an image sharp can decode.
 *
 * The size is read here rather than taken from Oxy Files: its metadata is
 * extracted after the upload returns, so a photo added straight away may not
 * have one yet, and the bytes are being read for the seeds anyway.
 */
export async function readPhoto(
  assetId: string,
  bytes: Uint8Array,
): Promise<Omit<PhotoFacts, 'assetId' | 'mime'> | null> {
  let metadata: Metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch (error) {
    console.warn('Dropsea could not decode a photo; it is not added', {
      assetId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  if (!metadata.width || !metadata.height) {
    console.warn('Dropsea read a photo with no size; it is not added', { assetId });
    return null;
  }

  // The size a viewer sees: EXIF orientations 5 to 8 turn the photo a quarter.
  const isQuarterTurned = (metadata.orientation ?? 1) >= 5;
  const width = isQuarterTurned ? metadata.height : metadata.width;
  const height = isQuarterTurned ? metadata.width : metadata.height;

  const thumbnail = await sharp(bytes)
    .rotate()
    .resize(SEED_THUMBNAIL_PX, SEED_THUMBNAIL_PX, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const seeds = seedsFromRgbBytes(thumbnail).slice(0, SEEDS_KEPT).map(hexFromArgb);

  return { width, height, seeds, takenAt: takenAtFromExif(assetId, metadata.exif) };
}

/**
 * EXIF `DateTimeOriginal` as an instant. The tag is the camera's wall clock
 * with no zone (exif-reader reads it as UTC); `OffsetTimeOriginal`, when the
 * camera wrote one, says which zone that was.
 */
export function takenAtFromExif(assetId: string, exif: Buffer | undefined): Date | null {
  if (!exif) return null;
  let photo: ReturnType<typeof exifReader>['Photo'];
  try {
    photo = exifReader(exif).Photo;
  } catch (error) {
    // The photo is still added, with no capture time.
    console.warn("Dropsea could not read a photo's EXIF", {
      assetId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  const wallClock = photo?.DateTimeOriginal;
  if (!(wallClock instanceof Date) || Number.isNaN(wallClock.getTime())) return null;
  const offset = /^([+-])(\d{2}):(\d{2})$/.exec(photo?.OffsetTimeOriginal ?? '');
  if (!offset) return wallClock;
  const sign = offset[1] === '-' ? -1 : 1;
  const offsetMinutes = sign * (Number(offset[2]) * 60 + Number(offset[3]));
  return new Date(wallClock.getTime() - offsetMinutes * 60_000);
}

/**
 * A photo's bytes from the short-lived URL Oxy Files minted for it: at most
 * `size` bytes, the size Oxy Files recorded for the file, and within
 * {@link DOWNLOAD_TIMEOUT_MS}. `null` for anything else, logged with the status
 * only: the URL is a live credential.
 */
async function downloadPhoto(
  assetId: string,
  url: string,
  size: number,
): Promise<Uint8Array | null> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (error) {
    console.warn('Dropsea could not download a photo; it is not added', {
      assetId,
      error: error instanceof Error ? error.name : String(error),
    });
    return null;
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    console.warn('Dropsea could not download a photo; it is not added', {
      assetId,
      status: response.status,
    });
    return null;
  }
  const body = await readResponseBody(Readable.fromWeb(response.body), {
    maxBytes: size,
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
  });
  if (body.kind !== 'ok') {
    console.warn('Dropsea could not download a photo; it is not added', {
      assetId,
      outcome: body.kind,
    });
    return null;
  }
  return new Uint8Array(body.body);
}

/**
 * The real source: Oxy Files, through Dropsea's own service identity.
 *
 * 1. `metadataByIds` names each file's owner, mime, size and status; only the
 *    caller's own live images go on.
 * 2. `linkedDownloadUrls` answers only for files their owner linked to Dropsea
 *    (oxy ADR 0021): that link, made by the person's own client, is their
 *    consent to Dropsea reading the file.
 * 3. Each one is downloaded, bounded by its recorded size, and read.
 */
export function createOxyPhotoSource(oxy: OxyServer): PhotoSource {
  return {
    async read(userId, assetIds) {
      const metadata = await oxy.assets.metadataByIds(assetIds);
      const images = new Map(
        metadata
          .filter(
            (asset) =>
              asset.ownerUserId === userId &&
              asset.status === 'active' &&
              asset.mime.startsWith('image/') &&
              asset.size <= MAX_PHOTO_BYTES,
          )
          .map((asset) => [asset.id, asset]),
      );
      if (images.size === 0) return [];

      const downloads = await oxy.assets.linkedDownloadUrls([...images.keys()]);
      const facts: PhotoFacts[] = [];
      for (let start = 0; start < downloads.length; start += DOWNLOAD_CONCURRENCY) {
        const batch = downloads.slice(start, start + DOWNLOAD_CONCURRENCY);
        const read = await Promise.all(
          batch.map(async (download): Promise<PhotoFacts | null> => {
            const asset = images.get(download.id);
            if (!asset) return null;
            const bytes = await downloadPhoto(asset.id, download.url, asset.size);
            if (!bytes) return null;
            const photo = await readPhoto(asset.id, bytes);
            return photo ? { assetId: asset.id, mime: asset.mime, ...photo } : null;
          }),
        );
        for (const entry of read) if (entry) facts.push(entry);
      }
      return facts;
    },
  };
}
