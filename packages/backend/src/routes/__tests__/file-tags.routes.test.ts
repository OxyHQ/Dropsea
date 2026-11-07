/**
 * The HTTP contract of `/file-tags`, over a real socket and a REAL Postgres
 * (see `services/__tests__/file-tags.service.test.ts`). `createOxyAuthMiddleware`
 * is replaced by a stand-in that sets `req.userId` from a test header, exactly
 * the field the real one sets; everything after it is the production router.
 * The real middleware's 401 is `__tests__/app.test.ts`'s.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inArray } from 'drizzle-orm';
import express, {
  type NextFunction,
  type Request,
  type Response as ExpressResponse,
} from 'express';
import { closePostgres, connectPostgres, getDb } from '../../db/postgres';
import { fileTags } from '../../db/schema';
import { errorHandler } from '../../middleware/errorHandler';
import { createFileTagsRouter } from '../file-tags.routes';

const OWNER = `user-${crypto.randomUUID()}`;
const STRANGER = `user-${crypto.randomUUID()}`;

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
  app.use('/file-tags', createFileTagsRouter());
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/file-tags`;
});

afterAll(async () => {
  await getDb()
    .delete(fileTags)
    .where(inArray(fileTags.ownerUserId, [OWNER, STRANGER]));
  server.close();
  await closePostgres();
});

function call(path: string, init: RequestInit & { user?: string } = {}): Promise<Response> {
  const { user = OWNER, ...rest } = init;
  return fetch(`${base}${path}`, {
    ...rest,
    headers: { 'content-type': 'application/json', 'x-test-user': user },
  });
}

function post(path: string, body: unknown, user = OWNER): Promise<Response> {
  return call(path, { method: 'POST', body: JSON.stringify(body), user });
}

describe('/file-tags', () => {
  test('changes, looks up, finds, lists, renames, removes and forgets tags', async () => {
    const changed = await post('/change', {
      assetIds: ['a', 'b'],
      add: ['Red', 'Work', 'red'],
    });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ tags: { a: ['Red', 'Work'], b: ['Red', 'Work'] } });

    const removed = await post('/change', { assetIds: ['b'], remove: ['work'] });
    expect(await removed.json()).toEqual({ tags: { b: ['Red'] } });

    const lookup = await post('/lookup', { assetIds: ['a', 'b', 'c'] });
    expect(await lookup.json()).toEqual({ tags: { a: ['Red', 'Work'], b: ['Red'] } });

    const tagged = await call(`/?name=${encodeURIComponent(' RED ')}&limit=1`);
    const firstPage = (await tagged.json()) as { assetIds: string[]; nextCursor: string | null };
    expect(firstPage.assetIds).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const next = await call(
      `/?name=Red&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
    );
    const secondPage = (await next.json()) as { assetIds: string[] };
    expect([...firstPage.assetIds, ...secondPage.assetIds].sort()).toEqual(['a', 'b']);

    expect(await (await call('/names')).json()).toEqual({
      names: [
        { name: 'Red', count: 2 },
        { name: 'Work', count: 1 },
      ],
    });

    expect(await (await post('/rename', { from: 'work', to: 'Projects' })).json()).toEqual({
      count: 1,
    });
    expect(await (await post('/remove-name', { name: 'RED' })).json()).toEqual({ count: 2 });
    expect(await (await post('/forget', { assetIds: ['a'] })).json()).toEqual({ count: 1 });
    expect(await (await post('/lookup', { assetIds: ['a', 'b'] })).json()).toEqual({ tags: {} });
  });

  test("never shows or changes another person's tags", async () => {
    await post('/change', { assetIds: ['private'], add: ['Secret'] });

    expect(await (await post('/lookup', { assetIds: ['private'] }, STRANGER)).json()).toEqual({
      tags: {},
    });
    expect(await (await call('/?name=Secret', { user: STRANGER })).json()).toEqual({
      assetIds: [],
      nextCursor: null,
    });
    expect(await (await call('/names', { user: STRANGER })).json()).toEqual({ names: [] });
    expect(await (await post('/remove-name', { name: 'Secret' }, STRANGER)).json()).toEqual({
      count: 0,
    });

    expect(await (await post('/lookup', { assetIds: ['private'] })).json()).toEqual({
      tags: { private: ['Secret'] },
    });
  });

  test('takes the owner from the session, never from the body', async () => {
    const smuggled = await post(
      '/change',
      { assetIds: ['x'], add: ['Mine'], ownerUserId: STRANGER },
      OWNER,
    );
    expect(smuggled.status).toBe(400);
    expect(await smuggled.json()).toEqual({
      error: { code: 'bad_request', message: expect.any(String) },
    });
    expect(await (await post('/lookup', { assetIds: ['x'] }, STRANGER)).json()).toEqual({
      tags: {},
    });
  });

  test('refuses names, lists and queries outside the contract', async () => {
    const refused: [string, unknown][] = [
      ['/change', { assetIds: ['a'] }],
      ['/change', { assetIds: ['a'], add: [], remove: [] }],
      ['/change', { assetIds: [], add: ['Red'] }],
      ['/change', { assetIds: ['a'], add: ['   '] }],
      ['/change', { assetIds: ['a'], add: ['a,b'] }],
      ['/change', { assetIds: ['a'], add: ['a\nb'] }],
      ['/change', { assetIds: ['a'], add: ['é'.repeat(128)] }],
      ['/change', { assetIds: ['a'], add: Array.from({ length: 51 }, (_, i) => `Tag ${i}`) }],
      ['/lookup', { assetIds: Array.from({ length: 501 }, (_, i) => `asset-${i}`) }],
      ['/lookup', { assetIds: ['a'.repeat(256)] }],
      ['/lookup', { assetIds: 'a' }],
      ['/rename', { from: 'Red' }],
      ['/rename', { from: 'Red', to: '' }],
      ['/remove-name', { name: 'a,b' }],
      ['/forget', {}],
    ];
    for (const [path, body] of refused) {
      const response = await post(path, body);
      expect({ path, body, status: response.status }).toEqual({ path, body, status: 400 });
    }
    for (const query of [
      '',
      '?name=',
      '?name=Red&limit=0',
      '?name=Red&limit=501',
      '?name=Red&x=1',
    ]) {
      expect({ query, status: (await call(`/${query}`)).status }).toEqual({ query, status: 400 });
    }

    const longest = await post('/change', { assetIds: ['edge'], add: [`${'é'.repeat(127)}x`] });
    expect(longest.status).toBe(200);
  });
});
