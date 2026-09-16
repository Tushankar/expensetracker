import type { IconName } from '@/components/icons/registry';
import type { CategoryHue } from '@/theme';

/**
 * Money is stored as an integer number of paise, never as a float of rupees.
 * 0.1 + 0.2 !== 0.3 in IEEE-754, and a ledger that drifts by a paisa is a ledger
 * nobody trusts. Format at the edge with `formatINR`.
 */
export type Paise = number;

export type TransactionKind = 'expense' | 'income' | 'transfer';

/** How the money actually moved. UPI is first-class here, not a card sub-type. */
export type PaymentMethod = 'upi' | 'card' | 'cash' | 'netbanking' | 'autopay';

export type AccountKind = 'bank' | 'cash' | 'creditCard' | 'wallet';

export type Category = {
  id: string;
  label: string;
  icon: IconName;
  hue: CategoryHue;
};

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  /** Bank or issuer, e.g. "HDFC Bank". */
  institution?: string;
  /** Last four digits, for cards and accounts. */
  last4?: string;
  /** Negative for a credit card means money owed. */
  balance: Paise;
  icon: IconName;
};

export type Transaction = {
  id: string;
  kind: TransactionKind;
  /** Always positive. `kind` carries the direction. */
  amount: Paise;
  merchant: string;
  categoryId: string;
  accountId: string;
  method: PaymentMethod;
  /** ISO 8601. */
  occurredAt: string;
  note?: string;
  /** Part of a recurring series, e.g. rent or a subscription. */
  recurring?: boolean;
};

export type MonthSummary = {
  /** First day of the month the summary covers, ISO. */
  month: string;
  openingBalance: Paise;
  currentBalance: Paise;
  income: Paise;
  spent: Paise;
  /** income - spent. Can be negative. */
  saved: Paise;
  /** Last month, for the delta chips. */
  previousIncome: Paise;
  previousSpent: Paise;
};

/** One bar in the weekly spending chart. */
export type WeeklySpend = {
  /** Short axis label, e.g. "W1". */
  label: string;
  amount: Paise;
};

export type CategorySpend = {
  categoryId: string;
  amount: Paise;
  /** 0-1 share of the month's total spend. */
  share: number;
};

export type Budget = {
  id: string;
  categoryId: string;
  limit: Paise;
  spent: Paise;
};
