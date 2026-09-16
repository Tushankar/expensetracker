import { Router } from 'express';

import { created, noContent, ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import {
  createTransactionSchema,
  listTransactionsSchema,
  dailySchema,
  summarySchema,
  transactionIdParam,
  updateTransactionSchema,
  type CreateTransactionInput,
  type DailyQuery,
  type ListTransactionsQuery,
  type SummaryQuery,
  type UpdateTransactionInput,
} from './transaction.schemas';
import {
  createTransaction,
  deleteTransaction,
  getDailySpend,
  getSummary,
  getTransaction,
  listTransactions,
  updateTransaction,
} from './transaction.service';

export const transactionRouter: Router = Router();

transactionRouter.use(requireAuth);

transactionRouter.get('/', validate({ query: listTransactionsSchema }), async (req, res) => {
  const query = validatedQuery<ListTransactionsQuery>(res);
  const { transactions, meta } = await listTransactions(currentUser(req).id, query);
  ok(res, { transactions }, meta);
});

/**
 * Declared before `/:id`, or Express matches "summary" as an id and the route is
 * unreachable.
 */
transactionRouter.get('/summary', validate({ query: summarySchema }), async (req, res) => {
  const { from, to } = validatedQuery<SummaryQuery>(res);
  ok(res, { summary: await getSummary(currentUser(req).id, { from, to }) });
});

/**
 * Spend per day, for the calendar and the trend strip. Also before `/:id`.
 *
 * Requires an explicit range rather than defaulting to "this month": the caller
 * is drawing a specific window and the server should not guess which.
 */
transactionRouter.get('/daily', validate({ query: dailySchema }), async (req, res) => {
  const { from, to } = validatedQuery<DailyQuery>(res);
  ok(res, { days: await getDailySpend(currentUser(req).id, { from, to }) });
});

transactionRouter.post('/', validate({ body: createTransactionSchema }), async (req, res) => {
  const transaction = await createTransaction(
    currentUser(req).id,
    req.body as CreateTransactionInput,
  );
  created(res, { transaction });
});

transactionRouter.get('/:id', validate({ params: transactionIdParam }), async (req, res) => {
  ok(res, { transaction: await getTransaction(currentUser(req).id, String(req.params.id)) });
});

transactionRouter.patch(
  '/:id',
  validate({ params: transactionIdParam, body: updateTransactionSchema }),
  async (req, res) => {
    const transaction = await updateTransaction(
      currentUser(req).id,
      String(req.params.id),
      req.body as UpdateTransactionInput,
    );
    ok(res, { transaction });
  },
);

transactionRouter.delete('/:id', validate({ params: transactionIdParam }), async (req, res) => {
  await deleteTransaction(currentUser(req).id, String(req.params.id));
  noContent(res);
});
