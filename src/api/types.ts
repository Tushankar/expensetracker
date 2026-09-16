/**
 * The wire shapes, mirroring `server/src/modules/*`.
 *
 * Money is an integer number of paise everywhere, exactly as it is stored, so no
 * conversion happens between the database and a rendered `₹12,480`. A float of
 * rupees on the wire would reintroduce the rounding the server went to some
 * trouble to avoid.
 */

export type TransactionType = 'expense' | 'income' | 'transfer';

export type PaymentMethod =
  | 'upi'
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'net_banking'
  | 'bank_transfer'
  | 'wallet'
  | 'other';

export type AccountType = 'bank' | 'cash' | 'credit_card' | 'wallet' | 'savings' | 'other';

export type User = {
  id: string;
  name: string;
  email: string;
  currency: string;
  /**
   * IANA zone. The server computes budget months and recurring dates in it, so
   * the app keeps it in step with the device to stop the two disagreeing about
   * which month a late-night expense belongs to.
   */
  timezone: string;
  notificationPrefs: { budgetAlerts: boolean; recurringAlerts: boolean };
  createdAt: string;
  updatedAt: string;
};

export type AuthSession = {
  user: User;
  accessToken: string;
  refreshToken: string;
  /** Seconds the access token is good for. */
  expiresIn: number;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  /** Integer paise. Negative on a credit card means money owed. */
  balance: number;
  currency: string;
  /** Name from the local icon registry. Resolve with `toIconName`. */
  icon: string;
  /** Hex. */
  color: string;
  institution?: string;
  last4?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  name: string;
  /** The heading this sits under: Food, Transport, Home. */
  group: string;
  type: TransactionType;
  icon: string;
  /** Hue key from the palette. Resolve with `categoryColor`. */
  color: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  /** Integer paise, always positive. `type` carries the direction. */
  amount: number;
  /** Null on a transfer: moving your own money is neither spending nor earning. */
  categoryId: string | null;
  accountId: string;
  destinationAccountId: string | null;
  merchant: string;
  description: string;
  paymentMethod: PaymentMethod;
  date: string;
  createdAt: string;
  updatedAt: string;
};

export type Summary = {
  from: string | null;
  to: string | null;
  income: number;
  expense: number;
  /** income − expense. Transfers are in neither, so they cannot move it. */
  net: number;
  /** Reported on its own so the number is visible rather than merely missing. */
  transferred: number;
  count: number;
  byCategory: { categoryId: string; amount: number; count: number }[];
};

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type TransactionFilters = {
  page?: number;
  limit?: number;
  type?: TransactionType;
  accountId?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
  q?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  sort?: '-date' | 'date' | '-amount' | 'amount';
};

export type CreateTransactionInput =
  | {
      type: 'expense' | 'income';
      amount: number;
      categoryId: string;
      accountId: string;
      merchant?: string;
      description?: string;
      paymentMethod?: PaymentMethod;
      date?: string;
    }
  | {
      type: 'transfer';
      amount: number;
      accountId: string;
      destinationAccountId: string;
      merchant?: string;
      description?: string;
      paymentMethod?: PaymentMethod;
      date?: string;
    };

export type UpdateTransactionInput = {
  amount?: number;
  categoryId?: string;
  accountId?: string;
  destinationAccountId?: string;
  merchant?: string;
  description?: string;
  paymentMethod?: PaymentMethod;
  date?: string;
};

export type CreateAccountInput = {
  name: string;
  type: AccountType;
  balance?: number;
  currency?: string;
  icon?: string;
  color?: string;
  institution?: string;
  last4?: string;
};

export type UpdateAccountInput = Partial<Omit<CreateAccountInput, 'balance' | 'currency'>> & {
  isActive?: boolean;
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  upi: 'UPI',
  cash: 'Cash',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  net_banking: 'Net Banking',
  bank_transfer: 'Bank Transfer',
  wallet: 'Wallet',
  other: 'Other',
};

/** UPI first, then cash: between them they are most of what an Indian wallet does. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'upi',
  'cash',
  'credit_card',
  'debit_card',
  'net_banking',
  'bank_transfer',
  'wallet',
  'other',
];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Bank account',
  savings: 'Savings',
  cash: 'Cash',
  credit_card: 'Credit card',
  wallet: 'Wallet',
  other: 'Other',
};

export const ACCOUNT_TYPES: readonly AccountType[] = [
  'bank',
  'savings',
  'cash',
  'credit_card',
  'wallet',
  'other',
];

/** Default glyph per account type, used when creating one from the app. */
export const ACCOUNT_TYPE_ICON: Record<AccountType, string> = {
  bank: 'bank',
  savings: 'piggyBank',
  cash: 'cash',
  credit_card: 'card',
  wallet: 'wallet',
  other: 'circle',
};

// ------------------------------------------------------------------- step 3

export type BudgetScope = 'overall' | 'category';
export type BudgetState = 'on_track' | 'warning' | 'exceeded';

export type BudgetProgress = {
  id: string;
  scope: BudgetScope;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  /** Hue key from the palette. Resolve with `categoryColor`. */
  categoryColor: string | null;
  /** Integer paise. */
  amount: number;
  spent: number;
  /** `amount − spent`, floored at zero. Never negative — that is what `overBy` is for. */
  remaining: number;
  overBy: number;
  /** 0–100+. Over 100 on purpose when a budget is blown. */
  percent: number;
  warnAtPercent: number;
  state: BudgetState;
  isActive: boolean;
};

export type BudgetSummary = {
  /** `YYYY-MM`. */
  month: string;
  from: string;
  to: string;
  overall: BudgetProgress | null;
  categories: BudgetProgress[];
  totals: {
    budgeted: number;
    spent: number;
    remaining: number;
    /** Spending in categories with no cap — what the budgets do not cover. */
    unbudgetedSpend: number;
  };
};

export type CreateBudgetInput =
  | { scope: 'overall'; amount: number; warnAtPercent?: number }
  | { scope: 'category'; categoryId: string; amount: number; warnAtPercent?: number };

export type UpdateBudgetInput = { amount?: number; warnAtPercent?: number; isActive?: boolean };

/**
 * A recurrence is a unit plus an interval, not a named frequency: "monthly" is
 * `{month, 1}` and "every 2 weeks" is `{week, 2}`. One representation means the
 * presets and a custom schedule share every code path.
 */
export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

export type RecurringRule = {
  id: string;
  name: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  accountId: string;
  destinationAccountId: string | null;
  description: string;
  paymentMethod: PaymentMethod;
  unit: RecurrenceUnit;
  interval: number;
  /** "Every month", "Every 2 weeks" — worded by the server so both clients agree. */
  scheduleLabel: string;
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  occurrencesCreated: number;
  /** Null once the rule has finished. */
  nextRunAt: string | null;
  lastRunAt: string | null;
  isPaused: boolean;
  isActive: boolean;
  /** False means "remind me" rather than "record it for me". */
  autoCreate: boolean;
};

type RecurringBase = {
  name: string;
  amount: number;
  accountId: string;
  description?: string;
  paymentMethod?: PaymentMethod;
  unit: RecurrenceUnit;
  interval?: number;
  startDate: string;
  endDate?: string | null;
  maxOccurrences?: number | null;
  autoCreate?: boolean;
};

export type CreateRecurringInput =
  | ({ type: 'expense' | 'income'; categoryId: string } & RecurringBase)
  | ({ type: 'transfer'; destinationAccountId: string } & RecurringBase);

export type UpdateRecurringInput = Partial<Omit<RecurringBase, 'startDate'>> & {
  startDate?: string;
  categoryId?: string;
  destinationAccountId?: string;
};

export type NotificationType =
  | 'budget_warning'
  | 'budget_exceeded'
  | 'recurring_upcoming'
  | 'recurring_created';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** `{ budgetId?, categoryId?, recurringId?, transactionId?, month? }` */
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
};

export type DailySpend = {
  /** `YYYY-MM-DD` in the account's zone. Days with no activity are absent. */
  date: string;
  expense: number;
  income: number;
  count: number;
};

/** Presets the recurring form offers, over the unit/interval representation. */
export const RECURRENCE_PRESETS: readonly {
  label: string;
  unit: RecurrenceUnit;
  interval: number;
}[] = [
  { label: 'Weekly', unit: 'week', interval: 1 },
  { label: 'Monthly', unit: 'month', interval: 1 },
  { label: 'Yearly', unit: 'year', interval: 1 },
];

export const RECURRENCE_UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: 'days',
  week: 'weeks',
  month: 'months',
  year: 'years',
};
