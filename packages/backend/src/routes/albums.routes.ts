/**
 * `/albums` — every route requires an authenticated Oxy user. `app.ts` mounts
 * `createOxyAuthMiddleware(oxy)` ahead of this router; `requireOxyAuth` below
 * is the defensive second check that `req.userId` is really set, as Willo's
 * `homes.routes.ts` keeps.
 */

import type { AddAlbumItemsResponse, Album, AlbumItemsPage } from '@dropsea/shared-types';
import { getRequiredOxyUserId, requireOxyAuth } from '@oxy.so/core/server';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../errors';
import { validateBody } from '../middleware/validate';
import * as albumsService from '../services/albums.service';
import type { PhotoSource } from '../services/photos.service';

/**
 * A path param as a string. A non-string becomes `''`, which names no row and
 * answers 404 — never coerced into a plausible-looking id.
 */
function pathParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

const albumNameSchema = z.string().trim().min(1).max(200);

const createAlbumSchema = z.object({ name: albumNameSchema }).strict();

// `.strict()` and at least one field: this is the whole list of album fields a
// request may change, and an empty change is a client bug, not a no-op.
const updateAlbumSchema = z
  .object({
    name: albumNameSchema.optional(),
    coverItemId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.coverItemId !== undefined, {
    message: 'Nothing to change.',
  });

const addItemsSchema = z
  .object({
    assetIds: z.array(z.string().trim().min(1)).min(1).max(albumsService.MAX_ITEMS_PER_ADD),
  })
  .strict();

const pageQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(albumsService.MAX_PAGE_SIZE).optional(),
});

export function createAlbumsRouter(photos: PhotoSource): Router {
  const router = Router();
  router.use(requireOxyAuth);

  router.get('/', async (req: Request, res: Response<{ albums: Album[] }>) => {
    res.json({ albums: await albumsService.listAlbums(getRequiredOxyUserId(req)) });
  });

  router.post(
    '/',
    validateBody(createAlbumSchema),
    async (req: Request, res: Response<{ album: Album }>) => {
      const { name } = req.body as z.infer<typeof createAlbumSchema>;
      res
        .status(201)
        .json({ album: await albumsService.createAlbum(getRequiredOxyUserId(req), name) });
    },
  );

  router.get('/:id', async (req: Request, res: Response<{ album: Album }>) => {
    res.json({
      album: await albumsService.getAlbum(getRequiredOxyUserId(req), pathParam(req.params.id)),
    });
  });

  router.patch(
    '/:id',
    validateBody(updateAlbumSchema),
    async (req: Request, res: Response<{ album: Album }>) => {
      const changes = req.body as z.infer<typeof updateAlbumSchema>;
      res.json({
        album: await albumsService.updateAlbum(
          getRequiredOxyUserId(req),
          pathParam(req.params.id),
          changes,
        ),
      });
    },
  );

  router.delete('/:id', async (req: Request, res: Response) => {
    await albumsService.deleteAlbum(getRequiredOxyUserId(req), pathParam(req.params.id));
    res.status(204).end();
  });

  router.get('/:id/items', async (req: Request, res: Response<AlbumItemsPage>) => {
    const query = pageQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new BadRequestError(query.error.issues.map((issue) => issue.message).join('; '));
    }
    res.json(
      await albumsService.listItems(
        getRequiredOxyUserId(req),
        pathParam(req.params.id),
        query.data,
      ),
    );
  });

  router.post(
    '/:id/items',
    validateBody(addItemsSchema),
    async (req: Request, res: Response<AddAlbumItemsResponse>) => {
      const { assetIds } = req.body as z.infer<typeof addItemsSchema>;
      res.json(
        await albumsService.addItems(
          getRequiredOxyUserId(req),
          pathParam(req.params.id),
          assetIds,
          photos,
        ),
      );
    },
  );

  router.delete('/:id/items/:itemId', async (req: Request, res: Response) => {
    await albumsService.removeItem(
      getRequiredOxyUserId(req),
      pathParam(req.params.id),
      pathParam(req.params.itemId),
    );
    res.status(204).end();
  });

  return router;
}
