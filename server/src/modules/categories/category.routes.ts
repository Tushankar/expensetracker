import { Router } from 'express';

import { created, ok } from '../../lib/response';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';

import {
  categoryIdParam,
  createCategorySchema,
  listCategoriesSchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type ListCategoriesQuery,
  type UpdateCategoryInput,
} from './category.schemas';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from './category.service';

export const categoryRouter: Router = Router();

categoryRouter.use(requireAuth);

categoryRouter.get('/', validate({ query: listCategoriesSchema }), async (req, res) => {
  const query = validatedQuery<ListCategoriesQuery>(res);
  const categories = await listCategories(currentUser(req).id, query);
  // The client renders a sectioned picker, and computing the group order here
  // keeps that from being rebuilt on every keystroke of the search field.
  const groups = [...new Set(categories.map((category) => category.group))];
  ok(res, { categories, groups });
});

categoryRouter.post('/', validate({ body: createCategorySchema }), async (req, res) => {
  const category = await createCategory(currentUser(req).id, req.body as CreateCategoryInput);
  created(res, { category });
});

categoryRouter.patch(
  '/:id',
  validate({ params: categoryIdParam, body: updateCategorySchema }),
  async (req, res) => {
    const category = await updateCategory(
      currentUser(req).id,
      String(req.params.id),
      req.body as UpdateCategoryInput,
    );
    ok(res, { category });
  },
);

categoryRouter.delete('/:id', validate({ params: categoryIdParam }), async (req, res) => {
  ok(res, await deleteCategory(currentUser(req).id, String(req.params.id)));
});
