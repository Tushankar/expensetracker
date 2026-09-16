import { Types } from 'mongoose';

import { logger } from '../../config/logger';
import { formatDay, occurrenceAt, zoneOrDefault, type RecurrenceUnit } from '../../lib/time';
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
 * The pass currently running, if any.
 *
 * Two passes at once double-bill. The timer fires every minute and the
 * `/recurring/run` endpoint calls the same function, so "at once" is not
 * hypothetical — it happens the first time a manual run lands on a tick, and it
 * happened in the test suite before this existed. Sharing the in-flight promise
 * means a second caller waits for the first rather than racing it.
 */
let passInFlight: Promise<SchedulerResult> | null = null;

/**
 * Writes the transactions that are due, and announces the ones that are close.
 *
 * Safe to call at any time and from anywhere: overlapping callers share one pass,
 * and each occurrence is claimed with a conditional update before anything is
 * written, so even two processes cannot both take the same one.
 */
export function runDueRecurring(now: Date = new Date()): Promise<SchedulerResult> {
  if (passInFlight) return passInFlight;

  passInFlight = executePass(now).finally(() => {
    passInFlight = null;
  });
  return passInFlight;
}

/**
 * One pass.
 *
 * Rules are processed one at a time rather than in parallel. Each one writes a
 * transaction and moves an account balance, and the throughput of a personal
 * finance app's standing orders is not worth the concurrency bugs.
 */
async function executePass(now: Date): Promise<SchedulerResult> {
  const result: SchedulerResult = { created: 0, announced: 0, finished: 0, errors: 0 };

  const due = await RecurringModel.find({
    isActive: true,
    isPaused: false,
    nextRunAt: { $lte: now },
  })
    .sort({ nextRunAt: 1 })
    .limit(500)
    .lean();

  for (const rule of due) {
    try {
      const zone = await timezoneOf(rule.userId);
      let cursor = rule;
      let writes = 0;

      while (
        cursor.isActive &&
        cursor.nextRunAt.getTime() <= now.getTime() &&
        writes < MAX_CATCHUP_PER_RULE
      ) {
        const occurrence = cursor.nextRunAt;
        const nextRunAt = occurrenceAt(
          cursor.startDate,
          cursor.unit as RecurrenceUnit,
          cursor.interval,
          cursor.occurrencesCreated + 1,
          zone,
        );
        const stillActive = !hasFinished({
          endDate: cursor.endDate,
          maxOccurrences: cursor.maxOccurrences,
          occurrencesCreated: cursor.occurrencesCreated + 1,
          nextRunAt,
        });

        /**
         * Claim the occurrence before writing it.
         *
         * The filter pins `occurrencesCreated` to what we read, so exactly one
         * caller can advance it — a second pass, in this process or another,
         * finds the count already moved and gets nothing back. Claiming *first*
         * means a crash between the claim and the write skips a charge rather
         * than repeating one, which is the right way round: a missed rent entry
         * is something a person notices and adds, a duplicate debit is something
         * they have to unpick.
         */
        const claimed = await RecurringModel.findOneAndUpdate(
          {
            _id: cursor._id,
            occurrencesCreated: cursor.occurrencesCreated,
            isActive: true,
            isPaused: false,
          },
          {
            $set: {
              occurrencesCreated: cursor.occurrencesCreated + 1,
              lastRunAt: occurrence,
              nextRunAt,
              isActive: stillActive,
            },
          },
          { new: true },
        ).lean();

        if (!claimed) break;

        if (!stillActive) result.finished += 1;

        if (claimed.autoCreate) {
          // `createTransaction` runs the budget check itself, so a standing
          // charge that tips a cap over raises the same alert a manual entry does.
          const transaction = await createTransaction(
            String(rule.userId),
            buildInput({ ...claimed, nextRunAt: occurrence }),
          );
          result.created += 1;

          await raise({
            userId: rule.userId as Types.ObjectId,
            type: 'recurring_created',
            title: `${claimed.name} was recorded`,
            body: `${formatRupees(claimed.amount)} on ${formatDay(occurrence, zone)}.`,
            dedupeKey: `rule:${String(claimed._id)}:${occurrence.toISOString()}:created`,
            data: { recurringId: String(claimed._id), transactionId: transaction.id },
          });
        }

        cursor = claimed;
        writes += 1;
      }

      if (writes >= MAX_CATCHUP_PER_RULE && cursor.nextRunAt.getTime() <= now.getTime()) {
        logger.warn(
          { ruleId: String(cursor._id), name: cursor.name },
          'recurring rule hit the catch-up cap; pausing it rather than writing more',
        );
        await RecurringModel.updateOne({ _id: cursor._id }, { $set: { isPaused: true } });
      }
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
  /** The occurrence being written, not the rule's next one. */
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
 * Two instances would both wake up and both find the same rules due, which is
 * fine: each occurrence is claimed with a conditional update, so only one of them
 * can write it. They would duplicate the *reads*, not the money.
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
  passInFlight = null;
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
