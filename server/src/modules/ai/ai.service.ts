import { Types } from 'mongoose';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  getCategoriesSpend,
  getCategorySpend,
  getDayTotal,
  getMerchantSpend,
  getOverview,
  type AnalyticsOverview,
} from '../analytics/analytics.service';
import { CategoryModel } from '../categories/category.model';
import { recallMerchant } from '../merchants/merchant.service';

import { checkGrounding, verify, type VerifiedReply } from './ai.guard';
import { complete, isAiConfigured, AiUnavailableError } from './groq.client';
import { matchDirectCategory, matchIndianMerchant } from './knowledge/indianKnowledge';
import {
  CATEGORISE_INSTRUCTION,
  INSIGHTS_INSTRUCTION,
  LIMITED_DATA_NOTE,
  SYSTEM_RULES,
  buildFactSheet,
  deterministicSummary,
  isLimitedData,
  rupees,
  type FactSection,
} from './ai.prompts';

export type Range = { from: Date; to: Date };

export type AiSummary = {
  text: string;
  /** False when the server's own wording was used instead of the model's. */
  fromModel: boolean;
  /** True when there is too little data to describe anything as a pattern. */
  limitedData: boolean;
  /** The figures the text was written from, so the client can show them. */
  facts: {
    totalExpenses: number;
    totalIncome: number;
    savings: number;
    savingsRate: number | null;
    topCategory: string | null;
    expenseChange: number;
    direction: 'up' | 'down' | 'flat';
  };
};

export type AiInsight = {
  title: string;
  body: string;
  tone: 'neutral' | 'positive' | 'warning';
  category: string | null;
};

export type AiAnswer = {
  text: string;
  fromModel: boolean;
  limitedData: boolean;
  /** What the server looked up, so the UI can show the working. */
  context: {
    intent: string;
    periodLabel: string;
    categoryName?: string;
    amount?: number;
    count?: number;
    transactions?: { id: string; merchant: string; amount: number; date: string }[];
  };
};

export type SuggestionSource =
  /** This user has filed this merchant before. The strongest evidence there is. */
  | 'memory'
  /** A brand in the built-in table. Instant, free, and never wrong about Swiggy. */
  | 'merchant'
  | 'model'
  | 'none';

export type CategorySuggestion = {
  categoryId: string | null;
  categoryName: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  /** Kept alongside `source` because the app already renders a model badge from it. */
  fromModel: boolean;
  source: SuggestionSource;
  /** Other plausible categories, so the picker can lead with them. */
  alternatives: { categoryId: string; categoryName: string }[];
};

// ------------------------------------------------------------------- summary

/**
 * The monthly summary.
 *
 * The model is given already-computed figures and asked only to phrase them.
 * Whatever comes back is checked against those figures; if it states one that is
 * not there, it is retried once and then discarded in favour of
 * `deterministicSummary`, which is written from the same numbers and cannot be
 * wrong.
 */
export async function generateSummary(
  userId: string,
  range: Range,
  previous: Range,
  label: string,
): Promise<AiSummary> {
  const overview = await getOverview(userId, range, previous, label);
  return summaryFromOverview(overview);
}

export async function summaryFromOverview(overview: AnalyticsOverview): Promise<AiSummary> {
  const facts = buildFactSheet(overview);
  const fallback = deterministicSummary(overview);
  const limited = isLimitedData(overview);

  const factsBlock = {
    totalExpenses: overview.totalExpenses,
    totalIncome: overview.totalIncome,
    savings: overview.savings,
    savingsRate: overview.savingsRate,
    topCategory: overview.highestCategory?.name ?? null,
    expenseChange: overview.monthlyComparison.expenseChange,
    direction: overview.monthlyComparison.direction,
  };

  if (!isAiConfigured() || overview.transactionCount === 0) {
    return { text: fallback, fromModel: false, limitedData: limited, facts: factsBlock };
  }

  const result = await verify(
    (retryNote) =>
      complete({
        temperature: 0.3,
        // The gpt-oss models spend completion tokens thinking before they write,
        // and that comes out of this budget. Too tight and the reply arrives
        // empty, which reads as an outage rather than as a short summary.
        maxTokens: 600,
        reasoning: 'low',
        messages: [
          { role: 'system', content: SYSTEM_RULES },
          ...(limited ? [{ role: 'system' as const, content: LIMITED_DATA_NOTE }] : []),
          ...(retryNote ? [{ role: 'system' as const, content: retryNote }] : []),
          {
            role: 'user',
            content: `DATA\n${facts}\n\nWrite a 2 to 3 sentence summary of this period. Lead with the total spent, then the largest category, then how it compares with the period before.`,
          },
        ],
      }),
    facts,
    fallback,
    { feature: 'summary' },
  );

  return { ...result, limitedData: limited, facts: factsBlock };
}

// ------------------------------------------------------------------ insights

/**
 * Insight cards.
 *
 * Asked for as JSON so the app can render severity and category properly instead
 * of parsing prose. Anything that fails the grounding check is dropped
 * individually rather than failing the whole set — three good insights and one
 * discarded is a better outcome than none.
 */
export async function generateInsights(
  userId: string,
  range: Range,
  previous: Range,
  label: string,
): Promise<{ insights: AiInsight[]; fromModel: boolean; limitedData: boolean }> {
  const overview = await getOverview(userId, range, previous, label);
  return insightsFromOverview(overview);
}

export async function insightsFromOverview(
  overview: AnalyticsOverview,
): Promise<{ insights: AiInsight[]; fromModel: boolean; limitedData: boolean }> {
  const limited = isLimitedData(overview);
  const fallback = deterministicInsights(overview);

  if (!isAiConfigured() || overview.transactionCount === 0) {
    return { insights: fallback, fromModel: false, limitedData: limited };
  }

  const facts = buildFactSheet(overview);

  let raw: string;
  try {
    raw = await complete({
      temperature: 0.3,
      // Generous, because the reasoning tokens come out of this budget before a
      // single character of JSON is emitted.
      maxTokens: 1200,
      json: true,
      reasoning: 'low',
      messages: [
        { role: 'system', content: SYSTEM_RULES },
        ...(limited ? [{ role: 'system' as const, content: LIMITED_DATA_NOTE }] : []),
        { role: 'user', content: `DATA\n${facts}\n\n${INSIGHTS_INSTRUCTION}` },
      ],
    });
  } catch {
    return { insights: fallback, fromModel: false, limitedData: limited };
  }

  let parsed: { insights?: unknown };
  try {
    parsed = JSON.parse(raw) as { insights?: unknown };
  } catch {
    return { insights: fallback, fromModel: false, limitedData: limited };
  }

  const categoryNames = new Set(overview.topCategories.map((entry) => entry.name));

  const insights = (Array.isArray(parsed.insights) ? parsed.insights : [])
    .map((entry): AiInsight | null => {
      const row = entry as Record<string, unknown>;
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      const body = typeof row.body === 'string' ? row.body.trim() : '';
      if (!title || !body) return null;

      // Each card is checked on its own, so one invented figure costs one card.
      if (!checkGrounding(`${title} ${body}`, facts).grounded) {
        logger.warn({ title }, 'insight dropped: ungrounded figure');
        return null;
      }

      const category = typeof row.category === 'string' ? row.category.trim() : '';
      const tone = row.tone;

      return {
        title: title.slice(0, 60),
        body: body.slice(0, 200),
        tone: tone === 'positive' || tone === 'warning' ? tone : 'neutral',
        // A category the model made up would render as a chip pointing nowhere.
        category: category && categoryNames.has(category) ? category : null,
      };
    })
    .filter((entry): entry is AiInsight => entry !== null)
    .slice(0, 4);

  if (insights.length === 0) {
    return { insights: fallback, fromModel: false, limitedData: limited };
  }

  return { insights, fromModel: true, limitedData: limited };
}

/**
 * Insights the server writes itself, from the same computed figures.
 *
 * Used when the model is unavailable, returns nothing usable, or invents
 * something. Fewer and blunter, but every one of them is true.
 */
export function deterministicInsights(overview: AnalyticsOverview): AiInsight[] {
  const insights: AiInsight[] = [];

  const mover = overview.categoryChanges.find((entry) => Math.abs(entry.change) > 0);
  if (mover && overview.monthlyComparison.previousExpenses > 0) {
    insights.push({
      title: mover.change > 0 ? `${mover.name} is up` : `${mover.name} is down`,
      body: `${mover.name} moved from ${rupees(mover.previous)} to ${rupees(mover.current)} against the period before.`,
      tone: mover.change > 0 ? 'warning' : 'positive',
      category: mover.name,
    });
  }

  const budget = overview.budgetStatus;
  if (budget.exceeded > 0) {
    insights.push({
      title: 'A budget is over',
      body: `${budget.exceededNames.join(', ')} went past the cap you set for ${budget.month}.`,
      tone: 'warning',
      category: budget.exceededNames[0] ?? null,
    });
  } else if (budget.warning > 0) {
    insights.push({
      title: 'A budget is getting close',
      body: `${budget.warningNames.join(', ')} is approaching its limit for ${budget.month}.`,
      tone: 'warning',
      category: budget.warningNames[0] ?? null,
    });
  }

  const largest = overview.largestExpenses[0];
  if (largest) {
    insights.push({
      title: 'Largest single expense',
      body: `${largest.merchant} at ${rupees(largest.amount)} was the biggest one this period.`,
      tone: 'neutral',
      category: largest.categoryName,
    });
  }

  if (overview.savingsRate !== null) {
    insights.push({
      title: overview.savings >= 0 ? 'What you kept' : 'You spent more than you earned',
      body:
        overview.savings >= 0
          ? `You kept ${rupees(overview.savings)} of what came in this period.`
          : `Spending exceeded income by ${rupees(Math.abs(overview.savings))} this period.`,
      tone: overview.savings >= 0 ? 'positive' : 'warning',
      category: null,
    });
  }

  return insights.slice(0, 4);
}

// -------------------------------------------------------------------- asking

export type Intent =
  | 'total_spend'
  | 'category_spend'
  | 'savings'
  | 'income'
  | 'largest_expenses'
  | 'top_category'
  | 'comparison'
  | 'budget_status'
  | 'today'
  | 'advice'
  | 'merchant_spend'
  | 'who_owes_me'
  | 'i_owe'
  | 'money_lent'
  | 'repayments'
  | 'general';

export type ResolvedIntent = { intent: Intent; categoryName?: string; groupName?: string };

/**
 * Only the part of the fact sheet each question needs.
 *
 * Sending everything every time is both slower and more expensive — the full
 * sheet is over a thousand tokens, and Groq meters tokens per minute, so a
 * padded prompt is the difference between an answer and a fallback. It is also
 * simply better prompting: a model asked "what did I spend on petrol" answers
 * more precisely when it is not also holding five budgets and a comparison.
 */
const SECTIONS_FOR: Record<Intent, readonly FactSection[]> = {
  total_spend: ['totals', 'categories', 'comparison'],
  category_spend: ['totals'],
  savings: ['totals', 'comparison'],
  income: ['totals', 'comparison'],
  largest_expenses: ['totals', 'largest'],
  top_category: ['totals', 'categories'],
  comparison: ['totals', 'comparison'],
  budget_status: ['totals', 'budgets'],
  today: ['totals'],
  advice: ['totals'],
  merchant_spend: ['totals', 'merchants'],
  who_owes_me: ['totals', 'people'],
  i_owe: ['totals', 'people'],
  money_lent: ['totals', 'cashFlow', 'people'],
  repayments: ['totals', 'cashFlow', 'people'],
  general: ['totals', 'categories', 'comparison', 'merchants', 'people', 'cashFlow'],
};

/**
 * Works out what was asked, without touching any numbers.
 *
 * The model is used for understanding, never for retrieval: it returns an intent
 * and possibly a category name, and the server then fetches that data itself
 * from MongoDB. Letting the model fetch — or worse, recall — figures is exactly
 * the thing this whole module exists to prevent.
 *
 * Falls back to keywords when the model is unavailable, which handles the common
 * phrasings well enough that the assistant still answers rather than apologising.
 */
async function resolveIntent(
  question: string,
  categoryNames: string[],
  groupNames: string[],
): Promise<ResolvedIntent> {
  const keyword = keywordIntent(question, categoryNames, groupNames);
  // Deterministic financial/obligation intents or advice are settled immediately
  if (
    keyword.intent === 'advice' ||
    keyword.intent === 'who_owes_me' ||
    keyword.intent === 'i_owe' ||
    keyword.intent === 'money_lent' ||
    keyword.intent === 'repayments' ||
    keyword.intent === 'merchant_spend' ||
    !isAiConfigured()
  ) {
    return keyword;
  }

  try {
    const raw = await complete({
      model: env.GROQ_FAST_MODEL,
      temperature: 0,
      maxTokens: 400,
      json: true,
      reasoning: 'low',
      messages: [
        {
          role: 'system',
          content: `Classify a question about personal spending. Reply with JSON only:
{"intent":"total_spend|category_spend|savings|income|largest_expenses|top_category|comparison|budget_status|today|advice|who_owes_me|i_owe|money_lent|repayments|merchant_spend|general","category":"exact category name from the list, or null","group":"exact group name from the list, or null"}

- "category_spend": about one named category or group of spending.
- "top_category": "where am I spending the most".
- "comparison": "why did I spend more", "versus last month".
- "today": about today specifically.
- "advice": asking what they SHOULD do with money — investing, saving strategy, whether to buy something.
- "who_owes_me": asking about who owes the user money.
- "i_owe": asking about debts or money the user owes.
- "money_lent": asking about money lent out.
- "repayments": asking about repayments received or made.
- "merchant_spend": asking about spending at a particular merchant.
- Prefer "group" when the question names a broad area like food, transport or shopping, and "category" when it names a specific one like Petrol or Netflix.

Category MUST be copied exactly from this list, or null:
${categoryNames.join(', ')}

Group MUST be copied exactly from this list, or null:
${groupNames.join(', ')}`,
        },
        { role: 'user', content: question.slice(0, 400) },
      ],
    });

    const parsed = JSON.parse(raw) as {
      intent?: string;
      category?: string | null;
      group?: string | null;
    };
    const intent = (parsed.intent ?? 'general') as Intent;
    const category =
      typeof parsed.category === 'string' && categoryNames.includes(parsed.category)
        ? parsed.category
        : keyword.categoryName;
    const group =
      typeof parsed.group === 'string' && groupNames.includes(parsed.group)
        ? parsed.group
        : keyword.groupName;

    // "How much did I spend on food?" often classifies as total_spend even
    // though it names a group. If something specific was named, the question is
    // about that thing.
    const narrowed: Intent =
      (category || group) && (intent === 'total_spend' || intent === 'general')
        ? 'category_spend'
        : intent;

    return { intent: narrowed, categoryName: category, groupName: group };
  } catch {
    return keyword;
  }
}

/** The fallback, and the reason a Groq outage does not take the feature down. */
export function keywordIntent(
  question: string,
  categoryNames: string[],
  groupNames: string[],
): ResolvedIntent {
  const text = question.toLowerCase();

  // Longest first, so "Mutual Fund" wins over "Fund" and "Food Delivery" over
  // "Food".
  const byLength = (a: string, b: string) => b.length - a.length;
  const matched = [...categoryNames].sort(byLength).find((name) => text.includes(name.toLowerCase()));
  const matchedGroup = [...groupNames].sort(byLength).find((name) => text.includes(name.toLowerCase()));

  if (ADVICE_QUESTION.test(text)) return { intent: 'advice' };
  if (/\btoday\b/.test(text)) return { intent: 'today', categoryName: matched };
  if (matched) return { intent: 'category_spend', categoryName: matched };
  if (matchedGroup) return { intent: 'category_spend', groupName: matchedGroup };
  if (/\b(save|saved|saving|savings)\b/.test(text)) return { intent: 'savings' };
  if (/\b(earn|earned|income|salary)\b/.test(text)) return { intent: 'income' };
  if (/\b(biggest|largest|most expensive|top expenses?)\b/.test(text)) {
    return { intent: 'largest_expenses' };
  }
  // Both orders. "Where am I spending the most?" — one of the questions the app
  // itself suggests — puts the superlative last, and a pattern that only read
  // left to right sent it to the plain total instead of the top category.
  if (
    /\b(most|highest|top|biggest)\b/.test(text) &&
    /\b(categor|spend|spending|spent|money)\b/.test(text)
  ) {
    return { intent: 'top_category' };
  }
  if (/\bwhere\b.*\b(money|spend|spending|going?|goes)\b/.test(text)) {
    return { intent: 'top_category' };
  }
  if (/\bwho owes me\b|\bowes? me\b|\bmoney owed to me\b/i.test(text)) {
    return { intent: 'who_owes_me' };
  }
  if (/\b(do i owe|who do i owe|i owe|my debts)\b/i.test(text)) {
    return { intent: 'i_owe' };
  }
  if (/\b(lend|lent|loaned)\b/i.test(text)) {
    return { intent: 'money_lent' };
  }
  if (/\b(repay|repaid|repayment|repayments|paid me back)\b/i.test(text)) {
    return { intent: 'repayments' };
  }
  const commonMerchants = [
    'zomato', 'swiggy', 'amazon', 'blinkit', 'dmart', 'uber', 'ola',
    'myntra', 'netflix', 'indianoil', 'zepto', 'flipkart', 'bigbasket',
    'makemytrip', 'starbucks', 'tata', 'airtel', 'jio'
  ];
  const matchedMerchant = commonMerchants.find((m) => text.includes(m));
  if (matchedMerchant && /\b(spend|spent|on|at|for)\b/i.test(text)) {
    return { intent: 'merchant_spend', categoryName: matchedMerchant };
  }
  if (/\b(more|less|than last|compared|why)\b/.test(text)) return { intent: 'comparison' };
  if (/\bbudget/.test(text)) return { intent: 'budget_status' };
  if (/\b(spend|spent|spending|total)\b/.test(text)) return { intent: 'total_spend' };

  return { intent: 'general' };
}

/**
 * Questions asking what to *do* with money rather than what happened to it.
 *
 * Answered by the server with a plain decline, never sent to the model. A model
 * told not to give advice usually complies, and "usually" is not a standard to
 * hold financial advice to.
 */
const ADVICE_QUESTION =
  /\b(should i|shall i|is it worth|worth it to|do you recommend|what should i do|advise me|help me (invest|choose))\b/i;

export const ADVICE_DECLINE =
  'I can tell you what you have spent, earned and saved, but I cannot advise on what to do with your money — that depends on things this app does not know about you.';

/**
 * Answers a question.
 *
 * Retrieval is deterministic: the server decides what to look up, MongoDB
 * computes it, and only then does the model see anything. Whatever it writes is
 * checked against exactly that data.
 */
export async function answerQuestion(
  userId: string,
  question: string,
  range: Range,
  previous: Range,
  label: string,
): Promise<AiAnswer> {
  const overview = await getOverview(userId, range, previous, label);
  const limited = isLimitedData(overview);

  const categories = await CategoryModel.find({
    $or: [{ userId: null }, { userId: new Types.ObjectId(userId) }],
    isActive: true,
  })
    .select('name group')
    .lean();
  const categoryNames = [...new Set(categories.map((entry) => entry.name))];
  const groupNames = [...new Set(categories.map((entry) => entry.group))];

  const resolved = await resolveIntent(question, categoryNames, groupNames);

  // "How much did I spend on dinosaurs?" classifies as a category question with
  // no category. Treated as a general one so the model answers from the overview
  // and says it cannot see anything like that — which is the honest reply, and a
  // better one than a summary nobody asked for.
  if (
    resolved.intent === 'category_spend' &&
    !resolved.categoryName &&
    !resolved.groupName
  ) {
    resolved.intent = 'general';
  }

  if (resolved.intent === 'advice') {
    return {
      text: `${ADVICE_DECLINE} ${deterministicSummary(overview)}`,
      fromModel: false,
      limitedData: limited,
      context: { intent: 'advice', periodLabel: label },
    };
  }

  let facts = buildFactSheet(overview, SECTIONS_FOR[resolved.intent]);
  let fallback = deterministicSummary(overview);
  const context: AiAnswer['context'] = { intent: resolved.intent, periodLabel: label };

  // Extra, narrower data for the intents the overview does not already cover.
  //
  // A group question ("how much on food?") is answered by adding up the group's
  // categories, because that is how people think about spending — "food" is
  // Restaurants and Swiggy and the cafe, not a category that happens to exist.
  if (resolved.intent === 'category_spend' && !resolved.categoryName && resolved.groupName) {
    const inGroup = categories.filter((entry) => entry.group === resolved.groupName);
    // Aggregated over every category in the group, not read off the overview's
    // top-eight list: a six-category group would otherwise report a fraction of
    // itself, and quietly wrong is the worst kind of wrong for a figure someone
    // is about to act on.
    const { amount, count, breakdown } = await getCategoriesSpend(
      userId,
      inGroup.map((entry) => String(entry._id)),
      range,
    );

    context.categoryName = resolved.groupName;
    context.amount = amount;
    context.count = count;

    facts += `\n\nSPENDING ON ${resolved.groupName.toUpperCase()} (the whole group) IN ${label.toUpperCase()}:\n  Total: ${rupees(
      amount,
    )} across ${count} transactions`;
    if (breakdown.length > 0) {
      facts += `\n  Made up of: ${breakdown
        .map((entry) => `${entry.name} ${rupees(entry.amount)}`)
        .join(', ')}`;
    }

    fallback =
      count === 0
        ? `Nothing recorded under ${resolved.groupName} in ${label}.`
        : `You spent ${rupees(amount)} on ${resolved.groupName} in ${label}, across ${count} ${
            count === 1 ? 'transaction' : 'transactions'
          }.`;
  }

  if (resolved.intent === 'category_spend' && resolved.categoryName) {
    const category = categories.find((entry) => entry.name === resolved.categoryName);
    if (category) {
      const detail = await getCategorySpend(userId, String(category._id), range);
      context.categoryName = resolved.categoryName;
      context.amount = detail.amount;
      context.count = detail.count;
      context.transactions = detail.transactions.map((row) => ({
        id: row.id,
        merchant: row.merchant,
        amount: row.amount,
        date: row.date,
      }));

      facts += `\n\nSPENDING ON ${resolved.categoryName.toUpperCase()} IN ${label.toUpperCase()}:\n  Total: ${rupees(
        detail.amount,
      )} across ${detail.count} transactions`;
      if (detail.transactions.length > 0) {
        facts += `\n  Largest: ${detail.transactions
          .map((row) => `${row.merchant} ${rupees(row.amount)}`)
          .join(', ')}`;
      }

      fallback =
        detail.count === 0
          ? `Nothing recorded under ${resolved.categoryName} in ${label}.`
          : `You spent ${rupees(detail.amount)} on ${resolved.categoryName} in ${label}, across ${detail.count} ${
              detail.count === 1 ? 'transaction' : 'transactions'
            }.`;
    }
  }

  if (resolved.intent === 'today') {
    const today = await getDayTotal(userId, new Date());
    context.amount = today.amount;
    context.count = today.count;
    facts += `\n\nTODAY (${today.key}):\n  Spent: ${rupees(today.amount)} across ${today.count} transactions`;
    fallback =
      today.count === 0
        ? 'Nothing recorded today yet.'
        : `You have spent ${rupees(today.amount)} today, across ${today.count} ${
            today.count === 1 ? 'transaction' : 'transactions'
          }.`;
  }

  if (resolved.intent === 'who_owes_me') {
    const debtors =
      overview.peopleSummary?.people.filter((p) => p.direction === 'they_owe' && p.balance > 0) ?? [];
    const total = overview.peopleSummary?.totalOwedToMe ?? 0;
    context.amount = total;
    context.count = debtors.length;
    facts += `\n\nPEOPLE WHO OWE YOU MONEY:\n  Total owed to you: ${rupees(total)}`;
    if (debtors.length > 0) {
      facts += `\n  Debtors: ${debtors.map((p) => `${p.name} owes ${rupees(p.balance)}`).join(', ')}`;
      fallback = `You are owed a total of ${rupees(total)} by ${debtors.length} ${
        debtors.length === 1 ? 'person' : 'people'
      }: ${debtors.slice(0, 3).map((p) => `${p.name} (${rupees(p.balance)})`).join(', ')}.`;
    } else {
      fallback = 'Nobody owes you money right now.';
    }
  }

  if (resolved.intent === 'i_owe') {
    const creditors =
      overview.peopleSummary?.people.filter((p) => p.direction === 'i_owe' && p.balance > 0) ?? [];
    const total = overview.peopleSummary?.totalIOwe ?? 0;
    context.amount = total;
    context.count = creditors.length;
    facts += `\n\nMONEY YOU OWE OTHERS:\n  Total you owe: ${rupees(total)}`;
    if (creditors.length > 0) {
      facts += `\n  Creditors: ${creditors.map((p) => `${p.name}: ${rupees(p.balance)}`).join(', ')}`;
      fallback = `You owe a total of ${rupees(total)} to ${creditors.length} ${
        creditors.length === 1 ? 'person' : 'people'
      }: ${creditors.slice(0, 3).map((p) => `${p.name} (${rupees(p.balance)})`).join(', ')}.`;
    } else {
      fallback = "You don't owe any money to anyone right now.";
    }
  }

  if (resolved.intent === 'money_lent') {
    const lent = overview.moneyLent ?? 0;
    context.amount = lent;
    facts += `\n\nMONEY LENT IN ${label.toUpperCase()}:\n  Total lent: ${rupees(lent)}`;
    fallback =
      lent === 0
        ? `You did not lend any money in ${label}.`
        : `You lent a total of ${rupees(lent)} in ${label}.`;
  }

  if (resolved.intent === 'repayments') {
    const received = overview.repaymentsReceived ?? 0;
    const made = overview.repaymentsMade ?? 0;
    context.amount = received;
    facts += `\n\nREPAYMENTS IN ${label.toUpperCase()}:\n  Repayments received: ${rupees(received)}\n  Repayments made: ${rupees(made)}`;
    fallback =
      received === 0 && made === 0
        ? `No repayments were recorded in ${label}.`
        : `You received ${rupees(received)} in repayments and made ${rupees(made)} in repayments in ${label}.`;
  }

  if (resolved.intent === 'merchant_spend' && resolved.categoryName) {
    const detail = await getMerchantSpend(userId, resolved.categoryName, range);
    context.categoryName = detail.merchant;
    context.amount = detail.amount;
    context.count = detail.count;
    context.transactions = detail.transactions.map((row) => ({
      id: row.id,
      merchant: row.merchant,
      amount: row.amount,
      date: row.date,
    }));

    facts += `\n\nSPENDING AT ${detail.merchant.toUpperCase()} IN ${label.toUpperCase()}:\n  Total: ${rupees(
      detail.amount,
    )} across ${detail.count} transactions`;
    if (detail.transactions.length > 0) {
      facts += `\n  Recent: ${detail.transactions
        .map((row) => `${rupees(row.amount)} on ${row.date.split('T')[0]}`)
        .join(', ')}`;
    }

    fallback =
      detail.count === 0
        ? `Nothing recorded for ${detail.merchant} in ${label}.`
        : `You spent ${rupees(detail.amount)} at ${detail.merchant} in ${label}, across ${detail.count} ${
            detail.count === 1 ? 'transaction' : 'transactions'
          }.`;
  }

  if (!isAiConfigured()) {
    return { text: fallback, fromModel: false, limitedData: limited, context };
  }

  const result: VerifiedReply = await verify(
    (retryNote) =>
      complete({
        temperature: 0.2,
        maxTokens: 700,
        reasoning: 'low',
        messages: [
          { role: 'system', content: SYSTEM_RULES },
          ...(limited ? [{ role: 'system' as const, content: LIMITED_DATA_NOTE }] : []),
          ...(retryNote ? [{ role: 'system' as const, content: retryNote }] : []),
          {
            role: 'user',
            content: `DATA\n${facts}\n\nQUESTION: ${question.slice(0, 400)}\n\nAnswer in 1 to 3 sentences using only the figures above. If the data does not answer it, say so and say what you can see.`,
          },
        ],
      }),
    facts,
    fallback,
    { feature: 'ask', intent: resolved.intent },
  );

  return { ...result, limitedData: limited, context };
}

// ------------------------------------------------------------- categorisation

/**
 * Suggests a category for a payment.
 *
 * Suggests. Nothing here writes: the endpoint returns a proposal and the app
 * shows it as a pre-selection the user can change with one tap. An assistant
 * that silently files a transaction wrongly is worse than one that says nothing,
 * because the mistake ends up in a chart six weeks later with no way to trace it.
 */
export async function suggestCategory(
  userId: string,
  input: { merchant: string; description?: string; amount?: number; type?: 'expense' | 'income' },
): Promise<CategorySuggestion> {
  const type = input.type ?? 'expense';

  const categories = await CategoryModel.find({
    $or: [{ userId: null }, { userId: new Types.ObjectId(userId) }],
    isActive: true,
    type,
  })
    .select('name group')
    .sort({ sortOrder: 1 })
    .lean();

  if (categories.length === 0) {
    return {
      categoryId: null,
      categoryName: null,
      confidence: 'low',
      reason: 'No categories to choose from',
      fromModel: false,
      source: 'none',
      alternatives: [],
    };
  }

  const byName = new Map(categories.map((entry) => [entry.name, entry]));
  const byId = new Map(categories.map((entry) => [String(entry._id), entry]));

  /**
   * What this user did last time, before anything else gets a turn.
   *
   * Their own history beats a brand table and beats a language model: it is
   * evidence about this person rather than about people in general, it costs one
   * indexed read instead of a network round trip, and it is the only one of the
   * three that improves when they correct it. Someone who files Amazon under
   * Electronics should stop being told it is Shopping.
   */
  const remembered = input.merchant.trim() ? await recallMerchant(userId, input.merchant) : null;
  const memoryMatch = remembered ? byId.get(remembered.categoryId) : undefined;

  if (remembered && memoryMatch) {
    return {
      categoryId: String(memoryMatch._id),
      categoryName: memoryMatch.name,
      // Once is a precedent, twice is a habit.
      confidence: remembered.count >= 2 ? 'high' : 'medium',
      reason:
        remembered.count >= 2
          ? `You have filed ${remembered.merchantLabel} here ${remembered.count} times`
          : `You filed ${remembered.merchantLabel} here last time`,
      fromModel: false,
      source: 'memory',
      alternatives: alternativesFor(memoryMatch.group, categories, memoryMatch.name),
    };
  }

  const local = localCategoryGuess(input.merchant, input.description, [...byName.keys()]);
  const localMatch = local ? byName.get(local) : undefined;

  /**
   * A brand in the built-in table, before the model is asked.
   *
   * Swiggy is a food delivery company. No amount of inference improves on that,
   * and asking costs a network round trip on the one screen where latency is felt
   * as a keystroke. The table only holds merchants that are unambiguous, which is
   * what makes skipping the model safe rather than merely fast.
   */
  if (localMatch) {
    return {
      categoryId: String(localMatch._id),
      categoryName: localMatch.name,
      confidence: 'high',
      reason: `${input.merchant.trim()} is a known merchant`,
      fromModel: false,
      source: 'merchant',
      alternatives: alternativesFor(localMatch.group, categories, localMatch.name),
    };
  }

  if (!isAiConfigured()) {
    return local
      ? {
          categoryId: String(byName.get(local)?._id),
          categoryName: local,
          confidence: 'medium',
          reason: 'Matched a known merchant',
          fromModel: false,
          source: 'merchant',
          alternatives: [],
        }
      : {
          categoryId: null,
          categoryName: null,
          confidence: 'low',
          reason: 'No match found',
          fromModel: false,
          source: 'none',
          alternatives: [],
        };
  }

  try {
    const raw = await complete({
      model: env.GROQ_FAST_MODEL,
      temperature: 0,
      maxTokens: 400,
      json: true,
      reasoning: 'low',
      messages: [
        { role: 'system', content: CATEGORISE_INSTRUCTION },
        {
          role: 'user',
          content: `MERCHANT: ${input.merchant.slice(0, 120)}
DESCRIPTION: ${(input.description ?? '').slice(0, 200) || '(none)'}
AMOUNT: ${input.amount ? rupees(input.amount) : '(not given)'}

CATEGORIES (choose one of these names exactly):
${categories.map((entry) => entry.name).join('\n')}`,
        },
      ],
    });

    const parsed = JSON.parse(raw) as {
      categoryName?: string;
      confidence?: string;
      reason?: string;
    };

    const raw_name = typeof parsed.categoryName === 'string' ? parsed.categoryName.trim() : '';
    // Tolerate the one shape it reaches for anyway — "Zomato (Food)" — rather
    // than discarding an otherwise correct answer over punctuation.
    const name = byName.has(raw_name) ? raw_name : raw_name.replace(/\s*\([^)]*\)\s*$/, '');
    const match = byName.get(name);

    // A name that is not in the list is an invention, so it is dropped rather
    // than fuzzy-matched into something that looks plausible.
    if (!match) {
      logger.warn({ suggested: raw_name }, 'category suggestion not in the list, discarding');
      throw new AiUnavailableError();
    }

    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low';

    return {
      categoryId: String(match._id),
      categoryName: match.name,
      confidence,
      reason: (typeof parsed.reason === 'string' ? parsed.reason : '').slice(0, 80) || 'Best match',
      fromModel: true,
      source: 'model',
      alternatives: alternativesFor(match.group, categories, match.name),
    };
  } catch {
    return local
      ? {
          categoryId: String(byName.get(local)?._id),
          categoryName: local,
          confidence: 'medium',
          reason: 'Matched a known merchant',
          fromModel: false,
          source: 'merchant',
          alternatives: [],
        }
      : {
          categoryId: null,
          categoryName: null,
          confidence: 'low',
          reason: 'Could not tell from the name',
          fromModel: false,
          source: 'none',
          alternatives: [],
        };
  }
}

/** Sibling categories, so the picker can lead with the near misses. */
function alternativesFor(
  group: string,
  categories: { _id: unknown; name: string; group: string }[],
  exclude: string,
): { categoryId: string; categoryName: string }[] {
  return categories
    .filter((entry) => entry.group === group && entry.name !== exclude)
    .slice(0, 3)
    .map((entry) => ({ categoryId: String(entry._id), categoryName: entry.name }));
}

/**
 * Brands common enough in India to be worth matching without a round trip.
 *
 * This is not a fallback for the model so much as a shortcut past it: these are
 * unambiguous, and a local hit is instant and free where a network call is
 * neither.
 */
const MERCHANT_HINTS: readonly [RegExp, string][] = [
  [/\bswiggy\s*instamart\b/i, 'Grocery'],
  [/\bswiggy\b/i, 'Swiggy'],
  [/\bzomato\b/i, 'Zomato'],
  [/\b(blinkit|zepto|bigbasket|dmart|jiomart)\b/i, 'Grocery'],
  [/\b(indian\s*oil|iocl|hp\s*petrol|hindustan\s*petroleum|bharat\s*petroleum|bpcl|shell)\b/i, 'Petrol'],
  [/\buber\b/i, 'Uber'],
  [/\bola\b/i, 'Ola'],
  [/\brapido\b/i, 'Rapido'],
  [/\b(netflix)\b/i, 'Netflix'],
  [/\b(prime\s*video)\b/i, 'Prime Video'],
  [/\bspotify\b/i, 'Spotify'],
  [/\byoutube\s*premium\b/i, 'YouTube Premium'],
  [/\bamazon\b/i, 'Amazon'],
  [/\bflipkart\b/i, 'Flipkart'],
  [/\bmyntra\b/i, 'Myntra'],
  [/\b(airtel|jio|vodafone|vi\b)/i, 'Mobile Recharge'],
  [/\b(jiofiber|act\s*fibernet|hathway)\b/i, 'Internet'],
  [/\b(bescom|tneb|msedcl|electricity)\b/i, 'Electricity'],
  [/\b(apollo\s*pharmacy|pharmeasy|1mg|netmeds)\b/i, 'Pharmacy'],
  [/\b(cult\.?fit|cultfit|gold'?s\s*gym)\b/i, 'Gym'],
  [/\b(irctc|indigo|vistara|spicejet|air\s*india)\b/i, 'Flights'],
  [/\b(pvr|inox|cinepolis)\b/i, 'Movies'],
  [/\b(rent)\b/i, 'Rent'],
];

export function localCategoryGuess(
  merchant: string,
  description: string | undefined,
  available: string[],
): string | null {
  const haystack = `${merchant} ${description ?? ''}`.trim();

  // 1. Check Indian knowledge base
  const known = matchIndianMerchant(haystack);
  if (known && available.includes(known.categoryName)) return known.categoryName;

  // 2. Check direct category keywords
  const direct = matchDirectCategory(haystack);
  if (direct) {
    if (available.includes(direct.categoryName)) return direct.categoryName;
    if (direct.aliases) {
      for (const alias of direct.aliases) {
        if (available.includes(alias)) return alias;
      }
    }
  }

  // 3. Built-in pattern hints
  for (const [pattern, name] of MERCHANT_HINTS) {
    if (pattern.test(haystack) && available.includes(name)) return name;
  }
  return null;
}
