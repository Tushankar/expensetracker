import { Types } from 'mongoose';

import { zoneOrDefault } from '../../lib/time';
import { AccountModel } from '../accounts/account.model';
import { CategoryModel } from '../categories/category.model';
import { UserModel } from '../users/user.model';

import { TransactionModel } from './transaction.model';

/**
 * Exporting a ledger, as a file someone can actually open.
 *
 * This is the backup story. A finance app that holds a year of someone's spending
 * and offers no way to get it out is asking for trust it has not earned — and the
 * honest form of "your data is yours" is a CSV that opens in Excel, not an API
 * they would have to write a script against.
 */

export type ExportResult = {
  filename: string;
  mimeType: string;
  rowCount: number;
  content: string;
};

/**
 * CSV escaping, done properly.
 *
 * Indian merchant names contain commas ("Sri Krishna Sweets, Jayanagar") and the
 * occasional quote, and a note can contain a newline. Any of those unescaped
 * silently shifts every column after it, which is the kind of corruption nobody
 * notices until they are reconciling a year later.
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';

  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Formats paise as a plain decimal.
 *
 * No grouping and no rupee sign: this column is for a spreadsheet to sum, and
 * "₹1,20,000" is text to every spreadsheet ever written. The human-readable form
 * belongs on screen, not in an export.
 */
function rupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** The local day and time, in the account holder's own zone. */
function localStamp(date: Date, zone: string): { day: string; time: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return { day: formatter.format(date), time: time.format(date) };
}

const HEADERS = [
  'Date',
  'Time',
  'Type',
  'Amount (INR)',
  'Category',
  'Account',
  'To Account',
  'Merchant',
  'Note',
  'Payment Method',
] as const;

const METHOD_LABEL: Record<string, string> = {
  upi: 'UPI',
  cash: 'Cash',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  net_banking: 'Net Banking',
  bank_transfer: 'Bank Transfer',
  wallet: 'Wallet',
  other: 'Other',
};

/**
 * Every transaction in a window, as CSV.
 *
 * Transfers keep their own row and their own type, with both accounts named. They
 * are not expenses and not income — the same rule the rest of the app runs on —
 * and anyone summing the Amount column by Type gets the same three totals the
 * dashboard shows. Flattening a transfer into a negative expense here would make
 * the export disagree with the app that produced it.
 */
export async function exportTransactions(
  userId: string,
  range: { from: Date; to: Date },
): Promise<ExportResult> {
  const owner = new Types.ObjectId(userId);

  const user = await UserModel.findById(userId).select('timezone name').lean();
  const zone = zoneOrDefault(user?.timezone);

  const [rows, accounts, categories] = await Promise.all([
    TransactionModel.find({ userId: owner, date: { $gte: range.from, $lte: range.to } })
      .sort({ date: 1, _id: 1 })
      .lean(),
    AccountModel.find({ userId: owner }).select('name').lean(),
    CategoryModel.find({ $or: [{ userId: null }, { userId: owner }] })
      .select('name')
      .lean(),
  ]);

  const accountName = new Map(accounts.map((entry) => [String(entry._id), entry.name]));
  const categoryName = new Map(categories.map((entry) => [String(entry._id), entry.name]));

  const lines = [HEADERS.map(csvCell).join(',')];

  for (const row of rows) {
    const { day, time } = localStamp(row.date, zone);

    lines.push(
      [
        day,
        time,
        row.type,
        rupees(row.amount),
        row.categoryId ? (categoryName.get(String(row.categoryId)) ?? '') : '',
        accountName.get(String(row.accountId)) ?? '',
        row.destinationAccountId ? (accountName.get(String(row.destinationAccountId)) ?? '') : '',
        row.merchant ?? '',
        row.description ?? '',
        METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  const first = localStamp(range.from, zone).day;
  const last = localStamp(range.to, zone).day;

  return {
    filename: `paisa-${first}-to-${last}.csv`,
    mimeType: 'text/csv',
    rowCount: rows.length,
    // A BOM, so Excel on Windows reads the rupee-adjacent text and Indian names as
    // UTF-8 rather than as the system codepage. Without it "Jayanagar" survives but
    // anything in Devanagari does not.
    content: `﻿${lines.join('\r\n')}\r\n`,
  };
}
