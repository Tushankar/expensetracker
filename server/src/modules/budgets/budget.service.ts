import { Types } from 'mongoose';

import { logger } from '../../config/logger';
import { ApiError } from '../../lib/ApiError';
import { monthKey, monthRangeFromKey, zoneOrDefault } from '../../lib/time';
import { CategoryModel } from '../categories/category.model';
import { raise } from '../notifications/notification.service';
import { TransactionModel } from '../transactions/transaction.model';
import { UserModel } from '../users/user.model';

import { BudgetModel, type BudgetScope } from './budget.model';
import type { CreateBudgetInput, UpdateBudgetInput } from './budget.schemas';

/** Over this share of the cap and under 100, a budget is "warning". */
export type BudgetState = 'on_track' | 'warning' | 'exceeded';

export type BudgetProgress = {
  id: string;
  scope: BudgetScope;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  /** Integer paise. */
  amount: number;
  spent: number;
  /** `amount − spent`, floored at zero: "remaining" is never negative. */
  remaining: number;
  /** How far past the cap, or zero. The other half of `remaining`. */
  overBy: number;
  /** 0–100+, rounded. Can exceed 100 on purpose. */
  percent: number;
  warnAtPercent: number;
  state: BudgetState;
  isActive: boolean;
};

export type BudgetSummary = {
  /** `YYYY-MM`, in the user's zone. */
  month: string;
  from: string;
  to: string;
  overall: BudgetProgress | null;
  categories: BudgetProgress[];
  totals: {
    /** Sum of every cap, the overall one excluded so it is not double-counted. */
    budgeted: number;
    /** Everything spent in the month, budgeted or not. */
    spent: number;
    remaining: number;
    /** Spending in categories with no budget — what the caps do not cover. */
    unbudgetedSpend: number;
  };
};

function stateFor(spent: number, amount: number, warnAt: number): BudgetState {
  if (spent > amount) return 'exceeded';
  if (amount > 0 && (spent / amount) * 100 >= warnAt) return 'warning';
  return 'on_track';
}

function progressFor(
  budget: {
    _id: Types.ObjectId;
    scope: string;
    categoryId?: Types.ObjectId | null;
    amount: number;
    warnAtPercent: number;
    isActive: boolean;
  },
  spent: number,
  category?: { name: string; icon: string; color: string },
): BudgetProgress {
  const amount = budget.amount;
  return {
    id: String(budget._id),
    scope: budget.scope as BudgetScope,
    categoryId: budget.categoryId ? String(budget.categoryId) : null,
    categoryName: category?.name ?? null,
    categoryIcon: category?.icon ?? null,
    categoryColor: category?.color ?? null,
    amount,
    spent,
    remaining: Math.max(0, amount - spent),
    overBy: Math.max(0, spent - amount),
    percent: amount > 0 ? Math.round((spent / amount) * 100) : 0,
    warnAtPercent: budget.warnAtPercent,
    state: stateFor(spent, amount, budget.warnAtPercent),
    isActive: budget.isActive,
  };
}

async function timezoneOf(userId: string): Promise<string> {
  const user = await UserModel.findById(userId).select('timezone').lean();
  return zoneOrDefault(user?.timezone);
}

/**
 * Every budget for a month, with what has been spent against it.
 *
 * Two aggregations and one category read, regardless of how many budgets exist —
 * the spend is grouped by category in the database rather than queried per
 * budget, which would be a round trip per row on a screen that shows a dozen.
 *
 * Transfers are absent by construction: the `$match` is `type: 'expense'`, so
 * moving ₹10,000 from HDFC to Cash cannot consume a food budget.
 */
export async function getBudgetSummary(
  userId: string,
  month?: string,
): Promise<BudgetSummary> {
  const zone = await timezoneOf(userId);
  const key = month ?? monthKey(new Date(), zone);
  const { from, to } = monthRangeFromKey(key, zone);

  const objectId = new Types.ObjectId(userId);
  const match = { userId: objectId, type: 'expense', date: { $gte: from, $lte: to } };

  const [budgets, byCategory, totals] = await Promise.all([
    BudgetModel.find({ userId: objectId, isActive: true }).lean(),
    TransactionModel.aggregate<{ _id: Types.ObjectId | null; amount: number }>([
      { $match: match },
      { $group: { _id: '$categoryId', amount: { $sum: '$amount' } } },
    ]),
    TransactionModel.aggregate<{ _id: null; amount: number }>([
      { $match: match },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]),
  ]);

  const spentByCategory = new Map(
    byCategory.filter((row) => row._id).map((row) => [String(row._id), row.amount]),
  );
  const totalSpent = totals[0]?.amount ?? 0;

  const categoryIds = budgets
    .filter((budget) => budget.categoryId)
    .map((budget) => budget.categoryId as Types.ObjectId);

  const categories = categoryIds.length
    ? await CategoryModel.find({ _id: { $in: categoryIds } })
        .select('name icon color')
        .lean()
    : [];
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));

  const overallBudget = budgets.find((budget) => budget.scope === 'overall');
  const categoryBudgets = budgets
    .filter((budget) => budget.scope === 'category' && budget.categoryId)
    .map((budget) => {
      const id = String(budget.categoryId);
      return progressFor(budget, spentByCategory.get(id) ?? 0, categoryById.get(id));
    })
    // Closest to trouble first: exceeded, then warning, then by how full it is.
    .sort((a, b) => b.percent - a.percent);

  const budgeted = categoryBudgets.reduce((total, budget) => total + budget.amount, 0);
  const budgetedCategoryIds = new Set(categoryBudgets.map((budget) => budget.categoryId));
  const unbudgetedSpend = [...spentByCategory.entries()]
    .filter(([id]) => !budgetedCategoryIds.has(id))
    .reduce((total, [, amount]) => total + amount, 0);

  return {
    month: key,
    from: from.toISOString(),
    to: to.toISOString(),
    overall: overallBudget ? progressFor(overallBudget, totalSpent) : null,
    categories: categoryBudgets,
    totals: {
      budgeted,
      spent: totalSpent,
      remaining: Math.max(0, budgeted - categoryBudgets.reduce((t, b) => t + Math.min(b.spent, b.amount), 0)),
      unbudgetedSpend,
    },
  };
}

export async function createBudget(
  userId: string,
  input: CreateBudgetInput,
): Promise<BudgetProgress> {
  const objectId = new Types.ObjectId(userId);

  if (input.scope === 'category') {
    const category = await CategoryModel.findOne({
      _id: input.categoryId,
      $or: [{ userId: null }, { userId: objectId }],
    }).lean();
    if (!category) throw ApiError.notFound('Category not found');
    if (category.type !== 'expense') {
      throw ApiError.badRequest('Only spending categories can have a budget', [
        { field: 'categoryId', message: 'Pick an expense category' },
      ]);
    }
  }

  const duplicate = await BudgetModel.exists({
    userId: objectId,
    scope: input.scope,
    categoryId: input.scope === 'category' ? new Types.ObjectId(input.categoryId) : null,
    isActive: true,
  });
  if (duplicate) {
    throw ApiError.conflict(
      input.scope === 'overall'
        ? 'You already have an overall budget. Edit that one instead.'
        : 'That category already has a budget.',
    );
  }

  const budget = await BudgetModel.create({
    userId: objectId,
    scope: input.scope,
    categoryId: input.scope === 'category' ? new Types.ObjectId(input.categoryId) : null,
    amount: input.amount,
    warnAtPercent: input.warnAtPercent,
  });

  const summary = await getBudgetSummary(userId);
  const found =
    summary.overall?.id === String(budget._id)
      ? summary.overall
      : summary.categories.find((entry) => entry.id === String(budget._id));

  return found ?? progressFor(budget, 0);
}

export async function updateBudget(
  userId: string,
  budgetId: string,
  patch: UpdateBudgetInput,
): Promise<BudgetProgress> {
  const budget = await BudgetModel.findOne({ _id: budgetId, userId: new Types.ObjectId(userId) });
  if (!budget) throw ApiError.notFound('Budget not found');

  Object.assign(budget, patch);
  await budget.save();

  const summary = await getBudgetSummary(userId);
  const found =
    summary.overall?.id === budgetId
      ? summary.overall
      : summary.categories.find((entry) => entry.id === budgetId);

  return found ?? progressFor(budget, 0);
}

export async function deleteBudget(userId: string, budgetId: string): Promise<void> {
  const result = await BudgetModel.deleteOne({
    _id: budgetId,
    userId: new Types.ObjectId(userId),
  });
  if (result.deletedCount === 0) throw ApiError.notFound('Budget not found');
}

/**
 * Raises budget alerts for the month a transaction landed in.
 *
 * Called after a transaction is written, outside its database transaction and
 * without being awaited: a notification that fails must never roll back the
 * expense that triggered it, and the user should not wait on an aggregation to
 * see their own transaction saved.
 *
 * Every alert carries a dedupe key naming the budget and the month, so the
 * hundredth expense of September cannot re-announce something the first one
 * already said. Crossing from warning into exceeded *does* produce a second
 * alert, because the two keys differ — which is right: those are different
 * pieces of news.
 */
export async function evaluateBudgets(userId: string, at: Date): Promise<void> {
  try {
    const zone = await timezoneOf(userId);
    const key = monthKey(at, zone);
    const summary = await getBudgetSummary(userId, key);
    const objectId = new Types.ObjectId(userId);

    const all = [...(summary.overall ? [summary.overall] : []), ...summary.categories];

    for (const budget of all) {
      const label = budget.scope === 'overall' ? 'Your monthly budget' : budget.categoryName;
      if (!label) continue;

      if (budget.state === 'exceeded') {
        await raise({
          userId: objectId,
          type: 'budget_exceeded',
          title: `${label} is over budget`,
          body: `${formatRupees(budget.spent)} spent of ${formatRupees(budget.amount)} — ${formatRupees(budget.overBy)} over.`,
          dedupeKey: `budget:${budget.id}:${key}:exceeded`,
          data: { budgetId: budget.id, categoryId: budget.categoryId, month: key },
        });
      } else if (budget.state === 'warning') {
        await raise({
          userId: objectId,
          type: 'budget_warning',
          title: `${label} is ${budget.percent}% used`,
          body: `${formatRupees(budget.remaining)} left of ${formatRupees(budget.amount)} for the rest of the month.`,
          dedupeKey: `budget:${budget.id}:${key}:warn`,
          data: { budgetId: budget.id, categoryId: budget.categoryId, month: key },
        });
      }
    }
  } catch (error) {
    logger.warn({ err: error, userId }, 'budget evaluation failed');
  }
}

/**
 * Rupees for notification copy, grouped the Indian way.
 *
 * Duplicated from the client rather than shared, because the two are different
 * products: a notification body is plain text assembled on a server with no
 * design tokens, and coupling it to the app's formatter would mean a styling
 * change could alter what a push says.
 */
function formatRupees(paise: number): string {
  const rupees = Math.round(Math.abs(paise) / 100);
  const whole = String(rupees);
  if (whole.length <= 3) return `₹${whole}`;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${rest},${last3}`;
}
