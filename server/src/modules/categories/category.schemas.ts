import { z } from 'zod';

import { objectId } from '../accounts/account.schemas';
import { CATEGORY_TYPES } from './category.model';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Give the category a name').max(60),
  group: z.string().trim().min(1, 'Pick a group').max(60),
  type: z.enum(CATEGORY_TYPES).default('expense'),
  icon: z.string().trim().min(1).max(40).default('circle'),
  /** A hue key from the mobile palette, e.g. `food`. The client resolves it. */
  color: z.string().trim().min(1).max(24).default('other'),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    group: z.string().trim().min(1).max(60).optional(),
    icon: z.string().trim().min(1).max(40).optional(),
    color: z.string().trim().min(1).max(24).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const listCategoriesSchema = z.object({
  type: z.enum(CATEGORY_TYPES).optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const categoryIdParam = z.object({ id: objectId });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesSchema>;
