import { logger } from '../../config/logger';

/**
 * The line between "an assistant that reads your data" and "an assistant that
 * makes things up".
 *
 * A language model asked to summarise `₹28,450 this month, ₹24,100 last month`
 * will very often reply "…an increase of ₹4,350". The arithmetic happens to be
 * right, and that is exactly the problem: nothing checked it, nothing will, and
 * the next one will be wrong in a way nobody notices. So every figure the model
 * is allowed to state has to have been computed by the analytics service first,
 * and this is what enforces it.
 *
 * The fact sheet therefore carries every derived number too — deltas, shares,
 * averages — so the model never has a reason to reach for a calculator.
 */

/** Rupee amounts, percentages and bare numbers, as the model would write them. */
const FIGURE_PATTERN = /₹\s?[\d,]+(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?%|\b\d[\d,]*(?:\.\d+)?\b/g;

/**
 * Numbers that are never financial claims: small counts and ordinals ("your top
 * 3 categories", "over the last 6 months"), and the days of a month.
 */
const HARMLESS_MAX = 31;

function normalise(value: string): string {
  return value.replace(/[₹\s,]/g, '').replace(/%$/, '');
}

export type GroundingResult = {
  grounded: boolean;
  /** Figures the model stated that the data does not contain. */
  ungrounded: string[];
};

/**
 * Checks that every figure in `reply` appears in `facts`.
 *
 * Comparison is on the digits alone, so "₹28,450" in the reply matches
 * "₹28,450" in the facts regardless of spacing, and "71%" matches "71". A number
 * at or below 31 with no currency or percent marker is treated as a count rather
 * than a claim — refusing "your top 5 categories" would make the assistant
 * unusable without making it safer.
 */
export function checkGrounding(reply: string, facts: string): GroundingResult {
  const allowed = new Set((facts.match(FIGURE_PATTERN) ?? []).map(normalise));

  const ungrounded: string[] = [];

  for (const match of reply.match(FIGURE_PATTERN) ?? []) {
    const value = normalise(match);
    if (allowed.has(value)) continue;

    const asNumber = Number(value);
    const isBareCount = !match.includes('₹') && !match.includes('%');
    if (isBareCount && Number.isFinite(asNumber) && asNumber <= HARMLESS_MAX) continue;

    ungrounded.push(match.trim());
  }

  return { grounded: ungrounded.length === 0, ungrounded };
}

/**
 * Phrasings that turn a summary into advice.
 *
 * The app describes what happened; it does not tell anyone what to do with their
 * money. Recommending an investment is regulated advice in most places and is
 * wrong here regardless — the assistant has a spending history, not a risk
 * profile, a time horizon or a tax situation.
 */
const ADVICE_PATTERNS: readonly RegExp[] = [
  /\b(you|i'?d)\s+(should|ought to|must)\s+(invest|buy|sell|trade|put)\b/i,
  /\b(recommend|suggest|advise)\s+(investing|buying|selling|a\s+(mutual fund|stock|sip))/i,
  /\b(invest|park|put)\s+(this|that|it|your money|the surplus)\s+in\b/i,
  /\bguaranteed\s+(returns?|profit)/i,
];

export function containsInvestmentAdvice(reply: string): boolean {
  return ADVICE_PATTERNS.some((pattern) => pattern.test(reply));
}

export type VerifiedReply = {
  text: string;
  /** False when the reply was rejected and the deterministic fallback was used. */
  fromModel: boolean;
  /** Set when the app is working from very little data and says so. */
  limitedData: boolean;
};

/**
 * Accepts a generated reply, or falls back to text the server wrote itself.
 *
 * Never returns an unverified figure to a user. A model that invents one gets a
 * single retry with the offending numbers named; if it does it again, the reply
 * is discarded and the caller's deterministic summary is sent instead. Slightly
 * duller, always true.
 */
export async function verify(
  generate: (retryNote?: string) => Promise<string>,
  facts: string,
  fallback: string,
  context: Record<string, unknown> = {},
): Promise<VerifiedReply> {
  let reply: string;

  try {
    reply = await generate();
  } catch (error) {
    // Logged rather than swallowed: a silent fall back to the computed wording
    // looks identical to a working assistant from the outside, which makes an
    // outage invisible until someone notices the prose never changes.
    logger.warn({ ...context, err: error }, 'assistant unavailable, using the computed summary');
    return { text: fallback, fromModel: false, limitedData: false };
  }

  let check = checkGrounding(reply, facts);
  let advice = containsInvestmentAdvice(reply);

  if (!check.grounded || advice) {
    logger.warn(
      { ...context, ungrounded: check.ungrounded, advice },
      'assistant reply rejected, retrying',
    );

    const note = advice
      ? 'Your previous reply gave financial advice. Describe what happened; never suggest what to do with money.'
      : `Your previous reply contained figures that are not in the data: ${check.ungrounded.join(
          ', ',
        )}. Use only figures that appear verbatim in the DATA block. Do not calculate anything.`;

    try {
      reply = await generate(note);
      check = checkGrounding(reply, facts);
      advice = containsInvestmentAdvice(reply);
    } catch {
      return { text: fallback, fromModel: false, limitedData: false };
    }
  }

  if (!check.grounded || advice) {
    logger.warn(
      { ...context, ungrounded: check.ungrounded, advice },
      'assistant reply rejected twice, falling back to the computed summary',
    );
    return { text: fallback, fromModel: false, limitedData: false };
  }

  return { text: reply, fromModel: true, limitedData: false };
}
