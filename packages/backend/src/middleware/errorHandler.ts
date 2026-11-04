import { OxyApiError } from '@oxy.so/core';
import type { NextFunction, Request, Response } from 'express';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors';

/** The body of every non-2xx response (`~/Oxy/docs/api-conventions.md`). */
interface ErrorBody {
  error: { code: string; message: string };
}

function send(res: Response<ErrorBody>, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/**
 * The failed Oxy call behind `error`: the error itself, or the `cause` an SDK
 * batch error (`ServiceAssetMetadataError`, `ServiceLinkedDownloadUrlError`)
 * carries for the chunk that failed.
 */
function oxyApiErrorOf(error: unknown): OxyApiError | null {
  if (error instanceof OxyApiError) return error;
  if (error instanceof Error && error.cause instanceof OxyApiError) return error.cause;
  return null;
}

/**
 * Oxy could not answer: no response at all (network, timeout), a 5xx, or a
 * 429 shedding load. Any other 4xx is Oxy refusing Dropsea's own call, which is
 * Dropsea's defect, not something a client can wait out.
 */
function isOxyOutage(error: OxyApiError): boolean {
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

/**
 * The one place a thrown error becomes an HTTP response. Mounted last, after
 * every route — Express 5 forwards a rejected async handler here
 * automatically, so route handlers never need their own try/catch for these.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response<ErrorBody>,
  _next: NextFunction,
): void {
  if (error instanceof BadRequestError) {
    send(res, 400, 'bad_request', error.message);
    return;
  }
  if (error instanceof ForbiddenError) {
    send(res, 403, 'forbidden', error.message);
    return;
  }
  if (error instanceof NotFoundError) {
    send(res, 404, 'not_found', error.message);
    return;
  }
  if (error instanceof ConflictError) {
    send(res, 409, 'conflict', error.message);
    return;
  }
  // Malformed request bodies (bad JSON) are a user-input boundary, not an
  // internal failure: express.json() throws a SyntaxError carrying its own
  // `status`/`statusCode` before any route handler ever runs.
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    send(res, 400, 'bad_request', 'Malformed request body.');
    return;
  }
  // An Oxy outage is a 503 the client may retry, never a 500. Oxy's own
  // message stays in the log: it describes Dropsea's call, not the client's.
  const oxyError = oxyApiErrorOf(error);
  if (oxyError && isOxyOutage(oxyError)) {
    console.warn('Oxy is unavailable; answering 503', {
      status: oxyError.status,
      code: oxyError.code,
    });
    send(res, 503, 'service_unavailable', 'Oxy is unavailable. Try again shortly.');
    return;
  }
  console.error('Unhandled error in Dropsea backend:', error);
  send(res, 500, 'internal_error', 'Something went wrong.');
}

/** Mounted after every route: a path no route serves. */
export function unknownRoute(_req: Request, res: Response<ErrorBody>): void {
  send(res, 404, 'unknown_route', 'No such route.');
}
