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
  search?: string;
  merchant?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  sort?: '-date' | 'date' | '-amount' | 'amount';
};

export type SearchConfidence = 'high' | 'medium' | 'low';

export type UnderstoodSearch = {
  merchant?: string;
  type?: TransactionType;
  minAmount?: number; // paise
  maxAmount?: number; // paise
  from?: string; // ISO
  to?: string; // ISO
  periodLabel?: string;
  accountName?: string;
  categoryName?: string;
  paymentMethod?: PaymentMethod;
  description?: string;
  obligationIntent?: {
    personName?: string;
    type: 'loan' | 'paid_for' | 'borrowed' | 'split';
    direction: 'owed_to_me' | 'i_owe';
  };
};

export type SearchProposalResult = {
  confidence: SearchConfidence;
  understood: UnderstoodSearch;
  filters: TransactionFilters;
  displaySummary: string;
  requiresConfirmation: boolean;
};

export type FilteredSummary = {
  count: number;
  totalExpense: number;
  totalIncome: number;
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

/**
 * Narrows a string off the wire to a payment method.
 *
 * Needed wherever a value arrives that the type system cannot vouch for — a
 * receipt extraction, for instance, where the method was read off a photograph.
 */
export function isPaymentMethod(value: string | null | undefined): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

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


// ------------------------------------------------------------------- step 4

export type CategoryTotal = {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  amount: number;
  count: number;
  /** 0–100 share of the period's spending. */
  share: number;
};

export type LargeTransaction = {
  id: string;
  amount: number;
  merchant: string;
  categoryName: string | null;
  date: string;
};

export type PeriodComparison = {
  previousFrom: string;
  previousTo: string;
  previousIncome: number;
  previousExpenses: number;
  expenseChange: number;
  incomeChange: number;
  expenseChangePercent: number | null;
  incomeChangePercent: number | null;
  direction: 'up' | 'down' | 'flat';
};

export type CategoryChange = {
  categoryId: string | null;
  name: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number | null;
};

export type AnalyticsBucket = {
  key: string;
  label: string;
  expense: number;
  income: number;
  count: number;
};

export type MetricChange = {
  amount: number;
  percent: number | null;
  direction: 'up' | 'down' | 'flat';
  text: string;
};

export type TopMerchant = {
  merchant: string;
  totalSpent: number;
  count: number;
};

export type AccountAnalytics = {
  accountId: string;
  accountName: string;
  type: string;
  icon: string;
  color: string;
  spending: number;
  incoming: number;
  transfers: number;
};

export type PeopleAnalytics = {
  totalOwedToMe: number;
  totalIOwe: number;
  netBalance: number;
  activePeopleCount: number;
  people: {
    id: string;
    name: string;
    balance: number;
    direction: 'they_owe' | 'i_owe' | 'settled';
  }[];
};

export type RecurringUpcomingItem = {
  id: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  merchant: string;
  categoryName: string | null;
  dueDate: string;
  isOverdue: boolean;
};

export type RecurringAnalytics = {
  estimatedMonthlyCost: number;
  upcomingCount: number;
  upcoming: RecurringUpcomingItem[];
};

export type BudgetItem = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  budgeted: number;
  spent: number;
  remaining: number;
  percent: number;
  state: 'on_track' | 'warning' | 'exceeded';
};

export type AnalyticsBudgetStatus = {
  month: string;
  hasBudgets: boolean;
  totalBudgeted: number;
  totalSpent: number;
  overallPercent: number | null;
  onTrack: number;
  warning: number;
  exceeded: number;
  exceededNames: string[];
  warningNames: string[];
  items?: BudgetItem[];
};

/**
 * Every figure the Insights screen shows, and the only figures the assistant is
 * allowed to state. Computed by MongoDB aggregation on the server — the AI layer
 * receives this already worked out and may only narrate it.
 */
export type AnalyticsOverview = {
  period: { from: string; to: string; label: string; days: number; elapsedDays: number };
  totalIncome: number;
  totalExpenses: number;
  savings: number;
  savingsRate: number | null;
  transferred: number;
  transactionCount: number;
  expenseCount: number;
  /** Divided by days elapsed, not days in the period. */
  averageDailySpend: number;
  /** Today's rate carried to the end of the period. Null once it is over. */
  projectedTotal: number | null;
  topCategories: CategoryTotal[];
  highestCategory: CategoryTotal | null;
  largestExpenses: LargeTransaction[];
  monthlyComparison: PeriodComparison;
  categoryChanges: CategoryChange[];
  weekly: AnalyticsBucket[];
  daily: AnalyticsBucket[];
  budgetStatus: AnalyticsBudgetStatus;

  // Phase C: Core Accounting & Analytics Invariants
  personalExpense: number;
  income: number;
  transfers: number;
  moneyLent: number;
  repaymentsReceived: number;
  moneyBorrowed: number;
  repaymentsMade: number;
  netCashFlow: number;

  spendingChange: MetricChange;
  incomeChange: MetricChange;
  transactionCountChange: MetricChange;

  categoryBreakdown: CategoryTotal[];
  dailySpending: AnalyticsBucket[];
  topMerchants: TopMerchant[];
  accountBreakdown: AccountAnalytics[];
  peopleSummary: PeopleAnalytics;
  recurringSummary: RecurringAnalytics;
};

export type AiSummary = {
  text: string;
  /** False when the server's own computed wording was used instead of the model's. */
  fromModel: boolean;
  /** True when there is too little data to call anything a pattern. */
  limitedData: boolean;
  facts: {
    totalExpenses: number;
    totalIncome: number;
    savings: number;
    savingsRate: number | null;
    topCategory: string | null;
    expenseChange: number;
    direction: 'up' | 'down' | 'flat';
  };
};

export type AiInsight = {
  title: string;
  body: string;
  tone: 'neutral' | 'positive' | 'warning';
  category: string | null;
};

export type AiAnswerContext = {
  intent: string;
  periodLabel: string;
  categoryName?: string;
  amount?: number;
  count?: number;
  transactions?: { id: string; merchant: string; amount: number; date: string }[];
};

export type AiAnswer = {
  text: string;
  fromModel: boolean;
  limitedData: boolean;
  /** What the server looked up to answer, so the UI can show its working. */
  context: AiAnswerContext;
};

export type AiChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  context: AiAnswerContext;
  fromModel: boolean;
  limitedData: boolean;
  createdAt: string;
};

/**
 * Where a category suggestion came from, in descending order of evidence.
 *
 * `memory` is this user's own filing history — the strongest signal there is, and
 * the one that improves when they correct it. `merchant` is the built-in brand
 * table. `model` is inference. The app says which, because they do not deserve
 * equal trust.
 */
export type SuggestionSource = 'memory' | 'merchant' | 'model' | 'none';

export type CategorySuggestion = {
  categoryId: string | null;
  categoryName: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  fromModel: boolean;
  source: SuggestionSource;
  alternatives: { categoryId: string; categoryName: string }[];
};

/**
 * The questions the chat offers before anyone types.
 *
 * A blank assistant is an assistant nobody uses: the first problem is not
 * understanding the answer, it is not knowing what it can be asked. These are
 * also the phrasings the server's intent resolution handles best.
 */
export const SUGGESTED_QUESTIONS: readonly string[] = [
  'Where am I spending the most?',
  'How much did I spend on food?',
  'How much did I save this month?',
  'Show my biggest expenses.',
  'Why did I spend more this month?',
  'How am I doing against my budgets?',
];


// ------------------------------------------------------------------- step 5

/**
 * What the quick-entry line was read as.
 *
 * Every field is a proposal. The amount, date and payment method were found by
 * rule on the server; only the category was inferred, and `categorySource` says
 * by what. Nothing is written until the preview is confirmed.
 */
export type QuickEntryProposal = {
  /** The detected transaction type — 'income' when salary/earned phrasing is found. */
  type: 'expense' | 'income';
  /** Null when no amount could be read. Save must stay disabled. */
  amount: number | null;
  merchant: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySource: 'memory' | 'merchant' | 'model' | 'none';
  categoryReason: string;
  accountId: string | null;
  accountName: string | null;
  paymentMethod: PaymentMethod;
  date: string;
  confidence: 'high' | 'medium' | 'low';
  /** What it was unsure about, in words the preview can show. */
  warnings: string[];
  matched: { amount: string | null; date: string | null; method: string | null };
  /** Person obligation details if detected deterministically */
  obligation?: {
    personName: string;
    direction: 'owed_to_me' | 'i_owe';
    type: 'loan' | 'paid_for' | 'borrowed';
  } | null;
  /** A recent transaction that looks like a duplicate of this one. */
  possibleDuplicate?: {
    id: string;
    amount: number;
    merchant: string;
    date: string;
    minutesAgo: number;
  } | null;
};

export type MerchantMemory = {
  categoryId: string;
  categoryName: string;
  count: number;
  merchantLabel: string;
};

export type MerchantSuggestion = {
  merchant: string;
  categoryId: string;
  categoryName: string;
};

export type ReceiptStatus = {
  /** False when Cloudinary is not configured — the camera button stays hidden. */
  storage: boolean;
  /** False when no vision model is available — upload still works, reading does not. */
  reading: boolean;
  maxBytes: number;
};

/** A signed permission to upload one image, straight from the phone. */
export type UploadTicket = {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  params: Record<string, string>;
  signature: string;
  maxBytes: number;
};

/** Cloudinary's reply, passed to our API which verifies it before storing. */
export type UploadedImage = {
  publicId: string;
  version: number;
  signature: string;
  secureUrl: string;
  bytes: number;
  format: string;
  width: number;
  height: number;
};

export type ReceiptConfidenceLevel = 'high' | 'needs_review' | 'unresolved';

export type ReceiptExtraction = {
  merchant: string;
  amount: number | null;
  /** The printed line the total was read from, so a person can check it. */
  amountText: string;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  date: string | null;
  isDateDefault?: boolean;
  items: { name: string; amount: number | null }[];
  categoryHint?: string | null;
  accountHint?: string | null;
  paymentMethod: string | null;
  suggestedCategoryId?: string | null;
  suggestedAccountId?: string | null;
  accountStatus?: 'resolved' | 'suggested' | 'unresolved';
  warnings?: string[];
  confidenceDetails?: {
    merchant: ReceiptConfidenceLevel;
    amount: ReceiptConfidenceLevel;
    date: ReceiptConfidenceLevel;
    account: ReceiptConfidenceLevel;
    paymentMethod: ReceiptConfidenceLevel;
  };
  possibleDuplicate?: {
    id: string;
    amount: number;
    merchant: string;
    date: string;
    minutesAgo: number;
  } | null;
  confidence: 'high' | 'medium' | 'low';
  extractedAt: string | null;
};

export type Receipt = {
  id: string;
  transactionId: string | null;
  url: string;
  thumbnailUrl: string;
  bytes: number;
  format: string;
  width: number;
  height: number;
  uploadedAt: string;
  /** Null until the image has been read. Never applied without confirmation. */
  extraction: ReceiptExtraction | null;
};

/**
 * The examples under the quick-entry field.
 *
 * Deliberately the shapes the parser is best at, and deliberately Indian: the
 * point of an example is to teach the grammar in one glance, and "Petrol 1200"
 * teaches it faster than any help text.
 */
export const QUICK_ENTRY_EXAMPLES: readonly string[] = [
  'Petrol 1200',
  'Chai 20',
  'Zomato 450',
  'Lunch 150',
  'DMart 2380',
  'Vegetables 180',
  'Netflix 649',
  'Dinner 350',
  'Snacks 80',
  'Uber 320',
  'IndianOil 1500',
  'Coffee 180',
  'Cigarettes 220',
  'Alcohol 1200',
  'Uber 320 yesterday',
];


// ------------------------------------------------------------------- step 6

/** A CSV of the ledger, ready to write to a file and share. */
export type TransactionExport = {
  filename: string;
  mimeType: string;
  rowCount: number;
  content: string;
};

/** What was removed when an account was closed. Shown once, then forgotten. */
export type DeletionSummary = {
  transactions: number;
  accounts: number;
  categories: number;
  budgets: number;
  recurring: number;
  notifications: number;
  receipts: number;
  merchantMemories: number;
  aiMessages: number;
  sessions: number;
};

// ------------------------------------------------------------------- Phase B.5

export type ObligationDirection = 'owed_to_me' | 'i_owe';
export type ObligationType = 'loan' | 'paid_for' | 'borrowed' | 'split';
export type ObligationStatus = 'active' | 'settled' | 'written_off';

export type Person = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  avatar?: string;
  note?: string;
  totalOwedToMe: number;
  totalIOwe: number;
  activeObligationsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PeopleSummary = {
  totalOwedToMe: number;
  totalIOwe: number;
  netBalance: number;
  peopleCount: number;
};

export type MoneyOwed = {
  id: string;
  personId: string;
  personName: string;
  direction: ObligationDirection;
  type: ObligationType;
  originalAmount: number;
  remainingAmount: number;
  purpose: string;
  categoryId: string | null;
  accountId: string;
  dueDate: string | null;
  status: ObligationStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type Repayment = {
  id: string;
  moneyOwedId: string;
  personId: string;
  amount: number;
  accountId: string;
  date: string;
  note: string;
  createdAt: string;
};

export type CreatePersonInput = {
  name: string;
  phone?: string;
  email?: string;
  avatar?: string;
  note?: string;
};

export type CreateMoneyOwedInput = {
  personId?: string;
  personName?: string;
  direction: ObligationDirection;
  type?: ObligationType;
  amount: number;
  purpose: string;
  categoryId?: string | null;
  accountId: string;
  dueDate?: string | null;
  note?: string;
};

export type RecordRepaymentInput = {
  amount: number;
  accountId: string;
  date?: string;
  note?: string;
};
