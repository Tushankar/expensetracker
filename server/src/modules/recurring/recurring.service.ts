import { Types } from 'mongoose';

import { ApiError } from '../../lib/ApiError';
import {
  formatDay,
  occurrenceAt,
  occurrencesElapsed,
  zoneOrDefault,
  type RecurrenceUnit,
} from '../../lib/time';
import { requireOwnedAccount } from '../accounts/account.service';
import { requireOwnedCategory } from '../categories/category.service';
import { UserModel } from '../users/user.model';
import type { PaymentMethod, TransactionType } from '../transactions/transaction.model';

import { RecurringModel } from './recurring.model';
import type { CreateRecurringInput, UpdateRecurringInput } from './recurring.schemas';

export type PublicRecurring = {
  id: string;
  name: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  accountId: string;
  destinationAccountId: string | null;
  description: string;
  paymentMethod: PaymentMethod;
  unit: RecurrenceUnit;
  interval: number;
  /** "Every month", "Every 2 weeks" — assembled here so both clients agree. */
  scheduleLabel: string;
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  occurrencesCreated: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  isPaused: boolean;
  isActive: boolean;
  autoCreate: boolean;
};

const UNIT_LABEL: Record<RecurrenceUnit, [one: string, many: string]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
};

export function scheduleLabel(unit: RecurrenceUnit, interval: number): string {
  const [one, many] = UNIT_LABEL[unit];
  if (interval === 1) {
    // "Every month" reads better than "Monthly" beside "Every 2 months".
    return `Every ${one}`;
  }
  return `Every ${interval} ${many}`;
}

type RecurringLike = {
  _id: Types.ObjectId;
  name: string;
  type: string;
  amount: number;
  categoryId?: Types.ObjectId | null;
  accountId: Types.ObjectId;
  destinationAccountId?: Types.ObjectId | null;
  description?: string;
  paymentMethod?: string;
  unit: string;
  interval: number;
  startDate: Date;
  endDate?: Date | null;
  maxOccurrences?: number | null;
  occurrencesCreated: number;
  nextRunAt: Date;
  lastRunAt?: Date | null;
  isPaused: boolean;
  isActive: boolean;
  autoCreate: boolean;
};

export function toPublicRecurring(rule: RecurringLike): PublicRecurring {
  const unit = rule.unit as RecurrenceUnit;
  return {
    id: String(rule._id),
    name: rule.name,
    type: rule.type as TransactionType,
    amount: rule.amount,
    categoryId: rule.categoryId ? String(rule.categoryId) : null,
    accountId: String(rule.accountId),
    destinationAccountId: rule.destinationAccountId ? String(rule.destinationAccountId) : null,
    description: rule.description ?? '',
    paymentMethod: (rule.paymentMethod ?? 'upi') as PaymentMethod,
    unit,
    interval: rule.interval,
    scheduleLabel: scheduleLabel(unit, rule.interval),
    startDate: rule.startDate.toISOString(),
    endDate: rule.endDate ? rule.endDate.toISOString() : null,
    maxOccurrences: rule.maxOccurrences ?? null,
    occurrencesCreated: rule.occurrencesCreated,
    // A finished rule has no next occurrence, and saying "next: some date in the
    // past" would be worse than saying nothing.
    nextRunAt: rule.isActive ? rule.nextRunAt.toISOString() : null,
    lastRunAt: rule.lastRunAt ? rule.lastRunAt.toISOString() : null,
    isPaused: rule.isPaused,
    isActive: rule.isActive,
    autoCreate: rule.autoCreate,
  };
}

async function timezoneOf(userId: string): Promise<string> {
  const user = await UserModel.findById(userId).select('timezone').lean();
  return zoneOrDefault(user?.timezone);
}

/**
 * Checks that a rule's accounts and category belong to this user, and that the
 * shape matches the type — the same rules the transaction service enforces,
 * applied when the rule is written rather than every time it fires.
 *
 * Doing it here is what stops a rule becoming a machine that produces one failed
 * write a month, silently, for a year.
 */
async function resolveReferences(
  userId: string,
  input: {
    type: TransactionType;
    accountId: string;
    destinationAccountId?: string;
    categoryId?: string;
  },
): Promise<{
  accountId: Types.ObjectId;
  destinationAccountId: Types.ObjectId | null;
  categoryId: Types.ObjectId | null;
}> {
  const account = await requireOwnedAccount(userId, input.accountId);

  let destination: Types.ObjectId | null = null;
  if (input.type === 'transfer') {
    if (!input.destinationAccountId) {
      throw ApiError.badRequest('Pick an account to transfer into', [
        { field: 'destinationAccountId', message: 'Required for a transfer' },
      ]);
    }
    if (input.destinationAccountId === input.accountId) {
      throw ApiError.badRequest('Transfer between two different accounts', [
        { field: 'destinationAccountId', message: 'Pick a different account' },
      ]);
    }
    destination = (await requireOwnedAccount(userId, input.destinationAccountId))._id;
  }

  let categoryId: Types.ObjectId | null = null;
  if (input.type !== 'transfer') {
    if (!input.categoryId) {
      throw ApiError.badRequest('Pick a category', [{ field: 'categoryId', message: 'Required' }]);
    }
    const category = await requireOwnedCategory(userId, input.categoryId);
    if (category.type !== input.type) {
      throw ApiError.badRequest(`"${category.name}" is not a ${input.type} category`, [
        { field: 'categoryId', message: `Pick a ${input.type} category` },
      ]);
    }
    categoryId = category._id;
  }

  return { accountId: account._id, destinationAccountId: destination, categoryId };
}

/**
 * Where the rule is in its schedule right now.
 *
 * A rule created with a start date in the past should not fire once for every
 * occurrence it missed — someone adding "rent, from January" in September wants
 * a rule, not nine backdated charges. So the count is fast-forwarded past
 * everything already elapsed and the first run is the next one due.
 */
export function initialSchedule(
  startDate: Date,
  unit: RecurrenceUnit,
  interval: number,
  zone: string,
  now: Date = new Date(),
): { occurrencesCreated: number; nextRunAt: Date } {
  if (startDate.getTime() > now.getTime()) {
    return { occurrencesCreated: 0, nextRunAt: startDate };
  }

  const elapsed = occurrencesElapsed(startDate, unit, interval, now, zone);
  // `elapsed` counts whole intervals behind us; the next one is the one after.
  const index = elapsed + 1;
  return { occurrencesCreated: index, nextRunAt: occurrenceAt(startDate, unit, interval, index, zone) };
}

/** True once the rule has run out of road: past its end date or its cap. */
export function hasFinished(rule: {
  endDate?: Date | null;
  maxOccurrences?: number | null;
  occurrencesCreated: number;
  nextRunAt: Date;
}): boolean {
  if (rule.maxOccurrences !== null && rule.maxOccurrences !== undefined) {
    if (rule.occurrencesCreated >= rule.maxOccurrences) return true;
  }
  if (rule.endDate && rule.nextRunAt.getTime() > rule.endDate.getTime()) return true;
  return false;
}

export async function listRecurring(
  userId: string,
  options: { includeInactive: boolean },
): Promise<PublicRecurring[]> {
  const rules = await RecurringModel.find({
    userId: new Types.ObjectId(userId),
    ...(options.includeInactive ? {} : { isActive: true }),
  })
    // Soonest first — a list of standing charges is read to answer "what is
    // coming out next", not "what did I set up first".
    .sort({ isActive: -1, nextRunAt: 1 })
    .lean();

  return rules.map(toPublicRecurring);
}

export async function getRecurring(userId: string, id: string): Promise<PublicRecurring> {
  const rule = await RecurringModel.findOne({ _id: id, userId: new Types.ObjectId(userId) }).lean();
  if (!rule) throw ApiError.notFound('Recurring transaction not found');
  return toPublicRecurring(rule);
}

export async function createRecurring(
  userId: string,
  input: CreateRecurringInput,
): Promise<PublicRecurring> {
  const zone = await timezoneOf(userId);

  const refs = await resolveReferences(userId, {
    type: input.type,
    accountId: input.accountId,
    destinationAccountId: input.type === 'transfer' ? input.destinationAccountId : undefined,
    categoryId: input.type === 'transfer' ? undefined : input.categoryId,
  });

  const { occurrencesCreated, nextRunAt } = initialSchedule(
    input.startDate,
    input.unit,
    input.interval,
    zone,
  );

  if (input.endDate && input.endDate.getTime() < input.startDate.getTime()) {
    throw ApiError.badRequest('The end date must come after the start date', [
      { field: 'endDate', message: 'Pick a later date' },
    ]);
  }

  const rule = await RecurringModel.create({
    userId: new Types.ObjectId(userId),
    name: input.name,
    type: input.type,
    amount: input.amount,
    accountId: refs.accountId,
    destinationAccountId: refs.destinationAccountId,
    categoryId: refs.categoryId,
    description: input.description,
    paymentMethod: input.paymentMethod,
    unit: input.unit,
    interval: input.interval,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    maxOccurrences: input.maxOccurrences ?? null,
    autoCreate: input.autoCreate,
    occurrencesCreated,
    nextRunAt,
  });

  return toPublicRecurring(rule);
}

export async function updateRecurring(
  userId: string,
  id: string,
  patch: UpdateRecurringInput,
): Promise<PublicRecurring> {
  const rule = await RecurringModel.findOne({ _id: id, userId: new Types.ObjectId(userId) });
  if (!rule) throw ApiError.notFound('Recurring transaction not found');

  const type = rule.type as TransactionType;

  if (patch.accountId || patch.destinationAccountId || patch.categoryId) {
    const refs = await resolveReferences(userId, {
      type,
      accountId: patch.accountId ?? String(rule.accountId),
      destinationAccountId:
        type === 'transfer'
          ? (patch.destinationAccountId ?? String(rule.destinationAccountId))
          : undefined,
      categoryId:
        type === 'transfer' ? undefined : (patch.categoryId ?? String(rule.categoryId)),
    });
    rule.accountId = refs.accountId;
    rule.destinationAccountId = refs.destinationAccountId;
    rule.categoryId = refs.categoryId;
  }

  if (patch.name !== undefined) rule.name = patch.name;
  if (patch.amount !== undefined) rule.amount = patch.amount;
  if (patch.description !== undefined) rule.description = patch.description;
  if (patch.paymentMethod !== undefined) rule.paymentMethod = patch.paymentMethod;
  if (patch.endDate !== undefined) rule.endDate = patch.endDate;
  if (patch.maxOccurrences !== undefined) rule.maxOccurrences = patch.maxOccurrences;
  if (patch.autoCreate !== undefined) rule.autoCreate = patch.autoCreate;

  // Changing the shape of the schedule re-anchors it. Keeping the old occurrence
  // count would mean "every month from the 1st" changed to "every week" fires
  // for the first time forty weeks from now.
  const scheduleChanged =
    patch.unit !== undefined || patch.interval !== undefined || patch.startDate !== undefined;

  if (scheduleChanged) {
    const zone = await timezoneOf(userId);
    rule.unit = patch.unit ?? rule.unit;
    rule.interval = patch.interval ?? rule.interval;
    rule.startDate = patch.startDate ?? rule.startDate;

    const schedule = initialSchedule(
      rule.startDate,
      rule.unit as RecurrenceUnit,
      rule.interval,
      zone,
    );
    rule.occurrencesCreated = schedule.occurrencesCreated;
    rule.nextRunAt = schedule.nextRunAt;
    rule.isActive = !hasFinished(rule);
  }

  await rule.save();
  return toPublicRecurring(rule);
}

/**
 * Pausing keeps the rule's place in the schedule, not its clock.
 *
 * Resuming fast-forwards past every occurrence that would have fired while it was
 * paused: a gym membership paused for three months must not write three months of
 * backdated charges the moment it comes back, which is exactly what "just keep
 * `nextRunAt` where it was" would do.
 */
export async function setPaused(
  userId: string,
  id: string,
  paused: boolean,
): Promise<PublicRecurring> {
  const rule = await RecurringModel.findOne({ _id: id, userId: new Types.ObjectId(userId) });
  if (!rule) throw ApiError.notFound('Recurring transaction not found');

  if (!paused && rule.isPaused) {
    const zone = await timezoneOf(userId);
    const schedule = initialSchedule(
      rule.startDate,
      rule.unit as RecurrenceUnit,
      rule.interval,
      zone,
    );
    rule.occurrencesCreated = schedule.occurrencesCreated;
    rule.nextRunAt = schedule.nextRunAt;
    rule.isActive = !hasFinished(rule);
  }

  rule.isPaused = paused;
  await rule.save();
  return toPublicRecurring(rule);
}

/**
 * Deletes the rule, never the transactions it wrote.
 *
 * Those are real money that really moved; removing them would rewrite closed
 * months to make a list screen tidier.
 */
export async function deleteRecurring(userId: string, id: string): Promise<void> {
  const result = await RecurringModel.deleteOne({
    _id: id,
    userId: new Types.ObjectId(userId),
  });
  if (result.deletedCount === 0) throw ApiError.notFound('Recurring transaction not found');
}

/** The next few charges, for the strip on Home. */
export async function listUpcoming(
  userId: string,
  withinDays: number,
  limit: number,
): Promise<PublicRecurring[]> {
  const until = new Date(Date.now() + withinDays * 86_400_000);
  const rules = await RecurringModel.find({
    userId: new Types.ObjectId(userId),
    isActive: true,
    isPaused: false,
    nextRunAt: { $lte: until },
  })
    .sort({ nextRunAt: 1 })
    .limit(limit)
    .lean();

  return rules.map(toPublicRecurring);
}

/** Used in notification copy, and by the tests. */
export function describeNext(rule: { nextRunAt: Date }, zone: string): string {
  return formatDay(rule.nextRunAt, zone);
}
