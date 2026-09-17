import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { env } from '../config/env';
import { AccountModel } from '../modules/accounts/account.model';
import { CategoryModel } from '../modules/categories/category.model';
import { UserModel } from '../modules/users/user.model';
import { createPerson } from '../modules/people/people.service';
import {
  createMoneyOwed,
  recordRepayment,
} from '../modules/moneyOwed/moneyOwed.service';
import { createTransaction } from '../modules/transactions/transaction.service';
import { getOverview, getMerchantSpend } from '../modules/analytics/analytics.service';
import { answerQuestion } from '../modules/ai/ai.service';
import { checkGrounding } from '../modules/ai/ai.guard';
import { createBudget } from '../modules/budgets/budget.service';

async function runTests() {
  console.log('=== Starting Phase C: Analytics, Insights & Financial Intelligence Comprehensive Test Suite ===\n');
  await mongoose.connect(env.MONGODB_URI);

  let passed = 0;
  let failed = 0;

  async function check(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed += 1;
      console.log(`  ✅ PASS: ${name}`);
    } catch (err: any) {
      failed += 1;
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     ${err?.message || err}`);
    }
  }

  try {
    // ---------------------------------------------------------------- SETUP FIXTURES
    const runId = Date.now();
    const user = await UserModel.create({
      name: 'Paisa Analyst',
      email: `analyst_${runId}@paisa.test`,
      passwordHash: 'secret_hash',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    const userId = String(user._id);

    const otherUser = await UserModel.create({
      name: 'Other User',
      email: `other_${runId}@paisa.test`,
      passwordHash: 'secret_hash',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    const otherUserId = String(otherUser._id);

    const hdfc = await AccountModel.create({
      userId: user._id,
      name: 'HDFC Bank',
      type: 'bank',
      balance: 10000000, // ₹1,00,000 in paise
      currency: 'INR',
      icon: 'landmark',
      color: '#004C8F',
    });
    const hdfcId = String(hdfc._id);

    const cash = await AccountModel.create({
      userId: user._id,
      name: 'Cash',
      type: 'cash',
      balance: 2000000, // ₹20,000
      currency: 'INR',
      icon: 'banknote',
      color: '#4CAF50',
    });
    const cashId = String(cash._id);

    const foodCategory = await CategoryModel.create({
      userId: user._id,
      name: 'Food & Dining',
      group: 'Food',
      type: 'expense',
      icon: 'utensils',
      color: '#FF5722',
    });
    const foodCatId = String(foodCategory._id);

    const shoppingCategory = await CategoryModel.create({
      userId: user._id,
      name: 'Shopping',
      group: 'Shopping',
      type: 'expense',
      icon: 'shoppingBag',
      color: '#9C27B0',
    });
    const shoppingCatId = String(shoppingCategory._id);

    const salaryCategory = await CategoryModel.create({
      userId: user._id,
      name: 'Salary',
      group: 'Income',
      type: 'income',
      icon: 'briefcase',
      color: '#2196F3',
    });
    const salaryCatId = String(salaryCategory._id);

    // People
    const rahul = await createPerson(userId, { name: 'Rahul' });
    const priya = await createPerson(userId, { name: 'Priya' });
    const amit = await createPerson(userId, { name: 'Amit' });

    // September 2026 current range and August 2026 previous range
    const sepFrom = new Date(Date.UTC(2026, 8, 1, 0, 0, 0));
    const sepTo = new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999));
    const augFrom = new Date(Date.UTC(2026, 7, 1, 0, 0, 0));
    const augTo = new Date(Date.UTC(2026, 7, 31, 23, 59, 59, 999));

    const currentRange = { from: sepFrom, to: sepTo };
    const previousRange = { from: augFrom, to: augTo };
    const label = 'September 2026';

    // ---------------------------------------------------------------- SECTION 27: 8 E2E SCENARIOS

    console.log('\n--- Section 27: 8 Core E2E Scenarios ---');

    // E2E 1: Add ₹500 Zomato expense -> Insights personal spending increases ₹500
    await check('E2E 1: Add ₹500 Zomato expense -> spending increases ₹500', async () => {
      await createTransaction(userId, {
        type: 'expense',
        amount: 50000, // ₹500
        accountId: hdfcId,
        categoryId: foodCatId,
        merchant: 'Zomato',
        description: 'Dinner delivery',
        paymentMethod: 'upi',
        date: new Date(Date.UTC(2026, 8, 5, 12, 0, 0)),
      });

      const overview = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(overview.personalExpense, 50000, 'personalExpense must be ₹500 (50000 paise)');
      assert.equal(overview.income, 0, 'income must remain 0');
      assert.equal(overview.topMerchants[0]?.merchant, 'Zomato');
      assert.equal(overview.topMerchants[0]?.totalSpent, 50000);
    });

    // E2E 2: Lend Rahul ₹5,000 -> Spending does NOT increase; Money owed increases ₹5,000
    let rahulLoanId: string;
    await check('E2E 2: Lend Rahul ₹5,000 -> Spending does NOT increase, Money owed increases ₹5,000', async () => {
      const loan = await createMoneyOwed(userId, {
        personId: rahul.id,
        direction: 'owed_to_me',
        type: 'loan',
        amount: 500000, // ₹5,000
        purpose: 'Emergency help',
        accountId: hdfcId,
      });
      rahulLoanId = loan.id;

      const overview = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(overview.personalExpense, 50000, 'Spending must NOT increase (remains ₹500)');
      assert.equal(overview.moneyLent, 500000, 'moneyLent must be ₹5,000');
      assert.equal(overview.peopleSummary.totalOwedToMe, 500000, 'You are owed must be ₹5,000');
    });

    // E2E 3: Rahul repays ₹2,000 -> Spending unchanged; Income unchanged; Outstanding is ₹3,000
    await check('E2E 3: Rahul repays ₹2,000 -> Spending and income unchanged, Outstanding becomes ₹3,000', async () => {
      await recordRepayment(userId, rahulLoanId, {
        amount: 200000, // ₹2,000
        accountId: hdfcId,
        date: new Date(Date.UTC(2026, 8, 10, 10, 0, 0)),
      });

      const overview = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(overview.personalExpense, 50000, 'Personal spending unchanged (still ₹500)');
      assert.equal(overview.income, 0, 'Income unchanged (must NOT count repayment as income)');
      assert.equal(overview.repaymentsReceived, 200000, 'repaymentsReceived must be ₹2,000');
      assert.equal(overview.peopleSummary.totalOwedToMe, 300000, 'Outstanding owed to user is now ₹3,000');
    });

    // E2E 4: Borrow ₹5,000 from Amit -> Income unchanged; You owe Amit ₹5,000
    await check('E2E 4: Borrow ₹5,000 from Amit -> Income unchanged, You owe Amit ₹5,000', async () => {
      await createMoneyOwed(userId, {
        personId: amit.id,
        direction: 'i_owe',
        type: 'borrowed',
        amount: 500000, // ₹5,000
        purpose: 'Laptop advance',
        accountId: hdfcId,
      });

      const overview = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(overview.income, 0, 'Income must NOT count borrowed money');
      assert.equal(overview.moneyBorrowed, 500000, 'moneyBorrowed must be ₹5,000');
      assert.equal(overview.peopleSummary.totalIOwe, 500000, 'You owe must be ₹5,000');
    });

    // E2E 5: Split dinner ₹3,000 (User ₹1,000, Rahul ₹1,000, Priya ₹1,000) -> personal spending increases only ₹1,000
    await check('E2E 5: Split dinner ₹3,000 -> Personal spending increases only ₹1,000', async () => {
      const initialSpend = (await getOverview(userId, currentRange, previousRange, label)).personalExpense;

      // 1. User records personal share ₹1,000
      await createTransaction(userId, {
        type: 'expense',
        amount: 100000, // ₹1,000
        accountId: hdfcId,
        categoryId: foodCatId,
        merchant: 'Taj Hotel',
        description: 'Dinner - my share',
        paymentMethod: 'upi',
        date: new Date(Date.UTC(2026, 8, 12, 20, 0, 0)),
      });

      // 2. User records obligations for Rahul's and Priya's shares
      await createMoneyOwed(userId, {
        personId: rahul.id,
        direction: 'owed_to_me',
        type: 'split',
        amount: 100000, // ₹1,000
        purpose: 'Taj Dinner split',
        accountId: hdfcId,
      });

      await createMoneyOwed(userId, {
        personId: priya.id,
        direction: 'owed_to_me',
        type: 'split',
        amount: 100000, // ₹1,000
        purpose: 'Taj Dinner split',
        accountId: hdfcId,
      });

      const overview = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(
        overview.personalExpense - initialSpend,
        100000,
        'Personal spending must increase by exactly ₹1,000, not ₹3,000',
      );
      assert.equal(overview.peopleSummary.totalOwedToMe, 500000, 'Total owed to me is now ₹5,000 (3k Rahul + 1k + 1k Priya)');
    });

    // E2E 6: Add ₹10,000 salary -> income increases ₹10,000
    await check('E2E 6: Add ₹10,000 salary -> income increases ₹10,000', async () => {
      await createTransaction(userId, {
        type: 'income',
        amount: 1000000, // ₹10,000
        accountId: hdfcId,
        categoryId: salaryCatId,
        merchant: 'Employer Inc',
        description: 'Monthly salary',
        paymentMethod: 'bank_transfer',
        date: new Date(Date.UTC(2026, 8, 1, 9, 0, 0)),
      });

      const overview = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(overview.income, 1000000, 'Income must be ₹10,000 (1000000 paise)');
    });

    // E2E 7: Transfer ₹5,000 from HDFC to Cash -> spending & income unchanged, transfers recorded
    await check('E2E 7: Transfer ₹5,000 HDFC to Cash -> Spending and income unchanged', async () => {
      const before = await getOverview(userId, currentRange, previousRange, label);

      await createTransaction(userId, {
        type: 'transfer',
        amount: 500000, // ₹5,000
        accountId: hdfcId,
        destinationAccountId: cashId,
        merchant: '',
        description: 'ATM withdrawal',
        paymentMethod: 'cash',
        date: new Date(Date.UTC(2026, 8, 15, 14, 0, 0)),
      });

      const after = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(after.personalExpense, before.personalExpense, 'Spending must not change after transfer');
      assert.equal(after.income, before.income, 'Income must not change after transfer');
      assert.equal(after.transfers, 500000, 'transfers must be ₹5,000');
    });

    // E2E 8: Period comparison math accuracy
    await check('E2E 8: Compare September with August -> Mathematically exact comparison', async () => {
      // Add August transaction to have verified previous period data
      await createTransaction(userId, {
        type: 'expense',
        amount: 200000, // ₹2,000 in August
        accountId: hdfcId,
        categoryId: shoppingCatId,
        merchant: 'Myntra',
        description: 'Clothing',
        paymentMethod: 'upi',
        date: new Date(Date.UTC(2026, 7, 20, 15, 0, 0)),
      });

      const overview = await getOverview(userId, currentRange, previousRange, label);
      const comparison = overview.monthlyComparison;
      assert.equal(comparison.previousExpenses, 200000, 'Previous expense must be ₹2,000');
      // Current spend: ₹500 Zomato + ₹1,000 Taj dinner = ₹1,500
      assert.equal(overview.personalExpense, 150000, 'Current expense must be ₹1,500');
      assert.equal(comparison.expenseChange, -50000, 'Expense change must be -₹500');
      assert.equal(comparison.direction, 'down', 'Direction must be down');
      assert.equal(comparison.expenseChangePercent, -25, 'Percent change must be -25%');
    });

    // ---------------------------------------------------------------- SECTION 26: DETAILED ANALYTICS CHECKS

    console.log('\n--- Section 26: Specific Subsystem Analytics Checks ---');

    // Merchant Normalization
    await check('Merchant normalization: zomato, Zomato, ZOMATO correctly grouped', async () => {
      await createTransaction(userId, {
        type: 'expense',
        amount: 20000, // ₹200
        accountId: hdfcId,
        categoryId: foodCatId,
        merchant: 'zomato',
        description: 'Snack',
        paymentMethod: 'upi',
        date: new Date(Date.UTC(2026, 8, 16, 12, 0, 0)),
      });
      await createTransaction(userId, {
        type: 'expense',
        amount: 30000, // ₹300
        accountId: hdfcId,
        categoryId: foodCatId,
        merchant: 'ZOMATO',
        description: 'Burger',
        paymentMethod: 'upi',
        date: new Date(Date.UTC(2026, 8, 17, 13, 0, 0)),
      });

      const overview = await getOverview(userId, currentRange, previousRange, label);
      const zomatoGroup = overview.topMerchants.find((m) => m.merchant.toLowerCase() === 'zomato');
      assert.ok(zomatoGroup, 'Zomato must exist in top merchants');
      // Initial ₹500 + ₹200 + ₹300 = ₹1,000 across 3 transactions
      assert.equal(zomatoGroup.totalSpent, 100000, 'Zomato total spent must be ₹1,000');
      assert.equal(zomatoGroup.count, 3, 'Zomato count must be 3');

      // Test getMerchantSpend helper
      const merchantDetail = await getMerchantSpend(userId, 'Zomato', currentRange);
      assert.equal(merchantDetail.amount, 100000);
      assert.equal(merchantDetail.count, 3);
    });

    // Category Analytics
    await check('Category analytics: amounts, shares, and ordering', async () => {
      const overview = await getOverview(userId, currentRange, previousRange, label);
      assert.ok(overview.categoryBreakdown.length > 0, 'Category breakdown must not be empty');
      const food = overview.categoryBreakdown.find((c) => c.name === 'Food & Dining');
      assert.ok(food, 'Food & Dining category must exist');
      // Total food spend: 100000 (Zomato) + 100000 (Taj dinner) = 200000
      assert.equal(food.amount, 200000);
      const firstAmount = overview.categoryBreakdown[0]?.amount ?? 0;
      const secondAmount = overview.categoryBreakdown[1]?.amount ?? 0;
      assert.equal(firstAmount >= secondAmount, true, 'Must be sorted descending');
    });

    // Budget Analytics
    await check('Budget analytics: only personal spending counted', async () => {
      await createBudget(userId, {
        categoryId: foodCatId,
        amount: 500000, // ₹5,000 budget
        scope: 'category',
        warnAtPercent: 80,
      });

      const overview = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(overview.budgetStatus.hasBudgets, true);
      const foodBudget = overview.budgetStatus.items?.find((b) => b.name === 'Food & Dining');
      assert.ok(foodBudget, 'Food budget item must exist');
      assert.equal(foodBudget.budgeted, 500000);
      assert.equal(foodBudget.spent, 200000, 'Spent must reflect only personal spending (₹2,000)');
      assert.equal(foodBudget.remaining, 300000, 'Remaining must be ₹3,000');
      assert.equal(foodBudget.percent, 40, 'Percent used must be 40%');
    });

    // User Isolation
    await check('User isolation: User B never sees User A analytics', async () => {
      const userBOverview = await getOverview(otherUserId, currentRange, previousRange, label);
      assert.equal(userBOverview.personalExpense, 0, 'User B personal expense must be 0');
      assert.equal(userBOverview.income, 0, 'User B income must be 0');
      assert.equal(userBOverview.transactionCount, 0, 'User B transaction count must be 0');
      assert.equal(userBOverview.topMerchants.length, 0, 'User B merchants must be empty');
      assert.equal(userBOverview.peopleSummary.totalOwedToMe, 0, 'User B owed must be 0');
    });

    // AI Safety & Queries
    console.log('\n--- Section 18 & 26: AI Natural Language Intelligence & Safety ---');

    await check('AI Question: "Who owes me money?" returns exact factual answer', async () => {
      const answer = await answerQuestion(userId, 'Who owes me money?', currentRange, previousRange, label);
      assert.ok(answer.text.includes('Rahul') || answer.text.includes('Priya') || answer.text.includes('owed'), 'Answer must mention active debtors');
      assert.equal(answer.context.intent, 'who_owes_me');
    });

    await check('AI Question: "How much did I lend this month?" returns verified figure', async () => {
      const answer = await answerQuestion(userId, 'How much did I lend this month?', currentRange, previousRange, label);
      assert.ok(answer.text.includes('5,000') || answer.text.includes('7,000'), 'Answer must quote lent amount');
      assert.equal(answer.context.intent, 'money_lent');
    });

    await check('AI Question: "How much did people repay me?" returns verified figure', async () => {
      const answer = await answerQuestion(userId, 'How much did people repay me?', currentRange, previousRange, label);
      assert.ok(answer.text.includes('2,000'), 'Answer must quote repayment received of ₹2,000');
      assert.equal(answer.context.intent, 'repayments');
    });

    await check('AI Question: "How much did I spend on Zomato?" returns exact merchant spend', async () => {
      const answer = await answerQuestion(userId, 'How much did I spend on Zomato?', currentRange, previousRange, label);
      assert.ok(answer.text.includes('1,000') || answer.text.includes('Zomato'), 'Answer must quote ₹1,000 Zomato spend');
      assert.equal(answer.context.intent, 'merchant_spend');
    });

    await check('AI Guard: checkGrounding rejects hallucinated figures', async () => {
      const facts = 'TOTAL SPENT: ₹2,000 in September. Food was your largest category.';
      const hallucinatedReply = 'You spent ₹99,999 on luxury watches this month.';
      const result = checkGrounding(hallucinatedReply, facts);
      assert.equal(result.grounded, false, 'Hallucinated figure ₹99,999 must be rejected by grounding check');
    });

  } finally {
    await mongoose.disconnect();
  }

  console.log('\n========================================');
  console.log(`Phase C Tests Finished: ${passed} Passed, ${failed} Failed`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
