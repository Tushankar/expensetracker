import { DateTime } from 'luxon';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { readableUrl } from '../../lib/cloudinary';
import { AiUnavailableError, complete } from '../ai/groq.client';
import { isPaymentMethod } from '../ai/quickEntry';
import type { PaymentMethod } from '../transactions/transaction.model';

/**
 * Reading a receipt.
 *
 * This is the one place in the app where a model produces a number that nothing
 * else can check. Everywhere else — the assistant, the analytics, the quick-text
 * parser — a figure is computed from the database or matched by rule, and a model
 * that invents one is caught. Here the ground truth is a photograph, and the model
 * is the only thing that can read it.
 *
 * So the safety moves from verification to consent. Three things follow:
 *
 *   1. Nothing extracted is ever written to a transaction automatically. The
 *      endpoint returns a proposal; the user confirms each field.
 *   2. The model is asked to return the *printed line* it took the total from,
 *      which turns "trust me" into something a person can check against the image
 *      in front of them.
 *   3. Anything illegible comes back null rather than guessed, and the prompt says
 *      so three times, because a confident wrong total is far worse here than an
 *      empty field the user fills in themselves.
 */

const INSTRUCTION = `You read a photograph of a receipt or bill and report ONLY what is printed on it. This is for an Indian expense app, so amounts are rupees.

Reply with a JSON object and nothing else:
{"merchant":string|null,"total":string|null,"totalLabel":string|null,"date":"YYYY-MM-DD"|null,"items":[{"name":string,"amount":string|null}],"paymentMethod":"upi"|"cash"|"credit_card"|"debit_card"|"net_banking"|"bank_transfer"|"wallet"|"other"|null,"confidence":"high"|"medium"|"low"}

Rules, in order of importance:
1. NEVER calculate. Copy the grand total exactly as printed. Do not add lines up, do not apply tax, do not convert.
2. If something is not clearly legible, return null for it. Never guess. An empty field is correct; a wrong one is not.
3. "total" is the final amount payable — the largest clearly-labelled total, after tax and discounts. Digits only, e.g. "2380.00".
4. "totalLabel" is the line you read that total from, copied word for word, e.g. "TOTAL Rs 2380.00".
5. "merchant" is the shop or business name, not the address or the GSTIN.
6. "date" is the transaction date printed on the receipt. Indian receipts write DD/MM/YYYY — read 12/09/2026 as 2026-09-12. Copy the year that is printed. Today's date is given below only so you can resolve a two-digit or smudged year; never use it to invent a date.
7. "items" is at most 12 purchased lines. Skip subtotals, taxes and totals.
8. "confidence" is how legible the receipt was: "high" only when the merchant and the total are both unmistakable.
If the image is not a receipt at all, return every field null with confidence "low".`;

export type ExtractedItem = { name: string; amount: number | null };

export type ReceiptExtraction = {
  merchant: string;
  /** Integer paise, or null when nothing legible was found. */
  amount: number | null;
  amountText: string;
  date: Date | null;
  items: ExtractedItem[];
  paymentMethod: PaymentMethod | null;
  confidence: 'high' | 'medium' | 'low';
  model: string;
  extractedAt: Date;
};

/** Rupees as printed, to integer paise. Rejects anything that is not plainly money. */
function toPaise(printed: string | null | undefined): number | null {
  if (typeof printed !== 'string') return null;

  const cleaned = printed.replace(/[₹,\s]|rs\.?|inr/gi, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;

  const paise = Math.round(Number(cleaned) * 100);
  // A receipt for nothing, or for more than a crore, is a misread rather than a
  // purchase. Both come back null so the user types it instead.
  if (!Number.isFinite(paise) || paise <= 0 || paise > 100_00_00_000) return null;

  return paise;
}

/**
 * The printed date, read in the user's zone.
 *
 * A receipt date has no time on it, so it is anchored to midday: midnight would
 * sit at the very edge of the day and land in the neighbouring one for anyone the
 * wrong side of a zone boundary. A future date is refused outright — it is always
 * a misread, and it would file the expense in a month that has not happened.
 */
function toDate(printed: string | null | undefined, zone: string, now: Date): Date | null {
  if (typeof printed !== 'string') return null;

  const parsed = DateTime.fromISO(printed, { zone }).set({ hour: 12, minute: 0, second: 0 });
  if (!parsed.isValid) return null;

  const today = DateTime.fromJSDate(now, { zone }).endOf('day');
  if (parsed > today) return null;
  // Older than a decade is a century misread — "12/09/26" as 1926.
  if (parsed < today.minus({ years: 10 })) return null;

  return parsed.toJSDate();
}

export function isVisionConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY && env.GROQ_VISION_MODEL);
}

/**
 * Extracts what it can from one receipt image.
 *
 * Takes a delivery URL rather than bytes: Cloudinary already has the image, it can
 * resize it on the way out, and sending a 4MB phone photograph through this server
 * and on to Groq would cost the time twice for no benefit.
 */
export async function extractFromImage(
  imageUrl: string,
  zone: string,
  now = new Date(),
): Promise<ReceiptExtraction> {
  if (!isVisionConfigured()) {
    throw new AiUnavailableError('Receipt reading is not configured on this server');
  }

  // Today's date, purely as an anchor for an ambiguous year. Without it a model
  // reading "14/09/26" has no way to tell 2026 from 1926, and one reading a clear
  // 2026 will still occasionally write the year it saw most during training. The
  // prompt is explicit that this is for disambiguation and never for invention.
  const today = DateTime.fromJSDate(now, { zone }).toFormat('yyyy-MM-dd');

  const raw = await complete({
    model: env.GROQ_VISION_MODEL,
    // Downgrading would hand the image to a model that cannot see it, and get
    // back a confident description of nothing.
    allowDowngrade: false,
    temperature: 0,
    maxTokens: 1600,
    timeoutMs: env.GROQ_VISION_TIMEOUT_MS,
    json: true,
    messages: [
      {
        role: 'user',
        content: `${INSTRUCTION}\n\nToday's date, for resolving an ambiguous year only: ${today}`,
        // A bounded rendition: large enough for small print, small enough that the
        // request does not time out on a slow connection.
        imageUrl: readableUrl(imageUrl),
      },
    ],
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.warn({ raw: raw.slice(0, 200) }, 'receipt extraction was not valid JSON');
    throw new AiUnavailableError('Could not read that receipt');
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];

  const confidence =
    parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low';

  const method =
    typeof parsed.paymentMethod === 'string' && isPaymentMethod(parsed.paymentMethod)
      ? parsed.paymentMethod
      : null;

  const amount = toPaise(typeof parsed.total === 'string' ? parsed.total : null);

  return {
    merchant:
      typeof parsed.merchant === 'string' ? parsed.merchant.trim().slice(0, 120) : '',
    amount,
    // Only meaningful alongside an amount. A label with no figure is a scrap of
    // text pretending to be evidence.
    amountText:
      amount !== null && typeof parsed.totalLabel === 'string'
        ? parsed.totalLabel.trim().slice(0, 120)
        : '',
    date: toDate(typeof parsed.date === 'string' ? parsed.date : null, zone, now),
    items: items
      .slice(0, 12)
      .map((entry) => {
        const row = entry as { name?: unknown; amount?: unknown };
        return {
          name: typeof row.name === 'string' ? row.name.trim().slice(0, 120) : '',
          amount: toPaise(typeof row.amount === 'string' ? row.amount : null),
        };
      })
      .filter((entry) => entry.name.length > 0),
    paymentMethod: method,
    confidence,
    model: env.GROQ_VISION_MODEL,
    extractedAt: new Date(),
  };
}
