import { Types } from 'mongoose';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  getCategorySpend,
  getDayTotal,
  getOverview,
  type AnalyticsOverview,
} from '../analytics/analytics.service';
import { CategoryModel } from '../categories/category.model';

import { checkGrounding, verify, type VerifiedReply } from './ai.guard';
import { complete, isAiConfigured, AiUnavailableError } from './groq.client';
import {
  CATEGORISE_INSTRUCTION,
  INSIGHTS_INSTRUCTION,
  LIMITED_DATA_NOTE,
  SYSTEM_RULES,
  buildFactSheet,
  deterministicSummary,
  isLimitedData,
  rupees,
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

export type CategorySuggestion = {
  categoryId: string | null;
  categoryName: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  fromModel: boolean;
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
        maxTokens: 220,
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
      maxTokens: 500,
      json: true,
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

type Intent =
  | 'total_spend'
  | 'category_spend'
  | 'savings'
  | 'income'
  | 'largest_expenses'
  | 'top_category'
  | 'comparison'
  | 'budget_status'
  | 'today'
  | 'general';

type ResolvedIntent = { intent: Intent; categoryName?: string };

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
async function resolveIntent(question: string, categoryNames: string[]): Promise<ResolvedIntent> {
  const keyword = keywordIntent(question, categoryNames);
  if (!isAiConfigured()) return keyword;

  try {
    const raw = await complete({
      model: env.GROQ_FAST_MODEL,
      temperature: 0,
      maxTokens: 200,
      json: true,
      messages: [
        {
          role: 'system',
          content: `Classify a question about personal spending. Reply with JSON only:
{"intent":"total_spend|category_spend|savings|income|largest_expenses|top_category|comparison|budget_status|today|general","category":"exact category name from the list, or null"}

"category_spend" is for questions about one named category. "top_category" is for "where am I spending the most". "comparison" is for "why did I spend more" or "versus last month". "today" is for questions about today specifically.
The category MUST be copied exactly from this list or be null:
${categoryNames.join(', ')}`,
        },
        { role: 'user', content: question.slice(0, 400) },
      ],
    });

    const parsed = JSON.parse(raw) as { intent?: string; category?: string | null };
    const intent = (parsed.intent ?? 'general') as Intent;
    const category =
      typeof parsed.category === 'string' && categoryNames.includes(parsed.category)
        ? parsed.category
        : keyword.categoryName;

    return { intent, categoryName: category };
  } catch {
    return keyword;
  }
}

/** The fallback, and the reason a Groq outage does not take the feature down. */
function keywordIntent(question: string, categoryNames: string[]): ResolvedIntent {
  const text = question.toLowerCase();

  const matched = categoryNames.find((name) => text.includes(name.toLowerCase()));

  if (/\btoday\b/.test(text)) return { intent: 'today', categoryName: matched };
  if (matched) return { intent: 'category_spend', categoryName: matched };
  if (/\b(save|saved|saving|savings)\b/.test(text)) return { intent: 'savings' };
  if (/\b(earn|earned|income|salary)\b/.test(text)) return { intent: 'income' };
  if (/\b(biggest|largest|most expensive|top expenses?)\b/.test(text)) {
    return { intent: 'largest_expenses' };
  }
  if (/\b(most|highest|top)\b.*\b(categor|spend)/.test(text)) return { intent: 'top_category' };
  if (/\b(more|less|than last|compared|why)\b/.test(text)) return { intent: 'comparison' };
  if (/\bbudget/.test(text)) return { intent: 'budget_status' };
  if (/\b(spend|spent|spending|total)\b/.test(text)) return { intent: 'total_spend' };

  return { intent: 'general' };
}

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
    .select('name')
    .lean();
  const categoryNames = [...new Set(categories.map((entry) => entry.name))];

  const resolved = await resolveIntent(question, categoryNames);

  let facts = buildFactSheet(overview);
  let fallback = deterministicSummary(overview);
  const context: AiAnswer['context'] = { intent: resolved.intent, periodLabel: label };

  // Extra, narrower data for the intents the overview does not already cover.
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

  if (!isAiConfigured()) {
    return { text: fallback, fromModel: false, limitedData: limited, context };
  }

  const result: VerifiedReply = await verify(
    (retryNote) =>
      complete({
        temperature: 0.2,
        maxTokens: 280,
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
      alternatives: [],
    };
  }

  const byName = new Map(categories.map((entry) => [entry.name, entry]));
  const local = localCategoryGuess(input.merchant, input.description, [...byName.keys()]);

  if (!isAiConfigured()) {
    return local
      ? {
          categoryId: String(byName.get(local)?._id),
          categoryName: local,
          confidence: 'medium',
          reason: 'Matched a known merchant',
          fromModel: false,
          alternatives: [],
        }
      : {
          categoryId: null,
          categoryName: null,
          confidence: 'low',
          reason: 'No match found',
          fromModel: false,
          alternatives: [],
        };
  }

  try {
    const raw = await complete({
      model: env.GROQ_FAST_MODEL,
      temperature: 0,
      maxTokens: 200,
      json: true,
      messages: [
        { role: 'system', content: CATEGORISE_INSTRUCTION },
        {
          role: 'user',
          content: `MERCHANT: ${input.merchant.slice(0, 120)}
DESCRIPTION: ${(input.description ?? '').slice(0, 200) || '(none)'}
AMOUNT: ${input.amount ? rupees(input.amount) : '(not given)'}

CATEGORIES:
${categories.map((entry) => `${entry.name} (${entry.group})`).join('\n')}`,
        },
      ],
    });

    const parsed = JSON.parse(raw) as {
      categoryName?: string;
      confidence?: string;
      reason?: string;
    };

    const name = typeof parsed.categoryName === 'string' ? parsed.categoryName.trim() : '';
    const match = byName.get(name);

    // A name that is not in the list is an invention, so it is dropped rather
    // than fuzzy-matched into something that looks plausible.
    if (!match) {
      logger.warn({ suggested: name }, 'category suggestion not in the list, discarding');
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
          alternatives: [],
        }
      : {
          categoryId: null,
          categoryName: null,
          confidence: 'low',
          reason: 'Could not tell from the name',
          fromModel: false,
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

function localCategoryGuess(
  merchant: string,
  description: string | undefined,
  available: string[],
): string | null {
  const haystack = `${merchant} ${description ?? ''}`;

  for (const [pattern, name] of MERCHANT_HINTS) {
    if (pattern.test(haystack) && available.includes(name)) return name;
  }
  return null;
}
