import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ServiceAssetMetadata } from '@oxy.so/core';
import { OxyServer } from '@oxy.so/core/server';
import sharp from 'sharp';
import { createOxyPhotoSource, readPhoto, takenAtFromExif } from '../photos.service';

/** A JPEG `width`×`height`, three quarters orange and a quarter blue. */
async function photo(
  width: number,
  height: number,
  exif?: { orientation?: number; takenAt?: string; offset?: string },
): Promise<Uint8Array> {
  const blueWidth = Math.round(width / 4);
  let image = sharp({
    create: { width, height, channels: 3, background: '#e76f51' },
  })
    .composite([
      {
        input: { create: { width: blueWidth, height, channels: 3, background: '#1d3557' } },
        left: width - blueWidth,
        top: 0,
      },
    ])
    .jpeg();
  if (exif?.orientation) image = image.withMetadata({ orientation: exif.orientation });
  if (exif?.takenAt) {
    image = image.withExifMerge({
      IFD2: {
        DateTimeOriginal: exif.takenAt,
        ...(exif.offset ? { OffsetTimeOriginal: exif.offset } : {}),
      },
    });
  }
  return new Uint8Array(await image.toBuffer());
}

describe('readPhoto', () => {
  test('reads the size and ranks the dominant colour first', async () => {
    const facts = await readPhoto('asset', await photo(400, 300));
    expect(facts?.width).toBe(400);
    expect(facts?.height).toBe(300);
    expect(facts?.seeds.length).toBeGreaterThan(0);
    expect(facts?.seeds.length).toBeLessThanOrEqual(3);
    for (const seed of facts?.seeds ?? []) expect(seed).toMatch(/^#[0-9a-f]{6}$/);
    // The orange covers three quarters of the photo: its seed is warm (red
    // channel above blue), not the blue strip's.
    const [top] = facts?.seeds ?? [];
    const red = Number.parseInt(top?.slice(1, 3) ?? '00', 16);
    const blue = Number.parseInt(top?.slice(5, 7) ?? '00', 16);
    expect(red).toBeGreaterThan(blue);
  });

  test('reports the size a viewer sees when EXIF turns the photo a quarter', async () => {
    const facts = await readPhoto('asset', await photo(400, 300, { orientation: 6 }));
    expect([facts?.width, facts?.height]).toEqual([300, 400]);
  });

  test('is null for bytes that are not an image', async () => {
    expect(await readPhoto('asset', new TextEncoder().encode('not a photo'))).toBeNull();
  });

  test('reads when the photo was taken, in the zone the camera wrote', async () => {
    const withOffset = await readPhoto(
      'asset',
      await photo(64, 48, { takenAt: '2016:05:16 19:12:48', offset: '+02:00' }),
    );
    expect(withOffset?.takenAt?.toISOString()).toBe('2016-05-16T17:12:48.000Z');

    const noOffset = await readPhoto(
      'asset',
      await photo(64, 48, { takenAt: '2016:05:16 19:12:48' }),
    );
    expect(noOffset?.takenAt?.toISOString()).toBe('2016-05-16T19:12:48.000Z');

    expect((await readPhoto('asset', await photo(64, 48)))?.takenAt).toBeNull();
  });
});

describe('takenAtFromExif', () => {
  test('is null with no EXIF and for EXIF it cannot read', () => {
    expect(takenAtFromExif('asset', undefined)).toBeNull();
    expect(takenAtFromExif('asset', Buffer.from('garbage'))).toBeNull();
  });
});

describe('createOxyPhotoSource', () => {
  const OWNER = 'user-1';
  let jpeg: Uint8Array;
  let store: Server;
  let storeBase: string;
  let endlessBytesSent = 0;

  beforeAll(async () => {
    jpeg = await photo(64, 48);
    // Stands in for the store a minted download URL points at.
    store = createServer((req, res) => {
      if (req.url === '/photo') {
        res.end(jpeg);
        return;
      }
      if (req.url === '/endless') {
        // Never ends: only a reader that stops at the recorded size returns.
        const chunk = Buffer.alloc(64 * 1024);
        const write = (): void => {
          while (!res.destroyed && res.write(chunk)) endlessBytesSent += chunk.length;
          if (!res.destroyed) res.once('drain', write);
        };
        write();
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => store.listen(0, '127.0.0.1', resolve));
    storeBase = `http://127.0.0.1:${(store.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    store.closeAllConnections();
    store.close();
  });

  /** An Oxy whose files are `paths` (asset id → store path), each `size` bytes per Oxy Files. */
  function oxyWith(files: Record<string, { path: string; size: number }>): OxyServer {
    const oxy = new OxyServer({ baseURL: 'http://127.0.0.1:9' });
    spyOn(oxy.assets, 'metadataByIds').mockImplementation(async (ids) =>
      ids.map(
        (id): ServiceAssetMetadata => ({
          id,
          sha256: 'a'.repeat(64),
          mime: 'image/jpeg',
          size: files[id]?.size ?? 0,
          status: 'active',
          ownerUserId: OWNER,
        }),
      ),
    );
    spyOn(oxy.assets, 'linkedDownloadUrls').mockImplementation(async (ids) =>
      ids.map((id) => ({
        id,
        url: `${storeBase}${files[id]?.path ?? '/missing'}`,
        expiresIn: 300,
        mime: 'image/jpeg',
        size: files[id]?.size ?? 0,
        sha256: 'a'.repeat(64),
      })),
    );
    return oxy;
  }

  test('reads a photo whose bytes are the size Oxy Files recorded', async () => {
    const source = createOxyPhotoSource(oxyWith({ ok: { path: '/photo', size: jpeg.length } }));
    expect(await source.read(OWNER, ['ok'])).toMatchObject([
      { assetId: 'ok', width: 64, height: 48 },
    ]);
  });

  test('refuses a photo whose bytes run past the recorded size, without reading them all', async () => {
    const source = createOxyPhotoSource(
      oxyWith({
        short: { path: '/photo', size: jpeg.length - 1 },
        endless: { path: '/endless', size: 1024 * 1024 },
      }),
    );
    expect(await source.read(OWNER, ['short', 'endless'])).toEqual([]);
    // The endless body was cut off near the cap, not buffered.
    expect(endlessBytesSent).toBeLessThan(64 * 1024 * 1024);
  });

  test('leaves out a photo the store does not serve', async () => {
    const source = createOxyPhotoSource(oxyWith({ gone: { path: '/missing', size: 10 } }));
    expect(await source.read(OWNER, ['gone'])).toEqual([]);
  });
});
