import type { Paise } from '@/types/models';

export const RUPEE = '₹';

/**
 * Indian digit grouping: the last three digits, then pairs.
 * 1234567 -> "12,34,567", not "1,234,567".
 *
 * Done by hand rather than with `Intl.NumberFormat('en-IN')` because Intl support
 * varies across Hermes builds and a wrong grouping is immediately obvious to an
 * Indian user.
 */
export function groupIndian(value: number): string {
  const whole = Math.abs(Math.trunc(value)).toString();
  if (whole.length <= 3) return whole;

  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  // Walk the remainder right-to-left in pairs.
  const paired = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${paired},${last3}`;
}

export type FormatOptions = {
  /** Include the rupee sign. Off when the sign is rendered separately. */
  symbol?: boolean;
  /** Show paise. Off by default — whole rupees is what people scan. */
  showPaise?: boolean;
  /** Prefix a + or - based on `signOf`. */
  signed?: boolean;
  /** Force the sign direction; otherwise taken from the value. */
  negative?: boolean;
};

/**
 * Format paise as a rupee string.
 *
 *   formatINR(1248000)                  -> "₹12,480"
 *   formatINR(1248050, { showPaise: true }) -> "₹12,480.50"
 *   formatINR(45000, { signed: true, negative: true }) -> "−₹450"
 */
export function formatINR(paise: Paise, options: FormatOptions = {}): string {
  const { symbol = true, showPaise = false, signed = false, negative } = options;

  const isNegative = negative ?? paise < 0;
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const remainder = absolute % 100;

  let body = groupIndian(rupees);
  if (showPaise) {
    body += `.${remainder.toString().padStart(2, '0')}`;
  }

  const prefix = symbol ? RUPEE : '';
  if (!signed) {
    // A bare negative still needs its minus, e.g. a credit-card balance.
    return `${isNegative ? '−' : ''}${prefix}${body}`;
  }
  // U+2212 MINUS SIGN, not a hyphen — it aligns with digits and reads as maths.
  return `${isNegative ? '−' : '+'}${prefix}${body}`;
}

/**
 * Short form for tight spaces: thousands, lakh and crore.
 *
 *   formatCompactINR(125000000) -> "₹12.5L"
 */
export function formatCompactINR(paise: Paise): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? '−' : '';

  if (rupees >= 10000000) return `${sign}${RUPEE}${trim(rupees / 10000000)}Cr`;
  if (rupees >= 100000) return `${sign}${RUPEE}${trim(rupees / 100000)}L`;
  if (rupees >= 1000) return `${sign}${RUPEE}${trim(rupees / 1000)}K`;
  return `${sign}${RUPEE}${groupIndian(rupees)}`;
}

/** One decimal, but never a trailing ".0". */
function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
}

/** Percentage change between two amounts; null when there is no baseline. */
export function percentChange(current: Paise, previous: Paise): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Rupees (as typed by a user) to paise, tolerating blanks and stray separators. */
export function rupeesToPaise(input: string): Paise {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}
