/* eslint-disable no-console */
import assert from 'node:assert/strict';

import { checkGrounding, containsInvestmentAdvice, verify } from '../modules/ai/ai.guard';
import {
  ADVICE_DECLINE,
  deterministicInsights,
  keywordIntent,
  localCategoryGuess,
} from '../modules/ai/ai.service';
import {
  ALL_SECTIONS,
  buildFactSheet,
  deterministicSummary,
  isLimitedData,
  rupees,
} from '../modules/ai/ai.prompts';
import type { AnalyticsOverview } from '../modules/analytics/analytics.service';

/**
 * Checks for the step-4 additions: the analytics aggregations and every guard
 * that stands between a language model and a number a user will believe.
 *
 *   npm run dev        (in one terminal)
 *   npm run test:ai    (in another)
 *
 * The first half runs in-process against the guard and the prompt builder — no
 * server, no database and, deliberately, no Groq. The whole point of those
 * modules is that they behave the same whether the model is brilliant, broken or
 * absent, so testing them against a live model would test the wrong thing.
 * Everything after `Analytics over HTTP` talks to a running server.
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
  error?: { code: string; message: string };
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
    throw new Error(
      `${method} ${path} returned non-JSON (${response.status}): ${text.slice(0, 200)}`,
    );
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

const paise = (value: number) => Math.round(value * 100);

// ------------------------------------------------------------------- fixture

/**
 * A month with enough shape to exercise every branch: an overspent category, a
 * previous period to compare against, a breached budget and a negative mover.
 */
function overviewFixture(patch: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  return {
    period: {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
      label: 'September 2026',
      days: 30,
      elapsedDays: 16,
    },
    totalIncome: paise(120000),
    totalExpenses: paise(48250),
    savings: paise(71750),
    savingsRate: 59.79,
    transferred: paise(10000),
    transactionCount: 42,
    expenseCount: 38,
    averageDailySpend: paise(3015.62),
    projectedTotal: paise(90468.75),
    topCategories: [
      {
        categoryId: 'c1',
        name: 'Food Delivery',
        icon: 'food',
        color: 'food',
        amount: paise(12400),
        count: 14,
        share: 25.7,
      },
      {
        categoryId: 'c2',
        name: 'Rent',
        icon: 'rent',
        color: 'rent',
        amount: paise(20000),
        count: 1,
        share: 41.4,
      },
    ],
    highestCategory: {
      categoryId: 'c2',
      name: 'Rent',
      icon: 'rent',
      color: 'rent',
      amount: paise(20000),
      count: 1,
      share: 41.4,
    },
    largestExpenses: [
      {
        id: 't1',
        amount: paise(20000),
        merchant: 'Landlord',
        categoryName: 'Rent',
        date: '2026-09-02T04:30:00.000Z',
      },
    ],
    monthlyComparison: {
      previousFrom: '2026-08-01T00:00:00.000Z',
      previousTo: '2026-08-31T23:59:59.999Z',
      previousIncome: paise(120000),
      previousExpenses: paise(41000),
      expenseChange: paise(7250),
      incomeChange: 0,
      expenseChangePercent: 17.68,
      incomeChangePercent: 0,
      direction: 'up',
    },
    categoryChanges: [
      {
        categoryId: 'c1',
        name: 'Food Delivery',
        current: paise(12400),
        previous: paise(6200),
        change: paise(6200),
        changePercent: 100,
      },
    ],
    weekly: [
      { key: '2026-W36', label: 'Wk 36', expense: paise(22000), income: 0, count: 8 },
      { key: '2026-W37', label: 'Wk 37', expense: paise(26250), income: paise(120000), count: 12 },
    ],
    daily: [],
    budgetStatus: {
      month: '2026-09',
      hasBudgets: true,
      totalBudgeted: paise(40000),
      totalSpent: paise(48250),
      overallPercent: 120.6,
      onTrack: 2,
      warning: 1,
      exceeded: 1,
      exceededNames: ['Food Delivery'],
      warningNames: ['Transport'],
    },
    ...patch,
  };
}

type Session = { accessToken: string; user: { id: string } };
type Account = { id: string; name: string };
type Category = { id: string; name: string; type: string };

type AnalyticsResponse = { overview: AnalyticsOverview };
type TrendResponse = { months: { key: string; label: string; expense: number }[] };
type AiSummaryResponse = {
  summary: { text: string; fromModel: boolean; limitedData: boolean };
  insights: { title: string; body: string; tone: string; category: string | null }[];
};
type AskResponse = {
  answer: {
    text: string;
    fromModel: boolean;
    limitedData: boolean;
    context: { intent: string; periodLabel: string; amount?: number; count?: number };
  };
};
type CategoriseResponse = {
  suggestion: {
    categoryId: string | null;
    categoryName: string | null;
    confidence: string;
    reason: string;
    alternatives: { categoryId: string; categoryName: string }[];
  };
};

async function main(): Promise<void> {
  console.log(`\nPaisa step-4 checks — ${BASE}\n${'='.repeat(62)}`);

  // ================================================================== grounding
  section('Grounding: the model may not invent a figure');

  await test('a reply using only figures from the data is accepted', () => {
    const facts = 'TOTAL SPENT: ₹48,250\nTOTAL INCOME: ₹1,20,000';
    const result = checkGrounding('You spent ₹48,250 of the ₹1,20,000 you earned.', facts);
    assert.equal(result.grounded, true, result.ungrounded.join(', '));
  });

  await test('a figure the model worked out itself is rejected', () => {
    // The arithmetic is correct. That is exactly why it has to be caught: nothing
    // checked it, and the next one will be wrong in the same undetectable way.
    const facts = 'TOTAL SPENT: ₹48,250\nPREVIOUS: ₹41,000';
    const result = checkGrounding('That is ₹7,250 more than last month.', facts);
    assert.equal(result.grounded, false);
    assert.deepEqual(result.ungrounded, ['₹7,250']);
  });

  await test('an invented transaction amount is rejected', () => {
    const facts = 'TOTAL SPENT: ₹48,250';
    const result = checkGrounding('Your ₹2,340 payment to Swiggy stood out.', facts);
    assert.equal(result.grounded, false);
  });

  await test('spacing and separators do not matter', () => {
    assert.equal(checkGrounding('₹ 48,250', 'SPENT: ₹48,250').grounded, true);
    assert.equal(checkGrounding('59.79%', 'RATE: 59.79%').grounded, true);
  });

  await test('a percentage not in the data is rejected', () => {
    const result = checkGrounding('Food is about 62% of your spending.', 'SHARE: 25.7%');
    assert.equal(result.grounded, false);
    assert.deepEqual(result.ungrounded, ['62%']);
  });

  await test('small bare counts are allowed through', () => {
    // "your top 3 categories", "over the last 6 months" — refusing these would
    // make the assistant unusable without making it any safer.
    assert.equal(checkGrounding('Your top 3 categories tell the story.', 'X: ₹10').grounded, true);
    assert.equal(checkGrounding('Across 30 days.', 'X: ₹10').grounded, true);
  });

  await test('a large bare number is still a claim', () => {
    assert.equal(checkGrounding('You spent 48250 rupees.', 'SPENT: ₹99').grounded, false);
  });

  // ===================================================================== advice
  section('Advice: the assistant describes, it does not recommend');

  await test('investment recommendations are detected', () => {
    const lines = [
      'You should invest the surplus in an index fund.',
      'I recommend investing in a mutual fund.',
      'Park this in a debt fund for guaranteed returns.',
    ];
    for (const line of lines) {
      assert.equal(containsInvestmentAdvice(line), true, `missed: ${line}`);
    }
  });

  await test('ordinary description is not mistaken for advice', () => {
    const lines = [
      'You spent ₹48,250 in September 2026.',
      'Rent was your largest category.',
      'Your investment category rose by ₹6,200.',
    ];
    for (const line of lines) {
      assert.equal(containsInvestmentAdvice(line), false, `false positive: ${line}`);
    }
  });

  await test('an advice question is declined by the server, never sent to a model', () => {
    for (const question of [
      'Should I invest my savings?',
      'Is it worth buying a house now?',
      'What should I do with the surplus?',
    ]) {
      assert.equal(keywordIntent(question, [], []).intent, 'advice', question);
    }
    assert.match(ADVICE_DECLINE, /cannot advise/i);
  });

  // ================================================================ verify loop
  section('Verification: one retry, then the truth');

  await test('a clean reply is returned as the model wrote it', async () => {
    const result = await verify(async () => 'You spent ₹48,250.', 'SPENT: ₹48,250', 'fallback');
    assert.equal(result.fromModel, true);
    assert.equal(result.text, 'You spent ₹48,250.');
  });

  await test('an ungrounded reply is retried with the offending figures named', async () => {
    const notes: (string | undefined)[] = [];
    const result = await verify(
      async (note) => {
        notes.push(note);
        return notes.length === 1 ? 'You spent ₹7,250 more.' : 'You spent ₹48,250.';
      },
      'SPENT: ₹48,250',
      'fallback',
    );

    assert.equal(notes.length, 2, 'it did not retry');
    assert.match(String(notes[1]), /₹7,250/, 'the retry did not name the bad figure');
    assert.equal(result.fromModel, true);
    assert.equal(result.text, 'You spent ₹48,250.');
  });

  await test('a model that invents twice is discarded for the computed text', async () => {
    const result = await verify(async () => 'You spent ₹99,999.', 'SPENT: ₹48,250', 'computed');
    assert.equal(result.fromModel, false);
    assert.equal(result.text, 'computed', 'an invented figure reached the user');
  });

  await test('a Groq outage falls back rather than failing', async () => {
    const result = await verify(
      async () => {
        throw new Error('503 from Groq');
      },
      'SPENT: ₹48,250',
      'computed',
    );
    assert.equal(result.fromModel, false);
    assert.equal(result.text, 'computed');
  });

  await test('advice is retried and then discarded', async () => {
    const result = await verify(
      async () => 'You should invest ₹48,250 in an index fund.',
      'SPENT: ₹48,250',
      'computed',
    );
    assert.equal(result.fromModel, false);
    assert.equal(result.text, 'computed');
  });

  // ================================================================ fact sheets
  section('Fact sheets: every derived number pre-computed');

  await test('the sheet carries the figures the model would otherwise calculate', () => {
    const sheet = buildFactSheet(overviewFixture());

    // If the delta and the share are in the sheet, the model never has a reason
    // to reach for a calculator — which is the only reliable way to stop it.
    assert.match(sheet, /TOTAL SPENT: ₹48,250/);
    assert.match(sheet, /₹7,250/, 'the change against the previous period is missing');
    assert.match(sheet, /25\.7%/, "a category's share is missing");
    assert.match(sheet, /NOT spending and NOT income/, 'transfers are not disclaimed');
  });

  await test('everything the deterministic summary says is in the sheet', () => {
    // The fallback and the prompt must agree, because the fallback is what a
    // user sees when the model is rejected.
    const overview = overviewFixture();
    const sheet = buildFactSheet(overview, ALL_SECTIONS);
    const result = checkGrounding(deterministicSummary(overview), sheet);
    assert.equal(result.grounded, true, `ungrounded: ${result.ungrounded.join(', ')}`);
  });

  await test('the deterministic insights are grounded in the same sheet', () => {
    const overview = overviewFixture();
    const sheet = buildFactSheet(overview, ALL_SECTIONS);

    for (const insight of deterministicInsights(overview)) {
      const result = checkGrounding(`${insight.title} ${insight.body}`, sheet);
      assert.equal(result.grounded, true, `${insight.title}: ${result.ungrounded.join(', ')}`);
    }
  });

  await test('an empty previous period is not described as a change', () => {
    const overview = overviewFixture({
      monthlyComparison: {
        previousFrom: '2026-08-01T00:00:00.000Z',
        previousTo: '2026-08-31T23:59:59.999Z',
        previousIncome: 0,
        previousExpenses: 0,
        expenseChange: paise(48250),
        incomeChange: paise(120000),
        expenseChangePercent: null,
        incomeChangePercent: null,
        direction: 'up',
      },
    });

    assert.match(
      buildFactSheet(overview, ['comparison']),
      /no data for the previous period/i,
      'the sheet invited a comparison against nothing',
    );
    assert.doesNotMatch(
      deterministicSummary(overview),
      /than the period before/,
      'the summary compared against an empty period',
    );
  });

  await test('an empty period produces a summary, not a crash', () => {
    const overview = overviewFixture({
      totalIncome: 0,
      totalExpenses: 0,
      savings: 0,
      savingsRate: null,
      transactionCount: 0,
      expenseCount: 0,
      averageDailySpend: 0,
      projectedTotal: null,
      topCategories: [],
      highestCategory: null,
      largestExpenses: [],
      categoryChanges: [],
    });

    assert.match(deterministicSummary(overview), /Nothing recorded/);
    assert.equal(isLimitedData(overview), true);
  });

  await test('limited data is flagged below five expenses', () => {
    assert.equal(isLimitedData(overviewFixture({ expenseCount: 4 })), true);
    assert.equal(isLimitedData(overviewFixture({ expenseCount: 5 })), false);
  });

  await test('rupees renders Indian digit grouping', () => {
    assert.equal(rupees(paise(120000)), '₹1,20,000');
    assert.equal(rupees(paise(1234567)), '₹12,34,567');
    assert.equal(rupees(0), '₹0');
  });

  // ==================================================================== intents
  section('Intent: retrieval is decided without a model');

  await test('questions route to the right retrieval', () => {
    const categories = ['Food Delivery', 'Petrol', 'Rent'];
    const groups = ['Food', 'Transport'];

    const cases: [string, string][] = [
      ['How much did I spend on food?', 'category_spend'],
      ['What did I spend on petrol this month?', 'category_spend'],
      ['Where am I spending the most?', 'top_category'],
      ['How much did I save this month?', 'savings'],
      ['Show my biggest expenses.', 'largest_expenses'],
      ['How am I doing against my budgets?', 'budget_status'],
      ['Why did I spend more this month?', 'comparison'],
      ['How much have I earned?', 'income'],
      ['What did I spend today?', 'today'],
    ];

    for (const [question, expected] of cases) {
      assert.equal(keywordIntent(question, categories, groups).intent, expected, question);
    }
  });

  await test('a longer category name wins over one contained in it', () => {
    const resolved = keywordIntent(
      'how much on food delivery?',
      ['Food Delivery', 'Food'],
      ['Food'],
    );
    assert.equal(resolved.categoryName, 'Food Delivery');
  });

  await test('a group name resolves even when no category matches', () => {
    const resolved = keywordIntent('what about transport?', ['Petrol'], ['Transport']);
    assert.equal(resolved.intent, 'category_spend');
    assert.equal(resolved.groupName, 'Transport');
  });

  await test('an unrecognisable question falls back to the general overview', () => {
    assert.equal(keywordIntent('tell me about dinosaurs', [], []).intent, 'general');
  });

  // =========================================================== categorisation
  section('Categorisation: a proposal, never a write');

  await test('known merchants map to a category the user actually has', () => {
    const available = ['Swiggy', 'Grocery', 'Petrol'];
    assert.equal(localCategoryGuess('Swiggy Instamart', undefined, available), 'Grocery');
    assert.equal(localCategoryGuess('Swiggy order 8821', undefined, available), 'Swiggy');
    assert.equal(localCategoryGuess('INDIAN OIL 4412', undefined, available), 'Petrol');
  });

  await test('a category the user does not have is never suggested', () => {
    // The whole risk of a suggestion is naming something that does not exist.
    assert.equal(localCategoryGuess('Swiggy', undefined, ['Rent']), null);
  });

  await test('an unknown merchant yields nothing rather than a guess', () => {
    assert.equal(localCategoryGuess('NEFT/Ref 88213', undefined, ['Grocery']), null);
  });

  // ================================================================== HTTP: API
  section('Analytics over HTTP');

  const email = `ai.${Date.now()}@paisa.test`;
  const session = data<Session>(
    await call('POST', '/auth/register', {
      body: { name: 'Analytics Tester', email, password: 'Str0ng!Passw0rd', currency: 'INR' },
    }),
  );
  const token = session.accessToken;

  const accounts = data<{ accounts: Account[] }>(await call('GET', '/accounts', { token })).accounts;
  const accountId = accounts[0]?.id;
  assert.ok(accountId, 'the new user has no default account');

  const categories = data<{ categories: Category[] }>(
    await call('GET', '/categories', { token }),
  ).categories;
  const expenseCategory = categories.find((entry) => entry.type === 'expense');
  const incomeCategory = categories.find((entry) => entry.type === 'income');
  assert.ok(expenseCategory && incomeCategory, 'default categories are missing');

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  const window = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  await test('an empty period reports zeroes rather than failing', async () => {
    const { overview } = data<AnalyticsResponse>(
      await call('GET', `/analytics/overview?${window}`, { token }),
    );
    assert.equal(overview.totalExpenses, 0);
    assert.equal(overview.savingsRate, null, 'a savings rate was invented without income');
    assert.equal(overview.highestCategory, null);
  });

  // Two expenses, one income and one transfer, so the transfer assertion below
  // has something to be wrong about.
  const second = accounts[1]?.id;
  for (const body of [
    {
      type: 'expense',
      amount: paise(2400),
      categoryId: expenseCategory.id,
      accountId,
      merchant: 'Swiggy',
    },
    {
      type: 'expense',
      amount: paise(600),
      categoryId: expenseCategory.id,
      accountId,
      merchant: 'Auto',
    },
    { type: 'income', amount: paise(50000), categoryId: incomeCategory.id, accountId },
    ...(second
      ? [{ type: 'transfer', amount: paise(10000), accountId, destinationAccountId: second }]
      : []),
  ]) {
    const created = await call('POST', '/transactions', { token, body });
    assert.equal(created.status, 201, `could not seed a ${body.type}`);
  }

  await test('totals match what was recorded', async () => {
    const { overview } = data<AnalyticsResponse>(
      await call('GET', `/analytics/overview?${window}`, { token }),
    );
    assert.equal(overview.totalExpenses, paise(3000));
    assert.equal(overview.totalIncome, paise(50000));
    assert.equal(overview.savings, paise(47000));
    assert.equal(overview.transactionCount, second ? 4 : 3);
  });

  await test('a transfer is neither income nor spending', async () => {
    if (!second) return;
    const { overview } = data<AnalyticsResponse>(
      await call('GET', `/analytics/overview?${window}`, { token }),
    );
    assert.equal(overview.transferred, paise(10000));
    assert.equal(overview.totalExpenses, paise(3000), 'a transfer was counted as spending');
    assert.equal(overview.totalIncome, paise(50000), 'a transfer was counted as income');
  });

  await test('the average is divided by days elapsed, not days in the period', async () => {
    const { overview } = data<AnalyticsResponse>(
      await call('GET', `/analytics/overview?${window}`, { token }),
    );
    assert.ok(overview.period.elapsedDays >= 1);
    assert.ok(
      overview.period.elapsedDays <= overview.period.days,
      'more days have elapsed than the period contains',
    );
    const expected = Math.round(overview.totalExpenses / overview.period.elapsedDays);
    assert.equal(overview.averageDailySpend, expected);
  });

  await test('category shares add up and the largest is named', async () => {
    const { overview } = data<AnalyticsResponse>(
      await call('GET', `/analytics/overview?${window}`, { token }),
    );
    assert.equal(overview.highestCategory?.amount, paise(3000));
    const total = overview.topCategories.reduce((sum, entry) => sum + entry.amount, 0);
    assert.equal(total, overview.totalExpenses, 'the categories do not add up to the total');
  });

  await test('the largest expenses are ordered, largest first', async () => {
    const { overview } = data<AnalyticsResponse>(
      await call('GET', `/analytics/overview?${window}`, { token }),
    );
    const amounts = overview.largestExpenses.map((entry) => entry.amount);
    assert.deepEqual(amounts, [...amounts].sort((a, b) => b - a));
    assert.equal(amounts[0], paise(2400));
  });

  await test('the monthly trend is zero-filled across the whole window', async () => {
    const { months } = data<TrendResponse>(await call('GET', '/analytics/trend?months=6', { token }));
    assert.equal(months.length, 6, 'a month with no spending was dropped');
    assert.equal(months[months.length - 1]?.expense, paise(3000));
  });

  await test('an inverted or oversized window is refused', async () => {
    expectError(
      await call('GET', `/analytics/overview?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`, {
        token,
      }),
      400,
    );
    expectError(
      await call(
        'GET',
        '/analytics/overview?from=2020-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z',
        { token },
      ),
      400,
    );
  });

  await test('analytics require a token', async () => {
    expectError(await call('GET', `/analytics/overview?${window}`), 401);
    expectError(await call('GET', '/analytics/trend'), 401);
  });

  // ===================================================================== HTTP: AI
  section('The assistant over HTTP');

  await test('every AI route requires a token', async () => {
    expectError(await call('GET', '/ai/summary'), 401);
    expectError(await call('POST', '/ai/ask', { body: { question: 'hi' } }), 401);
    expectError(await call('GET', '/ai/chat'), 401);
    expectError(await call('POST', '/ai/categorise', { body: { merchant: 'x' } }), 401);
  });

  await test('status reports whether a model is configured', async () => {
    const status = data<{ available: boolean; model: string | null }>(
      await call('GET', '/ai/status', { token }),
    );
    assert.equal(typeof status.available, 'boolean');
    if (!status.available) console.log('        (no GROQ_API_KEY — checking the computed path)');
  });

  await test('the summary answers with or without a model', async () => {
    const result = data<AiSummaryResponse>(await call('GET', `/ai/summary?${window}`, { token }));
    assert.ok(result.summary.text.length > 0, 'an empty summary');
    assert.equal(typeof result.summary.fromModel, 'boolean');
    assert.ok(Array.isArray(result.insights));
  });

  await test('the summary states no figure the analytics did not compute', async () => {
    const { overview } = data<AnalyticsResponse>(
      await call('GET', `/analytics/overview?${window}`, { token }),
    );
    const result = data<AiSummaryResponse>(await call('GET', `/ai/summary?${window}`, { token }));

    // Re-checked here against the same sheet the server used, so a regression in
    // the guard shows up as a failing test rather than a plausible sentence.
    const sheet = buildFactSheet(overview, ALL_SECTIONS);
    const check = checkGrounding(result.summary.text, sheet);
    assert.equal(check.grounded, true, `invented: ${check.ungrounded.join(', ')}`);

    for (const insight of result.insights) {
      const card = checkGrounding(`${insight.title} ${insight.body}`, sheet);
      assert.equal(card.grounded, true, `${insight.title}: ${card.ungrounded.join(', ')}`);
    }
  });

  await test('an insight card never names a category the user does not have', async () => {
    const result = data<AiSummaryResponse>(await call('GET', `/ai/summary?${window}`, { token }));
    const names = new Set(categories.map((entry) => entry.name));
    for (const insight of result.insights) {
      if (insight.category) assert.ok(names.has(insight.category), `invented: ${insight.category}`);
    }
  });

  await test('a spending question is answered from the retrieved figure', async () => {
    const { answer } = data<AskResponse>(
      await call('POST', '/ai/ask', {
        token,
        body: { question: 'How much did I spend?', from, to, label: 'this month' },
      }),
    );
    assert.ok(answer.text.length > 0);
    assert.ok(answer.text.includes('3,000'), `the total is missing from: ${answer.text}`);
  });

  await test('a category question retrieves that category, not the overview', async () => {
    const { answer } = data<AskResponse>(
      await call('POST', '/ai/ask', {
        token,
        body: {
          question: `How much did I spend on ${expenseCategory.name}?`,
          from,
          to,
          label: 'this month',
        },
      }),
    );
    assert.equal(answer.context.intent, 'category_spend');
    assert.equal(answer.context.amount, paise(3000));
  });

  await test('an advice question is declined without a model call', async () => {
    const { answer } = data<AskResponse>(
      await call('POST', '/ai/ask', {
        token,
        body: { question: 'Should I invest my savings in mutual funds?', from, to },
      }),
    );
    assert.equal(answer.context.intent, 'advice');
    assert.equal(answer.fromModel, false);
    assert.match(answer.text, /cannot advise/i);
  });

  await test('an empty or oversized question is refused', async () => {
    expectError(await call('POST', '/ai/ask', { token, body: { question: '', from, to } }), 400);
    expectError(
      await call('POST', '/ai/ask', { token, body: { question: 'x'.repeat(5000), from, to } }),
      400,
    );
  });

  await test('the transcript records both turns, oldest first', async () => {
    const { messages } = data<{ messages: { role: string; text: string; createdAt: string }[] }>(
      await call('GET', '/ai/chat', { token }),
    );
    assert.ok(messages.length >= 2, 'the conversation was not saved');
    assert.equal(messages[0]?.role, 'user');

    const times = messages.map((message) => Date.parse(message.createdAt));
    assert.deepEqual(times, [...times].sort((a, b) => a - b), 'the transcript is out of order');
  });

  await test('clearing the transcript deletes it', async () => {
    data(await call('DELETE', '/ai/chat', { token }));
    const { messages } = data<{ messages: unknown[] }>(await call('GET', '/ai/chat', { token }));
    assert.equal(messages.length, 0);
  });

  await test('a suggestion names a real category and offers alternatives', async () => {
    const { suggestion } = data<CategoriseResponse>(
      await call('POST', '/ai/categorise', {
        token,
        body: { merchant: 'Swiggy', amount: paise(420), type: 'expense' },
      }),
    );

    if (suggestion.categoryId) {
      const match = categories.find((entry) => entry.id === suggestion.categoryId);
      assert.ok(match, 'the suggested category does not exist');
      assert.equal(match.type, 'expense', 'an income category was suggested for an expense');
      assert.equal(suggestion.categoryName, match.name);
    }

    for (const option of suggestion.alternatives) {
      assert.ok(
        categories.some((entry) => entry.id === option.categoryId),
        `alternative does not exist: ${option.categoryName}`,
      );
    }
  });

  await test('an unrecognisable merchant is answered honestly, not guessed at', async () => {
    const { suggestion } = data<CategoriseResponse>(
      await call('POST', '/ai/categorise', {
        token,
        body: { merchant: 'NEFT/REF/88213/XYZ', type: 'expense' },
      }),
    );
    // Nothing, "Other", or something openly uncertain. What it must not do is
    // name a specific category with confidence for a string that means nothing —
    // a wrong-but-certain guess is the one a user accepts without looking.
    assert.ok(
      suggestion.categoryId === null ||
        suggestion.categoryName === 'Other' ||
        suggestion.confidence !== 'high',
      `a bank reference was filed as ${suggestion.categoryName} with high confidence`,
    );
  });

  await test('categorisation writes nothing', async () => {
    const before = data<AnalyticsResponse>(
      await call('GET', `/analytics/overview?${window}`, { token }),
    ).overview.transactionCount;

    await call('POST', '/ai/categorise', {
      token,
      body: { merchant: 'Big Bazaar', amount: paise(1500), type: 'expense' },
    });

    const after = data<AnalyticsResponse>(
      await call('GET', `/analytics/overview?${window}`, { token }),
    ).overview.transactionCount;
    assert.equal(after, before, 'the assistant created a transaction on its own');
  });

  await test("one user's assistant cannot see another's data", async () => {
    const other = data<Session>(
      await call('POST', '/auth/register', {
        body: {
          name: 'Someone Else',
          email: `other.${Date.now()}@paisa.test`,
          password: 'Str0ng!Passw0rd',
          currency: 'INR',
        },
      }),
    );

    const { overview } = data<AnalyticsResponse>(
      await call('GET', `/analytics/overview?${window}`, { token: other.accessToken }),
    );
    assert.equal(overview.totalExpenses, 0, "another user's spending leaked");

    const { messages } = data<{ messages: unknown[] }>(
      await call('GET', '/ai/chat', { token: other.accessToken }),
    );
    assert.equal(messages.length, 0, "another user's transcript leaked");
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
