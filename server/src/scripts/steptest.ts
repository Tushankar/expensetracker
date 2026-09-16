/* eslint-disable no-console */
import assert from 'node:assert/strict';

import { DateTime } from 'luxon';

import {
  monthKey,
  monthRange,
  monthRangeFromKey,
  occurrenceAt,
  occurrencesElapsed,
  parseLocalDay,
  weekRange,
  zoneOrDefault,
} from '../lib/time';
import { hasFinished, initialSchedule, scheduleLabel } from '../modules/recurring/recurring.service';

/**
 * Checks for the step-3 additions: budgets, recurring rules, notification
 * de-duplication, and the date arithmetic all three depend on.
 *
 *   npm run dev          (in one terminal)
 *   npm run test:step    (in another)
 *
 * The timezone and recurrence sections run in-process against `lib/time.ts` —
 * no server needed, and no database to seed with dates just to assert that
 * "monthly on the 31st" survives February. Everything after them talks HTTP.
 */

const BASE = process.env.API_URL ?? 'http://localhost:4000/api/v1';

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
    passed += 1;
    console.log(`  [32mPASS[0m  ${name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}\n        ${message.split('\n').join('\n        ')}`);
    console.log(`  [31mFAIL[0m  ${name}`);
    console.log(`        ${message.split('\n')[0]}`);
  }
}

function section(title: string): void {
  console.log(`\n[1m${title}[0m`);
}

type Envelope<T> = {
  success: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string; issues?: { field: string; message: string }[] };
};

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Envelope<T> }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) as Envelope<T> };
  } catch {
    throw new Error(`${method} ${path} returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
}

function data<T>(response: { status: number; body: Envelope<T> }): T {
  if (!response.body.success || !response.body.data) {
    throw new Error(
      `expected success, got ${response.status} ${response.body.error?.code}: ${response.body.error?.message}`,
    );
  }
  return response.body.data;
}

function expectError(response: { status: number; body: Envelope<unknown> }, status: number): void {
  assert.equal(response.status, status, `expected HTTP ${status}, got ${response.status}`);
  assert.equal(response.body.success, false);
}

const rupees = (value: number) => Math.round(value * 100);

/**
 * Polls until a condition holds, or gives up.
 *
 * The budget check is deliberately fire-and-forget — an alert must never hold up
 * the transaction that triggered it — so asserting on it means waiting for a
 * result rather than sleeping a guessed interval and hoping.
 */
async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  { timeoutMs = 5000, everyMs = 150 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let latest = await read();

  while (!done(latest) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, everyMs));
    latest = await read();
  }

  return latest;
}


const IST = 'Asia/Kolkata';
/** A zone with DST and a non-hour offset, to catch anything hard-coded to IST. */
const CHATHAM = 'Pacific/Chatham';

type Budget = {
  id: string;
  scope: string;
  categoryId: string | null;
  amount: number;
  spent: number;
  remaining: number;
  overBy: number;
  percent: number;
  state: 'on_track' | 'warning' | 'exceeded';
};
type BudgetSummary = {
  month: string;
  overall: Budget | null;
  categories: Budget[];
  totals: { budgeted: number; spent: number; unbudgetedSpend: number };
};
type Recurring = {
  id: string;
  name: string;
  nextRunAt: string | null;
  occurrencesCreated: number;
  isPaused: boolean;
  isActive: boolean;
  scheduleLabel: string;
  unit: string;
  interval: number;
};
type Notification = { id: string; type: string; title: string; read: boolean };
type Category = { id: string; name: string; type: string };
type Account = { id: string; balance: number };
type Session = { accessToken: string; refreshToken: string; user: { id: string } };

async function main(): Promise<void> {
  console.log(`\nPaisa step-3 checks — ${BASE}\n${'='.repeat(62)}`);

  // ============================================================ time, offline
  section('Time zones and boundaries');

  await test('a month range is local midnight to local end of month', () => {
    // 23:30 IST on the 30th is already the 1st in UTC. The month it belongs to
    // is September either way, and that is the whole point.
    const lateOnTheLast = DateTime.fromISO('2026-09-30T23:30:00', { zone: IST }).toJSDate();
    assert.equal(monthKey(lateOnTheLast, IST), '2026-09');

    const { from, to } = monthRange(lateOnTheLast, IST);
    assert.equal(DateTime.fromJSDate(from, { zone: IST }).toFormat('yyyy-MM-dd HH:mm'), '2026-09-01 00:00');
    assert.equal(DateTime.fromJSDate(to, { zone: IST }).toFormat('yyyy-MM-dd HH:mm'), '2026-09-30 23:59');
  });

  await test('the same instant belongs to different months in different zones', () => {
    // 2026-10-01T02:00 IST is 2026-09-30T20:30 UTC and 2026-09-30T13:30 in
    // New York. A user in each place is right about their own month.
    const instant = DateTime.fromISO('2026-10-01T02:00:00', { zone: IST }).toJSDate();
    assert.equal(monthKey(instant, IST), '2026-10');
    assert.equal(monthKey(instant, 'America/New_York'), '2026-09');
  });

  await test('a month key round-trips through its range', () => {
    const { from, to } = monthRangeFromKey('2026-02', IST);
    assert.equal(monthKey(from, IST), '2026-02');
    assert.equal(monthKey(to, IST), '2026-02');
    // February is 28 days in 2026 and the range must not leak into March.
    assert.equal(DateTime.fromJSDate(to, { zone: IST }).day, 28);
  });

  await test('a leap February ends on the 29th', () => {
    const { to } = monthRangeFromKey('2028-02', IST);
    assert.equal(DateTime.fromJSDate(to, { zone: IST }).day, 29);
  });

  await test('a week runs Monday to Sunday', () => {
    const wednesday = DateTime.fromISO('2026-09-16T12:00:00', { zone: IST }).toJSDate();
    const { from, to } = weekRange(wednesday, IST);
    assert.equal(DateTime.fromJSDate(from, { zone: IST }).toFormat('ccc dd'), 'Mon 14');
    assert.equal(DateTime.fromJSDate(to, { zone: IST }).toFormat('ccc dd'), 'Sun 20');
  });

  await test('a custom range parses calendar dates as local days', () => {
    const start = parseLocalDay('2026-09-12', IST, 'start');
    const end = parseLocalDay('2026-09-12', IST, 'end');
    assert.equal(DateTime.fromJSDate(start, { zone: IST }).toFormat('HH:mm:ss'), '00:00:00');
    assert.equal(DateTime.fromJSDate(end, { zone: IST }).toFormat('HH:mm:ss'), '23:59:59');
    assert.ok(end.getTime() > start.getTime());
  });

  await test('an unknown zone falls back instead of poisoning every boundary', () => {
    assert.equal(zoneOrDefault('Mars/Olympus_Mons'), IST);
    assert.equal(zoneOrDefault(undefined), IST);
    assert.equal(zoneOrDefault('America/New_York'), 'America/New_York');
  });

  await test('boundaries hold in a zone with DST and a 45-minute offset', () => {
    const { from, to } = monthRangeFromKey('2026-04', CHATHAM);
    assert.equal(DateTime.fromJSDate(from, { zone: CHATHAM }).toFormat('dd HH:mm'), '01 00:00');
    assert.equal(DateTime.fromJSDate(to, { zone: CHATHAM }).toFormat('dd HH:mm'), '30 23:59');
  });

  // ================================================================ recurrence
  section('Recurrence arithmetic');

  await test('monthly on the 31st keeps the 31st instead of collapsing to the 28th', () => {
    const anchor = DateTime.fromISO('2026-01-31T09:00:00', { zone: IST }).toJSDate();
    const days = [0, 1, 2, 3, 4].map((index) =>
      DateTime.fromJSDate(occurrenceAt(anchor, 'month', 1, index, IST), { zone: IST }).toFormat(
        'yyyy-MM-dd',
      ),
    );
    // February clamps, and March recovers — which is what "the 31st" means.
    assert.deepEqual(days, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  await test('the time of day survives every step', () => {
    const anchor = DateTime.fromISO('2026-01-15T07:45:00', { zone: IST }).toJSDate();
    for (const index of [1, 6, 13]) {
      const next = DateTime.fromJSDate(occurrenceAt(anchor, 'month', 1, index, IST), { zone: IST });
      assert.equal(next.toFormat('HH:mm'), '07:45');
    }
  });

  await test('weekly, yearly and custom intervals all advance correctly', () => {
    const anchor = DateTime.fromISO('2026-09-16T10:00:00', { zone: IST }).toJSDate();
    const format = (unit: 'day' | 'week' | 'month' | 'year', interval: number, index: number) =>
      DateTime.fromJSDate(occurrenceAt(anchor, unit, interval, index, IST), { zone: IST }).toFormat(
        'yyyy-MM-dd',
      );

    assert.equal(format('week', 1, 1), '2026-09-23');
    assert.equal(format('week', 2, 1), '2026-09-30');
    assert.equal(format('year', 1, 1), '2027-09-16');
    assert.equal(format('day', 10, 3), '2026-10-16');
    assert.equal(format('month', 3, 2), '2027-03-16');
  });

  await test('elapsed occurrences are counted, not looped', () => {
    const anchor = DateTime.fromISO('2026-01-01T00:00:00', { zone: IST }).toJSDate();
    const june = DateTime.fromISO('2026-06-15T00:00:00', { zone: IST }).toJSDate();
    assert.equal(occurrencesElapsed(anchor, 'month', 1, june, IST), 5);
    assert.equal(occurrencesElapsed(anchor, 'month', 2, june, IST), 2);
    // Before the anchor is zero, never negative.
    const lastYear = DateTime.fromISO('2025-06-15T00:00:00', { zone: IST }).toJSDate();
    assert.equal(occurrencesElapsed(anchor, 'month', 1, lastYear, IST), 0);
  });

  await test('a rule started in the past catches up once, not nine times', () => {
    const now = DateTime.fromISO('2026-09-16T12:00:00', { zone: IST }).toJSDate();
    const january = DateTime.fromISO('2026-01-05T09:00:00', { zone: IST }).toJSDate();

    const schedule = initialSchedule(january, 'month', 1, IST, now);

    // September's charge is real and is recorded. The eight between January and
    // August are skipped: a rule added in September must not rewrite closed
    // months or wreck the balance with eight backdated debits.
    assert.equal(
      DateTime.fromJSDate(schedule.nextRunAt, { zone: IST }).toFormat('yyyy-MM-dd'),
      '2026-09-05',
    );
    assert.equal(schedule.occurrencesCreated, 8);
  });

  await test('resuming a paused rule skips to the future instead of catching up', () => {
    const now = DateTime.fromISO('2026-09-16T12:00:00', { zone: IST }).toJSDate();
    const january = DateTime.fromISO('2026-01-05T09:00:00', { zone: IST }).toJSDate();

    const schedule = initialSchedule(january, 'month', 1, IST, now, 'skipToFuture');

    // Someone who paused deliberately and resumed deliberately must not be
    // charged on the way back in.
    assert.ok(schedule.nextRunAt.getTime() > now.getTime());
    assert.equal(
      DateTime.fromJSDate(schedule.nextRunAt, { zone: IST }).toFormat('yyyy-MM-dd'),
      '2026-10-05',
    );
    assert.equal(schedule.occurrencesCreated, 9);
  });

  await test('a rule starting in the future runs first on its start date', () => {
    const now = DateTime.fromISO('2026-09-16T12:00:00', { zone: IST }).toJSDate();
    const later = DateTime.fromISO('2026-12-01T09:00:00', { zone: IST }).toJSDate();
    const schedule = initialSchedule(later, 'month', 1, IST, now);
    assert.equal(schedule.occurrencesCreated, 0);
    assert.equal(schedule.nextRunAt.getTime(), later.getTime());
  });

  await test('a rule stops at its occurrence cap and at its end date', () => {
    const anchor = new Date('2026-01-01T00:00:00Z');
    assert.equal(hasFinished({ occurrencesCreated: 3, maxOccurrences: 3, nextRunAt: anchor }), true);
    assert.equal(hasFinished({ occurrencesCreated: 2, maxOccurrences: 3, nextRunAt: anchor }), false);
    assert.equal(
      hasFinished({
        occurrencesCreated: 1,
        endDate: new Date('2025-12-01T00:00:00Z'),
        nextRunAt: anchor,
      }),
      true,
    );
  });

  await test('schedule labels read like English', () => {
    assert.equal(scheduleLabel('month', 1), 'Every month');
    assert.equal(scheduleLabel('week', 2), 'Every 2 weeks');
    assert.equal(scheduleLabel('year', 1), 'Every year');
    assert.equal(scheduleLabel('day', 10), 'Every 10 days');
  });

  // ===================================================================== setup
  section('Setup');

  const stamp = Date.now();
  const email = `step3.${stamp}@paisa.test`;
  const password = 'Password123';

  let session: Session = { accessToken: '', refreshToken: '', user: { id: '' } };
  let bankId = '';
  let cashId = '';
  let foodCategoryId = '';
  let transportCategoryId = '';
  let salaryCategoryId = '';
  let token = '';

  await test('an account is registered and stocked', async () => {
    session = data(
      await call<Session>('POST', '/auth/register', {
        body: { name: 'Step Three', email, password },
      }),
    );
    token = session.accessToken;

    // Names that cannot collide with the two accounts registration seeds
    // ("Cash" and "Bank Account"), which would 409 and cascade into every
    // assertion below.
    const bank = data(
      await call<{ account: Account }>('POST', '/accounts', {
        token,
        body: { name: 'HDFC Savings', type: 'bank', balance: rupees(100000) },
      }),
    ).account;
    const cash = data(
      await call<{ account: Account }>('POST', '/accounts', {
        token,
        body: { name: 'Pocket Cash', type: 'cash', balance: rupees(5000) },
      }),
    ).account;
    bankId = bank.id;
    cashId = cash.id;

    const { categories } = data(
      await call<{ categories: Category[] }>('GET', '/categories', { token }),
    );
    foodCategoryId = categories.find((c) => c.name === 'Restaurants')!.id;
    transportCategoryId = categories.find((c) => c.name === 'Petrol')!.id;
    salaryCategoryId = categories.find((c) => c.name === 'Salary')!.id;

    assert.ok(bankId && cashId && foodCategoryId && transportCategoryId && salaryCategoryId);
  });

  await test('the profile carries a timezone and notification preferences', async () => {
    const { user } = data(
      await call<{ user: { timezone: string; notificationPrefs: Record<string, boolean> } }>(
        'GET',
        '/users/me',
        { token },
      ),
    );
    assert.equal(user.timezone, IST);
    assert.equal(user.notificationPrefs.budgetAlerts, true);
  });

  await test('an unrecognised timezone is refused', async () => {
    expectError(
      await call('PATCH', '/users/me', { token, body: { timezone: 'Mars/Olympus_Mons' } }),
      400,
    );
  });

  // =================================================================== budgets
  section('Budgets');

  const thisMonth = monthKey(new Date(), IST);
  let foodBudgetId = '';
  let overallBudgetId = '';

  await test('a new account has no budgets and no spend', async () => {
    const { summary } = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${thisMonth}`, { token }),
    );
    assert.equal(summary.overall, null);
    assert.equal(summary.categories.length, 0);
    assert.equal(summary.totals.spent, 0);
  });

  await test('an overall and a category budget can be created', async () => {
    overallBudgetId = data(
      await call<{ budget: Budget }>('POST', '/budgets', {
        token,
        body: { scope: 'overall', amount: rupees(30000) },
      }),
    ).budget.id;

    const food = data(
      await call<{ budget: Budget }>('POST', '/budgets', {
        token,
        body: { scope: 'category', categoryId: foodCategoryId, amount: rupees(7000) },
      }),
    ).budget;

    foodBudgetId = food.id;
    assert.equal(food.amount, rupees(7000));
    assert.equal(food.spent, 0);
    assert.equal(food.remaining, rupees(7000));
    assert.equal(food.percent, 0);
    assert.equal(food.state, 'on_track');
  });

  await test('a second budget for the same target is refused', async () => {
    expectError(
      await call('POST', '/budgets', { token, body: { scope: 'overall', amount: rupees(1) } }),
      409,
    );
    expectError(
      await call('POST', '/budgets', {
        token,
        body: { scope: 'category', categoryId: foodCategoryId, amount: rupees(1) },
      }),
      409,
    );
  });

  await test('an income category cannot be budgeted', async () => {
    expectError(
      await call('POST', '/budgets', {
        token,
        body: { scope: 'category', categoryId: salaryCategoryId, amount: rupees(1000) },
      }),
      400,
    );
  });

  await test('spending moves the budget, and the arithmetic adds up', async () => {
    await call('POST', '/transactions', {
      token,
      body: {
        type: 'expense',
        amount: rupees(5000),
        categoryId: foodCategoryId,
        accountId: bankId,
        merchant: 'Toit',
      },
    });

    const { summary } = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${thisMonth}`, { token }),
    );
    const food = summary.categories.find((budget) => budget.id === foodBudgetId)!;

    // The example from the brief: ₹5,000 / ₹7,000.
    assert.equal(food.spent, rupees(5000));
    assert.equal(food.amount, rupees(7000));
    assert.equal(food.remaining, rupees(2000));
    assert.equal(food.percent, 71);
    assert.equal(food.overBy, 0);
    assert.equal(food.spent + food.remaining, food.amount, 'spent + remaining must be the cap');
  });

  await test('crossing the warn threshold flips the state, not the numbers', async () => {
    await call('POST', '/transactions', {
      token,
      body: {
        type: 'expense',
        amount: rupees(700),
        categoryId: foodCategoryId,
        accountId: bankId,
        merchant: 'Swiggy',
      },
    });

    const { summary } = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${thisMonth}`, { token }),
    );
    const food = summary.categories.find((budget) => budget.id === foodBudgetId)!;
    assert.equal(food.spent, rupees(5700));
    assert.equal(food.percent, 81);
    assert.equal(food.state, 'warning');
  });

  await test('going over reports how far over, and remaining stops at zero', async () => {
    await call('POST', '/transactions', {
      token,
      body: {
        type: 'expense',
        amount: rupees(2000),
        categoryId: foodCategoryId,
        accountId: bankId,
        merchant: 'Dinner',
      },
    });

    const { summary } = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${thisMonth}`, { token }),
    );
    const food = summary.categories.find((budget) => budget.id === foodBudgetId)!;

    assert.equal(food.spent, rupees(7700));
    assert.equal(food.state, 'exceeded');
    assert.equal(food.overBy, rupees(700));
    // "Remaining" is never negative — that is what `overBy` is for.
    assert.equal(food.remaining, 0);
    assert.equal(food.percent, 110);
  });

  await test('a transfer never consumes a budget', async () => {
    const before = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${thisMonth}`, { token }),
    ).summary;

    await call('POST', '/transactions', {
      token,
      body: {
        type: 'transfer',
        amount: rupees(20000),
        accountId: bankId,
        destinationAccountId: cashId,
      },
    });

    const after = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${thisMonth}`, { token }),
    ).summary;

    assert.equal(after.totals.spent, before.totals.spent, 'a transfer reached the budget totals');
    assert.equal(after.overall?.spent, before.overall?.spent);
  });

  await test('income never consumes a budget either', async () => {
    const before = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${thisMonth}`, { token }),
    ).summary;

    await call('POST', '/transactions', {
      token,
      body: {
        type: 'income',
        amount: rupees(150000),
        categoryId: salaryCategoryId,
        accountId: bankId,
      },
    });

    const after = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${thisMonth}`, { token }),
    ).summary;
    assert.equal(after.totals.spent, before.totals.spent);
  });

  await test('spending outside a budgeted category is reported separately', async () => {
    await call('POST', '/transactions', {
      token,
      body: {
        type: 'expense',
        amount: rupees(2100),
        categoryId: transportCategoryId,
        accountId: bankId,
        merchant: 'Indian Oil',
      },
    });

    const { summary } = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${thisMonth}`, { token }),
    );
    assert.equal(summary.totals.unbudgetedSpend, rupees(2100));
    assert.equal(summary.overall?.spent, rupees(9800), 'the overall budget counts everything');
  });

  await test('another month is a clean slate for the same budgets', async () => {
    const previous = DateTime.now().setZone(IST).minus({ months: 1 }).toFormat('yyyy-MM');
    const { summary } = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${previous}`, { token }),
    );
    // Same caps, no spend — a budget is a standing rule, not a row per month.
    assert.equal(summary.categories.length, 1);
    assert.equal(summary.categories[0]?.spent, 0);
    assert.equal(summary.categories[0]?.state, 'on_track');
  });

  await test('a budget can be raised, and progress recalculates', async () => {
    const budget = data(
      await call<{ budget: Budget }>('PATCH', `/budgets/${foodBudgetId}`, {
        token,
        body: { amount: rupees(12000) },
      }),
    ).budget;
    assert.equal(budget.amount, rupees(12000));
    assert.equal(budget.spent, rupees(7700));
    assert.equal(budget.state, 'on_track');
    assert.equal(budget.remaining, rupees(4300));
  });

  await test('a deleted budget leaves the transactions alone', async () => {
    const response = await call('DELETE', `/budgets/${overallBudgetId}`, { token });
    assert.equal(response.status, 200);

    const { summary } = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${thisMonth}`, { token }),
    );
    assert.equal(summary.overall, null);
    assert.equal(summary.totals.spent, rupees(9800), 'deleting a cap must not delete the spend');
  });

  await test('a malformed month is refused rather than guessed at', async () => {
    expectError(await call('GET', '/budgets?month=2026-13', { token }), 400);
    expectError(await call('GET', '/budgets?month=September', { token }), 400);
  });

  // ================================================================== recurring
  section('Recurring transactions');

  let rentRuleId = '';

  await test('a rule can be created with a monthly schedule', async () => {
    const rule = data(
      await call<{ recurring: Recurring }>('POST', '/recurring', {
        token,
        body: {
          name: 'Rent',
          type: 'expense',
          amount: rupees(18500),
          categoryId: foodCategoryId,
          accountId: bankId,
          unit: 'month',
          interval: 1,
          startDate: DateTime.now().setZone(IST).plus({ days: 5 }).toISO(),
        },
      }),
    ).recurring;

    rentRuleId = rule.id;
    assert.equal(rule.scheduleLabel, 'Every month');
    assert.equal(rule.occurrencesCreated, 0);
    assert.ok(rule.nextRunAt);
    assert.ok(new Date(rule.nextRunAt).getTime() > Date.now());
  });

  await test('a rule whose references are not yours is refused', async () => {
    const other = data(
      await call<Session>('POST', '/auth/register', {
        body: { name: 'Other', email: `other.${stamp}@paisa.test`, password },
      }),
    );
    expectError(
      await call('POST', '/recurring', {
        token: other.accessToken,
        body: {
          name: 'Hijack',
          type: 'expense',
          amount: rupees(100),
          categoryId: foodCategoryId,
          accountId: bankId,
          unit: 'month',
          startDate: new Date().toISOString(),
        },
      }),
      404,
    );
  });

  await test('a due rule writes its transaction and moves the balance', async () => {
    const balanceBefore = data(
      await call<{ account: Account }>('GET', `/accounts/${cashId}`, { token }),
    ).account.balance;

    const rule = data(
      await call<{ recurring: Recurring }>('POST', '/recurring', {
        token,
        body: {
          name: 'Netflix',
          type: 'expense',
          amount: rupees(649),
          categoryId: foodCategoryId,
          accountId: cashId,
          unit: 'month',
          interval: 1,
          // Yesterday, so the very first pass has something to do.
          startDate: DateTime.now().setZone(IST).minus({ days: 1 }).toISO(),
        },
      }),
    ).recurring;

    await call('POST', '/recurring/run', { token });

    const after = data(await call<{ account: Account }>('GET', `/accounts/${cashId}`, { token }))
      .account.balance;
    assert.equal(after, balanceBefore - rupees(649));

    const refreshed = data(
      await call<{ recurring: Recurring }>('GET', `/recurring/${rule.id}`, { token }),
    ).recurring;
    assert.ok(refreshed.occurrencesCreated >= 1);
    assert.ok(new Date(refreshed.nextRunAt!).getTime() > Date.now(), 'next run did not advance');

    const rows = data(
      await call<{ transactions: { merchant: string }[] }>('GET', '/transactions?q=Netflix', {
        token,
      }),
    ).transactions;
    assert.equal(rows.length, 1);
  });

  await test('running the scheduler again does not bill twice', async () => {
    const before = data(
      await call<{ account: Account }>('GET', `/accounts/${cashId}`, { token }),
    ).account.balance;

    await call('POST', '/recurring/run', { token });
    await call('POST', '/recurring/run', { token });

    const after = data(await call<{ account: Account }>('GET', `/accounts/${cashId}`, { token }))
      .account.balance;
    assert.equal(after, before, 'a repeat pass wrote another transaction');
  });

  await test('pausing stops it, and resuming does not backfill', async () => {
    const rule = data(
      await call<{ recurring: Recurring }>('POST', '/recurring', {
        token,
        body: {
          name: 'Gym',
          type: 'expense',
          amount: rupees(2500),
          categoryId: foodCategoryId,
          accountId: cashId,
          unit: 'month',
          startDate: DateTime.now().setZone(IST).minus({ months: 4 }).toISO(),
        },
      }),
    ).recurring;

    const paused = data(
      await call<{ recurring: Recurring }>('POST', `/recurring/${rule.id}/pause`, {
        token,
        body: { paused: true },
      }),
    ).recurring;
    assert.equal(paused.isPaused, true);

    const balanceBefore = data(
      await call<{ account: Account }>('GET', `/accounts/${cashId}`, { token }),
    ).account.balance;
    await call('POST', '/recurring/run', { token });
    assert.equal(
      data(await call<{ account: Account }>('GET', `/accounts/${cashId}`, { token })).account
        .balance,
      balanceBefore,
      'a paused rule fired',
    );

    const resumed = data(
      await call<{ recurring: Recurring }>('POST', `/recurring/${rule.id}/pause`, {
        token,
        body: { paused: false },
      }),
    ).recurring;
    assert.equal(resumed.isPaused, false);
    assert.ok(
      new Date(resumed.nextRunAt!).getTime() > Date.now(),
      'resuming left the next run in the past, which would backfill four months',
    );

    await call('POST', '/recurring/run', { token });
    assert.equal(
      data(await call<{ account: Account }>('GET', `/accounts/${cashId}`, { token })).account
        .balance,
      balanceBefore,
      'resuming wrote backdated charges',
    );
  });

  await test('a rule stops at its occurrence cap', async () => {
    const rule = data(
      await call<{ recurring: Recurring }>('POST', '/recurring', {
        token,
        body: {
          name: 'Two instalments',
          type: 'expense',
          amount: rupees(100),
          categoryId: foodCategoryId,
          accountId: cashId,
          unit: 'day',
          interval: 1,
          maxOccurrences: 2,
          // One day back: position 1 is due now, and writing it reaches the cap.
          startDate: DateTime.now().setZone(IST).minus({ days: 1 }).toISO(),
        },
      }),
    ).recurring;

    await call('POST', '/recurring/run', { token });

    const after = data(
      await call<{ recurring: Recurring }>('GET', `/recurring/${rule.id}`, { token }),
    ).recurring;
    assert.ok(after.occurrencesCreated >= 2);
    assert.equal(after.isActive, false, 'the rule kept going past its cap');
    assert.equal(after.nextRunAt, null);
  });

  await test('editing the schedule re-anchors it', async () => {
    const rule = data(
      await call<{ recurring: Recurring }>('PATCH', `/recurring/${rentRuleId}`, {
        token,
        body: { unit: 'week', interval: 2 },
      }),
    ).recurring;
    assert.equal(rule.scheduleLabel, 'Every 2 weeks');
    assert.ok(new Date(rule.nextRunAt!).getTime() > Date.now());
  });

  await test('an end date before the start date is refused', async () => {
    expectError(
      await call('POST', '/recurring', {
        token,
        body: {
          name: 'Backwards',
          type: 'expense',
          amount: rupees(100),
          categoryId: foodCategoryId,
          accountId: cashId,
          unit: 'month',
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2026-01-01T00:00:00.000Z',
        },
      }),
      400,
    );
  });

  await test('a transfer rule needs a destination, and refuses the same account', async () => {
    expectError(
      await call('POST', '/recurring', {
        token,
        body: {
          name: 'Savings sweep',
          type: 'transfer',
          amount: rupees(5000),
          accountId: bankId,
          destinationAccountId: bankId,
          unit: 'month',
          startDate: new Date().toISOString(),
        },
      }),
      400,
    );
  });

  await test('the upcoming list is ordered by what comes next', async () => {
    const { recurring } = data(
      await call<{ recurring: Recurring[] }>('GET', '/recurring/upcoming?withinDays=60', { token }),
    );
    const times = recurring.map((rule) => new Date(rule.nextRunAt!).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    assert.ok(recurring.every((rule) => rule.isActive && !rule.isPaused));
  });

  await test('deleting a rule keeps the transactions it already wrote', async () => {
    const before = data(
      await call<{ transactions: unknown[] }>('GET', '/transactions?q=Netflix', { token }),
    ).transactions.length;

    const { recurring } = data(
      await call<{ recurring: Recurring[] }>('GET', '/recurring?includeInactive=true', { token }),
    );
    const netflix = recurring.find((rule) => rule.name === 'Netflix')!;
    await call('DELETE', `/recurring/${netflix.id}`, { token });

    expectError(await call('GET', `/recurring/${netflix.id}`, { token }), 404);
    assert.equal(
      data(await call<{ transactions: unknown[] }>('GET', '/transactions?q=Netflix', { token }))
        .transactions.length,
      before,
      'deleting a rule rewrote history',
    );
  });

  // ============================================================== notifications
  section('Notifications');

  await test('crossing a budget raised exactly one warning and one exceeded alert', async () => {
    const notifications = await waitFor(
      async () =>
        data(
          await call<{ notifications: Notification[]; unread: number }>('GET', '/notifications', {
            token,
          }),
        ).notifications,
      (rows) =>
        rows.some((row) => row.type === 'budget_warning') &&
        rows.some((row) => row.type === 'budget_exceeded'),
    );

    const warnings = notifications.filter((row) => row.type === 'budget_warning');
    const exceeded = notifications.filter((row) => row.type === 'budget_exceeded');

    // Three expenses crossed 80%, and one crossed 100%. Each is news once.
    assert.equal(warnings.length, 1, `expected 1 warning, got ${warnings.length}`);
    assert.equal(exceeded.length, 1, `expected 1 exceeded, got ${exceeded.length}`);
  });

  await test('more spending in the same month does not re-announce it', async () => {
    const before = data(
      await call<{ notifications: Notification[] }>('GET', '/notifications', { token }),
    ).notifications.length;

    for (let index = 0; index < 4; index += 1) {
      await call('POST', '/transactions', {
        token,
        body: {
          type: 'expense',
          amount: rupees(500),
          categoryId: foodCategoryId,
          accountId: bankId,
          merchant: `Spam ${index}`,
        },
      });
    }
    // Nothing to wait *for* here — the assertion is that nothing new arrives — so
    // this is the one place a fixed pause is the right tool.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const after = data(
      await call<{ notifications: Notification[] }>('GET', '/notifications', { token }),
    ).notifications.length;
    assert.equal(after, before, `four more expenses produced ${after - before} extra alerts`);
  });

  await test('a recurring charge announces itself once', async () => {
    const { notifications } = data(
      await call<{ notifications: Notification[] }>('GET', '/notifications', { token }),
    );
    const created = notifications.filter((row) => row.type === 'recurring_created');
    assert.ok(created.length >= 1, 'no recorded-charge alert');

    const titles = created.map((row) => row.title);
    assert.equal(new Set(titles).size, titles.length, 'the same charge was announced twice');
  });

  await test('the unread count matches, and marking read moves it', async () => {
    const { unread } = data(await call<{ unread: number }>('GET', '/notifications/unread-count', { token }));
    assert.ok(unread > 0);

    const { notifications } = data(
      await call<{ notifications: Notification[] }>('GET', '/notifications', { token }),
    );
    const first = notifications[0]!;

    const read = data(
      await call<{ notification: Notification }>('POST', `/notifications/${first.id}/read`, { token }),
    ).notification;
    assert.equal(read.read, true);

    const after = data(
      await call<{ unread: number }>('GET', '/notifications/unread-count', { token }),
    ).unread;
    assert.equal(after, unread - 1);

    // Reading twice is not an error — two taps on one row must not fail.
    assert.equal(
      (await call(`POST`, `/notifications/${first.id}/read`, { token })).status,
      200,
    );
  });

  await test('read-all clears the badge', async () => {
    await call('POST', '/notifications/read-all', { token });
    assert.equal(
      data(await call<{ unread: number }>('GET', '/notifications/unread-count', { token })).unread,
      0,
    );
  });

  await test('turning an alert off stops it at the source', async () => {
    await call('PATCH', '/users/me', {
      token,
      body: { notificationPrefs: { budgetAlerts: false } },
    });

    // A fresh category budget that is immediately blown would normally alert.
    const budget = data(
      await call<{ budget: Budget }>('POST', '/budgets', {
        token,
        body: { scope: 'category', categoryId: transportCategoryId, amount: rupees(100) },
      }),
    ).budget;

    await call('POST', '/transactions', {
      token,
      body: {
        type: 'expense',
        amount: rupees(5000),
        categoryId: transportCategoryId,
        accountId: bankId,
        merchant: 'Fuel',
      },
    });
    // Again an absence, so a fixed pause is right: there is no arrival to await.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const { notifications } = data(
      await call<{ notifications: Notification[] }>('GET', '/notifications', { token }),
    );
    const forThisBudget = notifications.filter(
      (row) => row.type === 'budget_exceeded' && row.title.includes('Petrol'),
    );
    assert.equal(forThisBudget.length, 0, 'an alert arrived with the preference off');

    // Put it back for anything after this.
    await call('PATCH', '/users/me', {
      token,
      body: { notificationPrefs: { budgetAlerts: true } },
    });
    assert.ok(budget.id);
  });

  await test('a device token can be registered and removed', async () => {
    const deviceToken = `ExponentPushToken[${stamp}]`;
    assert.equal(
      (await call('POST', '/notifications/device', { token, body: { token: deviceToken } })).status,
      200,
    );
    assert.equal(
      (await call('DELETE', '/notifications/device', { token, body: { token: deviceToken } }))
        .status,
      200,
    );
  });

  await test("one user cannot read another's notifications", async () => {
    const outsider = data(
      await call<Session>('POST', '/auth/register', {
        body: { name: 'Outsider', email: `out.${stamp}@paisa.test`, password },
      }),
    );
    const { notifications } = data(
      await call<{ notifications: Notification[] }>('GET', '/notifications', {
        token: outsider.accessToken,
      }),
    );
    assert.equal(notifications.length, 0);
  });

  // ================================================================== dashboard
  section('Dashboard aggregations');

  await test('daily spending is bucketed by local day', async () => {
    const { from, to } = monthRange(new Date(), IST);
    const { days } = data(
      await call<{ days: { date: string; expense: number; income: number; count: number }[] }>(
        'GET',
        `/transactions/daily?from=${from.toISOString()}&to=${to.toISOString()}`,
        { token },
      ),
    );

    assert.ok(days.length > 0);
    assert.ok(days.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date)));
    assert.deepEqual(
      days.map((day) => day.date),
      [...days.map((day) => day.date)].sort(),
      'days are not in order',
    );

    const today = DateTime.now().setZone(IST).toFormat('yyyy-MM-dd');
    const todayRow = days.find((day) => day.date === today);
    assert.ok(todayRow, "today's spending is missing");
    assert.ok(todayRow.expense > 0);
  });

  await test('daily spending excludes transfers', async () => {
    const { from, to } = monthRange(new Date(), IST);
    const { days } = data(
      await call<{ days: { expense: number; income: number }[] }>(
        'GET',
        `/transactions/daily?from=${from.toISOString()}&to=${to.toISOString()}`,
        { token },
      ),
    );
    const summary = data(
      await call<{ summary: { expense: number; income: number; transferred: number } }>(
        'GET',
        `/transactions/summary?from=${from.toISOString()}&to=${to.toISOString()}`,
        { token },
      ),
    ).summary;

    const dailyExpense = days.reduce((total, day) => total + day.expense, 0);
    const dailyIncome = days.reduce((total, day) => total + day.income, 0);

    // The two aggregations must agree, and the ₹20,000 transfer must be in
    // neither — a day whose only activity was an ATM run reads as a quiet day.
    assert.equal(dailyExpense, summary.expense);
    assert.equal(dailyIncome, summary.income);
    assert.ok(summary.transferred > 0, 'the transfer vanished entirely');
  });

  await test('a backwards or over-long daily range is refused', async () => {
    expectError(
      await call(
        'GET',
        '/transactions/daily?from=2026-10-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z',
        { token },
      ),
      400,
    );
    expectError(
      await call(
        'GET',
        '/transactions/daily?from=2020-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z',
        { token },
      ),
      400,
    );
  });

  await test('a transaction at the end of a month stays in that month', async () => {
    // 23:45 IST on the last day. In UTC this is the 1st of the next month, so a
    // naive boundary would move it — and with it, the budget it counts against.
    const last = DateTime.now().setZone(IST).endOf('month').minus({ minutes: 15 });
    const key = last.toFormat('yyyy-MM');

    const before = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${key}`, { token }),
    ).summary.totals.spent;

    await call('POST', '/transactions', {
      token,
      body: {
        type: 'expense',
        amount: rupees(333),
        categoryId: transportCategoryId,
        accountId: bankId,
        merchant: 'Late night',
        date: last.toISO(),
      },
    });

    const after = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${key}`, { token }),
    ).summary.totals.spent;

    assert.equal(after, before + rupees(333), 'a late-night expense fell out of its month');

    const nextMonth = last.plus({ months: 1 }).toFormat('yyyy-MM');
    const leaked = data(
      await call<{ summary: BudgetSummary }>('GET', `/budgets?month=${nextMonth}`, { token }),
    ).summary.totals.spent;
    assert.equal(leaked, 0, 'it leaked into the following month');
  });

  // ==================================================================== report
  console.log(`\n${'='.repeat(62)}`);
  if (failures.length > 0) {
    console.log('\nFailures:\n');
    for (const failure of failures) console.log(`  - ${failure}\n`);
  }
  console.log(`${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error('\nTest run could not finish:', error);
  process.exit(1);
});
