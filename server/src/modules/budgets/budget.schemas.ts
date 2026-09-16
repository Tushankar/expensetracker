import { z } from 'zod';

import { objectId, paise } from '../accounts/account.schemas';

/** A cap of zero is a category you cannot spend in, which nobody means. */
const budgetAmount = paise.refine((value) => value > 0, 'Enter an amount greater than zero');

const warnAtPercent = z.coerce.number().int().min(50).max(99).default(80);

/**
 * Two shapes, not one with an optional `categoryId`: an overall budget with a
 * category is meaningless, and a category budget without one cannot be applied.
 * A discriminated union rejects both at the edge instead of leaving the service
 * to guess.
 */
export const createBudgetSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('overall'),
    amount: budgetAmount,
    warnAtPercent,
  }),
  z.object({
    scope: z.literal('category'),
    categoryId: objectId,
    amount: budgetAmount,
    warnAtPercent,
  }),
]);

/**
 * The scope and the category are fixed once set. Moving a budget from Food to
 * Transport is two different budgets with two different histories — clearer as a
 * delete and a create than as a patch that silently rewrites what a month meant.
 */
export const updateBudgetSchema = z
  .object({
    amount: budgetAmount.optional(),
    warnAtPercent: z.coerce.number().int().min(50).max(99).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

/** `YYYY-MM`, as the client's own local month. */
export const monthQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a month like 2026-09')
    .optional(),
});

export const budgetIdParam = z.object({ id: objectId });

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type MonthQuery = z.infer<typeof monthQuerySchema>;
