import { z } from 'zod';

import { objectId } from '../accounts/account.schemas';
import { PAYMENT_METHODS } from '../transactions/transaction.model';
import { RECURRENCE_UNITS } from './recurring.model';

const amount = z
  .number()
  .int('Amounts are in whole paise')
  .positive('Enter an amount greater than zero')
  .max(100_000_000_000, 'That amount is too large');

const isoDate = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'Not a valid date',
});

/**
 * The schedule, as a unit and an interval.
 *
 * "Monthly", "weekly" and "yearly" are `{month,1}`, `{week,1}` and `{year,1}`;
 * a custom schedule is any other pair. One representation means every code path
 * that advances a date is the same code path, which is the one place this kind of
 * feature usually grows four subtly different implementations.
 */
const schedule = {
  unit: z.enum(RECURRENCE_UNITS),
  interval: z.coerce.number().int().min(1).max(365).default(1),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  maxOccurrences: z.coerce.number().int().min(1).max(1000).nullable().optional(),
  autoCreate: z.boolean().default(true),
};

const common = {
  name: z.string().trim().min(1, 'Give it a name').max(120),
  amount,
  accountId: objectId,
  description: z.string().trim().max(500).default(''),
  paymentMethod: z.enum(PAYMENT_METHODS).default('upi'),
  ...schedule,
};

/** Same three shapes as a transaction, for the same reasons. */
export const createRecurringSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('expense'), categoryId: objectId, ...common }),
  z.object({ type: z.literal('income'), categoryId: objectId, ...common }),
  z.object({ type: z.literal('transfer'), destinationAccountId: objectId, ...common }),
]);

/**
 * The type is fixed, exactly as it is for a transaction: changing an expense rule
 * into a transfer changes which fields are required and which balances move, and
 * is clearer as a delete and a re-create.
 */
export const updateRecurringSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    amount: amount.optional(),
    accountId: objectId.optional(),
    destinationAccountId: objectId.optional(),
    categoryId: objectId.optional(),
    description: z.string().trim().max(500).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    unit: z.enum(RECURRENCE_UNITS).optional(),
    interval: z.coerce.number().int().min(1).max(365).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.nullable().optional(),
    maxOccurrences: z.coerce.number().int().min(1).max(1000).nullable().optional(),
    autoCreate: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const pauseSchema = z.object({ paused: z.boolean() });

export const listRecurringSchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const recurringIdParam = z.object({ id: objectId });

export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;
export type UpdateRecurringInput = z.infer<typeof updateRecurringSchema>;
export type ListRecurringQuery = z.infer<typeof listRecurringSchema>;
