import { Types } from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/db';
import { logger } from '../config/logger';
import { hashPassword } from '../lib/password';
import { zoneOrDefault } from '../lib/time';
import { AccountModel } from '../modules/accounts/account.model';
import { BudgetModel } from '../modules/budgets/budget.model';
import { CategoryModel } from '../modules/categories/category.model';
import { NotificationModel } from '../modules/notifications/notification.model';
import { RecurringModel } from '../modules/recurring/recurring.model';
import { TransactionModel } from '../modules/transactions/transaction.model';
import { UserModel } from '../modules/users/user.model';
import { initialSchedule } from '../modules/recurring/recurring.service';
import { seedUserDefaults } from '../seed/seedUser';

/**
 * Creates (or resets) a demo account with a realistic month behind it, so the app
 * can be opened against data that looks like something rather than an empty state.
 *
 *   npm run seed                      → demo@paisa.app / Password123
 *   npm run seed -- me@example.com    → seeds that address instead
 *
 * Re-running wipes that user's transactions and rebuilds them. It touches nothing
 * else in the database.
 */

const EMAIL = process.argv[2] ?? 'demo@paisa.app';
const PASSWORD = 'Password123';

/** Rupees to paise, for readable literals below. */
const r = (rupees: number): number => Math.round(rupees * 100);

function daysAgo(days: number, hour = 12, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function main(): Promise<void> {
  await connectDatabase();

  let user = await UserModel.findOne({ email: EMAIL });

  if (!user) {
    user = await UserModel.create({
      name: 'Aarav Sharma',
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      currency: 'INR',
    });
    await seedUserDefaults(user._id, user.currency);
    logger.info({ email: EMAIL }, 'created demo user');
  } else {
    logger.info({ email: EMAIL }, 'demo user already exists, resetting their data');
    await Promise.all([
      TransactionModel.deleteMany({ userId: user._id }),
      BudgetModel.deleteMany({ userId: user._id }),
      RecurringModel.deleteMany({ userId: user._id }),
      NotificationModel.deleteMany({ userId: user._id }),
    ]);
    if (!user.seededAt) await seedUserDefaults(user._id, user.currency);
  }

  const userId = user._id;

  const categories = await CategoryModel.find({ userId }).lean();
  const byName = new Map(categories.map((category) => [category.name, category._id]));
  const category = (name: string): Types.ObjectId => {
    const id = byName.get(name);
    if (!id) throw new Error(`Missing seeded category: ${name}`);
    return id;
  };

  // Give the demo account a richer set than the two defaults.
  await AccountModel.deleteMany({ userId });
  const [hdfc, card, cash] = await AccountModel.create([
    {
      userId,
      name: 'HDFC Savings',
      type: 'bank',
      institution: 'HDFC Bank',
      last4: '4821',
      icon: 'bank',
      color: '#4C8DFF',
      balance: 0,
    },
    {
      userId,
      name: 'Amazon Pay Card',
      type: 'credit_card',
      institution: 'ICICI Bank',
      last4: '7749',
      icon: 'card',
      color: '#FF6FB5',
      balance: 0,
    },
    { userId, name: 'Cash', type: 'cash', icon: 'cash', color: '#2BD98C', balance: 0 },
  ]);

  if (!hdfc || !card || !cash) throw new Error('Could not create demo accounts');

  type Row = {
    type: 'expense' | 'income' | 'transfer';
    amount: number;
    name: string;
    accountId: Types.ObjectId;
    destinationAccountId?: Types.ObjectId;
    categoryName?: string;
    method: 'upi' | 'cash' | 'credit_card' | 'debit_card' | 'net_banking' | 'bank_transfer' | 'wallet';
    date: Date;
  };

  const rows: Row[] = [
    { type: 'income', amount: r(145000), name: 'Salary credit', accountId: hdfc._id, categoryName: 'Salary', method: 'net_banking', date: daysAgo(15, 6, 30) },
    { type: 'income', amount: r(12000), name: 'Logo design project', accountId: hdfc._id, categoryName: 'Freelance', method: 'upi', date: daysAgo(12, 15) },

    { type: 'expense', amount: r(18500), name: 'Rent', accountId: hdfc._id, categoryName: 'Rent', method: 'net_banking', date: daysAgo(14, 9, 15) },
    { type: 'expense', amount: r(1890), name: 'BESCOM', accountId: hdfc._id, categoryName: 'Electricity', method: 'upi', date: daysAgo(7, 7) },
    { type: 'expense', amount: r(999), name: 'JioFiber', accountId: hdfc._id, categoryName: 'Internet', method: 'upi', date: daysAgo(10, 7) },
    { type: 'expense', amount: r(799), name: 'Airtel Postpaid', accountId: hdfc._id, categoryName: 'Mobile Recharge', method: 'upi', date: daysAgo(1, 8) },

    { type: 'expense', amount: r(1248), name: 'Blinkit', accountId: hdfc._id, categoryName: 'Grocery', method: 'upi', date: daysAgo(0, 19, 42) },
    { type: 'expense', amount: r(3410), name: 'BigBasket', accountId: hdfc._id, categoryName: 'Supermarket', method: 'upi', date: daysAgo(3, 17, 12) },
    { type: 'expense', amount: r(1890), name: 'Licious', accountId: hdfc._id, categoryName: 'Meat & Chicken', method: 'upi', date: daysAgo(9, 18, 30) },
    { type: 'expense', amount: r(1200), name: 'Milk and vegetables', accountId: cash._id, categoryName: 'Vegetables', method: 'cash', date: daysAgo(11, 8, 15) },

    { type: 'expense', amount: r(428), name: 'Swiggy', accountId: hdfc._id, categoryName: 'Swiggy', method: 'upi', date: daysAgo(0, 13, 18) },
    { type: 'expense', amount: r(612), name: 'Zomato', accountId: hdfc._id, categoryName: 'Zomato', method: 'upi', date: daysAgo(2, 21, 10) },
    { type: 'expense', amount: r(2450), name: 'Toit', accountId: card._id, categoryName: 'Restaurants', method: 'credit_card', date: daysAgo(5, 21, 40) },
    { type: 'expense', amount: r(320), name: 'Third Wave Coffee', accountId: cash._id, categoryName: 'Cafe', method: 'cash', date: daysAgo(4, 9, 25) },

    { type: 'expense', amount: r(2000), name: 'Indian Oil', accountId: card._id, categoryName: 'Petrol', method: 'credit_card', date: daysAgo(0, 9, 5) },
    { type: 'expense', amount: r(2500), name: 'HP Petrol Pump', accountId: card._id, categoryName: 'Petrol', method: 'credit_card', date: daysAgo(6, 8, 30) },
    { type: 'expense', amount: r(340), name: 'Uber', accountId: hdfc._id, categoryName: 'Uber', method: 'upi', date: daysAgo(2, 9, 20) },
    { type: 'expense', amount: r(190), name: 'Rapido', accountId: hdfc._id, categoryName: 'Rapido', method: 'upi', date: daysAgo(4, 18, 50) },
    { type: 'expense', amount: r(120), name: 'Auto rickshaw', accountId: cash._id, categoryName: 'Auto', method: 'cash', date: daysAgo(1, 7, 40) },
    { type: 'expense', amount: r(1000), name: 'Metro card recharge', accountId: hdfc._id, categoryName: 'Metro', method: 'upi', date: daysAgo(10, 8) },

    { type: 'expense', amount: r(2499), name: 'Myntra', accountId: card._id, categoryName: 'Myntra', method: 'credit_card', date: daysAgo(1, 21, 30) },
    { type: 'expense', amount: r(4299), name: 'Amazon', accountId: card._id, categoryName: 'Amazon', method: 'credit_card', date: daysAgo(5, 22, 10) },

    { type: 'expense', amount: r(649), name: 'Netflix', accountId: card._id, categoryName: 'Netflix', method: 'credit_card', date: daysAgo(11, 6) },
    { type: 'expense', amount: r(1100), name: 'PVR Cinemas', accountId: hdfc._id, categoryName: 'Movies', method: 'upi', date: daysAgo(6, 19, 30) },

    { type: 'expense', amount: r(845), name: 'Apollo Pharmacy', accountId: hdfc._id, categoryName: 'Pharmacy', method: 'upi', date: daysAgo(3, 11, 25) },
    { type: 'expense', amount: r(2500), name: 'Cult.fit', accountId: card._id, categoryName: 'Gym', method: 'credit_card', date: daysAgo(9, 8) },

    { type: 'expense', amount: r(1400), name: 'Old Monk and beer', accountId: cash._id, categoryName: 'Alcohol', method: 'cash', date: daysAgo(8, 20) },

    { type: 'expense', amount: r(10000), name: 'Nifty 50 SIP', accountId: hdfc._id, categoryName: 'Mutual Fund', method: 'net_banking', date: daysAgo(10, 10) },

    // The point of the demo data: a transfer that moves money without being spent.
    { type: 'transfer', amount: r(10000), name: 'ATM withdrawal', accountId: hdfc._id, destinationAccountId: cash._id, method: 'bank_transfer', date: daysAgo(13, 11) },
    { type: 'transfer', amount: r(25000), name: 'Card bill payment', accountId: hdfc._id, destinationAccountId: card._id, method: 'net_banking', date: daysAgo(4, 10) },
  ];

  const documents = rows.map((row) => ({
    userId,
    type: row.type,
    amount: row.amount,
    accountId: row.accountId,
    destinationAccountId: row.destinationAccountId ?? null,
    categoryId: row.categoryName ? category(row.categoryName) : null,
    merchant: row.name,
    description: '',
    paymentMethod: row.method,
    date: row.date,
  }));

  await TransactionModel.insertMany(documents);

  // Recompute balances from the ledger rather than tracking them as we insert.
  // The same arithmetic the API applies per write, applied once in bulk.
  const balances = new Map<string, number>([
    [String(hdfc._id), r(50000)],
    [String(card._id), r(-20000)],
    [String(cash._id), r(2000)],
  ]);

  for (const row of documents) {
    const from = String(row.accountId);
    if (row.type === 'income') {
      balances.set(from, (balances.get(from) ?? 0) + row.amount);
    } else {
      balances.set(from, (balances.get(from) ?? 0) - row.amount);
      if (row.type === 'transfer' && row.destinationAccountId) {
        const to = String(row.destinationAccountId);
        balances.set(to, (balances.get(to) ?? 0) + row.amount);
      }
    }
  }

  for (const [accountId, balance] of balances) {
    await AccountModel.updateOne({ _id: accountId }, { $set: { balance } });
  }

  // -------------------------------------------------------------- budgets
  //
  // Deliberately a mix: one comfortably on track, one close enough to warn, and
  // one already over. A demo where every bar is green shows none of the states
  // the screen exists to communicate.
  await BudgetModel.deleteMany({ userId });
  await BudgetModel.insertMany([
    { userId, scope: 'overall', categoryId: null, amount: r(60000), warnAtPercent: 80 },
    { userId, scope: 'category', categoryId: category('Restaurants'), amount: r(7000), warnAtPercent: 80 },
    { userId, scope: 'category', categoryId: category('Petrol'), amount: r(5000), warnAtPercent: 80 },
    { userId, scope: 'category', categoryId: category('Amazon'), amount: r(5000), warnAtPercent: 80 },
    { userId, scope: 'category', categoryId: category('Rent'), amount: r(20000), warnAtPercent: 90 },
  ]);

  // ------------------------------------------------------------ recurring
  const zone = zoneOrDefault(user.timezone);

  const rules = [
    { name: 'Rent', amount: r(18500), categoryName: 'Rent', accountId: hdfc._id, unit: 'month' as const, day: 5, method: 'net_banking' as const },
    { name: 'Netflix', amount: r(649), categoryName: 'Netflix', accountId: card._id, unit: 'month' as const, day: 11, method: 'credit_card' as const },
    { name: 'Cult.fit', amount: r(2500), categoryName: 'Gym', accountId: card._id, unit: 'month' as const, day: 9, method: 'credit_card' as const },
    { name: 'JioFiber', amount: r(999), categoryName: 'Internet', accountId: hdfc._id, unit: 'month' as const, day: 10, method: 'upi' as const },
    { name: 'Nifty 50 SIP', amount: r(10000), categoryName: 'Mutual Fund', accountId: hdfc._id, unit: 'month' as const, day: 3, method: 'net_banking' as const },
  ];

  const now = new Date();

  await RecurringModel.insertMany(
    rules.map((rule) => {
      // Anchored on a day of this month that has not happened yet, so the demo
      // opens on a list of things genuinely coming up rather than a list of
      // charges the scheduler is about to write the moment it starts.
      const anchor = new Date(now.getFullYear(), now.getMonth(), rule.day, 9, 0, 0, 0);
      if (anchor.getTime() <= now.getTime()) anchor.setMonth(anchor.getMonth() + 1);

      const schedule = initialSchedule(anchor, rule.unit, 1, zone, now);

      return {
        userId,
        name: rule.name,
        type: 'expense' as const,
        amount: rule.amount,
        categoryId: category(rule.categoryName),
        accountId: rule.accountId,
        destinationAccountId: null,
        description: '',
        paymentMethod: rule.method,
        unit: rule.unit,
        interval: 1,
        startDate: anchor,
        endDate: null,
        maxOccurrences: null,
        autoCreate: true,
        occurrencesCreated: schedule.occurrencesCreated,
        nextRunAt: schedule.nextRunAt,
        isPaused: rule.name === 'Cult.fit',
        isActive: true,
      };
    }),
  );

  logger.info(
    {
      email: EMAIL,
      password: PASSWORD,
      transactions: documents.length,
      categories: categories.length,
      budgets: 5,
      recurring: rules.length,
    },
    'seed complete',
  );

  await disconnectDatabase();
}

void main().catch(async (error: unknown) => {
  logger.fatal({ err: error }, 'seed failed');
  await disconnectDatabase();
  process.exit(1);
});
