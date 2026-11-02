import type { NextFunction, Request, Response } from 'express';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors';

/**
 * The one place a thrown domain error becomes an HTTP response. Mounted last,
 * after every route — Express 5 forwards a rejected async handler here
 * automatically, so route handlers never need their own try/catch for these.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof BadRequestError) {
    res.status(400).json({ error: 'BadRequest', message: error.message });
    return;
  }
  if (error instanceof ForbiddenError) {
    res.status(403).json({ error: 'Forbidden', message: error.message });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: 'NotFound', message: error.message });
    return;
  }
  if (error instanceof ConflictError) {
    res.status(409).json({ error: 'Conflict', message: error.message });
    return;
  }
  // Malformed request bodies (bad JSON) are a user-input boundary, not an
  // internal failure: express.json() throws a SyntaxError carrying its own
  // `status`/`statusCode` before any route handler ever runs.
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    res.status(400).json({ error: 'BadRequest', message: 'Malformed request body.' });
    return;
  }
  console.error('Unhandled error in Dropsea backend:', error);
  res.status(500).json({ error: 'InternalServerError', message: 'Something went wrong.' });
}
