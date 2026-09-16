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
