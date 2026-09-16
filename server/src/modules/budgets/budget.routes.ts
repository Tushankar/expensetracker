import { Router } from 'express';

import { created, noContent, ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import {
  budgetIdParam,
  createBudgetSchema,
  monthQuerySchema,
  updateBudgetSchema,
  type CreateBudgetInput,
  type MonthQuery,
  type UpdateBudgetInput,
} from './budget.schemas';
import { createBudget, deleteBudget, getBudgetSummary, updateBudget } from './budget.service';

export const budgetRouter: Router = Router();

budgetRouter.use(requireAuth);

/**
 * Budgets and their progress in one response.
 *
 * There is no bare "list the budgets" endpoint: a cap without what has been
 * spent against it is not something any screen wants to show, and splitting them
 * would make every client do two round trips and then join them by hand.
 */
budgetRouter.get('/', validate({ query: monthQuerySchema }), async (req, res) => {
  const { month } = validatedQuery<MonthQuery>(res);
  ok(res, { summary: await getBudgetSummary(currentUser(req).id, month) });
});

budgetRouter.post('/', validate({ body: createBudgetSchema }), async (req, res) => {
  const budget = await createBudget(currentUser(req).id, req.body as CreateBudgetInput);
  created(res, { budget });
});

budgetRouter.patch(
  '/:id',
  validate({ params: budgetIdParam, body: updateBudgetSchema }),
  async (req, res) => {
    const budget = await updateBudget(
      currentUser(req).id,
      String(req.params.id),
      req.body as UpdateBudgetInput,
    );
    ok(res, { budget });
  },
);

budgetRouter.delete('/:id', validate({ params: budgetIdParam }), async (req, res) => {
  await deleteBudget(currentUser(req).id, String(req.params.id));
  noContent(res);
});
