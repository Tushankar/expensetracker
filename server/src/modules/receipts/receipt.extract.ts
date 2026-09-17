import { DateTime } from 'luxon';
import { z } from 'zod';

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
 * Safety architecture:
 *   1. Nothing extracted is ever written to a transaction automatically.
 *   2. The model reports the final payable total ("total") prioritizing Grand Total,
 *      Total Payable, Net Amount, or Amount Paid over any subtotal or tax figure.
 *   3. Subtotal, taxes (GST/CGST/SGST/IGST), discount, category hint, account hint,
 *      and payment method are extracted as distinct breakdown items.
 *   4. Field-specific confidence ratings ("high", "needs_review", "unresolved")
 *      are computed for clear UX indication.
 *   5. Anything illegible comes back null rather than guessed.
 */

const INSTRUCTION = `You read a photograph of an Indian bill or receipt and extract transaction details.
Amounts are Indian Rupees.

Reply ONLY with a valid JSON object matching this schema and nothing else:
{
  "merchant": string | null,
  "total": string | null,
  "totalLabel": string | null,
  "subtotal": string | null,
  "tax": string | null,
  "discount": string | null,
  "date": "YYYY-MM-DD" | null,
  "items": [{"name": string, "amount": string | null}],
  "categoryHint": string | null,
  "accountHint": string | null,
  "paymentMethod": "upi" | "cash" | "credit_card" | "debit_card" | "net_banking" | "bank_transfer" | "wallet" | "other" | null,
  "confidence": "high" | "medium" | "low"
}

Rules in order of strict priority:
1. "total" MUST BE THE FINAL PAYABLE TOTAL after all taxes and discounts.
   - Look specifically for "Grand Total", "Total Payable", "Net Payable", "Net Amount", "Amount Paid", "Total Paid", "Invoice Total".
   - If a receipt has:
       Subtotal: 2100.00
       GST: 280.00
       Discount: 50.00
       Grand Total: 2330.00
     Then "total" MUST be "2330.00" (NOT "2100.00", NOT "280.00", NOT "2380.00").
   - Digits only, e.g. "2330.00" or "450".
2. "totalLabel": the exact line copied from the receipt where you found the final total, e.g. "GRAND TOTAL ₹2,330.00".
3. "subtotal": the printed subtotal before taxes/discounts, e.g. "2100.00", or null if not itemized.
4. "tax": total tax/GST amount (sum of CGST, SGST, IGST or VAT), e.g. "280.00", or null.
5. "discount": total discount amount, e.g. "50.00", or null.
6. "merchant": the shop, restaurant, brand or business name (e.g. "DMart", "Zomato", "Swiggy", "Blinkit", "Apollo Pharmacy", "IndianOil"). Do not use the address or GSTIN number as the merchant name.
7. "date": the transaction date printed on the receipt. Indian receipts write DD/MM/YYYY — read 12/09/2026 as 2026-09-12. Copy the year printed. Today's date is provided below only for resolving an ambiguous 2-digit year (e.g. '26); never invent a date.
8. "categoryHint": suggested category name based on merchant and items (e.g. "Groceries", "Food & Dining", "Fuel", "Shopping", "Transport", "Healthcare").
9. "accountHint": explicit bank or card issuer name if printed on the receipt or card slip (e.g. "HDFC", "ICICI", "SBI", "Axis", "Kotak"). Null if not printed.
10. "paymentMethod": "upi" (for GPay, PhonePe, Paytm, BHIM, UPI QR, VPA), "cash", "credit_card", "debit_card", "net_banking", "wallet", or null.
11. "items": at most 12 purchased item lines. Skip taxes, subtotals, and discounts.
12. "confidence": "high" only when both merchant and total are unmistakable. If the image is illegible or not a receipt, return all null with confidence "low".`;

export type ExtractedItem = { name: string; amount: number | null };

export type ConfidenceLevel = 'high' | 'needs_review' | 'unresolved';

export type FieldConfidenceDetails = {
  merchant: ConfidenceLevel;
  amount: ConfidenceLevel;
  date: ConfidenceLevel;
  account: ConfidenceLevel;
  paymentMethod: ConfidenceLevel;
};

export type ReceiptExtraction = {
  merchant: string;
  /** Integer paise, or null when nothing legible was found. */
  amount: number | null;
  amountText: string;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  date: Date | null;
  isDateDefault: boolean;
  items: ExtractedItem[];
  categoryHint: string | null;
  accountHint: string | null;
  paymentMethod: PaymentMethod | null;
  confidenceDetails: FieldConfidenceDetails;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  model: string;
  extractedAt: Date;
};

const groqReceiptResponseSchema = z.object({
  merchant: z.string().nullable().optional(),
  total: z.union([z.string(), z.number()]).nullable().optional(),
  totalLabel: z.string().nullable().optional(),
  subtotal: z.union([z.string(), z.number()]).nullable().optional(),
  tax: z.union([z.string(), z.number()]).nullable().optional(),
  discount: z.union([z.string(), z.number()]).nullable().optional(),
  date: z.string().nullable().optional(),
  categoryHint: z.string().nullable().optional(),
  accountHint: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  confidence: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        name: z.unknown().optional(),
        amount: z.unknown().optional(),
      }),
    )
    .nullable()
    .optional(),
});

/** Rupees as printed, to integer paise. Rejects anything that is not plainly money. */
export function toPaise(printed: unknown): number | null {
  if (typeof printed === 'number') {
    if (!Number.isFinite(printed) || printed <= 0 || printed > 100_00_00_000) return null;
    return Math.round(printed * 100);
  }
  if (typeof printed !== 'string') return null;

  const cleaned = printed.replace(/[₹,\s]|rs\.?|inr/gi, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;

  const paise = Math.round(Number(cleaned) * 100);
  if (!Number.isFinite(paise) || paise <= 0 || paise > 100_00_00_000) return null;

  return paise;
}

/**
 * Contextual total resolution:
 * Ensures the authoritative payable total is selected (Grand Total > Subtotal + Tax - Discount > Subtotal).
 */
export function selectAuthoritativeTotal(
  total: number | null,
  subtotal: number | null,
  tax: number | null,
  discount: number | null,
): number | null {
  if (total !== null) return total;
  if (subtotal !== null && tax !== null && discount !== null) {
    return subtotal + tax - discount;
  }
  if (subtotal !== null && tax !== null) {
    return subtotal + tax;
  }
  return subtotal;
}

/**
 * The printed date, read in the user's zone.
 */
function toDate(printed: string | null | undefined, zone: string, now: Date): Date | null {
  if (typeof printed !== 'string') return null;

  const parsed = DateTime.fromISO(printed, { zone }).set({ hour: 12, minute: 0, second: 0 });
  if (!parsed.isValid) return null;

  const today = DateTime.fromJSDate(now, { zone }).endOf('day');
  if (parsed > today) return null;
  if (parsed < today.minus({ years: 10 })) return null;

  return parsed.toJSDate();
}

export function isVisionConfigured(): boolean {
  return Boolean(env.GROQ_API_KEY && env.GROQ_VISION_MODEL);
}

/**
 * Parses structured raw output into a validated ReceiptExtraction.
 * Separated for testability and deterministic assertions.
 */
export function parseReceiptData(
  rawJson: Record<string, unknown>,
  zone: string,
  now = new Date(),
  modelName = env.GROQ_VISION_MODEL,
): ReceiptExtraction {
  const parsed = groqReceiptResponseSchema.safeParse(rawJson);
  const data = parsed.success ? parsed.data : rawJson;

  const merchant = typeof data.merchant === 'string' ? data.merchant.trim().slice(0, 120) : '';
  const rawTotal = toPaise(data.total);
  const subtotal = toPaise(data.subtotal);
  const tax = toPaise(data.tax);
  const discount = toPaise(data.discount);
  const amount = selectAuthoritativeTotal(rawTotal, subtotal, tax, discount);

  const amountText =
    amount !== null && typeof data.totalLabel === 'string'
      ? data.totalLabel.trim().slice(0, 120)
      : '';

  const parsedDate = toDate(typeof data.date === 'string' ? data.date : null, zone, now);
  const date = parsedDate ?? now;
  const isDateDefault = parsedDate === null;

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: ExtractedItem[] = rawItems
    .slice(0, 12)
    .map((row) => ({
      name: typeof row?.name === 'string' ? row.name.trim().slice(0, 120) : '',
      amount: toPaise(row?.amount),
    }))
    .filter((entry) => entry.name.length > 0);

  const categoryHint =
    typeof data.categoryHint === 'string' ? data.categoryHint.trim().slice(0, 60) : null;
  const accountHint =
    typeof data.accountHint === 'string' ? data.accountHint.trim().slice(0, 60) : null;

  const method =
    typeof data.paymentMethod === 'string' && isPaymentMethod(data.paymentMethod)
      ? data.paymentMethod
      : null;

  const warnings: string[] = [];
  if (amount === null) warnings.push('No total amount could be read from this receipt.');
  if (isDateDefault) warnings.push('Receipt date not found. Defaulting to today.');
  if (accountHint) warnings.push(`Payment account indicated as "${accountHint}".`);

  // Field-specific confidence breakdown
  const confidenceDetails: FieldConfidenceDetails = {
    merchant: merchant.length > 1 ? 'high' : merchant.length === 1 ? 'needs_review' : 'unresolved',
    amount: amount !== null ? 'high' : 'unresolved',
    date: !isDateDefault ? 'high' : 'needs_review',
    account: accountHint ? 'needs_review' : 'unresolved',
    paymentMethod: method ? 'high' : 'unresolved',
  };

  const confidence =
    data.confidence === 'high' || data.confidence === 'medium' ? data.confidence : 'low';

  return {
    merchant,
    amount,
    amountText,
    subtotal,
    tax,
    discount,
    date,
    isDateDefault,
    items,
    categoryHint,
    accountHint,
    paymentMethod: method,
    confidenceDetails,
    confidence,
    warnings,
    model: modelName,
    extractedAt: new Date(),
  };
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

  const today = DateTime.fromJSDate(now, { zone }).toFormat('yyyy-MM-dd');

  let raw: string;
  try {
    raw = await complete({
      model: env.GROQ_VISION_MODEL,
      allowDowngrade: false,
      temperature: 0,
      maxTokens: 1600,
      timeoutMs: env.GROQ_VISION_TIMEOUT_MS,
      json: true,
      messages: [
        {
          role: 'user',
          content: `${INSTRUCTION}\n\nToday's date, for resolving an ambiguous year only: ${today}`,
          imageUrl: readableUrl(imageUrl),
        },
      ],
    });
  } catch (err) {
    logger.warn({ err }, 'Groq vision call failed');
    throw new AiUnavailableError('Could not read that receipt. Please try again or enter manually.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.warn({ raw: raw.slice(0, 200) }, 'receipt extraction was not valid JSON');
    throw new AiUnavailableError('Could not read that receipt. Please try again or enter manually.');
  }

  return parseReceiptData(parsed, zone, now, env.GROQ_VISION_MODEL);
}

