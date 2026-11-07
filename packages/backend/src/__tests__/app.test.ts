/**
 * The probes of the production app (`createApp`), against a REAL Postgres
 * migrated to this build (see `services/__tests__/albums.service.test.ts`).
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OxyServer } from '@oxy.so/core/server';
import { createApp } from '../app';
import { closePostgres, connectPostgres } from '../db/postgres';

let server: Server;
let base: string;

beforeAll(async () => {
  await connectPostgres();
  // The probes never call Oxy; an unroutable address proves it.
  const oxy = new OxyServer({ baseURL: 'http://127.0.0.1:9' });
  server = createApp(oxy, { read: async () => [] }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await closePostgres();
});

test('is live and, with every migration applied, ready', async () => {
  expect((await fetch(`${base}/health`)).status).toBe(200);
  const ready = await fetch(`${base}/ready`);
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({ status: 'ready' });
});

test('refuses /albums and /file-tags with no session', async () => {
  expect((await fetch(`${base}/albums`)).status).toBe(401);
  expect((await fetch(`${base}/file-tags/names`)).status).toBe(401);
  expect(
    (
      await fetch(`${base}/file-tags/lookup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetIds: ['a'] }),
      })
    ).status,
  ).toBe(401);
});

test('lets the web app at dropsea.net call it cross-origin, and no unlisted origin', async () => {
  const preflight = (origin: string) =>
    fetch(`${base}/albums`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
    });
  const allowed = await preflight('https://dropsea.net');
  expect(allowed.headers.get('access-control-allow-origin')).toBe('https://dropsea.net');
  const refused = await preflight('https://dropsea.example');
  expect(refused.headers.get('access-control-allow-origin')).toBeNull();
});
