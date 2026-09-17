import { Router } from 'express';

import { created, noContent, ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import {
  createPersonSchema,
  listPeopleQuerySchema,
  personIdParam,
  updatePersonSchema,
  type CreatePersonInput,
  type UpdatePersonInput,
} from './people.schemas';
import {
  createPerson,
  deletePerson,
  getPeopleSummary,
  getPerson,
  listPeople,
  updatePerson,
} from './people.service';

export const peopleRouter: Router = Router();

peopleRouter.use(requireAuth);

peopleRouter.get('/summary', async (req, res) => {
  const summary = await getPeopleSummary(currentUser(req).id);
  ok(res, { summary });
});

peopleRouter.get('/', validate({ query: listPeopleQuerySchema }), async (req, res) => {
  const query = validatedQuery<{ search?: string }>(res);
  const people = await listPeople(currentUser(req).id, query.search);
  ok(res, { people });
});

peopleRouter.get('/:id', validate({ params: personIdParam }), async (req, res) => {
  const person = await getPerson(currentUser(req).id, String(req.params.id));
  ok(res, { person });
});

peopleRouter.post('/', validate({ body: createPersonSchema }), async (req, res) => {
  const person = await createPerson(currentUser(req).id, req.body as CreatePersonInput);
  created(res, { person });
});

peopleRouter.patch(
  '/:id',
  validate({ params: personIdParam, body: updatePersonSchema }),
  async (req, res) => {
    const person = await updatePerson(
      currentUser(req).id,
      String(req.params.id),
      req.body as UpdatePersonInput,
    );
    ok(res, { person });
  },
);

peopleRouter.delete('/:id', validate({ params: personIdParam }), async (req, res) => {
  await deletePerson(currentUser(req).id, String(req.params.id));
  noContent(res);
});
