import { Types } from 'mongoose';
import { DateTime } from 'luxon';

import { logger } from '../../config/logger';
import { monthKey, zoneOrDefault } from '../../lib/time';
import { getBudgetSummary } from '../budgets/budget.service';
import { MoneyOwedModel } from '../moneyOwed/moneyOwed.model';
import { PersonModel } from '../people/person.model';
import { RecurringModel } from '../recurring/recurring.model';
import { TransactionModel } from '../transactions/transaction.model';
import { UserModel } from '../users/user.model';
import { raise } from './notification.service';

/**
 * Format paise into Indian Rupee representation (e.g. ₹1,25,000)
 */
export function formatRupees(paise: number): string {
  const rupees = Math.round(Math.abs(paise) / 100);
  const whole = String(rupees);
  if (whole.length <= 3) return `₹${whole}`;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${rest},${last3}`;
}

/**
 * Check if the given time is within quiet hours for the user's timezone.
 * Default quiet hours: 22:00 to 08:00.
 */
export function isInQuietHours(
  now: Date,
  timezone: string,
  quietHours?: { enabled: boolean; start: string; end: string },
): boolean {
  if (!quietHours || !quietHours.enabled) return false;

  const zone = zoneOrDefault(timezone);
  const dt = DateTime.fromJSDate(now, { zone });

  const [startH, startM] = quietHours.start.split(':').map(Number);
  const [endH, endM] = quietHours.end.split(':').map(Number);

  if (startH === undefined || startM === undefined || endH === undefined || endM === undefined) {
    return false;
  }

  const currentMinutes = dt.hour * 60 + dt.minute;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes > endMinutes) {
    // Crosses midnight: e.g. 22:00 (1320) to 08:00 (480)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } else {
    // Within same day: e.g. 13:00 to 15:00
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}

/**
 * Apply privacy filter to notification previews for lock screen / push notifications.
 */
export function applyPreviewPrivacy(
  title: string,
  body: string,
  previewMode: 'detailed' | 'basic' | 'private' = 'private',
): { title: string; body: string } {
  if (previewMode === 'private') {
    return {
      title: 'Paisa',
      body: 'You have a new financial reminder.',
    };
  }

  if (previewMode === 'basic') {
    return {
      title,
      body: 'Open Paisa to view details.',
    };
  }

  return { title, body };
}

/**
 * 1. Budget Alerts Evaluator
 * Evaluates budget thresholds (80% warning, 100% exceeded) for a user.
 */
export async function evaluateBudgetAlertsForUser(
  userId: string,
  now = new Date(),
): Promise<number> {
  let count = 0;
  const user = await UserModel.findById(userId).select('timezone notificationPrefs').lean();
  if (!user || user.notificationPrefs?.budgetAlerts === false) return 0;

  const zone = zoneOrDefault(user.timezone);
  const key = monthKey(now, zone);
  const summary = await getBudgetSummary(userId, key);
  const objectId = new Types.ObjectId(userId);

  const all = [...(summary.overall ? [summary.overall] : []), ...summary.categories];

  for (const budget of all) {
    const label = budget.scope === 'overall' ? 'Your monthly budget' : budget.categoryName;
    if (!label) continue;

    if (budget.state === 'exceeded') {
      const raised = await raise({
        userId: objectId,
        type: 'budget_exceeded',
        title: `${label} is over budget`,
        body: `${formatRupees(budget.spent)} spent of ${formatRupees(budget.amount)} — ${formatRupees(budget.overBy)} over.`,
        dedupeKey: `budget:${budget.id}:${key}:exceeded`,
        data: { budgetId: budget.id, categoryId: budget.categoryId, month: key, screen: 'Budgets' },
      });
      if (raised) count++;
    } else if (budget.state === 'warning') {
      const raised = await raise({
        userId: objectId,
        type: 'budget_warning',
        title: `${label} is ${budget.percent}% used`,
        body: `${formatRupees(budget.remaining)} left of ${formatRupees(budget.amount)} for the rest of the month.`,
        dedupeKey: `budget:${budget.id}:${key}:warn`,
        data: { budgetId: budget.id, categoryId: budget.categoryId, month: key, screen: 'Budgets' },
      });
      if (raised) count++;
    }
  }

  return count;
}

/**
 * 2. Recurring Payment Reminders Evaluator
 * Reminds users:
 * - 2 days before due date
 * - Due today
 */
export async function evaluateRecurringRemindersForUser(
  userId: string,
  now = new Date(),
): Promise<number> {
  let count = 0;
  const user = await UserModel.findById(userId).select('timezone notificationPrefs').lean();
  if (!user || user.notificationPrefs?.recurringAlerts === false) return 0;

  const zone = zoneOrDefault(user.timezone);
  const dtNow = DateTime.fromJSDate(now, { zone }).startOf('day');
  const twoDaysAhead = dtNow.plus({ days: 2 }).endOf('day').toJSDate();

  const rules = await RecurringModel.find({
    userId: new Types.ObjectId(userId),
    isActive: true,
    isPaused: false,
    nextRunAt: { $gte: dtNow.toJSDate(), $lte: twoDaysAhead },
  }).lean();

  const objectId = new Types.ObjectId(userId);

  for (const rule of rules) {
    const dtDue = DateTime.fromJSDate(rule.nextRunAt, { zone }).startOf('day');
    const daysDiff = Math.round(dtDue.diff(dtNow, 'days').days);
    const dateKey = dtDue.toISODate();

    if (daysDiff === 0) {
      // Due today
      const raised = await raise({
        userId: objectId,
        type: 'recurring_due',
        title: `${rule.name} is due today`,
        body: `${rule.name} payment of ${formatRupees(rule.amount)} is due today.`,
        dedupeKey: `rule:${String(rule._id)}:${dateKey}:due`,
        data: { recurringId: String(rule._id), dueAt: rule.nextRunAt.toISOString(), screen: 'Recurring' },
      });
      if (raised) count++;
    } else if (daysDiff <= 2 && daysDiff > 0) {
      // Due in 1 or 2 days
      const daysText = daysDiff === 1 ? 'tomorrow' : 'in 2 days';
      const raised = await raise({
        userId: objectId,
        type: 'recurring_upcoming',
        title: `${rule.name} is due ${daysText}`,
        body: `${rule.name} payment of ${formatRupees(rule.amount)} is due ${daysText}.`,
        dedupeKey: `rule:${String(rule._id)}:${dateKey}:upcoming`,
        data: { recurringId: String(rule._id), dueAt: rule.nextRunAt.toISOString(), screen: 'Recurring' },
      });
      if (raised) count++;
    }
  }

  return count;
}

/**
 * 3. People & Money Owed Reminders Evaluator (B.5 Integration)
 * Reminds users:
 * - 1 day before due date
 * - Due today
 * - Overdue (once)
 * Notifications NEVER alter obligations or ledger balances.
 */
export async function evaluatePeopleRemindersForUser(
  userId: string,
  now = new Date(),
): Promise<number> {
  let count = 0;
  const user = await UserModel.findById(userId).select('timezone notificationPrefs').lean();
  if (!user || user.notificationPrefs?.peopleAlerts === false) return 0;

  const zone = zoneOrDefault(user.timezone);
  const dtNow = DateTime.fromJSDate(now, { zone }).startOf('day');
  const objectId = new Types.ObjectId(userId);

  // Active obligations with a due date
  const obligations = await MoneyOwedModel.find({
    userId: objectId,
    status: 'active',
    dueDate: { $ne: null },
  }).lean();

  if (obligations.length === 0) return 0;

  const personIds = Array.from(new Set(obligations.map((o) => String(o.personId))));
  const people = await PersonModel.find({ _id: { $in: personIds } }).lean();
  const personMap = new Map<string, string>();
  for (const p of people) {
    personMap.set(String(p._id), p.name);
  }

  for (const ob of obligations) {
    if (!ob.dueDate) continue;
    const personName = personMap.get(String(ob.personId)) ?? 'Someone';
    const dtDue = DateTime.fromJSDate(ob.dueDate, { zone }).startOf('day');
    const daysDiff = Math.round(dtDue.diff(dtNow, 'days').days);
    const dateKey = dtDue.toISODate();
    const amountStr = formatRupees(ob.remainingAmount);

    if (ob.direction === 'owed_to_me') {
      if (daysDiff === 0) {
        // Due today
        const raised = await raise({
          userId: objectId,
          type: 'money_owed_due',
          title: `${personName} owes you ${amountStr}, due today`,
          body: `${personName} owes you ${amountStr}, due today.`,
          dedupeKey: `owed:${String(ob._id)}:${dateKey}:due`,
          data: { obligationId: String(ob._id), personId: String(ob.personId), screen: 'PersonDetail' },
        });
        if (raised) count++;
      } else if (daysDiff === 1) {
        // Due tomorrow
        const raised = await raise({
          userId: objectId,
          type: 'money_owed_due',
          title: `${personName} owes you ${amountStr}, due tomorrow`,
          body: `${personName} owes you ${amountStr}, due tomorrow.`,
          dedupeKey: `owed:${String(ob._id)}:${dateKey}:upcoming`,
          data: { obligationId: String(ob._id), personId: String(ob.personId), screen: 'PersonDetail' },
        });
        if (raised) count++;
      } else if (daysDiff < 0) {
        // Overdue
        const raised = await raise({
          userId: objectId,
          type: 'money_owed_due',
          title: `${amountStr} from ${personName} is overdue`,
          body: `${amountStr} from ${personName} is overdue.`,
          dedupeKey: `owed:${String(ob._id)}:${dateKey}:overdue`,
          data: { obligationId: String(ob._id), personId: String(ob.personId), screen: 'PersonDetail' },
        });
        if (raised) count++;
      }
    } else {
      // i_owe
      if (daysDiff === 0) {
        // Due today
        const raised = await raise({
          userId: objectId,
          type: 'repayment_due',
          title: `You owe ${personName} ${amountStr}, due today`,
          body: `You owe ${personName} ${amountStr}, due today.`,
          dedupeKey: `owed:${String(ob._id)}:${dateKey}:due`,
          data: { obligationId: String(ob._id), personId: String(ob.personId), screen: 'PersonDetail' },
        });
        if (raised) count++;
      } else if (daysDiff === 1) {
        // Due tomorrow
        const raised = await raise({
          userId: objectId,
          type: 'repayment_due',
          title: `You owe ${personName} ${amountStr}, due tomorrow`,
          body: `You owe ${personName} ${amountStr}, due tomorrow.`,
          dedupeKey: `owed:${String(ob._id)}:${dateKey}:upcoming`,
          data: { obligationId: String(ob._id), personId: String(ob.personId), screen: 'PersonDetail' },
        });
        if (raised) count++;
      } else if (daysDiff < 0) {
        // Overdue
        const raised = await raise({
          userId: objectId,
          type: 'repayment_due',
          title: `Repayment of ${amountStr} to ${personName} is overdue`,
          body: `Repayment of ${amountStr} to ${personName} is overdue.`,
          dedupeKey: `owed:${String(ob._id)}:${dateKey}:overdue`,
          data: { obligationId: String(ob._id), personId: String(ob.personId), screen: 'PersonDetail' },
        });
        if (raised) count++;
      }
    }
  }

  return count;
}

/**
 * 4. Unusual Spending Alerts Evaluator
 * Identifies conservative category deviations:
 * - Category spending in the past 7 days exceeds 2x the 4-week prior weekly average.
 * - Minimum threshold of ₹2,000 (200,000 paise).
 * - Minimum historical transactions of 3 to establish a reasonable baseline.
 */
export async function evaluateUnusualSpendingForUser(
  userId: string,
  now = new Date(),
): Promise<number> {
  let count = 0;
  const user = await UserModel.findById(userId).select('timezone notificationPrefs').lean();
  if (!user || user.notificationPrefs?.spendingAlerts === false) return 0;

  const zone = zoneOrDefault(user.timezone);
  const dtNow = DateTime.fromJSDate(now, { zone });
  const objectId = new Types.ObjectId(userId);

  const sevenDaysAgo = dtNow.minus({ days: 7 }).toJSDate();
  const thirtyFiveDaysAgo = dtNow.minus({ days: 35 }).toJSDate();

  // Aggregate current 7 days spend by category
  const recentSpend = await TransactionModel.aggregate<{
    _id: Types.ObjectId;
    total: number;
    count: number;
  }>([
    {
      $match: {
        userId: objectId,
        type: 'expense',
        date: { $gte: sevenDaysAgo, $lte: now },
        categoryId: { $ne: null },
      },
    },
    {
      $group: {
        _id: '$categoryId',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  // Aggregate historical prior 4-week spend by category (days 8 through 35)
  const priorSpend = await TransactionModel.aggregate<{
    _id: Types.ObjectId;
    total: number;
    count: number;
  }>([
    {
      $match: {
        userId: objectId,
        type: 'expense',
        date: { $gte: thirtyFiveDaysAgo, $lt: sevenDaysAgo },
        categoryId: { $ne: null },
      },
    },
    {
      $group: {
        _id: '$categoryId',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const priorMap = new Map<string, { total: number; count: number }>();
  for (const p of priorSpend) {
    priorMap.set(String(p._id), { total: p.total, count: p.count });
  }

  const weekKey = `${dtNow.year}-W${dtNow.weekNumber}`;

  for (const r of recentSpend) {
    const catId = String(r._id);
    const prior = priorMap.get(catId);

    // Require sufficient historical baseline (at least 3 transactions in prior weeks)
    if (!prior || prior.count < 3) continue;

    const priorWeeklyAvg = Math.round(prior.total / 4);
    const minimumSpendPaise = 2000 * 100; // ₹2,000 minimum spend

    // If recent spend is more than 2x historical weekly average and exceeds minimum threshold
    if (r.total >= minimumSpendPaise && r.total >= priorWeeklyAvg * 2) {
      // Find category name
      const cat = await UserModel.db
        .collection('categories')
        .findOne({ _id: r._id }, { projection: { name: 1 } });
      const catName = cat?.name ?? 'Category';

      const raised = await raise({
        userId: objectId,
        type: 'unusual_spending',
        title: `${catName} spending is higher than usual`,
        body: `${catName} spending is higher than your recent average this week.`,
        dedupeKey: `unusual:${userId}:${catId}:${weekKey}`,
        data: { categoryId: catId, week: weekKey, screen: 'Insights' },
      });
      if (raised) count++;
    }
  }

  return count;
}

/**
 * 5. Monthly Financial Summary Evaluator
 * At the start of a month, alerts the user that their previous month summary is ready.
 */
export async function evaluateMonthlySummaryForUser(
  userId: string,
  now = new Date(),
): Promise<number> {
  const user = await UserModel.findById(userId).select('timezone notificationPrefs').lean();
  if (!user || user.notificationPrefs?.monthlySummaryAlerts === false) return 0;

  const zone = zoneOrDefault(user.timezone);
  const dtNow = DateTime.fromJSDate(now, { zone });

  // Previous month
  const prevMonthDt = dtNow.minus({ months: 1 });
  const prevMonthKey = prevMonthDt.toFormat('yyyy-MM');
  const monthName = prevMonthDt.toFormat('LLLL');

  const objectId = new Types.ObjectId(userId);

  // Check if user has any transactions in previous month
  const startOfMonth = prevMonthDt.startOf('month').toJSDate();
  const endOfMonth = prevMonthDt.endOf('month').toJSDate();

  const hasActivity = await TransactionModel.exists({
    userId: objectId,
    date: { $gte: startOfMonth, $lte: endOfMonth },
  });

  if (!hasActivity) return 0;

  const raised = await raise({
    userId: objectId,
    type: 'monthly_summary',
    title: `Your ${monthName} summary is ready`,
    body: `Tap to view your ${monthName} financial breakdown on Insights.`,
    dedupeKey: `summary:${userId}:${prevMonthKey}`,
    data: { month: prevMonthKey, screen: 'Insights' },
  });

  return raised ? 1 : 0;
}

/**
 * Run all alerts for a given user idempotently.
 */
export async function runAllAlertsForUser(
  userId: string,
  now = new Date(),
): Promise<{
  budgets: number;
  recurring: number;
  people: number;
  unusual: number;
  summary: number;
  total: number;
}> {
  const [budgets, recurring, people, unusual, summary] = await Promise.all([
    evaluateBudgetAlertsForUser(userId, now),
    evaluateRecurringRemindersForUser(userId, now),
    evaluatePeopleRemindersForUser(userId, now),
    evaluateUnusualSpendingForUser(userId, now),
    evaluateMonthlySummaryForUser(userId, now),
  ]);

  return {
    budgets,
    recurring,
    people,
    unusual,
    summary,
    total: budgets + recurring + people + unusual + summary,
  };
}

/**
 * Master Scheduler: Runs alerts for all users.
 */
export async function runAllAlerts(now = new Date()): Promise<{
  usersProcessed: number;
  alertsCreated: number;
}> {
  const users = await UserModel.find({}).select('_id').lean();
  let alertsCreated = 0;

  for (const user of users) {
    try {
      const res = await runAllAlertsForUser(String(user._id), now);
      alertsCreated += res.total;
    } catch (err) {
      logger.error({ err, userId: String(user._id) }, 'Failed running alerts for user');
    }
  }

  return {
    usersProcessed: users.length,
    alertsCreated,
  };
}
