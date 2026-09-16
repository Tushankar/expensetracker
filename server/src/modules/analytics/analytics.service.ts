import { Types } from 'mongoose';

import {
  dayKey,
  monthKey,
  monthRangeFromKey,
  zoneOrDefault,
} from '../../lib/time';
import { getBudgetSummary, type BudgetSummary } from '../budgets/budget.service';
import { TransactionModel } from '../transactions/transaction.model';
import { UserModel } from '../users/user.model';

/**
 * Every figure the dashboard and the assistant are allowed to state.
 *
 * This is the only place financial numbers are produced. The AI layer receives
 * this object already computed and is forbidden from doing arithmetic on it —
 * see `ai/ai.guard.ts`, which rejects any figure in a generated reply that is not
 * present here. That is why the shape carries so many derived values: deltas,
 * shares, averages. Anything the assistant might want to say has to exist as a
 * number this service calculated, or it cannot be said at all.
 */
export type AnalyticsOverview = {
  period: { from: string; to: string; label: string; days: number; elapsedDays: number };

  totalIncome: number;
  totalExpenses: number;
  /** income − expenses. Can be negative. Transfers are in neither. */
  savings: number;
  /** Percentage of income kept, 0–100. Null when there was no income to keep. */
  savingsRate: number | null;
  /** Moved between the user's own accounts. Neither income nor spending. */
  transferred: number;

  transactionCount: number;
  expenseCount: number;

  /**
   * Spending divided by the days that have actually happened, not the days the
   * period contains. Dividing a half-finished month by 30 understates it by half
   * and makes every projection wrong.
   */
  averageDailySpend: number;
  /** Today's rate carried to the end of the period. Null once the period is over. */
  projectedTotal: number | null;

  topCategories: CategoryTotal[];
  /** The single largest category, or null when nothing was spent. */
  highestCategory: CategoryTotal | null;
  largestExpenses: LargeTransaction[];

  monthlyComparison: PeriodComparison;
  /** Per-category movement against the previous window, biggest change first. */
  categoryChanges: CategoryChange[];

  weekly: Bucket[];
  daily: Bucket[];

  budgetStatus: BudgetStatus;
};

export type CategoryTotal = {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  amount: number;
  count: number;
  /** 0–100 share of the period's spending. */
  share: number;
};

export type LargeTransaction = {
  id: string;
  amount: number;
  merchant: string;
  categoryName: string | null;
  date: string;
};

export type PeriodComparison = {
  previousFrom: string;
  previousTo: string;
  previousIncome: number;
  previousExpenses: number;
  /** current − previous. Positive means more was spent. */
  expenseChange: number;
  incomeChange: number;
  /** Percentage change, or null when the previous window was empty. */
  expenseChangePercent: number | null;
  incomeChangePercent: number | null;
  direction: 'up' | 'down' | 'flat';
};

export type CategoryChange = {
  categoryId: string | null;
  name: string;
  current: number;
  previous: number;
  /** current − previous. */
  change: number;
  changePercent: number | null;
};

export type Bucket = {
  /** `YYYY-MM-DD` for a day, `YYYY-Www` for a week, `YYYY-MM` for a month. */
  key: string;
  label: string;
  expense: number;
  income: number;
  count: number;
};

export type BudgetStatus = {
  month: string;
  hasBudgets: boolean;
  totalBudgeted: number;
  totalSpent: number;
  overallPercent: number | null;
  onTrack: number;
  warning: number;
  exceeded: number;
  /** Named so the assistant can talk about them without guessing. */
  exceededNames: string[];
  warningNames: string[];
};

type Range = { from: Date; to: Date };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

async function timezoneOf(userId: string): Promise<string> {
  const user = await UserModel.findById(userId).select('timezone').lean();
  return zoneOrDefault(user?.timezone);
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/**
 * One trip to the database for everything scoped to the period.
 *
 * `$facet` runs each branch against the same already-matched set, so the totals,
 * the category split, the largest expenses and both time series cost one pass
 * over one index range rather than five separate queries hitting it five times.
 */
type FacetResult = {
  totals: { _id: string; amount: number; count: number }[];
  byCategory: { _id: Types.ObjectId | null; amount: number; count: number }[];
  largest: {
    _id: Types.ObjectId;
    amount: number;
    merchant: string;
    categoryId: Types.ObjectId | null;
    date: Date;
  }[];
  daily: { _id: string; expense: number; income: number; count: number }[];
  weekly: { _id: string; expense: number; income: number; count: number }[];
};

async function facetForRange(
  userId: Types.ObjectId,
  range: Range,
  timezone: string,
): Promise<FacetResult> {
  const [result] = await TransactionModel.aggregate<FacetResult>([
    { $match: { userId, date: { $gte: range.from, $lte: range.to } } },
    {
      $facet: {
        totals: [
          { $group: { _id: '$type', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        ],
        byCategory: [
          { $match: { type: 'expense' } },
          { $group: { _id: '$categoryId', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
          { $sort: { amount: -1 } },
        ],
        largest: [
          { $match: { type: 'expense' } },
          { $sort: { amount: -1 } },
          { $limit: 5 },
          { $project: { amount: 1, merchant: 1, categoryId: 1, date: 1 } },
        ],
        daily: [
          { $match: { type: { $in: ['expense', 'income'] } } },
          {
            $group: {
              // Bucketed in the user's zone, in the database. A 10pm purchase
              // belongs to that evening, not to the next morning in UTC.
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone } },
              expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
              income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        weekly: [
          { $match: { type: { $in: ['expense', 'income'] } } },
          {
            $group: {
              // ISO week, so a week runs Monday to Sunday — the same boundary the
              // app's own "this week" uses.
              _id: { $dateToString: { format: '%G-W%V', date: '$date', timezone } },
              expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
              income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  return (
    result ?? { totals: [], byCategory: [], largest: [], daily: [], weekly: [] }
  );
}

/** Totals only, for the previous window. Cheaper than a second full facet. */
async function totalsForRange(
  userId: Types.ObjectId,
  range: Range,
): Promise<{
  income: number;
  expenses: number;
  byCategory: Map<string, number>;
}> {
  const [rows, categories] = await Promise.all([
    TransactionModel.aggregate<{ _id: string; amount: number }>([
      { $match: { userId, date: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$type', amount: { $sum: '$amount' } } },
    ]),
    TransactionModel.aggregate<{ _id: Types.ObjectId | null; amount: number }>([
      {
        $match: {
          userId,
          type: 'expense',
          date: { $gte: range.from, $lte: range.to },
        },
      },
      { $group: { _id: '$categoryId', amount: { $sum: '$amount' } } },
    ]),
  ]);

  const find = (type: string) => rows.find((row) => row._id === type)?.amount ?? 0;

  return {
    income: find('income'),
    expenses: find('expense'),
    byCategory: new Map(
      categories.filter((row) => row._id).map((row) => [String(row._id), row.amount]),
    ),
  };
}

function weekLabel(key: string): string {
  const [, week] = key.split('-W');
  return `W${week ?? ''}`;
}

function dayLabel(key: string): string {
  const [, , day] = key.split('-');
  return String(Number(day ?? 0));
}

/**
 * The whole report for a period.
 *
 * Accepts the previous window explicitly rather than deriving it, because the app
 * already computes it for the dashboard and the two must not disagree about what
 * "last month" means — a week's comparison is the week before, a custom range's
 * is the same number of days before it.
 */
export async function getOverview(
  userId: string,
  range: Range,
  previous: Range,
  label: string,
): Promise<AnalyticsOverview> {
  const timezone = await timezoneOf(userId);
  const objectId = new Types.ObjectId(userId);
  const now = new Date();

  const [facet, previousTotals, budgets] = await Promise.all([
    facetForRange(objectId, range, timezone),
    totalsForRange(objectId, previous),
    getBudgetSummary(userId, monthKey(range.from, timezone)),
  ]);

  // ------------------------------------------------------------------ totals
  const totalOf = (type: string) => facet.totals.find((row) => row._id === type);
  const totalIncome = totalOf('income')?.amount ?? 0;
  const totalExpenses = totalOf('expense')?.amount ?? 0;
  const transferred = totalOf('transfer')?.amount ?? 0;
  const savings = totalIncome - totalExpenses;

  const transactionCount = facet.totals.reduce((sum, row) => sum + row.count, 0);
  const expenseCount = totalOf('expense')?.count ?? 0;

  // ---------------------------------------------------------------- averages
  const days = daysBetween(range.from, range.to);
  // Only the days that have happened. A month that is half over divided by 30
  // reports half the real daily rate, and every projection built on it is wrong.
  const endOfElapsed = now < range.to ? now : range.to;
  const elapsedDays = Math.max(1, Math.min(days, daysBetween(range.from, endOfElapsed)));

  const averageDailySpend = Math.round(totalExpenses / elapsedDays);
  const projectedTotal = now < range.to ? averageDailySpend * days : null;

  // -------------------------------------------------------------- categories
  const categoryIds = [
    ...new Set(
      [
        ...facet.byCategory.map((row) => row._id),
        ...facet.largest.map((row) => row.categoryId),
      ].filter((id): id is Types.ObjectId => id !== null),
    ),
  ];

  const categoryDocs = categoryIds.length
    ? await TransactionModel.db
        .collection('categories')
        .find({ _id: { $in: categoryIds } })
        .project({ name: 1, icon: 1, color: 1 })
        .toArray()
    : [];

  const categoryById = new Map(
    categoryDocs.map((doc) => [
      String(doc._id),
      { name: String(doc.name), icon: String(doc.icon), color: String(doc.color) },
    ]),
  );

  const topCategories: CategoryTotal[] = facet.byCategory.map((row) => {
    const meta = row._id ? categoryById.get(String(row._id)) : undefined;
    return {
      categoryId: row._id ? String(row._id) : null,
      name: meta?.name ?? 'Uncategorised',
      icon: meta?.icon ?? 'circle',
      color: meta?.color ?? 'other',
      amount: row.amount,
      count: row.count,
      share: totalExpenses > 0 ? Math.round((row.amount / totalExpenses) * 1000) / 10 : 0,
    };
  });

  const largestExpenses: LargeTransaction[] = facet.largest.map((row) => ({
    id: String(row._id),
    amount: row.amount,
    merchant: row.merchant || (row.categoryId ? (categoryById.get(String(row.categoryId))?.name ?? 'Expense') : 'Expense'),
    categoryName: row.categoryId ? (categoryById.get(String(row.categoryId))?.name ?? null) : null,
    date: row.date.toISOString(),
  }));

  // ------------------------------------------------------------- comparison
  const expenseChange = totalExpenses - previousTotals.expenses;
  const monthlyComparison: PeriodComparison = {
    previousFrom: previous.from.toISOString(),
    previousTo: previous.to.toISOString(),
    previousIncome: previousTotals.income,
    previousExpenses: previousTotals.expenses,
    expenseChange,
    incomeChange: totalIncome - previousTotals.income,
    expenseChangePercent: percentChange(totalExpenses, previousTotals.expenses),
    incomeChangePercent: percentChange(totalIncome, previousTotals.income),
    direction: expenseChange > 0 ? 'up' : expenseChange < 0 ? 'down' : 'flat',
  };

  // Every category that moved, in either window — a category that vanished this
  // period is as much of a change as one that appeared.
  const changeKeys = new Set([
    ...topCategories.map((entry) => entry.categoryId ?? ''),
    ...previousTotals.byCategory.keys(),
  ]);

  const categoryChanges: CategoryChange[] = [...changeKeys]
    .filter(Boolean)
    .map((id) => {
      const current = topCategories.find((entry) => entry.categoryId === id);
      const previousAmount = previousTotals.byCategory.get(id) ?? 0;
      const currentAmount = current?.amount ?? 0;
      return {
        categoryId: id,
        name: current?.name ?? categoryById.get(id)?.name ?? 'Uncategorised',
        current: currentAmount,
        previous: previousAmount,
        change: currentAmount - previousAmount,
        changePercent: percentChange(currentAmount, previousAmount),
      };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // Names for anything missing from the current period's lookup.
  const missingNames = categoryChanges.filter((entry) => entry.name === 'Uncategorised');
  if (missingNames.length > 0) {
    const docs = await TransactionModel.db
      .collection('categories')
      .find({ _id: { $in: missingNames.map((entry) => new Types.ObjectId(entry.categoryId as string)) } })
      .project({ name: 1 })
      .toArray();
    const names = new Map(docs.map((doc) => [String(doc._id), String(doc.name)]));
    for (const entry of missingNames) {
      entry.name = names.get(entry.categoryId as string) ?? entry.name;
    }
  }

  // ----------------------------------------------------------------- buckets
  const daily: Bucket[] = facet.daily.map((row) => ({
    key: row._id,
    label: dayLabel(row._id),
    expense: row.expense,
    income: row.income,
    count: row.count,
  }));

  const weekly: Bucket[] = facet.weekly.map((row) => ({
    key: row._id,
    label: weekLabel(row._id),
    expense: row.expense,
    income: row.income,
    count: row.count,
  }));

  return {
    period: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      label,
      days,
      elapsedDays,
    },
    totalIncome,
    totalExpenses,
    savings,
    savingsRate: totalIncome > 0 ? Math.round((savings / totalIncome) * 1000) / 10 : null,
    transferred,
    transactionCount,
    expenseCount,
    averageDailySpend,
    projectedTotal,
    topCategories: topCategories.slice(0, 8),
    highestCategory: topCategories[0] ?? null,
    largestExpenses,
    monthlyComparison,
    categoryChanges: categoryChanges.slice(0, 8),
    weekly,
    daily,
    budgetStatus: toBudgetStatus(budgets),
  };
}

function toBudgetStatus(summary: BudgetSummary): BudgetStatus {
  const all = [...(summary.overall ? [summary.overall] : []), ...summary.categories];

  return {
    month: summary.month,
    hasBudgets: all.length > 0,
    totalBudgeted: summary.totals.budgeted,
    totalSpent: summary.totals.spent,
    overallPercent: summary.overall?.percent ?? null,
    onTrack: all.filter((budget) => budget.state === 'on_track').length,
    warning: all.filter((budget) => budget.state === 'warning').length,
    exceeded: all.filter((budget) => budget.state === 'exceeded').length,
    exceededNames: summary.categories
      .filter((budget) => budget.state === 'exceeded')
      .map((budget) => budget.categoryName ?? 'A category'),
    warningNames: summary.categories
      .filter((budget) => budget.state === 'warning')
      .map((budget) => budget.categoryName ?? 'A category'),
  };
}

/**
 * Month-by-month totals, for the trend chart and for answering "am I spending
 * more than I used to".
 *
 * Grouped in the database by the user's local month, so the boundaries match the
 * ones every other screen uses.
 */
export async function getMonthlyTrend(
  userId: string,
  months: number,
): Promise<Bucket[]> {
  const timezone = await timezoneOf(userId);
  const objectId = new Types.ObjectId(userId);

  const now = new Date();
  const earliestKey = monthKey(
    new Date(now.getFullYear(), now.getMonth() - (months - 1), 1),
    timezone,
  );
  const { from } = monthRangeFromKey(earliestKey, timezone);

  const rows = await TransactionModel.aggregate<{
    _id: string;
    expense: number;
    income: number;
    count: number;
  }>([
    {
      $match: {
        userId: objectId,
        date: { $gte: from },
        type: { $in: ['expense', 'income'] },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone } },
        expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } },
        income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byKey = new Map(rows.map((row) => [row._id, row]));

  // Zero-filled, because a gap in a trend chart reads as missing data rather
  // than as a month where nothing happened.
  const series: Bucket[] = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = monthKey(date, timezone);
    const row = byKey.get(key);
    series.push({
      key,
      label: (MONTHS[date.getMonth()] ?? '').slice(0, 3),
      expense: row?.expense ?? 0,
      income: row?.income ?? 0,
      count: row?.count ?? 0,
    });
  }

  return series;
}

/**
 * Spending in one category over a period, with its transactions.
 *
 * Used by the assistant to answer "how much did I spend on petrol" without the
 * model ever touching a number — it receives this result and phrases it.
 */
export async function getCategorySpend(
  userId: string,
  categoryId: string,
  range: Range,
): Promise<{ amount: number; count: number; transactions: LargeTransaction[] }> {
  const objectId = new Types.ObjectId(userId);

  const [totals, rows] = await Promise.all([
    TransactionModel.aggregate<{ _id: null; amount: number; count: number }>([
      {
        $match: {
          userId: objectId,
          type: 'expense',
          categoryId: new Types.ObjectId(categoryId),
          date: { $gte: range.from, $lte: range.to },
        },
      },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    TransactionModel.find({
      userId: objectId,
      type: 'expense',
      categoryId: new Types.ObjectId(categoryId),
      date: { $gte: range.from, $lte: range.to },
    })
      .sort({ amount: -1 })
      .limit(5)
      .select('amount merchant date')
      .lean(),
  ]);

  return {
    amount: totals[0]?.amount ?? 0,
    count: totals[0]?.count ?? 0,
    transactions: rows.map((row) => ({
      id: String(row._id),
      amount: row.amount,
      merchant: row.merchant || 'Expense',
      categoryName: null,
      date: row.date.toISOString(),
    })),
  };
}

/** Today's spending, for "how much have I spent today". */
export async function getDayTotal(
  userId: string,
  instant: Date,
): Promise<{ key: string; amount: number; count: number }> {
  const timezone = await timezoneOf(userId);
  const key = dayKey(instant, timezone);

  const rows = await TransactionModel.aggregate<{ _id: string; amount: number; count: number }>([
    { $match: { userId: new Types.ObjectId(userId), type: 'expense' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone } },
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $match: { _id: key } },
  ]);

  return { key, amount: rows[0]?.amount ?? 0, count: rows[0]?.count ?? 0 };
}
