import { z } from 'zod';

import { objectId, paise } from '../accounts/account.schemas';

const isoDate = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'Not a valid date',
});

/**
 * The window every AI endpoint works over.
 *
 * Supplied by the client rather than assumed, so the assistant always talks
 * about the period the user is looking at — asking "how much did I spend" while
 * the dashboard shows last month should not silently answer for this one.
 */
export const aiPeriodSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    previousFrom: isoDate.optional(),
    previousTo: isoDate.optional(),
    label: z.string().trim().max(60).default('this period'),
  })
  .refine((value) => value.from <= value.to, {
    message: 'The start date must come before the end date',
    path: ['from'],
  });

export const askSchema = aiPeriodSchema.safeExtend({
  question: z.string().trim().min(2, 'Ask a question').max(400),
});

/**
 * One line of typed shorthand.
 *
 * Capped well below the question limit: this is "Petrol 1200", not a paragraph.
 * Anything longer is a note that wandered into the wrong field, and parsing it
 * would produce a confident reading of nothing in particular.
 */
export const quickParseSchema = z.object({
  text: z.string().trim().min(1, 'Type something like: Petrol 1200').max(160),
  type: z.enum(['expense', 'income']).default('expense'),
});

export type QuickParseInput = z.infer<typeof quickParseSchema>;

export const categoriseSchema = z.object({
  merchant: z.string().trim().min(1, 'Give a merchant or description').max(120),
  description: z.string().trim().max(200).optional(),
  amount: paise.optional(),
  type: z.enum(['expense', 'income']).default('expense'),
});

export const chatHistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const messageIdParam = z.object({ id: objectId });

export type AiPeriodQuery = z.infer<typeof aiPeriodSchema>;
export type AskInput = z.infer<typeof askSchema>;
export type CategoriseInput = z.infer<typeof categoriseSchema>;
export type ChatHistoryQuery = z.infer<typeof chatHistorySchema>;
