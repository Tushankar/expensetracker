import { Router } from 'express';

import { created, noContent, ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import {
  createMoneyOwedSchema,
  listMoneyOwedQuerySchema,
  moneyOwedIdParam,
  recordRepaymentSchema,
  updateMoneyOwedSchema,
  writeOffSchema,
  type CreateMoneyOwedInput,
  type ListMoneyOwedQuery,
  type RecordRepaymentInput,
  type UpdateMoneyOwedInput,
  type WriteOffInput,
} from './moneyOwed.schemas';
import {
  createMoneyOwed,
  deleteMoneyOwed,
  getMoneyOwed,
  listMoneyOwed,
  listRepayments,
  recordRepayment,
  updateMoneyOwed,
  writeOffObligation,
} from './moneyOwed.service';

export const moneyOwedRouter: Router = Router();

moneyOwedRouter.use(requireAuth);

moneyOwedRouter.get('/', validate({ query: listMoneyOwedQuerySchema }), async (req, res) => {
  const query = validatedQuery<ListMoneyOwedQuery>(res);
  const obligations = await listMoneyOwed(currentUser(req).id, query);
  ok(res, { obligations });
});

moneyOwedRouter.get('/:id', validate({ params: moneyOwedIdParam }), async (req, res) => {
  const obligation = await getMoneyOwed(currentUser(req).id, String(req.params.id));
  ok(res, { obligation });
});

moneyOwedRouter.post('/', validate({ body: createMoneyOwedSchema }), async (req, res) => {
  const obligation = await createMoneyOwed(currentUser(req).id, req.body as CreateMoneyOwedInput);
  created(res, { obligation });
});

moneyOwedRouter.patch(
  '/:id',
  validate({ params: moneyOwedIdParam, body: updateMoneyOwedSchema }),
  async (req, res) => {
    const obligation = await updateMoneyOwed(
      currentUser(req).id,
      String(req.params.id),
      req.body as UpdateMoneyOwedInput,
    );
    ok(res, { obligation });
  },
);

moneyOwedRouter.delete('/:id', validate({ params: moneyOwedIdParam }), async (req, res) => {
  await deleteMoneyOwed(currentUser(req).id, String(req.params.id));
  noContent(res);
});

moneyOwedRouter.post(
  '/:id/repayments',
  validate({ params: moneyOwedIdParam, body: recordRepaymentSchema }),
  async (req, res) => {
    const result = await recordRepayment(
      currentUser(req).id,
      String(req.params.id),
      req.body as RecordRepaymentInput,
    );
    created(res, result);
  },
);

moneyOwedRouter.get('/:id/repayments', validate({ params: moneyOwedIdParam }), async (req, res) => {
  const repayments = await listRepayments(currentUser(req).id, String(req.params.id));
  ok(res, { repayments });
});

moneyOwedRouter.post(
  '/:id/write-off',
  validate({ params: moneyOwedIdParam, body: writeOffSchema.optional() }),
  async (req, res) => {
    const body = req.body as WriteOffInput | undefined;
    const obligation = await writeOffObligation(
      currentUser(req).id,
      String(req.params.id),
      body?.note,
    );
    ok(res, { obligation });
  },
);
