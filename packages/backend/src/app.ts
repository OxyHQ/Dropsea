import {
  type OxyServer,
  createOxyAuthMiddleware,
  createOxyCors,
  createOxyRateLimit,
  createOxySecurityHeaders,
  oxyTrustProxy,
} from '@oxy.so/core/server';
import express, { type Express } from 'express';
import { config } from './config';
import { assertMigrationsCurrent, checkPostgresHealth } from './db/postgres';
import { errorHandler, unknownRoute } from './middleware/errorHandler';
import { createAlbumsRouter } from './routes/albums.routes';
import type { PhotoSource } from './services/photos.service';
import { logger } from './utils/logger';

/**
 * Build the Express app. Takes `oxy` and the photo source as parameters so
 * tests can pass ones pointed at a fake Oxy instead of the real one.
 */
export function createApp(oxy: OxyServer, photos: PhotoSource): Express {
  const app = express();

  // Before any middleware: `req.ip` is the real client behind the ALB and the
  // Cloudflare proxy, and a forged X-Forwarded-For is never believed.
  app.set('trust proxy', oxyTrustProxy);
  app.use(createOxySecurityHeaders());
  app.use(createOxyCors({ appOrigins: config.corsOrigins }));
  app.use(express.json());

  // Liveness: 200 while the process is up.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness: Postgres answers AND this build's migrations are applied.
  app.get('/ready', async (_req, res) => {
    if (!(await checkPostgresHealth())) {
      res.status(503).json({ status: 'not-ready', reason: 'database-unreachable' });
      return;
    }
    try {
      await assertMigrationsCurrent();
    } catch (error) {
      logger.warn('Not ready: migrations are not current', error);
      res.status(503).json({ status: 'not-ready', reason: 'migrations-pending' });
      return;
    }
    res.json({ status: 'ready' });
  });

  // Every API route is throttled per user; the probes above are not.
  app.use(
    '/albums',
    createOxyRateLimit(oxy),
    createOxyAuthMiddleware(oxy),
    createAlbumsRouter(photos),
  );

  // Last: a path no route serves, then every thrown error, as typed JSON.
  app.use(unknownRoute);
  app.use(errorHandler);

  return app;
}
