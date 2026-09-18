import type { CategorySlice, Paise } from '@/types/models';

/**
 * The bands the spending donut names before everything else folds into "Others".
 *
 * A fixed count reads the same way month to month, which a top-N-that-varies list
 * would not: five arcs in September and nine in October look like a different
 * chart rather than a different month.
 */
export const HEADLINE_SLICES = 5;

/** A category total, already largest-first, with its colour resolved. */
export type BreakdownEntry = {
  key: string;
  label: string;
  color: string;
  amount: Paise;
  /** The category's group, carried through for the legend's second line. */
  group?: string;
  /** Icon name from the registry, carried through for the legend's avatar. */
  icon?: string;
};

export type BreakdownOptions = {
  /** The colour for the folded band. Resolved by the caller, which has the theme. */
  othersColor: string;
  headlineCount?: number;
};

/**
 * Turns category totals into donut slices, with one honest "Others" band.
 *
 * The remainder is computed from the period's real total rather than by summing
 * the tail, because the two are not the same thing. The analytics endpoint
 * returns only the top handful of categories, so the entries it hands over add up
 * to less than the month did — and a chart whose slices sum to 100% of a number
 * that is not the total is the most convincing way to be wrong. Taking the
 * remainder from the total means whatever the server left out still shows up.
 *
 * Shares are fractions of `total`, so they are comparable across periods and
 * cannot drift from the figure printed beside them.
 *
 * Deliberately free of any theme import: it is pure arithmetic over numbers the
 * server produced, and keeping it that way is what lets it be unit-tested outside
 * a React Native runtime.
 */
export function toBreakdown(
  total: Paise,
  entries: readonly BreakdownEntry[],
  { othersColor, headlineCount = HEADLINE_SLICES }: BreakdownOptions,
): CategorySlice[] {
  if (total <= 0 || entries.length === 0) return [];

  const headline = entries.slice(0, headlineCount).map((entry) => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
    amount: entry.amount,
    share: entry.amount / total,
    group: entry.group,
    icon: entry.icon,
  }));

  const accounted = headline.reduce((sum, slice) => sum + slice.amount, 0);
  const rest = total - accounted;
  // A rounding difference of a few paise is not a category.
  if (rest <= 0) return headline;

  return [
    ...headline,
    { key: 'others', label: 'Others', color: othersColor, amount: rest, share: rest / total },
  ];
}
