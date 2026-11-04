/**
 * What a client is told when a handler throws: the status and the
 * `{ error: { code, message } }` body, over a real socket. An Oxy outage is a
 * 503 the client may retry, and Oxy's own message never reaches the client.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OxyApiError, ServiceAssetMetadataError } from '@oxy.so/core';
import express from 'express';
import { NotFoundError } from '../../errors';
import { errorHandler, unknownRoute } from '../errorHandler';

const UPSTREAM_MESSAGE = 'upstream detail that must stay in the log';

function oxyError(status: number): OxyApiError {
  return new OxyApiError(UPSTREAM_MESSAGE, { status, code: 'UPSTREAM' });
}

const failures: Record<string, () => unknown> = {
  'not-found': () => new NotFoundError('Album not found.'),
  'oxy-network': () => oxyError(0),
  'oxy-5xx': () => oxyError(502),
  'oxy-throttled': () => oxyError(429),
  'oxy-refused': () => oxyError(403),
  'oxy-metadata-chunk': () => new ServiceAssetMetadataError(['asset'], [503], oxyError(503)),
  'oxy-metadata-refused': () => new ServiceAssetMetadataError(['asset'], [403], oxyError(403)),
  defect: () => new Error(UPSTREAM_MESSAGE),
};

let server: Server;
let base: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.get('/fail/:kind', async (req) => {
    const failure = failures[req.params.kind];
    throw failure ? failure() : new Error('unknown failure kind');
  });
  app.use(unknownRoute);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

async function failWith(kind: string): Promise<{ status: number; body: unknown; text: string }> {
  const response = await fetch(`${base}/fail/${kind}`);
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text), text };
}

describe('errorHandler', () => {
  test('answers a domain error with its status and the error envelope', async () => {
    expect(await failWith('not-found')).toMatchObject({
      status: 404,
      body: { error: { code: 'not_found', message: 'Album not found.' } },
    });
  });

  test.each([
    ['no response from Oxy', 'oxy-network'],
    ['a 5xx from Oxy', 'oxy-5xx'],
    ['Oxy shedding load', 'oxy-throttled'],
    ['a failed Oxy Files chunk', 'oxy-metadata-chunk'],
  ])('answers 503 for %s, without its message', async (_label, kind) => {
    const { status, body, text } = await failWith(kind);
    expect(status).toBe(503);
    expect(body).toEqual({ error: { code: 'service_unavailable', message: expect.any(String) } });
    expect(text).not.toContain(UPSTREAM_MESSAGE);
  });

  test.each([
    ['Oxy refusing Dropsea itself', 'oxy-refused'],
    ['Oxy Files refusing Dropsea itself', 'oxy-metadata-refused'],
    ['a defect', 'defect'],
  ])('answers 500 for %s, without its message', async (_label, kind) => {
    const { status, body, text } = await failWith(kind);
    expect(status).toBe(500);
    expect(body).toEqual({ error: { code: 'internal_error', message: expect.any(String) } });
    expect(text).not.toContain(UPSTREAM_MESSAGE);
  });

  test('answers malformed JSON with 400 and a path no route serves with unknown_route', async () => {
    const malformed = await fetch(`${base}/fail/defect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      error: { code: 'bad_request', message: 'Malformed request body.' },
    });

    const unknown = await fetch(`${base}/nowhere`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({
      error: { code: 'unknown_route', message: 'No such route.' },
    });
  });
});
