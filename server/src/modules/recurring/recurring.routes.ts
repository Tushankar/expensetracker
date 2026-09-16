import { Router } from 'express';
import { z } from 'zod';

import { created, noContent, ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import {
  createRecurringSchema,
  listRecurringSchema,
  pauseSchema,
  recurringIdParam,
  updateRecurringSchema,
  type CreateRecurringInput,
  type ListRecurringQuery,
  type UpdateRecurringInput,
} from './recurring.schemas';
import {
  createRecurring,
  deleteRecurring,
  getRecurring,
  listRecurring,
  listUpcoming,
  setPaused,
  updateRecurring,
} from './recurring.service';
import { runDueRecurring } from './recurring.scheduler';

export const recurringRouter: Router = Router();

recurringRouter.use(requireAuth);

recurringRouter.get('/', validate({ query: listRecurringSchema }), async (req, res) => {
  const { includeInactive } = validatedQuery<ListRecurringQuery>(res);
  ok(res, { recurring: await listRecurring(currentUser(req).id, { includeInactive }) });
});

const upcomingSchema = z.object({
  withinDays: z.coerce.number().int().min(1).max(90).default(14),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

/** Declared before `/:id`, or Express reads "upcoming" as an id. */
recurringRouter.get('/upcoming', validate({ query: upcomingSchema }), async (req, res) => {
  const { withinDays, limit } = validatedQuery<z.infer<typeof upcomingSchema>>(res);
  ok(res, { recurring: await listUpcoming(currentUser(req).id, withinDays, limit) });
});

/**
 * Forces a scheduler pass.
 *
 * The timer runs this anyway; the endpoint exists so the integration tests can
 * make a rule fire without waiting for a tick, and so a stuck deployment can be
 * nudged without a restart. It is safe to call at any time — a pass that finds
 * nothing due does nothing.
 */
recurringRouter.post('/run', async (_req, res) => {
  ok(res, { result: await runDueRecurring() });
});

recurringRouter.post('/', validate({ body: createRecurringSchema }), async (req, res) => {
  const rule = await createRecurring(currentUser(req).id, req.body as CreateRecurringInput);
  created(res, { recurring: rule });
});

recurringRouter.get('/:id', validate({ params: recurringIdParam }), async (req, res) => {
  ok(res, { recurring: await getRecurring(currentUser(req).id, String(req.params.id)) });
});

recurringRouter.patch(
  '/:id',
  validate({ params: recurringIdParam, body: updateRecurringSchema }),
  async (req, res) => {
    const rule = await updateRecurring(
      currentUser(req).id,
      String(req.params.id),
      req.body as UpdateRecurringInput,
    );
    ok(res, { recurring: rule });
  },
);

recurringRouter.post(
  '/:id/pause',
  validate({ params: recurringIdParam, body: pauseSchema }),
  async (req, res) => {
    const { paused } = req.body as z.infer<typeof pauseSchema>;
    const rule = await setPaused(currentUser(req).id, String(req.params.id), paused);
    ok(res, { recurring: rule });
  },
);

recurringRouter.delete('/:id', validate({ params: recurringIdParam }), async (req, res) => {
  await deleteRecurring(currentUser(req).id, String(req.params.id));
  noContent(res);
});
