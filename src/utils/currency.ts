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

/** Paise back to the raw string the amount keypad edits, e.g. 124850 -> "1248.50". */
export function paiseToRupeeInput(paise: Paise): string {
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return remainder === 0 ? String(rupees) : `${rupees}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Applies one keypad press to the raw amount string.
 *
 * The rules exist because a ledger cannot hold what a free-text field allows:
 * paise stop at two decimals, there is only ever one point, and a leading zero
 * never survives the next digit. Enforcing them here means the amount is always
 * valid — there is no "that is not a number" error state to design, because the
 * field cannot reach one.
 */
export function applyAmountKey(current: string, key: string): string {
  if (key === 'back') return current.slice(0, -1);

  if (key === '.') {
    if (current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }

  const [whole = '', fraction] = current.split('.');

  // Two decimal places is the whole of the rupee. A third digit is a typo.
  if (fraction !== undefined && fraction.length >= 2) return current;

  // "0" then "5" means ₹5, not ₹05.
  if (current === '0') return key;

  // Ten crore is past any transaction a personal tracker needs and short of where
  // a double stops holding integers exactly.
  if (fraction === undefined && whole.replace(/\D/g, '').length >= 9) return current;

  return current + key;
}

/**
 * Renders the raw amount string for display, grouped Indian-style, while keeping
 * a trailing "." or a half-typed ".5" visible as the user types it.
 */
export function formatAmountInput(raw: string): string {
  if (raw === '') return '0';

  const [whole = '', fraction] = raw.split('.');
  const grouped = whole === '' ? '0' : groupIndian(Number(whole));

  if (fraction === undefined) return grouped;
  return `${grouped}.${fraction}`;
}
