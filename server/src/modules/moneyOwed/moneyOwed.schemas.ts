import { z } from 'zod';
import {
  OBLIGATION_DIRECTIONS,
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
} from './moneyOwed.model';

export const createMoneyOwedSchema = z.object({
  personId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid person id').optional(),
  personName: z.string().trim().min(1, 'Person name is required').max(100).optional(),
  direction: z.enum(OBLIGATION_DIRECTIONS),
  type: z.enum(OBLIGATION_TYPES).default('loan'),
  amount: z.number().int('Amount must be in integer paise').min(1, 'Amount must be positive'),
  purpose: z.string().trim().min(1, 'Purpose is required').max(200),
  categoryId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid category id').optional().nullable(),
  accountId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid account id'),
  dueDate: z
    .string()
    .datetime({ offset: true })
    .transform((iso) => new Date(iso))
    .optional()
    .nullable(),
  note: z.string().trim().max(500).optional(),
}).refine((data) => data.personId || data.personName, {
  message: 'Either personId or personName must be provided',
  path: ['personId'],
});

export const updateMoneyOwedSchema = z.object({
  purpose: z.string().trim().min(1).max(200).optional(),
  dueDate: z
    .string()
    .datetime({ offset: true })
    .transform((iso) => new Date(iso))
    .optional()
    .nullable(),
  note: z.string().trim().max(500).optional(),
});

export const moneyOwedIdParam = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid obligation id'),
});

export const listMoneyOwedQuerySchema = z.object({
  personId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  direction: z.enum(OBLIGATION_DIRECTIONS).optional(),
  status: z.enum(OBLIGATION_STATUSES).optional(),
});

export const recordRepaymentSchema = z.object({
  amount: z.number().int('Amount must be in integer paise').min(1, 'Amount must be positive'),
  accountId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid account id'),
  date: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((iso) => (iso ? new Date(iso) : new Date())),
  note: z.string().trim().max(500).optional(),
});

export const writeOffSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type CreateMoneyOwedInput = z.infer<typeof createMoneyOwedSchema>;
export type UpdateMoneyOwedInput = z.infer<typeof updateMoneyOwedSchema>;
export type RecordRepaymentInput = z.infer<typeof recordRepaymentSchema>;
export type WriteOffInput = z.infer<typeof writeOffSchema>;
export type ListMoneyOwedQuery = z.infer<typeof listMoneyOwedQuerySchema>;
