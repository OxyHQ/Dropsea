/**
 * The HTTP contract of `/albums`, over a real socket and a REAL Postgres (see
 * `services/__tests__/albums.service.test.ts`). `createOxyAuthMiddleware` is
 * replaced by a stand-in that sets `req.userId` from a test header, exactly the
 * field the real one sets; everything after it is the production router. The
 * real middleware's 401 is `__tests__/app.test.ts`'s.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import express, {
  type NextFunction,
  type Request,
  type Response as ExpressResponse,
} from 'express';
import { closePostgres, connectPostgres, getDb } from '../../db/postgres';
import { albums } from '../../db/schema';
import { errorHandler } from '../../middleware/errorHandler';
import type { PhotoSource } from '../../services/photos.service';
import { createAlbumsRouter } from '../albums.routes';

const OWNER = `user-${crypto.randomUUID()}`;

const photos: PhotoSource = {
  async read(userId, assetIds) {
    return userId === OWNER
      ? assetIds.map((assetId) => ({
          assetId,
          mime: 'image/jpeg',
          width: 640,
          height: 480,
          seeds: ['#cc210c'],
          takenAt: null,
        }))
      : [];
  },
};

let server: Server;
let base: string;

beforeAll(async () => {
  await connectPostgres();
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    const userId = req.header('x-test-user');
    if (userId) Object.assign(req, { userId });
    next();
  });
  app.use('/albums', createAlbumsRouter(photos));
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/albums`;
});

afterAll(async () => {
  await getDb().delete(albums).where(eq(albums.ownerUserId, OWNER));
  server.close();
  await closePostgres();
});

function call(path: string, init: RequestInit & { user?: string } = {}): Promise<Response> {
  const { user = OWNER, ...rest } = init;
  return fetch(`${base}${path}`, {
    ...rest,
    headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
  });
}

describe('/albums', () => {
  test('creates an album, adds a photo and lists it', async () => {
    const created = await call('', { method: 'POST', body: JSON.stringify({ name: 'Gallery' }) });
    expect(created.status).toBe(201);
    const { album } = (await created.json()) as { album: { id: string } };

    const added = await call(`/${album.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ assetIds: ['photo-1'] }),
    });
    expect(added.status).toBe(200);
    expect(await added.json()).toMatchObject({
      items: [{ assetId: 'photo-1', width: 640, height: 480, seeds: ['#cc210c'] }],
      rejectedAssetIds: [],
    });

    const page = await call(`/${album.id}/items?limit=10`);
    expect(await page.json()).toMatchObject({ items: [{ assetId: 'photo-1' }], nextCursor: null });
  });

  test("answers 404 for another person's album", async () => {
    const created = await call('', { method: 'POST', body: JSON.stringify({ name: 'Private' }) });
    const { album } = (await created.json()) as { album: { id: string } };
    const response = await call(`/${album.id}`, { user: `user-${crypto.randomUUID()}` });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: expect.any(String) },
    });
  });

  test('refuses fields it does not know, an empty change and a bad page query', async () => {
    const created = await call('', { method: 'POST', body: JSON.stringify({ name: 'Strict' }) });
    const { album } = (await created.json()) as { album: { id: string } };

    const smuggled = await call('', {
      method: 'POST',
      body: JSON.stringify({ name: 'Mine', ownerUserId: 'someone-else' }),
    });
    expect(smuggled.status).toBe(400);

    const empty = await call(`/${album.id}`, { method: 'PATCH', body: '{}' });
    expect(empty.status).toBe(400);

    const badPage = await call(`/${album.id}/items?limit=0`);
    expect(badPage.status).toBe(400);
  });
});
