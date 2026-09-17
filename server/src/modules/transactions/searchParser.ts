import { DateTime } from 'luxon';
import { z } from 'zod';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { zoneOrDefault } from '../../lib/time';
import { AccountModel } from '../accounts/account.model';
import { CategoryModel } from '../categories/category.model';
import { UserModel } from '../users/user.model';
import { complete, isAiConfigured } from '../ai/groq.client';
import { INDIAN_MERCHANTS } from '../ai/knowledge/indianKnowledge';
import { PAYMENT_METHODS, type PaymentMethod, type TransactionType } from './transaction.model';

export type SearchConfidence = 'high' | 'medium' | 'low';

export type UnderstoodSearch = {
  merchant?: string;
  type?: TransactionType;
  minAmount?: number; // paise
  maxAmount?: number; // paise
  from?: string; // ISO
  to?: string; // ISO
  periodLabel?: string;
  accountName?: string;
  categoryName?: string;
  paymentMethod?: PaymentMethod;
  description?: string;
  obligationIntent?: {
    personName?: string;
    type: 'loan' | 'paid_for' | 'borrowed' | 'split';
    direction: 'owed_to_me' | 'i_owe';
  };
};

export type SearchFilters = {
  q?: string;
  search?: string;
  merchant?: string;
  type?: TransactionType;
  accountId?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
  minAmount?: number;
  maxAmount?: number;
  from?: string;
  to?: string;
};

export type SearchProposalResult = {
  confidence: SearchConfidence;
  understood: UnderstoodSearch;
  filters: SearchFilters;
  displaySummary: string;
  requiresConfirmation: boolean;
};

// Strict Zod schema for Groq fallback output — NEVER allows raw MongoDB operators
const groqSearchSchema = z.object({
  merchant: z.string().trim().max(100).nullable().optional(),
  type: z.enum(['expense', 'income', 'transfer']).nullable().optional(),
  minAmountRupees: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  maxAmountRupees: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  accountHint: z.string().trim().max(80).nullable().optional(),
  categoryHint: z.string().trim().max(80).nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  period: z
    .enum([
      'today',
      'yesterday',
      'this_week',
      'last_week',
      'this_month',
      'last_month',
      'this_year',
      'last_7_days',
      'last_30_days',
      'august',
      'custom',
    ])
    .nullable()
    .optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});

/**
 * Normalizes Indian currency strings into numeric whole rupees.
 * Handles: ₹1,25,000, ₹125000, Rs 125000, INR 125000, 1.5k, 2k, 500, etc.
 */
function parseIndianRupee(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹\s,]|rs\.?|inr/gi, '').trim();
  if (!cleaned) return null;

  if (/k$/i.test(cleaned)) {
    const num = Number(cleaned.slice(0, -1));
    return Number.isFinite(num) && num > 0 ? num * 1000 : null;
  }

  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Deterministic date parser scoped to the user's timezone.
 */
export function parseSearchDateRange(
  text: string,
  zone: string,
  now = new Date(),
): { from: string; to: string; label: string } | null {
  const lower = text.toLowerCase();
  const dtNow = DateTime.fromJSDate(now, { zone });

  if (/\btoday\b/.test(lower)) {
    return {
      from: dtNow.startOf('day').toJSDate().toISOString(),
      to: dtNow.endOf('day').toJSDate().toISOString(),
      label: 'Today',
    };
  }

  if (/\byesterday\b/.test(lower)) {
    const y = dtNow.minus({ days: 1 });
    return {
      from: y.startOf('day').toJSDate().toISOString(),
      to: y.endOf('day').toJSDate().toISOString(),
      label: 'Yesterday',
    };
  }

  if (/\bthis week\b/.test(lower)) {
    return {
      from: dtNow.startOf('week').toJSDate().toISOString(),
      to: dtNow.endOf('week').toJSDate().toISOString(),
      label: 'This week',
    };
  }

  if (/\blast week\b/.test(lower)) {
    const lw = dtNow.minus({ weeks: 1 });
    return {
      from: lw.startOf('week').toJSDate().toISOString(),
      to: lw.endOf('week').toJSDate().toISOString(),
      label: 'Last week',
    };
  }

  if (/\bthis month\b/.test(lower)) {
    return {
      from: dtNow.startOf('month').toJSDate().toISOString(),
      to: dtNow.endOf('month').toJSDate().toISOString(),
      label: 'This month',
    };
  }

  if (/\blast month\b/.test(lower)) {
    const lm = dtNow.minus({ months: 1 });
    return {
      from: lm.startOf('month').toJSDate().toISOString(),
      to: lm.endOf('month').toJSDate().toISOString(),
      label: 'Last month',
    };
  }

  if (/\bthis year\b/.test(lower)) {
    return {
      from: dtNow.startOf('year').toJSDate().toISOString(),
      to: dtNow.endOf('year').toJSDate().toISOString(),
      label: 'This year',
    };
  }

  if (/\blast 7 days\b/.test(lower) || /\bpast 7 days\b/.test(lower)) {
    return {
      from: dtNow.minus({ days: 7 }).startOf('day').toJSDate().toISOString(),
      to: dtNow.endOf('day').toJSDate().toISOString(),
      label: 'Last 7 days',
    };
  }

  if (/\blast 30 days\b/.test(lower) || /\bpast 30 days\b/.test(lower)) {
    return {
      from: dtNow.minus({ days: 30 }).startOf('day').toJSDate().toISOString(),
      to: dtNow.endOf('day').toJSDate().toISOString(),
      label: 'Last 30 days',
    };
  }

  // Explicit month names like "August", "August 2026", "in Aug"
  const MONTHS: Record<string, number> = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12,
  };

  for (const [mName, mNum] of Object.entries(MONTHS)) {
    const pattern = new RegExp(`\\b(?:in\\s+)?${mName}(?:\\s+(\\d{4}))?\\b`, 'i');
    const match = pattern.exec(lower);
    if (match) {
      const year = match[1] ? Number(match[1]) : dtNow.year;
      const targetMonth = DateTime.fromObject({ year, month: mNum, day: 1 }, { zone });
      if (targetMonth.isValid) {
        return {
          from: targetMonth.startOf('month').toJSDate().toISOString(),
          to: targetMonth.endOf('month').toJSDate().toISOString(),
          label: `${targetMonth.monthLong} ${year}`,
        };
      }
    }
  }

  return null;
}

/**
 * Deterministic Amount Filter Parser
 * Supports:
 * - > ₹2,000, above 2000, over ₹2,000, more than ₹2,000, >= 1000
 * - < ₹500, below 500, under ₹500, less than ₹500, <= 5000
 * - ₹500-₹2,000, between ₹500 and ₹2,000
 * - ₹500 (exact)
 */
export function parseSearchAmount(text: string): {
  minAmount?: number; // paise
  maxAmount?: number; // paise
  matchedText?: string;
} | null {
  // Range: "between ₹500 and ₹2,000" or "₹500-₹2,000" or "500 to 2000"
  const rangePattern =
    /(?:between\s+)?(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)\s*(?:-|to|and)\s*(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)/i;
  const rangeMatch = rangePattern.exec(text);
  if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
    const minR = parseIndianRupee(rangeMatch[1]);
    const maxR = parseIndianRupee(rangeMatch[2]);
    if (minR && maxR && minR <= maxR) {
      return {
        minAmount: Math.round(minR * 100),
        maxAmount: Math.round(maxR * 100),
        matchedText: rangeMatch[0],
      };
    }
  }

  // Greater than / above / over / more than: "above ₹2,000", "> ₹2000", "over 2000"
  const gtPattern =
    /(?:>|>=|above|over|more than|exceeding)\s*(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d{1,2})?)/i;
  const gtMatch = gtPattern.exec(text);
  if (gtMatch && gtMatch[1]) {
    const r = parseIndianRupee(gtMatch[1]);
    if (r) {
      return {
        minAmount: Math.round(r * 100),
        matchedText: gtMatch[0],
      };
    }
  }

  // Less than / below / under: "< ₹500", "below 500", "under ₹500"
  const ltPattern =
    /(?:<|<=|below|under|less than)\s*(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d{1,2})?)/i;
  const ltMatch = ltPattern.exec(text);
  if (ltMatch && ltMatch[1]) {
    const r = parseIndianRupee(ltMatch[1]);
    if (r) {
      return {
        maxAmount: Math.round(r * 100),
        matchedText: ltMatch[0],
      };
    }
  }

  // Single exact amount with currency symbol: "₹500", "Rs 125000", "INR 2000"
  const exactPattern = /(?:₹|rs\.?|inr)\s*(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d{1,2})?)/i;
  const exactMatch = exactPattern.exec(text);
  if (exactMatch && exactMatch[1]) {
    const r = parseIndianRupee(exactMatch[1]);
    if (r) {
      const paise = Math.round(r * 100);
      return {
        minAmount: paise,
        maxAmount: paise,
        matchedText: exactMatch[0],
      };
    }
  }

  return null;
}

/**
 * Deterministic Natural Language Parser
 */
export function parseDeterministicSearch(
  query: string,
  zone: string,
  now = new Date(),
): {
  understood: UnderstoodSearch;
  confidence: SearchConfidence;
  residualText: string;
} {
  const understood: UnderstoodSearch = {};
  let working = query.trim();

  // 1. Check for B.5 People / Obligation intents
  // e.g. "Money I lent Rahul", "Repayments from Rahul", "Lent Rahul 5000", "Rahul owes"
  const lentMatch = /\b(?:lent|loaned|gave loan to)\s+([a-zA-Z]+)/i.exec(working);
  if (lentMatch) {
    understood.obligationIntent = {
      personName: lentMatch[1],
      type: 'loan',
      direction: 'owed_to_me',
    };
    understood.description = `Lent ${lentMatch[1]}`;
  }
  const repayMatch = /\b(?:repayment|repaid by|repayments from)\s+([a-zA-Z]+)/i.exec(working);
  if (repayMatch) {
    understood.obligationIntent = {
      personName: repayMatch[1],
      type: 'loan',
      direction: 'owed_to_me',
    };
    understood.description = `Repayment from ${repayMatch[1]}`;
  }
  const borrowedMatch = /\b(?:borrowed from|took loan from)\s+([a-zA-Z]+)/i.exec(working);
  if (borrowedMatch) {
    understood.obligationIntent = {
      personName: borrowedMatch[1],
      type: 'borrowed',
      direction: 'i_owe',
    };
    understood.description = `Borrowed from ${borrowedMatch[1]}`;
  }

  // 2. Parse Date Range
  const dateRange = parseSearchDateRange(working, zone, now);
  if (dateRange) {
    understood.from = dateRange.from;
    understood.to = dateRange.to;
    understood.periodLabel = dateRange.label;
    // Strip date phrase
    working = working.replace(
      /\b(today|yesterday|this week|last week|this month|last month|this year|last 7 days|last 30 days|august(?: \d{4})?|january|february|march|april|may|june|july|september|october|november|december)\b/gi,
      '',
    );
  }

  // 3. Parse Amount Filter
  const amountParsed = parseSearchAmount(working);
  if (amountParsed) {
    if (amountParsed.minAmount !== undefined) understood.minAmount = amountParsed.minAmount;
    if (amountParsed.maxAmount !== undefined) understood.maxAmount = amountParsed.maxAmount;
    if (amountParsed.matchedText) {
      working = working.replace(amountParsed.matchedText, '');
    }
  }

  // 4. Parse Transaction Type
  if (/\b(?:expenses?|spending|spent|spend)\b/i.test(working)) {
    understood.type = 'expense';
    working = working.replace(/\b(?:expenses?|spending|spent|spend)\b/gi, '');
  } else if (/\b(?:income|earnings?|earned|salary)\b/i.test(working)) {
    understood.type = 'income';
    working = working.replace(/\b(?:income|earnings?|earned|salary)\b/gi, '');
  } else if (/\b(?:transfers?|moved)\b/i.test(working)) {
    understood.type = 'transfer';
    working = working.replace(/\b(?:transfers?|moved)\b/gi, '');
  }

  // 5. Parse Payment Method
  if (/\bupi\b/i.test(working)) {
    understood.paymentMethod = 'upi';
    working = working.replace(/\bupi\b/gi, '');
  } else if (/\bcash\b/i.test(working)) {
    understood.paymentMethod = 'cash';
    working = working.replace(/\bcash\b/gi, '');
  } else if (/\bcredit\s*card\b/i.test(working)) {
    understood.paymentMethod = 'credit_card';
    working = working.replace(/\bcredit\s*card\b/gi, '');
  } else if (/\bdebit\s*card\b/i.test(working)) {
    understood.paymentMethod = 'debit_card';
    working = working.replace(/\bdebit\s*card\b/gi, '');
  } else if (/\bnet\s*banking\b/i.test(working)) {
    understood.paymentMethod = 'net_banking';
    working = working.replace(/\bnet\s*banking\b/gi, '');
  }

  // 6. Match Known Indian Merchants
  for (const rule of INDIAN_MERCHANTS) {
    if (rule.pattern.test(working)) {
      understood.merchant = rule.canonicalName;
      understood.categoryName = rule.categoryName;
      working = working.replace(rule.pattern, '');
      break;
    }
  }

  // 7. Match Common Categories if not already matched
  if (!understood.categoryName) {
    if (/\b(?:food|dining|restaurant|eat|lunch|dinner|breakfast)\b/i.test(working)) {
      understood.categoryName = 'Food & Dining';
      working = working.replace(/\b(?:food|dining|restaurant|eat|lunch|dinner|breakfast)\b/gi, '');
    } else if (/\b(?:petrol|fuel|diesel)\b/i.test(working)) {
      understood.categoryName = 'Petrol';
      working = working.replace(/\b(?:petrol|fuel|diesel)\b/gi, '');
    } else if (/\b(?:groceries|grocery|supermarket|mart)\b/i.test(working)) {
      understood.categoryName = 'Groceries';
      working = working.replace(/\b(?:groceries|grocery|supermarket|mart)\b/gi, '');
    } else if (/\b(?:shopping|clothes|fashion)\b/i.test(working)) {
      understood.categoryName = 'Shopping';
      working = working.replace(/\b(?:shopping|clothes|fashion)\b/gi, '');
    } else if (/\b(?:travel|flight|train|cab|auto|taxi)\b/i.test(working)) {
      understood.categoryName = 'Travel';
      working = working.replace(/\b(?:travel|flight|train|cab|auto|taxi)\b/gi, '');
    }
  }

  // 8. Clean up residue (strip stop words)
  const residual = working
    .replace(/\b(everything|i|in|at|on|for|from|paid|via|with|using|all|my|transactions?|money)\b/gi, '')
    .trim();

  // If we haven't found a merchant yet and residual is a clean single/double word, it could be the merchant or search term
  if (!understood.merchant && residual.length > 0 && residual.length <= 40) {
    understood.merchant = residual;
  }

  // Compute confidence
  let confidence: SearchConfidence = 'low';
  const hasSignal =
    understood.merchant ||
    understood.minAmount !== undefined ||
    understood.maxAmount !== undefined ||
    understood.from ||
    understood.type ||
    understood.paymentMethod ||
    understood.obligationIntent;

  if (hasSignal) {
    confidence = residual.length <= 15 ? 'high' : 'medium';
  }

  return {
    understood,
    confidence,
    residualText: residual,
  };
}

/**
 * Fallback to Groq with strict JSON output validation.
 * NEVER executes queries directly.
 */
async function groqSearchFallback(
  query: string,
  userAccounts: string[],
  userCategories: string[],
): Promise<z.infer<typeof groqSearchSchema> | null> {
  if (!isAiConfigured()) return null;

  try {
    const prompt = `Analyze this search query for a personal finance app and propose search filters.
Query: "${query}"

Available Accounts: ${userAccounts.join(', ') || 'None'}
Available Categories: ${userCategories.join(', ') || 'None'}

Return ONLY a JSON object with this shape:
{
  "merchant": string or null (brand or merchant name),
  "type": "expense" | "income" | "transfer" | null,
  "minAmountRupees": number or null,
  "maxAmountRupees": number or null,
  "accountHint": string or null,
  "categoryHint": string or null,
  "paymentMethod": "upi" | "cash" | "credit_card" | "debit_card" | "net_banking" | null,
  "period": "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | "last_7_days" | "last_30_days" | null,
  "confidence": "high" | "medium" | "low"
}`;

    const text = await complete({
      messages: [{ role: 'user', content: prompt }],
      model: env.GROQ_FAST_MODEL,
      temperature: 0.1,
      maxTokens: 250,
      json: true,
    });

    const parsed = JSON.parse(text);
    const validated = groqSearchSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn({ err: validated.error }, 'Groq search proposal failed Zod validation');
      return null;
    }

    return validated.data;
  } catch (error) {
    logger.warn({ err: error }, 'Groq search fallback encountered error');
    return null;
  }
}

/**
 * Generates user-friendly "Paisa understood" summary for confirmation and display.
 */
export function buildDisplaySummary(understood: UnderstoodSearch): string {
  const parts: string[] = [];

  if (understood.merchant) parts.push(`Merchant: ${understood.merchant}`);
  if (understood.type) {
    parts.push(`Type: ${understood.type.charAt(0).toUpperCase() + understood.type.slice(1)}`);
  }
  if (understood.categoryName) parts.push(`Category: ${understood.categoryName}`);
  if (understood.accountName) parts.push(`Account: ${understood.accountName}`);
  if (understood.paymentMethod) {
    parts.push(`Payment: ${understood.paymentMethod.replace('_', ' ').toUpperCase()}`);
  }

  if (understood.minAmount !== undefined && understood.maxAmount !== undefined) {
    if (understood.minAmount === understood.maxAmount) {
      parts.push(`Amount: ₹${(understood.minAmount / 100).toLocaleString('en-IN')}`);
    } else {
      parts.push(
        `Amount: ₹${(understood.minAmount / 100).toLocaleString('en-IN')} – ₹${(understood.maxAmount / 100).toLocaleString('en-IN')}`,
      );
    }
  } else if (understood.minAmount !== undefined) {
    parts.push(`Amount: > ₹${(understood.minAmount / 100).toLocaleString('en-IN')}`);
  } else if (understood.maxAmount !== undefined) {
    parts.push(`Amount: < ₹${(understood.maxAmount / 100).toLocaleString('en-IN')}`);
  }

  if (understood.periodLabel) {
    parts.push(`Period: ${understood.periodLabel}`);
  }

  if (understood.obligationIntent) {
    parts.push(
      `Obligation: ${understood.obligationIntent.type} (${understood.obligationIntent.personName ?? 'Person'})`,
    );
  }

  return parts.join('  ·  ') || 'All transactions';
}

/**
 * Main Natural Language Search Proposal Service
 */
export async function parseNaturalLanguageSearch(
  userId: string,
  query: string,
): Promise<SearchProposalResult> {
  const user = await UserModel.findById(userId).select('timezone').lean();
  const zone = zoneOrDefault(user?.timezone);

  // 1. Run deterministic parser
  const detResult = parseDeterministicSearch(query, zone);
  let finalUnderstood = { ...detResult.understood };
  let finalConfidence = detResult.confidence;

  // 2. Fetch user's active accounts and categories for mapping
  const [accounts, categories] = await Promise.all([
    AccountModel.find({ userId }).select('_id name').lean(),
    CategoryModel.find({ userId }).select('_id name').lean(),
  ]);

  const accountNames = accounts.map((a) => a.name);
  const categoryNames = categories.map((c) => c.name);

  // Check if query directly mentions any of user's accounts
  const lowerQuery = query.toLowerCase();
  for (const acc of accounts) {
    const accLower = acc.name.toLowerCase();
    const pattern = new RegExp(`\\b${accLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lowerQuery)) {
      finalUnderstood.accountName = acc.name;
      break;
    }
    // Also check significant tokens (e.g. "hdfc" in "HDFC Bank")
    const tokens = accLower
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !['bank', 'card', 'account', 'savings', 'current'].includes(t));
    for (const token of tokens) {
      if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lowerQuery)) {
        finalUnderstood.accountName = acc.name;
        break;
      }
    }
    if (finalUnderstood.accountName) break;
  }

  // Check if query directly mentions any of user's categories
  for (const cat of categories) {
    const catLower = cat.name.toLowerCase();
    const pattern = new RegExp(`\\b${catLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lowerQuery)) {
      finalUnderstood.categoryName = cat.name;
      break;
    }
    const catTokens = catLower
      .split(/[\s&/]+/)
      .filter((t) => t.length >= 3);
    for (const token of catTokens) {
      if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lowerQuery)) {
        finalUnderstood.categoryName = cat.name;
        break;
      }
    }
    if (finalUnderstood.categoryName) break;
  }

  // Disambiguate: if the merchant was assigned to the account or category name, clear it
  if (finalUnderstood.accountName && finalUnderstood.merchant) {
    const mLower = finalUnderstood.merchant.toLowerCase();
    const aLower = finalUnderstood.accountName.toLowerCase();
    if (aLower.includes(mLower) || mLower.includes(aLower)) {
      finalUnderstood.merchant = undefined;
    }
  }
  if (finalUnderstood.categoryName && finalUnderstood.merchant) {
    const mLower = finalUnderstood.merchant.toLowerCase();
    const cLower = finalUnderstood.categoryName.toLowerCase();
    if (cLower.includes(mLower) || mLower.includes(cLower)) {
      finalUnderstood.merchant = undefined;
    }
  }

  // 3. Fallback to Groq if confidence is not high and AI is available
  if (finalConfidence !== 'high' && isAiConfigured()) {
    const groqProposal = await groqSearchFallback(query, accountNames, categoryNames);
    if (groqProposal) {
      if (!finalUnderstood.merchant && groqProposal.merchant) {
        finalUnderstood.merchant = groqProposal.merchant;
      }
      if (!finalUnderstood.type && groqProposal.type) {
        finalUnderstood.type = groqProposal.type;
      }
      if (finalUnderstood.minAmount === undefined && groqProposal.minAmountRupees) {
        finalUnderstood.minAmount = Math.round(groqProposal.minAmountRupees * 100);
      }
      if (finalUnderstood.maxAmount === undefined && groqProposal.maxAmountRupees) {
        finalUnderstood.maxAmount = Math.round(groqProposal.maxAmountRupees * 100);
      }
      if (!finalUnderstood.paymentMethod && groqProposal.paymentMethod) {
        finalUnderstood.paymentMethod = groqProposal.paymentMethod;
      }
      if (!finalUnderstood.accountName && groqProposal.accountHint) {
        finalUnderstood.accountName = groqProposal.accountHint;
      }
      if (!finalUnderstood.categoryName && groqProposal.categoryHint) {
        finalUnderstood.categoryName = groqProposal.categoryHint;
      }
      if (groqProposal.confidence) {
        finalConfidence = groqProposal.confidence;
      }
    }
  }

  // 4. Map resolved names to actual database IDs
  const filters: SearchFilters = {};

  if (finalUnderstood.merchant) {
    filters.merchant = finalUnderstood.merchant;
  }
  if (finalUnderstood.type) {
    filters.type = finalUnderstood.type;
  }
  if (finalUnderstood.paymentMethod) {
    filters.paymentMethod = finalUnderstood.paymentMethod;
  }
  if (finalUnderstood.minAmount !== undefined) {
    filters.minAmount = finalUnderstood.minAmount;
  }
  if (finalUnderstood.maxAmount !== undefined) {
    filters.maxAmount = finalUnderstood.maxAmount;
  }
  if (finalUnderstood.from) {
    filters.from = finalUnderstood.from;
  }
  if (finalUnderstood.to) {
    filters.to = finalUnderstood.to;
  }

  if (finalUnderstood.accountName) {
    const matched = accounts.find(
      (a) => a.name.toLowerCase() === finalUnderstood.accountName?.toLowerCase(),
    );
    if (matched) filters.accountId = String(matched._id);
  }

  if (finalUnderstood.categoryName) {
    const matched = categories.find(
      (c) => c.name.toLowerCase() === finalUnderstood.categoryName?.toLowerCase(),
    );
    if (matched) filters.categoryId = String(matched._id);
  }

  const displaySummary = buildDisplaySummary(finalUnderstood);
  const requiresConfirmation = finalConfidence === 'low' || finalConfidence === 'medium';

  return {
    confidence: finalConfidence,
    understood: finalUnderstood,
    filters,
    displaySummary,
    requiresConfirmation,
  };
}
