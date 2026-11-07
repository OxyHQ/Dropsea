/**
 * `/file-tags` — the person's tags on their Oxy Files assets. Every route
 * requires an authenticated Oxy user: `app.ts` mounts
 * `createOxyAuthMiddleware(oxy)` ahead of this router, which answers 401 for a
 * request with no person, so every handler here has one. The owner is always
 * that person, never a field of the request.
 *
 * Reads that take a list of assets are `POST`s: 500 ids do not fit a URL.
 */

import type {
  FileTagNamesResponse,
  FileTagsCountResponse,
  FileTagsResponse,
  TaggedAssetsPage,
} from '@dropsea/shared-types';
import { getRequiredOxyUserId } from '@oxy.so/core/server';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../errors';
import { validateBody } from '../middleware/validate';
import { FILE_TAG_ASSET_ID_MAX_LENGTH, FILE_TAG_NAME_MAX_BYTES } from '../db/schema';
import * as fileTagsService from '../services/file-tags.service';

const utf8 = new TextEncoder();

/**
 * A tag name, trimmed: 1 to 255 UTF-8 bytes, no `,` and no newline (the
 * separators of `user.xdg.tags` and of macOS's tag list), as on a local file.
 */
const tagNameSchema = z
  .string()
  .trim()
  .min(1, 'A tag name cannot be empty.')
  .refine((name) => utf8.encode(name).length <= FILE_TAG_NAME_MAX_BYTES, {
    message: `A tag name is at most ${FILE_TAG_NAME_MAX_BYTES} bytes.`,
  })
  .refine((name) => !name.includes(',') && !name.includes('\n'), {
    message: 'A tag name cannot contain a comma or a line break.',
  });

const assetIdsSchema = z
  .array(z.string().trim().min(1).max(FILE_TAG_ASSET_ID_MAX_LENGTH))
  .min(1)
  .max(fileTagsService.MAX_ASSETS_PER_REQUEST);

const tagNamesSchema = z.array(tagNameSchema).max(fileTagsService.MAX_NAMES_PER_CHANGE);

const lookupSchema = z.object({ assetIds: assetIdsSchema }).strict();

// An empty change is a client bug, not a no-op. A name in both lists is
// removed and then added again, so it ends on the file.
const changeSchema = z
  .object({
    assetIds: assetIdsSchema,
    add: tagNamesSchema.default([]),
    remove: tagNamesSchema.default([]),
  })
  .strict()
  .refine((body) => body.add.length > 0 || body.remove.length > 0, {
    message: 'Nothing to change.',
  });

const renameSchema = z.object({ from: tagNameSchema, to: tagNameSchema }).strict();

const removeNameSchema = z.object({ name: tagNameSchema }).strict();

const forgetSchema = z.object({ assetIds: assetIdsSchema }).strict();

const taggedQuerySchema = z
  .object({
    name: tagNameSchema,
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(fileTagsService.MAX_PAGE_SIZE).optional(),
  })
  .strict();

export function createFileTagsRouter(): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response<TaggedAssetsPage>) => {
    const query = taggedQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new BadRequestError(query.error.issues.map((issue) => issue.message).join('; '));
    }
    const { name, ...page } = query.data;
    res.json(await fileTagsService.listTaggedAssets(getRequiredOxyUserId(req), name, page));
  });

  router.get('/names', async (req: Request, res: Response<FileTagNamesResponse>) => {
    res.json({ names: await fileTagsService.listTagNames(getRequiredOxyUserId(req)) });
  });

  router.post(
    '/lookup',
    validateBody(lookupSchema),
    async (req: Request, res: Response<FileTagsResponse>) => {
      const { assetIds } = req.body as z.infer<typeof lookupSchema>;
      res.json({ tags: await fileTagsService.lookupTags(getRequiredOxyUserId(req), assetIds) });
    },
  );

  router.post(
    '/change',
    validateBody(changeSchema),
    async (req: Request, res: Response<FileTagsResponse>) => {
      const { assetIds, add, remove } = req.body as z.infer<typeof changeSchema>;
      res.json({
        tags: await fileTagsService.changeTags(getRequiredOxyUserId(req), assetIds, {
          add,
          remove,
        }),
      });
    },
  );

  router.post(
    '/rename',
    validateBody(renameSchema),
    async (req: Request, res: Response<FileTagsCountResponse>) => {
      const { from, to } = req.body as z.infer<typeof renameSchema>;
      res.json({ count: await fileTagsService.renameTag(getRequiredOxyUserId(req), from, to) });
    },
  );

  router.post(
    '/remove-name',
    validateBody(removeNameSchema),
    async (req: Request, res: Response<FileTagsCountResponse>) => {
      const { name } = req.body as z.infer<typeof removeNameSchema>;
      res.json({ count: await fileTagsService.removeTagName(getRequiredOxyUserId(req), name) });
    },
  );

  router.post(
    '/forget',
    validateBody(forgetSchema),
    async (req: Request, res: Response<FileTagsCountResponse>) => {
      const { assetIds } = req.body as z.infer<typeof forgetSchema>;
      res.json({ count: await fileTagsService.forgetAssets(getRequiredOxyUserId(req), assetIds) });
    },
  );

  return router;
}
