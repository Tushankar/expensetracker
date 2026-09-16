import { Types } from 'mongoose';

import { logger } from '../../config/logger';
import { formatDay, occurrenceAt, zoneOrDefault, type RecurrenceUnit } from '../../lib/time';
import { evaluateBudgets } from '../budgets/budget.service';
import { raise } from '../notifications/notification.service';
import { createTransaction } from '../transactions/transaction.service';
import { UserModel } from '../users/user.model';

import { RecurringModel } from './recurring.model';
import { hasFinished } from './recurring.service';

/**
 * How far ahead a charge is announced. Three days is enough warning to move money
 * before a rent debit bounces, and short enough that the alert still feels like
 * news when it arrives.
 */
const UPCOMING_WINDOW_DAYS = 3;

/**
 * Guard against a rule whose start date is far in the past somehow surviving the
 * fast-forward in `initialSchedule` — this loop writes real money, so it stops
 * rather than catching up unboundedly.
 */
const MAX_CATCHUP_PER_RULE = 12;

export type SchedulerResult = {
  created: number;
  announced: number;
  finished: number;
  errors: number;
};

/**
 * Writes the transactions that are due, and announces the ones that are close.
 *
 * Idempotency comes from `occurrencesCreated`: the counter is advanced in the
 * same save that records the run, so a second pass finds `nextRunAt` already in
 * the future and does nothing. That matters because this runs on a timer — a slow
 * pass must not overlap with the next one and bill someone twice.
 *
 * Rules are processed one at a time rather than in parallel. Each one writes a
 * transaction and moves an account balance, and the throughput of a personal
 * finance app's standing orders is not worth the concurrency bugs.
 */
export async function runDueRecurring(now: Date = new Date()): Promise<SchedulerResult> {
  const result: SchedulerResult = { created: 0, announced: 0, finished: 0, errors: 0 };

  const due = await RecurringModel.find({
    isActive: true,
    isPaused: false,
    nextRunAt: { $lte: now },
  })
    .sort({ nextRunAt: 1 })
    .limit(500);

  for (const rule of due) {
    try {
      const zone = await timezoneOf(rule.userId);
      let writes = 0;

      while (
        rule.isActive &&
        rule.nextRunAt.getTime() <= now.getTime() &&
        writes < MAX_CATCHUP_PER_RULE
      ) {
        const occurrenceAtDate = rule.nextRunAt;

        if (rule.autoCreate) {
          const transaction = await createTransaction(String(rule.userId), buildInput(rule));
          result.created += 1;

          await raise({
            userId: rule.userId as Types.ObjectId,
            type: 'recurring_created',
            title: `${rule.name} was recorded`,
            body: `${formatRupees(rule.amount)} on ${formatDay(occurrenceAtDate, zone)}.`,
            dedupeKey: `rule:${String(rule._id)}:${occurrenceAtDate.toISOString()}:created`,
            data: { recurringId: String(rule._id), transactionId: transaction.id },
          });

          // A standing charge can be the one that tips a budget over, so the same
          // check a manual entry triggers runs here too.
          void evaluateBudgets(String(rule.userId), occurrenceAtDate);
        }

        rule.occurrencesCreated += 1;
        rule.lastRunAt = occurrenceAtDate;
        rule.nextRunAt = occurrenceAt(
          rule.startDate,
          rule.unit as RecurrenceUnit,
          rule.interval,
          rule.occurrencesCreated,
          zone,
        );
        if (hasFinished(rule)) {
          rule.isActive = false;
          result.finished += 1;
        }

        writes += 1;
      }

      if (writes >= MAX_CATCHUP_PER_RULE && rule.nextRunAt.getTime() <= now.getTime()) {
        logger.warn(
          { ruleId: String(rule._id), name: rule.name },
          'recurring rule hit the catch-up cap; pausing it rather than writing more',
        );
        rule.isPaused = true;
      }

      await rule.save();
    } catch (error) {
      result.errors += 1;
      // One broken rule — a deleted account, say — must not stop everyone else's.
      logger.error({ err: error, ruleId: String(rule._id) }, 'recurring rule failed');
    }
  }

  result.announced = await announceUpcoming(now);
  return result;
}

/** Raises a "coming up" alert for each rule due within the window. */
async function announceUpcoming(now: Date): Promise<number> {
  const until = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86_400_000);

  const soon = await RecurringModel.find({
    isActive: true,
    isPaused: false,
    nextRunAt: { $gt: now, $lte: until },
  })
    .limit(500)
    .lean();

  let announced = 0;

  for (const rule of soon) {
    const zone = await timezoneOf(rule.userId);
    // Keyed on the occurrence, so a rule due on Friday is announced once on
    // Tuesday rather than once per scheduler tick for three days.
    const created = await raise({
      userId: rule.userId as Types.ObjectId,
      type: 'recurring_upcoming',
      title: `${rule.name} is coming up`,
      body: `${formatRupees(rule.amount)} on ${formatDay(rule.nextRunAt, zone)}.`,
      dedupeKey: `rule:${String(rule._id)}:${rule.nextRunAt.toISOString()}:upcoming`,
      data: { recurringId: String(rule._id), dueAt: rule.nextRunAt.toISOString() },
    });
    if (created) announced += 1;
  }

  return announced;
}

function buildInput(rule: {
  type: string;
  amount: number;
  accountId: Types.ObjectId;
  destinationAccountId?: Types.ObjectId | null;
  categoryId?: Types.ObjectId | null;
  name: string;
  description?: string;
  paymentMethod?: string;
  nextRunAt: Date;
}) {
  const base = {
    amount: rule.amount,
    accountId: String(rule.accountId),
    merchant: rule.name,
    description: rule.description ?? '',
    paymentMethod: (rule.paymentMethod ?? 'upi') as 'upi',
    date: rule.nextRunAt,
  };

  return rule.type === 'transfer'
    ? ({
        type: 'transfer' as const,
        ...base,
        destinationAccountId: String(rule.destinationAccountId),
      })
    : ({
        type: rule.type as 'expense' | 'income',
        ...base,
        categoryId: String(rule.categoryId),
      });
}

const zoneCache = new Map<string, string>();

async function timezoneOf(userId: Types.ObjectId): Promise<string> {
  const key = String(userId);
  const cached = zoneCache.get(key);
  if (cached) return cached;

  const user = await UserModel.findById(userId).select('timezone').lean();
  const zone = zoneOrDefault(user?.timezone);
  zoneCache.set(key, zone);
  return zone;
}

let timer: NodeJS.Timeout | null = null;

/**
 * Starts the timer.
 *
 * A single in-process interval, not a cron service, because the correctness does
 * not depend on the cadence: every pass asks the database what is due, and the
 * occurrence counter makes a repeat a no-op. Running late writes the same
 * transactions a moment later; running twice writes them once.
 *
 * It does assume one process. Two instances would both pick up the same rule and
 * both write it — the fix at that point is a lock collection or a real scheduler,
 * not a shorter interval.
 */
export function startScheduler(intervalMs: number): void {
  if (timer) return;

  const tick = () => {
    void runDueRecurring()
      .then((result) => {
        if (result.created || result.announced || result.errors) {
          logger.info(result, 'recurring pass complete');
        }
      })
      .catch((error: unknown) => logger.error({ err: error }, 'recurring pass failed'));
  };

  // One pass at boot catches everything that came due while the process was down.
  tick();
  timer = setInterval(tick, intervalMs);
  timer.unref();

  logger.info({ intervalMs }, 'recurring scheduler started');
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  zoneCache.clear();
}

/** Same formatter as the budget alerts; see the note there. */
function formatRupees(paise: number): string {
  const rupees = Math.round(Math.abs(paise) / 100);
  const whole = String(rupees);
  if (whole.length <= 3) return `₹${whole}`;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${rest},${last3}`;
}
