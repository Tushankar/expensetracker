import { z } from 'zod';

const isoDate = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'Not a valid date',
});

/**
 * The window, and the window to compare it against.
 *
 * The previous window is supplied by the caller rather than derived here,
 * because the app already computes it for the dashboard and the two must agree
 * about what "before this" means — a week compares with the week before, a
 * custom range with the same number of days before it. Deriving it twice is how
 * the two ends up disagreeing.
 */
export const overviewSchema = z
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
  })
  .refine((value) => value.to.getTime() - value.from.getTime() <= 400 * 86_400_000, {
    message: 'Ask for at most a year at a time',
    path: ['to'],
  });

export const trendSchema = z.object({
  months: z.coerce.number().int().min(2).max(24).default(6),
});

export type OverviewQuery = z.infer<typeof overviewSchema>;
export type TrendQuery = z.infer<typeof trendSchema>;
