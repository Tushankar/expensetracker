import { DateTime } from 'luxon';

import { PAYMENT_METHODS, type PaymentMethod } from '../transactions/transaction.model';
import { matchDirectCategory, matchIndianMerchant } from './knowledge/indianKnowledge';

/**
 * Turning "Petrol 1200" into a transaction, without a model touching the money.
 *
 * The amount, the date and the payment method are found here, by rule. Only the
 * *category* is ever left to inference, and even then the merchant memory and the
 * brand table get first refusal. This is the same principle as the assistant: a
 * language model may interpret, it may not calculate, and an amount it produced is
 * an amount nobody checked.
 *
 * It matters more here than anywhere else in the app, because this is the one
 * screen where a wrong number gets saved rather than merely read. Hence the
 * confirmation preview: nothing parsed is written until someone has seen it.
 */

export type ParsedAmount = {
  paise: number;
  /** The exact substring the amount came from, so the preview can show its working. */
  text: string;
  /** True when the input held more than one plausible amount. */
  ambiguous: boolean;
};

/**
 * Money, as people actually type it.
 *
 * Handles `1200`, `₹1,200`, `1200.50`, `1.2k`, `2k`, `Rs 450`, `450/-`. Rejects
 * anything with more than two decimal places, which is a quantity or a reference,
 * not rupees.
 */
const AMOUNT_PATTERN =
  /(?:₹|rs\.?|inr)?\s?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?\s?(k|rs|\/-)?/gi;

/** Digit runs this long are a phone number, a bill number or a UPI reference. */
const TOO_MANY_DIGITS = 8;

export function parseAmount(input: string): ParsedAmount | null {
  const candidates: ParsedAmount[] = [];

  for (const match of input.matchAll(AMOUNT_PATTERN)) {
    const [whole, digits, decimals, suffix] = match;
    if (!digits) continue;

    const bare = digits.replace(/,/g, '');
    if (bare.length > TOO_MANY_DIGITS) continue;

    let rupees = Number(bare);
    if (!Number.isFinite(rupees)) continue;

    // "1.2k" is 1200; "1200.50" is 1200 rupees 50 paise. The `k` decides which,
    // which is why the suffix is captured rather than stripped earlier.
    const fraction = decimals ? Number(`0.${decimals}`) : 0;
    if (suffix?.toLowerCase() === 'k') {
      rupees = (rupees + fraction) * 1000;
    } else {
      rupees += fraction;
    }

    const paise = Math.round(rupees * 100);
    if (paise <= 0) continue;

    candidates.push({ paise, text: whole.trim(), ambiguous: false });
  }

  if (candidates.length === 0) return null;

  // More than one number means the guess could be wrong, and the preview says so
  // rather than picking silently. The largest is the better bet — "2 coffees 240"
  // is far more common than an amount smaller than its quantity.
  const best = candidates.reduce((a, b) => (b.paise > a.paise ? b : a));
  return { ...best, ambiguous: candidates.length > 1 };
}

export type ParsedDate = {
  date: Date;
  /** The words the date came from, or null when it defaulted to today. */
  text: string | null;
};

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/**
 * When it happened, in the user's own zone.
 *
 * Everything is anchored to `DateTime.now().setZone(zone)` rather than the
 * server's clock: "yesterday" typed at 00:30 in Kolkata is a different day from
 * "yesterday" on a machine in UTC, and getting that wrong files an expense in the
 * wrong month twice a year at the boundary.
 *
 * The time of day is kept from the moment of entry when the day is today, and set
 * to midday otherwise — a backdated expense with a 00:00 stamp sits suspiciously
 * at the very top of its day, and midday is safely inside the day in any zone.
 */
export function parseDate(input: string, zone: string, now = new Date()): ParsedDate {
  const text = input.toLowerCase();
  const today = DateTime.fromJSDate(now, { zone });

  const noon = (value: DateTime) => value.set({ hour: 12, minute: 0, second: 0, millisecond: 0 });

  if (/\bday before yesterday\b/.test(text)) {
    return { date: noon(today.minus({ days: 2 })).toJSDate(), text: 'day before yesterday' };
  }
  if (/\byesterday\b/.test(text)) {
    return { date: noon(today.minus({ days: 1 })).toJSDate(), text: 'yesterday' };
  }
  if (/\btoday\b/.test(text)) {
    return { date: today.toJSDate(), text: 'today' };
  }

  const ago = /\b(\d{1,2})\s?(?:days?|d)\s+ago\b/.exec(text);
  if (ago?.[1]) {
    const days = Number(ago[1]);
    if (days > 0 && days <= 60) {
      return { date: noon(today.minus({ days })).toJSDate(), text: ago[0] };
    }
  }

  // "12 sep", "sep 12", "12 september"
  const named =
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(text) ??
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/.exec(text);
  if (named) {
    const first = named[1] ?? '';
    const second = named[2] ?? '';
    const day = Number(/^\d+$/.test(first) ? first : second);
    const monthName = /^\d+$/.test(first) ? second : first;
    const month = MONTHS.indexOf(monthName.slice(0, 3)) + 1;

    if (month > 0 && day >= 1 && day <= 31) {
      const candidate = noon(today.set({ month, day }));
      // A date later than today means last year — "31 dec" typed in January is
      // the December that just happened, not the one eleven months away.
      const resolved = candidate > today ? candidate.minus({ years: 1 }) : candidate;
      if (resolved.isValid) return { date: resolved.toJSDate(), text: named[0] };
    }
  }

  // "12/09", "12-09-2026". Day first: this is an app for India, where 12/09 is
  // the twelfth of September and never the ninth of December.
  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(text);
  if (numeric?.[1] && numeric[2]) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const yearPart = numeric[3];
    const year = yearPart
      ? Number(yearPart.length === 2 ? `20${yearPart}` : yearPart)
      : today.year;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidate = noon(DateTime.fromObject({ year, month, day }, { zone }));
      if (candidate.isValid) {
        const resolved = !yearPart && candidate > today ? candidate.minus({ years: 1 }) : candidate;
        return { date: resolved.toJSDate(), text: numeric[0] };
      }
    }
  }

  return { date: today.toJSDate(), text: null };
}

/** The words each payment method answers to, longest phrases first. */
const METHOD_WORDS: readonly [RegExp, PaymentMethod][] = [
  [/\b(credit\s?card|cc)\b/i, 'credit_card'],
  [/\b(debit\s?card|dc)\b/i, 'debit_card'],
  [/\b(net\s?banking|netbanking|imps|neft|rtgs)\b/i, 'net_banking'],
  [/\b(bank\s?transfer|transfer)\b/i, 'bank_transfer'],
  [/\b(paytm|phonepe|gpay|g\s?pay|google\s?pay|wallet)\b/i, 'wallet'],
  [/\b(upi|scan|qr)\b/i, 'upi'],
  [/\b(cash|paid\s?cash)\b/i, 'cash'],
  [/\b(card)\b/i, 'credit_card'],
];

export type ParsedMethod = { method: PaymentMethod; text: string } | null;

export function parsePaymentMethod(input: string): ParsedMethod {
  for (const [pattern, method] of METHOD_WORDS) {
    const match = pattern.exec(input);
    if (match) return { method, text: match[0] };
  }
  return null;
}

/** Words that carry no merchant, left over from the phrasing around one. */
const FILLER =
  /\b(for|on|at|to|paid|pay|spent|spend|bought|buy|by|with|via|of|the|a|an|rs|inr|rupees?|today|yesterday|ago|days?)\b/gi;

/**
 * Whatever is left once the amount, the date and the method have been taken out.
 *
 * Removed by position rather than by re-matching, so "Cafe 100 100" does not lose
 * both numbers when only one was the amount. Returns an empty string rather than a
 * guess when nothing meaningful remains — a merchant is optional everywhere in
 * this app, and inventing one from filler words would put "For" in someone's
 * ledger.
 */
export function extractMerchant(input: string, remove: (string | null | undefined)[]): string {
  let rest = input;

  for (const fragment of remove) {
    if (!fragment) continue;
    const at = rest.toLowerCase().indexOf(fragment.toLowerCase());
    if (at === -1) continue;
    rest = `${rest.slice(0, at)} ${rest.slice(at + fragment.length)}`;
  }

  const cleaned = rest
    .replace(FILLER, ' ')
    .replace(/[^\p{L}\p{N}&'. -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length < 2) return '';

  // Title case, but only for input that was typed flat. "DMart" and "IndianOil"
  // are spelled that way on purpose and re-casing them is worse than leaving them.
  const looksFlat = cleaned === cleaned.toLowerCase() || cleaned === cleaned.toUpperCase();
  const titled = looksFlat
    ? cleaned
        .split(' ')
        .map((word) => (word.length > 2 ? word[0]?.toUpperCase() + word.slice(1).toLowerCase() : word))
        .join(' ')
    : cleaned;

  return titled.slice(0, 120);
}

export type QuickParse = {
  amount: ParsedAmount | null;
  date: ParsedDate;
  method: ParsedMethod;
  merchant: string;
  categoryHint?: string | null;
  categoryGroup?: string | null;
  categoryAliases?: string[];
  ruleConfidence?: 'high' | 'medium' | 'low';
  obligation?: {
    personName: string;
    direction: 'owed_to_me' | 'i_owe';
    type: 'loan' | 'paid_for' | 'borrowed';
  } | null;
  /** A raw account name fragment (e.g. "HDFC") to fuzzy-match against user accounts. */
  accountHint?: string | null;
  /** True when the phrasing looks like income rather than an expense. */
  incomeIntent?: boolean;
};

/**
 * Extracts a likely account name from the input.
 *
 * Recognises patterns like:
 *   "HDFC Zomato 450"       → "HDFC"
 *   "Zomato 450 from HDFC"  → "HDFC"
 *   "Amazon 2500 ICICI"     → "ICICI"
 *   "SBI credit card"       → "SBI"  (only when followed by card/account)
 *
 * Returns the raw hint string. Matching against the user's actual accounts
 * happens in quick.service.ts — this function never touches the database.
 */
const ACCOUNT_KEYWORDS = [
  'hdfc', 'icici', 'sbi', 'axis', 'kotak', 'bob', 'pnb', 'canara', 'idbi',
  'yes bank', 'indusind', 'federal', 'rbl', 'idfc', 'bandhan', 'au bank',
  'paytm', 'fi', 'jupiter', 'niyo', 'cred',
];

export function parseAccountHint(input: string): string | null {
  const text = input.toLowerCase();

  // 1. Keyword anywhere in the input with word boundaries (e.g. "HDFC Zomato 450", "Amazon 2000 ICICI")
  for (const keyword of ACCOUNT_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(text)) {
      return keyword;
    }
  }

  // 2. Explicit account prepositions (from/using/via/through) followed by an account name
  const prefixMatch = /\b(?:from|using|via|through)\s+(?:my\s+)?([a-z0-9][a-z0-9\s]{1,20})\b/i.exec(text);
  if (prefixMatch?.[1]) {
    const candidate = prefixMatch[1].trim();
    const firstWord = candidate.split(/\s+/)[0];
    if (
      firstWord &&
      !/^(?:the|a|an|me|here|there|cash|card|upi|rs|inr|zomato|swiggy|uber|amazon|flipkart|petrol)$/i.test(firstWord)
    ) {
      return firstWord;
    }
  }

  return null;
}

/**
 * Detects income intent from phrasing.
 *
 * Recognises: "Salary 50000", "Earned 5000", "Freelance 10000",
 * "Got paid 25000", "Interest 500", "Bonus 10000".
 *
 * Does NOT fire for ambiguous phrasing — "paid 1200" without "got" is an
 * expense, not income, because that is what people mean 99% of the time.
 */
const INCOME_PATTERN =
  /\b(salary|earned|earnings?|freelance|interest|dividend|bonus|stipend|refund|cashback|got\s+paid|received|credited)\b/i;

export function parseIncomeIntent(input: string): boolean {
  // Obligations take priority — "got paid by Rahul" could be a repayment
  if (/\b(lent|loaned|owes?|borrowed|paid\s+for)\b/i.test(input)) return false;
  return INCOME_PATTERN.test(input);
}

/** Blanks out the first occurrence of a fragment, leaving a separator behind. */
function strip(text: string, fragment: string | null | undefined): string {
  if (!fragment) return text;
  const at = text.toLowerCase().indexOf(fragment.toLowerCase());
  if (at === -1) return text;
  return `${text.slice(0, at)} ${text.slice(at + fragment.length)}`;
}

/**
 * Deterministic detection of person / money owed intents:
 * 1. "Lent Rahul 5000" / "Lent 5000 to Rahul"
 * 2. "Rahul owes me 5000"
 * 3. "Paid 1200 for Priya" / "Paid for Priya 1200"
 * 4. "Priya paid me 1000" / "Rahul returned 1000"
 * 5. "I borrowed 3000 from Amit" / "Borrowed 3000 from Amit"
 */
function parsePersonObligation(input: string): {
  personName: string;
  direction: 'owed_to_me' | 'i_owe';
  type: 'loan' | 'paid_for' | 'borrowed';
} | null {
  const trimmed = input.trim();

  // "Lent Rahul 5000" or "Lent to Rahul 5000" or "Lent 5000 to Rahul"
  const lentMatch =
    /^(?:i\s+)?(?:lent|loaned|gave\s+loan\s+to)\s+(?:to\s+)?([a-zA-Z]+)(?:\s+.*)?$/i.exec(trimmed) ??
    /^(?:i\s+)?(?:lent|loaned)\s+.*?\s+(?:to\s+)?([a-zA-Z]+)$/i.exec(trimmed);
  if (lentMatch?.[1] && !/^(?:rs|inr|money|cash|\d+)$/i.test(lentMatch[1])) {
    return { personName: lentMatch[1], direction: 'owed_to_me', type: 'loan' };
  }

  // "Rahul owes me 5000" or "Rahul owes 5000"
  const owesMatch = /^([a-zA-Z]+)\s+owes(?:\s+me)?(?:\s+.*)?$/i.exec(trimmed);
  if (owesMatch?.[1] && !/^(?:he|she|who|i|they)$/i.test(owesMatch[1])) {
    return { personName: owesMatch[1], direction: 'owed_to_me', type: 'loan' };
  }

  // "Paid 1200 for Priya" or "Paid for Priya 1200"
  const paidForMatch =
    /(?:paid|spent|bought)\s+.*?\s+for\s+([a-zA-Z]+)/i.exec(trimmed) ??
    /(?:paid|spent)\s+for\s+([a-zA-Z]+)/i.exec(trimmed);
  if (paidForMatch?.[1] && !/^(?:dinner|lunch|food|tea|coffee|movie|uber|petrol|\d+)$/i.test(paidForMatch[1])) {
    return { personName: paidForMatch[1], direction: 'owed_to_me', type: 'paid_for' };
  }

  // "I borrowed 3000 from Amit" or "Borrowed from Amit 3000" or "Amit gave me 5000"
  const borrowMatch =
    /(?:borrowed|took\s+loan)\s+.*?\s+from\s+([a-zA-Z]+)/i.exec(trimmed) ??
    /(?:borrowed|took\s+loan)\s+from\s+([a-zA-Z]+)/i.exec(trimmed) ??
    /^([a-zA-Z]+)\s+gave\s+me\s+/i.exec(trimmed);
  if (borrowMatch?.[1] && !/^(?:bank|atm|friend|\d+)$/i.test(borrowMatch[1])) {
    return { personName: borrowMatch[1], direction: 'i_owe', type: 'borrowed' };
  }

  return null;
}

/**
 * The whole deterministic pass. No network, no model, no randomness.
 *
 * The date and the payment method are read first and taken out of the string
 * before the amount is looked for, because both contain digits: "rent 25000 on 1
 * sep" and "chai 40 2 days ago" each hold a number that is plainly not money.
 * Searching the raw text would find two candidates in both, pick the larger, and
 * warn about an ambiguity that only the parser's own reading order created.
 */
export function parseQuickEntry(input: string, zone: string, now = new Date()): QuickParse {
  const trimmed = input.trim();

  const date = parseDate(trimmed, zone, now);
  const method = parsePaymentMethod(trimmed);

  const money = strip(strip(trimmed, date.text), method?.text);
  const amount = parseAmount(money);

  const obligation = parsePersonObligation(trimmed);
  const accountHint = parseAccountHint(trimmed);
  const incomeIntent = !obligation && parseIncomeIntent(trimmed);

  const extracted = extractMerchant(trimmed, [amount?.text, date.text, method?.text, accountHint]);

  // Check Indian knowledge base for known merchants
  const knownMerchant = matchIndianMerchant(extracted);
  // Check direct category keywords (e.g. "Petrol 1200", "Coffee 180", "Cigarettes 220")
  const directCategory = matchDirectCategory(extracted);

  let merchant = extracted;
  let categoryHint: string | null = null;
  let categoryGroup: string | null = null;
  let categoryAliases: string[] | undefined = undefined;
  let ruleConfidence: 'high' | 'medium' | 'low' = 'low';

  if (obligation) {
    ruleConfidence = 'high';
    categoryHint = obligation.type === 'paid_for' ? 'Shopping' : null;
    merchant = obligation.personName;
  } else if (knownMerchant) {
    merchant = knownMerchant.canonicalName;
    categoryHint = knownMerchant.categoryName;
    categoryGroup = knownMerchant.categoryGroup;
    categoryAliases = [knownMerchant.categoryName];
    ruleConfidence = 'high';
  } else if (directCategory) {
    // If the input was solely a category keyword like "Petrol 1200", don't fabricate a merchant
    const cleanWord = extracted.toLowerCase().trim();
    if (directCategory.pattern.test(cleanWord)) {
      merchant = '';
    }
    categoryHint = directCategory.categoryName;
    categoryGroup = directCategory.categoryGroup;
    categoryAliases = directCategory.aliases;
    ruleConfidence = 'high';
  }

  return {
    amount,
    date,
    method,
    merchant,
    categoryHint,
    categoryGroup,
    categoryAliases,
    ruleConfidence,
    obligation,
    accountHint,
    incomeIntent,
  };
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}
