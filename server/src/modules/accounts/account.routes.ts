import { Router } from 'express';

import { created, ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import {
  createAccountSchema,
  idParam,
  listAccountsSchema,
  updateAccountSchema,
  type CreateAccountInput,
  type ListAccountsQuery,
  type UpdateAccountInput,
} from './account.schemas';
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from './account.service';

export const accountRouter: Router = Router();

accountRouter.use(requireAuth);

accountRouter.get('/', validate({ query: listAccountsSchema }), async (req, res) => {
  const { includeArchived } = validatedQuery<ListAccountsQuery>(res);
  ok(res, { accounts: await listAccounts(currentUser(req).id, includeArchived) });
});

accountRouter.post('/', validate({ body: createAccountSchema }), async (req, res) => {
  const account = await createAccount(currentUser(req).id, req.body as CreateAccountInput);
  created(res, { account });
});

accountRouter.get('/:id', validate({ params: idParam }), async (req, res) => {
  ok(res, { account: await getAccount(currentUser(req).id, String(req.params.id)) });
});

accountRouter.patch(
  '/:id',
  validate({ params: idParam, body: updateAccountSchema }),
  async (req, res) => {
    const account = await updateAccount(
      currentUser(req).id,
      String(req.params.id),
      req.body as UpdateAccountInput,
    );
    ok(res, { account });
  },
);

accountRouter.delete('/:id', validate({ params: idParam }), async (req, res) => {
  // The result says which of the two happened so the client can word the toast
  // correctly — "Account deleted" and "Account archived" are different promises.
  ok(res, await deleteAccount(currentUser(req).id, String(req.params.id)));
});
