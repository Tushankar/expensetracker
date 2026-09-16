import type {
  Account,
  Category,
  CategorySpend,
  MonthSummary,
  Paise,
  Transaction,
  WeeklySpend,
} from '@/types/models';

/**
 * Static sample data for the UI foundation. Nothing here is persisted and nothing
 * writes back — screens read this module directly until the API layer lands.
 *
 * Dates are generated relative to "now" so Home always shows a plausible current
 * month rather than a frozen one.
 */

/** Rupees to paise, for readable literals below. */
const r = (rupees: number): Paise => Math.round(rupees * 100);

function at(daysAgo: number, hour: number, minute = 0): string {
  const now = new Date();
  // Clamp so a date never slips into the previous month — these all belong to the
  // current month's summary.
  const offset = Math.min(daysAgo, now.getDate() - 1);
  const date = new Date(now);
  date.setDate(now.getDate() - offset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/**
 * Groceries live under Food, and fuel under Transport. Indian household spending
 * splits that way in practice — nobody budgets "groceries" against "dining" — and
 * it keeps the donut down to bands worth naming.
 */
export const categories: readonly Category[] = [
  { id: 'food', label: 'Food', icon: 'food', hue: 'food' },
  { id: 'rent', label: 'Rent', icon: 'rent', hue: 'rent' },
  { id: 'transport', label: 'Transport', icon: 'transport', hue: 'transport' },
  { id: 'shopping', label: 'Shopping', icon: 'shopping', hue: 'shopping' },
  { id: 'bills', label: 'Bills', icon: 'bills', hue: 'bills' },
  { id: 'health', label: 'Health', icon: 'health', hue: 'health' },
  { id: 'entertainment', label: 'Entertainment', icon: 'entertainment', hue: 'entertainment' },
  { id: 'education', label: 'Education', icon: 'education', hue: 'education' },
  { id: 'investment', label: 'Investments', icon: 'investment', hue: 'investment' },
  { id: 'salary', label: 'Salary', icon: 'arrowDownLeft', hue: 'income' },
  { id: 'transfer', label: 'Transfer', icon: 'repeat', hue: 'transfer' },
];

const categoryIndex = new Map(categories.map((category) => [category.id, category]));

export function getCategory(id: string): Category {
  return categoryIndex.get(id) ?? { id: 'other', label: 'Others', icon: 'circle', hue: 'other' };
}

export const accounts: readonly Account[] = [
  {
    id: 'hdfc',
    name: 'HDFC Savings',
    kind: 'bank',
    institution: 'HDFC Bank',
    last4: '4821',
    balance: r(214830),
    icon: 'bank',
  },
  {
    id: 'icici-card',
    name: 'Amazon Pay Card',
    kind: 'creditCard',
    institution: 'ICICI Bank',
    last4: '7749',
    balance: r(-18460),
    icon: 'card',
  },
  { id: 'cash', name: 'Cash', kind: 'cash', balance: r(4200), icon: 'cash' },
];

const accountIndex = new Map(accounts.map((account) => [account.id, account]));

export function getAccount(id: string): Account | undefined {
  return accountIndex.get(id);
}

export const transactions: readonly Transaction[] = [
  // ------------------------------------------------------------------- food
  { id: 't1', kind: 'expense', amount: r(1248), merchant: 'Blinkit', categoryId: 'food', accountId: 'hdfc', method: 'upi', occurredAt: at(0, 19, 42), note: 'Weekly groceries' },
  { id: 't2', kind: 'expense', amount: r(428), merchant: 'Swiggy', categoryId: 'food', accountId: 'hdfc', method: 'upi', occurredAt: at(0, 13, 18) },
  { id: 't3', kind: 'expense', amount: r(1803), merchant: 'Zepto', categoryId: 'food', accountId: 'hdfc', method: 'upi', occurredAt: at(1, 20, 5) },
  { id: 't4', kind: 'expense', amount: r(612), merchant: 'Zomato', categoryId: 'food', accountId: 'hdfc', method: 'upi', occurredAt: at(2, 21, 10) },
  { id: 't5', kind: 'expense', amount: r(3410), merchant: 'BigBasket', categoryId: 'food', accountId: 'hdfc', method: 'upi', occurredAt: at(3, 17, 12) },
  { id: 't6', kind: 'expense', amount: r(320), merchant: 'Third Wave Coffee', categoryId: 'food', accountId: 'cash', method: 'cash', occurredAt: at(4, 9, 25) },
  { id: 't7', kind: 'expense', amount: r(2450), merchant: 'Dinner — Toit', categoryId: 'food', accountId: 'icici-card', method: 'card', occurredAt: at(5, 21, 40) },
  { id: 't8', kind: 'expense', amount: r(890), merchant: 'Swiggy Instamart', categoryId: 'food', accountId: 'hdfc', method: 'upi', occurredAt: at(6, 11, 5) },
  { id: 't9', kind: 'expense', amount: r(649), merchant: "Domino's Pizza", categoryId: 'food', accountId: 'hdfc', method: 'upi', occurredAt: at(8, 21, 5) },
  { id: 't10', kind: 'expense', amount: r(1890), merchant: 'Licious', categoryId: 'food', accountId: 'hdfc', method: 'upi', occurredAt: at(9, 18, 30) },
  { id: 't11', kind: 'expense', amount: r(1200), merchant: 'Milk & vegetables', categoryId: 'food', accountId: 'cash', method: 'cash', occurredAt: at(11, 8, 15) },
  { id: 't12', kind: 'expense', amount: r(2150), merchant: 'DMart', categoryId: 'food', accountId: 'hdfc', method: 'upi', occurredAt: at(13, 18, 35) },

  // ------------------------------------------------------------------- rent
  { id: 't13', kind: 'expense', amount: r(18500), merchant: 'Rent — September', categoryId: 'rent', accountId: 'hdfc', method: 'netbanking', occurredAt: at(14, 9, 15), recurring: true },

  // -------------------------------------------------------------- transport
  { id: 't14', kind: 'expense', amount: r(2000), merchant: 'Indian Oil', categoryId: 'transport', accountId: 'icici-card', method: 'card', occurredAt: at(0, 9, 5) },
  { id: 't15', kind: 'expense', amount: r(120), merchant: 'Auto rickshaw', categoryId: 'transport', accountId: 'cash', method: 'cash', occurredAt: at(1, 7, 40) },
  { id: 't16', kind: 'expense', amount: r(340), merchant: 'Uber', categoryId: 'transport', accountId: 'hdfc', method: 'upi', occurredAt: at(2, 9, 20) },
  { id: 't17', kind: 'expense', amount: r(190), merchant: 'Rapido', categoryId: 'transport', accountId: 'hdfc', method: 'upi', occurredAt: at(4, 18, 50) },
  { id: 't18', kind: 'expense', amount: r(2500), merchant: 'HP Petrol Pump', categoryId: 'transport', accountId: 'icici-card', method: 'card', occurredAt: at(6, 8, 30) },
  { id: 't19', kind: 'expense', amount: r(280), merchant: 'Ola', categoryId: 'transport', accountId: 'hdfc', method: 'upi', occurredAt: at(8, 22, 15) },
  { id: 't20', kind: 'expense', amount: r(1000), merchant: 'Metro card recharge', categoryId: 'transport', accountId: 'hdfc', method: 'upi', occurredAt: at(10, 8, 0) },
  { id: 't21', kind: 'expense', amount: r(1500), merchant: 'Shell Petrol', categoryId: 'transport', accountId: 'icici-card', method: 'card', occurredAt: at(12, 8, 25) },
  { id: 't22', kind: 'expense', amount: r(2300), merchant: 'Car service', categoryId: 'transport', accountId: 'icici-card', method: 'card', occurredAt: at(15, 11, 0) },

  // ---------------------------------------------------------------- shopping
  { id: 't23', kind: 'expense', amount: r(2499), merchant: 'Myntra', categoryId: 'shopping', accountId: 'icici-card', method: 'card', occurredAt: at(1, 21, 30) },
  { id: 't24', kind: 'expense', amount: r(4299), merchant: 'Amazon', categoryId: 'shopping', accountId: 'icici-card', method: 'card', occurredAt: at(5, 22, 10) },
  { id: 't25', kind: 'expense', amount: r(1722), merchant: 'Decathlon', categoryId: 'shopping', accountId: 'icici-card', method: 'card', occurredAt: at(12, 16, 45) },

  // ------------------------------------------------------------------- bills
  { id: 't26', kind: 'expense', amount: r(799), merchant: 'Airtel Postpaid', categoryId: 'bills', accountId: 'hdfc', method: 'autopay', occurredAt: at(1, 8, 0), recurring: true },
  { id: 't27', kind: 'expense', amount: r(1890), merchant: 'BESCOM Electricity', categoryId: 'bills', accountId: 'hdfc', method: 'autopay', occurredAt: at(7, 7, 0), recurring: true },
  { id: 't28', kind: 'expense', amount: r(999), merchant: 'JioFiber', categoryId: 'bills', accountId: 'hdfc', method: 'autopay', occurredAt: at(10, 7, 0), recurring: true },
  { id: 't29', kind: 'expense', amount: r(3000), merchant: 'Household help', categoryId: 'bills', accountId: 'cash', method: 'cash', occurredAt: at(14, 10, 0), recurring: true },

  // ---------------------------------------------------------------- the rest
  { id: 't30', kind: 'expense', amount: r(845), merchant: 'Apollo Pharmacy', categoryId: 'health', accountId: 'hdfc', method: 'upi', occurredAt: at(3, 11, 25) },
  { id: 't31', kind: 'expense', amount: r(2500), merchant: 'Cult.fit membership', categoryId: 'health', accountId: 'icici-card', method: 'autopay', occurredAt: at(9, 8, 0), recurring: true },
  { id: 't32', kind: 'expense', amount: r(1846), merchant: 'Health checkup', categoryId: 'health', accountId: 'icici-card', method: 'card', occurredAt: at(15, 10, 30) },
  { id: 't33', kind: 'expense', amount: r(1100), merchant: 'PVR Cinemas', categoryId: 'entertainment', accountId: 'hdfc', method: 'upi', occurredAt: at(6, 19, 30) },
  { id: 't34', kind: 'expense', amount: r(649), merchant: 'Netflix', categoryId: 'entertainment', accountId: 'icici-card', method: 'autopay', occurredAt: at(11, 6, 0), recurring: true },
  { id: 't35', kind: 'expense', amount: r(1299), merchant: 'Udemy course', categoryId: 'education', accountId: 'icici-card', method: 'card', occurredAt: at(7, 20, 15) },
  { id: 't36', kind: 'expense', amount: r(6000), merchant: 'School fees — Term 2', categoryId: 'education', accountId: 'hdfc', method: 'netbanking', occurredAt: at(13, 11, 45) },
  { id: 't37', kind: 'transfer', amount: r(10000), merchant: 'SIP — Nifty 50 Index', categoryId: 'investment', accountId: 'hdfc', method: 'netbanking', occurredAt: at(10, 10, 0), recurring: true },

  // ------------------------------------------------------------------ income
  { id: 't38', kind: 'income', amount: r(145000), merchant: 'Salary credit', categoryId: 'salary', accountId: 'hdfc', method: 'netbanking', occurredAt: at(15, 6, 30), recurring: true },
  { id: 't39', kind: 'income', amount: r(12000), merchant: 'Freelance — logo design', categoryId: 'salary', accountId: 'hdfc', method: 'upi', occurredAt: at(12, 15, 0) },
];

/** Most recent first — what Home and Activity show. */
export const recentTransactions: readonly Transaction[] = [...transactions].sort(
  (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
);

function sumBy(kind: Transaction['kind']): Paise {
  return transactions
    .filter((transaction) => transaction.kind === kind)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

const income = sumBy('income');
// A transfer into investments leaves the spending account, so it counts against the
// month exactly as an expense does.
const spent = sumBy('expense') + sumBy('transfer');

export const monthSummary: MonthSummary = {
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
  openingBalance: r(88500),
  currentBalance: accounts.reduce((total, account) => total + account.balance, 0),
  income,
  spent,
  saved: income - spent,
  previousIncome: r(140000),
  previousSpent: r(92000),
};

/** Per-category totals for the month, largest first. */
export const categorySpend: readonly CategorySpend[] = (() => {
  const totals = new Map<string, Paise>();

  for (const transaction of transactions) {
    if (transaction.kind === 'income') continue;
    totals.set(
      transaction.categoryId,
      (totals.get(transaction.categoryId) ?? 0) + transaction.amount,
    );
  }

  const grandTotal = [...totals.values()].reduce((total, value) => total + value, 0);

  return [...totals.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      amount,
      share: grandTotal === 0 ? 0 : amount / grandTotal,
    }))
    .sort((a, b) => b.amount - a.amount);
})();

/**
 * The five bands the spending donut names, in legend order; everything else folds
 * into "Others". A fixed set reads the same way month to month, which a
 * top-five-by-amount list would not.
 */
const HEADLINE_CATEGORIES = ['food', 'rent', 'transport', 'shopping', 'bills'] as const;

export const spendingBreakdown: readonly CategorySpend[] = (() => {
  const byId = new Map(categorySpend.map((entry) => [entry.categoryId, entry]));

  const headline = HEADLINE_CATEGORIES.map((id) => byId.get(id)).filter(
    (entry): entry is CategorySpend => entry !== undefined,
  );

  const headlineTotal = headline.reduce((total, entry) => total + entry.amount, 0);
  const othersAmount = spent - headlineTotal;

  if (othersAmount <= 0) return headline;

  return [
    ...headline,
    {
      categoryId: 'other',
      amount: othersAmount,
      share: spent === 0 ? 0 : othersAmount / spent,
    },
  ];
})();

/** Spend per week of the current month, for the overview bar chart. */
export const weeklySpend: readonly WeeklySpend[] = [
  { label: 'W1', amount: r(16800) },
  { label: 'W2', amount: r(21400) },
  { label: 'W3', amount: r(22900) },
  { label: 'W4', amount: r(24127) },
];

/**
 * Normalised balance trend behind the hero number. Shape only — the line carries no
 * axis and no labels, so the values just need to read as a month that dipped
 * mid-way and recovered.
 */
export const balanceTrend: readonly number[] = [
  38, 42, 40, 47, 52, 49, 58, 63, 59, 68, 74, 71, 82, 88, 84, 96,
];

/**
 * Spend per day so far this month, for the Activity summary chart. Real data, not a
 * shape: a day with nothing spent is a genuine gap in the bars.
 */
export const dailySpend: readonly WeeklySpend[] = (() => {
  const byDay = new Map<number, Paise>();

  for (const transaction of transactions) {
    if (transaction.kind === 'income') continue;
    const day = new Date(transaction.occurredAt).getDate();
    byDay.set(day, (byDay.get(day) ?? 0) + transaction.amount);
  }

  const today = new Date().getDate();
  const days: WeeklySpend[] = [];
  for (let day = 1; day <= today; day += 1) {
    days.push({ label: String(day), amount: byDay.get(day) ?? 0 });
  }
  // Two weeks is as much as the card can show without the bars turning to hairlines.
  return days.slice(-14);
})();

/**
 * Shape-only series for the thumbnail bars on the income and spent tiles. Real
 * weekly income is one salary spike and three empty weeks, which makes a useless
 * chart — these read as "steady" and "climbing" instead.
 */
export const incomeTrend: readonly number[] = [46, 52, 48, 62, 70];
export const spendTrend: readonly number[] = [38, 56, 44, 72, 88];

export const user = {
  firstName: 'Aarav',
  initials: 'AS',
};
