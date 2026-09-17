import { Router } from 'express';
import { z } from 'zod';

import { ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import { forgetMerchant, recallMerchant, suggestMerchants } from './merchant.service';

export const merchantRouter: Router = Router();

merchantRouter.use(requireAuth);

const querySchema = z.object({
  q: z.string().trim().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

type MerchantQuery = z.infer<typeof querySchema>;

/** Names this user has used before, most-used first. Feeds the entry field. */
merchantRouter.get('/', validate({ query: querySchema }), async (req, res) => {
  const { q, limit } = validatedQuery<MerchantQuery>(res);
  ok(res, { merchants: await suggestMerchants(currentUser(req).id, q, limit) });
});

/** What this user usually files one merchant under, with no model involved. */
merchantRouter.get(
  '/recall',
  validate({ query: z.object({ merchant: z.string().trim().min(1).max(120) }) }),
  async (req, res) => {
    const { merchant } = validatedQuery<{ merchant: string }>(res);
    ok(res, { memory: await recallMerchant(currentUser(req).id, merchant) });
  },
);

/**
 * Forgets a merchant.
 *
 * The way out of a memory that learned something wrong. Without it the only cure
 * for one bad habit would be repeating the right answer until it outvoted the
 * wrong one, which is a strange thing to ask of someone who just wants their
 * petrol filed correctly.
 */
merchantRouter.delete(
  '/',
  validate({ body: z.object({ merchant: z.string().trim().min(1).max(120) }) }),
  async (req, res) => {
    const { merchant } = req.body as { merchant: string };
    ok(res, { forgotten: await forgetMerchant(currentUser(req).id, merchant) });
  },
);
