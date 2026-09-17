import { DateTime } from 'luxon';

import { PAYMENT_METHODS, type PaymentMethod } from '../transactions/transaction.model';

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
};

/** Blanks out the first occurrence of a fragment, leaving a separator behind. */
function strip(text: string, fragment: string | null | undefined): string {
  if (!fragment) return text;
  const at = text.toLowerCase().indexOf(fragment.toLowerCase());
  if (at === -1) return text;
  return `${text.slice(0, at)} ${text.slice(at + fragment.length)}`;
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

  const merchant = extractMerchant(trimmed, [amount?.text, date.text, method?.text]);

  return { amount, date, method, merchant };
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}
