import { z } from 'zod';

import { objectId } from '../accounts/account.schemas';
import { PAYMENT_METHODS, TRANSACTION_TYPES } from './transaction.model';

/** Integer paise, strictly positive. `type` carries the direction, never the sign. */
const amount = z
  .number()
  .int('Amounts are in whole paise')
  .positive('Enter an amount greater than zero')
  .max(100_000_000_000, 'That amount is too large');

/** Accepts an ISO string or an epoch in milliseconds; defaults to now. */
const isoDate = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'Not a valid date',
});

const baseFields = {
  amount,
  accountId: objectId,
  merchant: z.string().trim().max(120).default(''),
  description: z.string().trim().max(500).default(''),
  paymentMethod: z.enum(PAYMENT_METHODS).default('upi'),
  date: isoDate.default(() => new Date()),
};

/**
 * Three shapes, not one shape with optional fields.
 *
 * A transfer with a `categoryId`, or an expense with a `destinationAccountId`, is
 * not a slightly-wrong request — it is a request that means nothing. A
 * discriminated union rejects both at the edge, so no service function downstream
 * has to ask "is this field meaningful for this type" and no row can be written in
 * a state the app cannot render.
 *
 * Note what is *not* here: `userId`. There is no field on any write schema that
 * lets a client say who they are. Identity comes from the access token and nothing
 * else, and `validate()` strips unknown keys, so sending one is a no-op rather than
 * an escalation.
 */
export const createTransactionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('expense'),
    categoryId: objectId,
    ...baseFields,
  }),
  z.object({
    type: z.literal('income'),
    categoryId: objectId,
    ...baseFields,
  }),
  z.object({
    type: z.literal('transfer'),
    /**
     * Moving your own money between your own accounts is not spending and not
     * earning, so it has no spending category. Forbidding the field is what keeps
     * a transfer out of every category total by construction rather than by every
     * aggregation remembering to exclude it.
     */
    destinationAccountId: objectId,
    ...baseFields,
  }),
]);

/**
 * Editing keeps the transaction's type. Changing an expense into a transfer means
 * a different set of required fields and a different pair of balance effects —
 * clearer as a delete and a re-add than as a patch that silently rewrites three
 * accounts.
 */
export const updateTransactionSchema = z
  .object({
    amount: amount.optional(),
    accountId: objectId.optional(),
    destinationAccountId: objectId.optional(),
    categoryId: objectId.optional(),
    merchant: z.string().trim().max(120).optional(),
    description: z.string().trim().max(500).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    date: isoDate.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

const listSort = z.enum(['date', '-date', 'amount', '-amount', 'createdAt', '-createdAt']);

export const listTransactionsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    // Capped so one client cannot ask for a month of rows and stall the pool.
    limit: z.coerce.number().int().min(1).max(100).default(25),
    type: z.enum(TRANSACTION_TYPES).optional(),
    accountId: objectId.optional(),
    categoryId: objectId.optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    /** Free text over merchant and description. */
    q: z.string().trim().max(120).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    minAmount: z.coerce.number().int().nonnegative().optional(),
    maxAmount: z.coerce.number().int().nonnegative().optional(),
    sort: listSort.default('-date'),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The start date must come before the end date',
    path: ['from'],
  })
  .refine(
    (value) =>
      value.minAmount === undefined ||
      value.maxAmount === undefined ||
      value.minAmount <= value.maxAmount,
    { message: 'The minimum must be below the maximum', path: ['minAmount'] },
  );

export const summarySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** The calendar always draws a known window, so both ends are required. */
export const dailySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((value) => value.from <= value.to, {
    message: 'The start date must come before the end date',
    path: ['from'],
  })
  .refine((value) => value.to.getTime() - value.from.getTime() <= 400 * 86_400_000, {
    // A year and a bit. Past that the grouping is cheap but the response is not,
    // and no screen draws more than a year of days at once.
    message: 'Ask for at most a year at a time',
    path: ['to'],
  });

/**
 * An export names its own window explicitly.
 *
 * No defaults: "export my transactions" with an implied range is how someone ends
 * up with a file covering this month when they wanted the year, and finds out
 * after they have closed the account. Five years is the outer bound — long enough
 * to be a real backup, short enough that one request cannot build a hundred
 * megabytes of CSV in memory.
 */
export const exportSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((value) => value.from <= value.to, {
    message: 'The start date must come before the end date',
    path: ['from'],
  })
  .refine((value) => value.to.getTime() - value.from.getTime() <= 5 * 366 * 86_400_000, {
    message: 'Export at most five years at a time',
    path: ['to'],
  });

export const transactionIdParam = z.object({ id: objectId });

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsSchema>;
export type SummaryQuery = z.infer<typeof summarySchema>;
export type ExportQuery = z.infer<typeof exportSchema>;
export type DailyQuery = z.infer<typeof dailySchema>;
