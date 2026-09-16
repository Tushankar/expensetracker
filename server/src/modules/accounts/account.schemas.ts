import { z } from 'zod';

import { ACCOUNT_TYPES } from './account.model';

/** A 24-character hex ObjectId. Rejecting early keeps CastErrors out of the services. */
export const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id');

export const idParam = z.object({ id: objectId });

/**
 * Integer paise. Rupees never reach the API: a float is the wrong type for money,
 * and "is this rupees or paise" is the kind of ambiguity that produces a ledger
 * out by a factor of 100 somewhere in month four.
 */
export const paise = z
  .number()
  .int('Amounts are in whole paise')
  .finite()
  // ±₹1,00,00,00,000. Comfortably past any real balance, and short of the point
  // where a double stops representing integers exactly.
  .min(-100_000_000_000)
  .max(100_000_000_000);

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex colour like #7856F0');

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Give the account a name').max(60),
  type: z.enum(ACCOUNT_TYPES),
  /**
   * The balance the account has *today*. Every later change comes from a
   * transaction — there is deliberately no way to set a balance directly after
   * creation, because a balance that can be edited by hand is a balance that
   * stops matching the transactions under it.
   */
  balance: paise.default(0),
  currency: z.string().trim().toUpperCase().length(3).default('INR'),
  icon: z.string().trim().min(1).max(40).default('wallet'),
  color: hexColor.default('#7856F0'),
  institution: z.string().trim().max(60).optional(),
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Expected the last four digits')
    .optional(),
});

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    type: z.enum(ACCOUNT_TYPES).optional(),
    icon: z.string().trim().min(1).max(40).optional(),
    color: hexColor.optional(),
    institution: z.string().trim().max(60).nullable().optional(),
    last4: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Expected the last four digits')
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const listAccountsSchema = z.object({
  /** Archived accounts are hidden unless asked for — history still references them. */
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ListAccountsQuery = z.infer<typeof listAccountsSchema>;
