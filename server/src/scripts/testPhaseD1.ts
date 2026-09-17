import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { env } from '../config/env';
import { AccountModel } from '../modules/accounts/account.model';
import { CategoryModel } from '../modules/categories/category.model';
import { UserModel } from '../modules/users/user.model';
import { parseQuickEntry, parseAmount, parseIncomeIntent } from '../modules/ai/quickEntry';
import { proposeFromText } from '../modules/ai/quick.service';
import { createTransaction } from '../modules/transactions/transaction.service';
import { rememberMerchant, recallMerchant } from '../modules/merchants/merchant.service';
import { getOverview } from '../modules/analytics/analytics.service';
import { createPerson } from '../modules/people/people.service';
import { createMoneyOwed } from '../modules/moneyOwed/moneyOwed.service';

async function runTests() {
  console.log('=== Starting Phase D.1 & D.1.1: Financial Safety Audit & Comprehensive Test Suite ===\n');
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
      name: 'Paisa Safety Auditor',
      email: `auditor_${runId}@paisa.test`,
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

    // Accounts for primary user: HDFC & ICICI
    const hdfc = await AccountModel.create({
      userId: user._id,
      name: 'HDFC Salary Account',
      type: 'savings',
      balance: 10000000, // ₹1,00,000
    });
    const hdfcId = String(hdfc._id);

    const icici = await AccountModel.create({
      userId: user._id,
      name: 'ICICI Credit Card',
      type: 'credit_card',
      balance: 0,
    });
    const iciciId = String(icici._id);

    const cashAccount = await AccountModel.create({
      userId: user._id,
      name: 'Cash In Hand',
      type: 'cash',
      balance: 500000, // ₹5,000
    });
    const cashId = String(cashAccount._id);

    // Account for other user: SBI
    const sbiOther = await AccountModel.create({
      userId: otherUser._id,
      name: 'SBI Savings',
      type: 'savings',
      balance: 5000000,
    });
    const sbiOtherId = String(sbiOther._id);

    // Standard Categories
    const catFood = await CategoryModel.create({
      userId: user._id,
      name: 'Food & Dining',
      type: 'expense',
      group: 'food',
      color: '#FF6B6B',
      icon: 'utensils',
      sortOrder: 1,
    });

    await CategoryModel.create({
      userId: user._id,
      name: 'Groceries',
      type: 'expense',
      group: 'groceries',
      color: '#4ECDC4',
      icon: 'shopping-cart',
      sortOrder: 2,
    });

    await CategoryModel.create({
      userId: user._id,
      name: 'Transportation',
      type: 'expense',
      group: 'transport',
      color: '#45B7D1',
      icon: 'car',
      sortOrder: 3,
    });

    await CategoryModel.create({
      userId: user._id,
      name: 'Entertainment',
      type: 'expense',
      group: 'entertainment',
      color: '#96CEB4',
      icon: 'tv',
      sortOrder: 4,
    });

    await CategoryModel.create({
      userId: user._id,
      name: 'Fuel',
      type: 'expense',
      group: 'fuel',
      color: '#FFBE0B',
      icon: 'gas-pump',
      sortOrder: 5,
    });

    const catIncome = await CategoryModel.create({
      userId: user._id,
      name: 'Salary',
      type: 'income',
      group: 'income',
      color: '#2EC4B6',
      icon: 'briefcase',
      sortOrder: 10,
    });

    await CategoryModel.create({
      userId: user._id,
      name: 'Other Income',
      type: 'income',
      group: 'income',
      color: '#3A86FF',
      icon: 'dollar-sign',
      sortOrder: 11,
    });

    // ---------------------------------------------------------------- 1. DETERMINISTIC PARSER TESTS
    console.log('\n--- 1. Deterministic Parsing ---');

    await check('Parse "Zomato 450" -> merchant Zomato, amount 45000 paise', () => {
      const parsed = parseQuickEntry('Zomato 450', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 45000);
      assert.equal(parsed.merchant.toLowerCase(), 'zomato');
      assert.equal(parsed.categoryHint, 'Zomato');
      assert.equal(parsed.categoryGroup, 'Food');
      assert.equal(parsed.ruleConfidence, 'high');
    });

    await check('Parse "DMart 2380" -> merchant DMart, amount 238000 paise', () => {
      const parsed = parseQuickEntry('DMart 2380', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 238000);
      assert.equal(parsed.merchant, 'DMart');
      assert.equal(parsed.categoryHint, 'Grocery');
      assert.equal(parsed.categoryGroup, 'Grocery');
      assert.equal(parsed.ruleConfidence, 'high');
    });

    await check('Parse "Uber 320" -> merchant Uber, amount 32000 paise', () => {
      const parsed = parseQuickEntry('Uber 320', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 32000);
      assert.equal(parsed.merchant, 'Uber');
      assert.equal(parsed.categoryHint, 'Uber');
      assert.equal(parsed.categoryGroup, 'Transport');
      assert.equal(parsed.ruleConfidence, 'high');
    });

    await check('Parse "Netflix 649" -> merchant Netflix, amount 64900 paise', () => {
      const parsed = parseQuickEntry('Netflix 649', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 64900);
      assert.equal(parsed.merchant, 'Netflix');
      assert.equal(parsed.categoryHint, 'Netflix');
      assert.equal(parsed.categoryGroup, 'Entertainment');
      assert.equal(parsed.ruleConfidence, 'high');
    });

    // ---------------------------------------------------------------- 2. PAYMENT METHODS
    console.log('\n--- 2. Payment Method Recognition ---');

    await check('Parse "Petrol 1200 UPI" -> UPI method, amount 120000', () => {
      const parsed = parseQuickEntry('Petrol 1200 UPI', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 120000);
      assert.equal(parsed.method?.method, 'upi');
      assert.equal(parsed.categoryHint, 'Petrol');
      assert.equal(parsed.categoryGroup, 'Transport');
    });

    await check('Parse "Coffee 180 cash" -> cash method, amount 18000', () => {
      const parsed = parseQuickEntry('Coffee 180 cash', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 18000);
      assert.equal(parsed.method?.method, 'cash');
      assert.equal(parsed.categoryHint, 'Cafe');
      assert.equal(parsed.categoryGroup, 'Food');
    });

    await check('Parse "Amazon 3000 credit card" -> credit_card method, amount 300000', () => {
      const parsed = parseQuickEntry('Amazon 3000 credit card', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 300000);
      assert.equal(parsed.method?.method, 'credit_card');
      assert.equal(parsed.merchant, 'Amazon');
    });

    // ---------------------------------------------------------------- 3. DATES
    console.log('\n--- 3. Date Parsing ---');

    await check('Parse "Yesterday Zomato 450" -> date is yesterday', () => {
      const now = new Date('2026-09-17T12:00:00Z');
      const parsed = parseQuickEntry('Yesterday Zomato 450', 'Asia/Kolkata', now);
      assert.equal(parsed.amount?.paise, 45000);
      const parsedDate = parsed.date.date.toISOString().slice(0, 10);
      assert.equal(parsedDate, '2026-09-16');
    });

    await check('Parse "Zomato 450 today" -> date is today', () => {
      const now = new Date('2026-09-17T12:00:00Z');
      const parsed = parseQuickEntry('Zomato 450 today', 'Asia/Kolkata', now);
      assert.equal(parsed.amount?.paise, 45000);
      const parsedDate = parsed.date.date.toISOString().slice(0, 10);
      assert.equal(parsedDate, '2026-09-17');
    });

    // ---------------------------------------------------------------- 4. NATURAL LANGUAGE & INDIAN FORMATTING
    console.log('\n--- 4. Natural Language & Indian Formatting ---');

    await check('Parse "Spent 500 on Zomato" -> 50000 paise, Zomato', () => {
      const parsed = parseQuickEntry('Spent 500 on Zomato', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 50000);
      assert.equal(parsed.merchant.toLowerCase(), 'zomato');
    });

    await check('Parse "Paid 1200 for petrol" -> 120000 paise, Petrol', () => {
      const parsed = parseQuickEntry('Paid 1200 for petrol', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 120000);
      assert.equal(parsed.categoryHint, 'Petrol');
    });

    await check('Parse "₹1,200 Zomato" -> 120000 paise', () => {
      const parsed = parseQuickEntry('₹1,200 Zomato', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 120000);
    });

    await check('Parse "₹1,25,000" Indian comma format -> 12500000 paise', () => {
      const parsedAmount = parseAmount('₹1,25,000');
      assert.equal(parsedAmount?.paise, 12500000);
    });

    await check('Parse "Zomato 1.5k" -> 150000 paise', () => {
      const parsed = parseQuickEntry('Zomato 1.5k', 'Asia/Kolkata');
      assert.equal(parsed.amount?.paise, 150000);
    });

    // ---------------------------------------------------------------- 5. B.5 ROUTING
    console.log('\n--- 5. B.5 Obligation Routing ---');

    await check('Parse "Lent Rahul 5000" -> routes to obligation owed_to_me loan', () => {
      const parsed = parseQuickEntry('Lent Rahul 5000', 'Asia/Kolkata');
      assert.ok(parsed.obligation, 'Must identify obligation');
      assert.equal(parsed.obligation.direction, 'owed_to_me');
      assert.equal(parsed.obligation.type, 'loan');
      assert.equal(parsed.obligation.personName.toLowerCase(), 'rahul');
      assert.equal(parsed.amount?.paise, 500000);
    });

    await check('Parse "Paid 1200 for Priya" -> routes to obligation owed_to_me paid_for', () => {
      const parsed = parseQuickEntry('Paid 1200 for Priya', 'Asia/Kolkata');
      assert.ok(parsed.obligation, 'Must identify obligation');
      assert.equal(parsed.obligation.direction, 'owed_to_me');
      assert.equal(parsed.obligation.type, 'paid_for');
      assert.equal(parsed.obligation.personName.toLowerCase(), 'priya');
      assert.equal(parsed.amount?.paise, 120000);
    });

    await check('Parse "I borrowed 3000 from Amit" -> routes to obligation i_owe borrowed', () => {
      const parsed = parseQuickEntry('I borrowed 3000 from Amit', 'Asia/Kolkata');
      assert.ok(parsed.obligation, 'Must identify obligation');
      assert.equal(parsed.obligation.direction, 'i_owe');
      assert.equal(parsed.obligation.type, 'borrowed');
      assert.equal(parsed.obligation.personName.toLowerCase(), 'amit');
      assert.equal(parsed.amount?.paise, 300000);
    });

    // ---------------------------------------------------------------- 6. INCOME INTENT DETECTION
    console.log('\n--- 6. Income Intent Detection ---');

    await check('Detect income intent: "Salary 50000"', () => {
      assert.equal(parseIncomeIntent('Salary 50000'), true);
      const parsed = parseQuickEntry('Salary 50000', 'Asia/Kolkata');
      assert.equal(parsed.incomeIntent, true);
    });

    await check('Detect income intent: "Freelance 15000", "Got paid 25000", "Interest 500"', () => {
      assert.equal(parseIncomeIntent('Freelance 15000'), true);
      assert.equal(parseIncomeIntent('Got paid 25000'), true);
      assert.equal(parseIncomeIntent('Interest 500'), true);
    });

    await check('ProposeFromText with "Salary 50000" outputs proposal type "income"', async () => {
      const proposal = await proposeFromText(userId, 'Salary 50000');
      assert.equal(proposal.type, 'income');
      assert.equal(proposal.amount, 5000000);
      assert.equal(proposal.categoryName, 'Salary');
    });

    // ---------------------------------------------------------------- 7. EXPLICIT ACCOUNT SAFETY (PHASE D.1.1)
    console.log('\n--- 7. Explicit Account Safety (D.1.1 Audit) ---');

    await check('7.1 Known explicit account: "HDFC Zomato 450" resolves to HDFC account', async () => {
      const proposal = await proposeFromText(userId, 'HDFC Zomato 450');
      assert.equal(proposal.accountId, hdfcId);
      assert.equal(proposal.accountName, 'HDFC Salary Account');
    });

    await check('7.2 Known explicit account: "Zomato 450 from ICICI" resolves to ICICI account', async () => {
      const proposal = await proposeFromText(userId, 'Zomato 450 from ICICI');
      assert.equal(proposal.accountId, iciciId);
      assert.equal(proposal.accountName, 'ICICI Credit Card');
    });

    await check('7.3 Account in different positions: "Amazon 2000 using ICICI" resolves to ICICI', async () => {
      const proposal = await proposeFromText(userId, 'Amazon 2000 using ICICI');
      assert.equal(proposal.accountId, iciciId);
    });

    await check('7.4 Account in different positions: "Zomato 450 ICICI" resolves to ICICI', async () => {
      const proposal = await proposeFromText(userId, 'Zomato 450 ICICI');
      assert.equal(proposal.accountId, iciciId);
    });

    await check('7.5 UNKNOWN EXPLICIT ACCOUNT: "Zomato 450 from Axis" MUST NOT silently fall back to default', async () => {
      const proposal = await proposeFromText(userId, 'Zomato 450 from Axis');
      // User owns HDFC and ICICI, NOT Axis!
      assert.equal(proposal.accountId, null, 'Unmatched explicit account must remain null');
      assert.equal(proposal.accountName, null);
      assert.ok(
        proposal.warnings.some((w) => w.includes('Account "axis" not found')),
        'Warning must prompt user to select an account',
      );
      assert.equal(proposal.confidence, 'low', 'Confidence must be low when explicit account is missing');
    });

    await check('7.6 UNKNOWN EXPLICIT ACCOUNT: "SBI Zomato 450" MUST NOT silently fall back to default', async () => {
      const proposal = await proposeFromText(userId, 'SBI Zomato 450');
      // User does not own SBI account
      assert.equal(proposal.accountId, null, 'Unmatched explicit account must remain null');
      assert.ok(
        proposal.warnings.some((w) => w.includes('Account "sbi" not found')),
        'Warning must prompt user to select an account',
      );
    });

    await check('7.7 Implicit account: "Zomato 450" safely uses default account when no explicit account given', async () => {
      const proposal = await proposeFromText(userId, 'Zomato 450');
      assert.ok(proposal.accountId, 'Implicit account suggestion remains available');
      assert.equal(proposal.accountId, hdfcId);
    });

    // ---------------------------------------------------------------- 8. MERCHANT MEMORY SAFETY (D.1.1 Audit)
    console.log('\n--- 8. Merchant Memory Safety (D.1.1 Audit) ---');

    await check('8.1 Learned HDFC preference is recorded for Swiggy', async () => {
      await rememberMerchant(userId, 'Swiggy', catFood._id, {
        accountId: hdfcId,
        paymentMethod: 'upi',
      });
      const recalled = await recallMerchant(userId, 'Swiggy');
      assert.ok(recalled);
      assert.equal(recalled.preferredAccountId, hdfcId);
    });

    await check('8.2 Explicit input ICICI overrides learned HDFC preference ("Swiggy 300 from ICICI")', async () => {
      const proposal = await proposeFromText(userId, 'Swiggy 300 from ICICI');
      // Must use explicit ICICI, NEVER learned HDFC!
      assert.equal(proposal.accountId, iciciId, 'Explicit ICICI must override learned HDFC');
    });

    await check('8.3 Unmatched explicit account Axis NEVER falls back to learned HDFC ("Swiggy 300 from Axis")', async () => {
      const proposal = await proposeFromText(userId, 'Swiggy 300 from Axis');
      // User does not own Axis, must be null, NEVER learned HDFC!
      assert.equal(proposal.accountId, null, 'Must NOT fall back to learned HDFC');
      assert.ok(proposal.warnings.some((w) => w.includes('Account "axis" not found')));
    });

    await check('8.4 Implicit input uses learned preference ("Swiggy 300")', async () => {
      const proposal = await proposeFromText(userId, 'Swiggy 300');
      assert.equal(proposal.accountId, hdfcId, 'Implicit input safely suggests learned preference');
      assert.equal(proposal.paymentMethod, 'upi');
    });

    // ---------------------------------------------------------------- 9. EXPLICIT PAYMENT METHOD SAFETY
    console.log('\n--- 9. Explicit Payment Method Safety ---');

    await check('9.1 Learned credit_card for Starbucks does NOT override explicit cash', async () => {
      await rememberMerchant(userId, 'Starbucks', catFood._id, {
        paymentMethod: 'credit_card',
      });

      const proposal = await proposeFromText(userId, 'Starbucks 350 cash');
      assert.equal(proposal.paymentMethod, 'cash', 'Explicit cash must be respected');
    });

    await check('9.2 Learned credit_card for Starbucks does NOT override explicit UPI', async () => {
      const proposal = await proposeFromText(userId, 'Starbucks 350 UPI');
      assert.equal(proposal.paymentMethod, 'upi', 'Explicit UPI must be respected');
    });

    // ---------------------------------------------------------------- 10. UNKNOWN MERCHANT HANDLING
    console.log('\n--- 10. Unknown Merchant Handling ---');

    await check('10.1 Obscure merchant extracts name cleanly without category guess', async () => {
      const proposal = await proposeFromText(userId, 'MysteryCafeXYZ 350');
      assert.equal(proposal.amount, 35000);
      assert.ok(proposal.merchant.toLowerCase().includes('mysterycafexyz'));
      // No hallucinated category
      assert.ok(!proposal.categoryId || proposal.confidence === 'low' || proposal.confidence === 'medium');
    });

    // ---------------------------------------------------------------- 11. DUPLICATE PROTECTION & LEGITIMATE REPEATS
    console.log('\n--- 11. Duplicate Protection & Legitimate Repeated Purchases ---');

    await check('11.1 Duplicate protection detects same transaction within 5 minutes', async () => {
      await createTransaction(userId, {
        amount: 45000,
        merchant: "Domino's",
        description: '',
        type: 'expense',
        categoryId: String(catFood._id),
        accountId: hdfcId,
        paymentMethod: 'upi',
        date: new Date(),
      });

      const proposal = await proposeFromText(userId, 'Dominos Pizza 450');
      assert.ok(proposal.possibleDuplicate, 'Must detect duplicate');
      assert.equal(proposal.possibleDuplicate.amount, 45000);
      assert.ok(proposal.warnings.some((w) => w.includes('Similar transaction added')));
    });

    await check('11.2 Legitimate repeated purchase can still be created ("Add anyway")', async () => {
      // User confirms intentional repeat
      const secondTx = await createTransaction(userId, {
        amount: 45000,
        merchant: "Domino's",
        description: 'Second order for guests',
        type: 'expense',
        categoryId: String(catFood._id),
        accountId: hdfcId,
        paymentMethod: 'upi',
        date: new Date(),
      });

      assert.ok(secondTx.id, 'Second legitimate transaction saved successfully');
    });

    // ---------------------------------------------------------------- 12. USER ISOLATION
    console.log('\n--- 12. User Isolation ---');

    await check('12.1 User A cannot match User B account even if explicitly named', async () => {
      // User B owns SBI, User A does not
      const proposalA = await proposeFromText(userId, 'SBI Zomato 450');
      assert.notEqual(proposalA.accountId, sbiOtherId);
      assert.equal(proposalA.accountId, null, 'Unowned account must be null');
    });

    await check('12.2 Duplicate check does NOT flag across different users', async () => {
      // User A just spent ₹450 at Dominos. User B parsing same thing must NOT see duplicate!
      const proposalB = await proposeFromText(otherUserId, 'Dominos Pizza 450');
      assert.equal(proposalB.possibleDuplicate, null, 'User B must not see User A duplicates');
    });

    // ---------------------------------------------------------------- 13. ACCOUNTING REGRESSION AUDIT (Section 7)
    console.log('\n--- 13. Accounting Regression Audit (Section 7) ---');

    const currentRange = { from: new Date(Date.UTC(2026, 8, 1)), to: new Date(Date.UTC(2026, 8, 30, 23, 59, 59)) };
    const previousRange = { from: new Date(Date.UTC(2026, 7, 1)), to: new Date(Date.UTC(2026, 7, 31, 23, 59, 59)) };
    const label = 'September 2026';

    const initialOverview = await getOverview(userId, currentRange, previousRange, label);
    const initialExpenses = initialOverview.personalExpense;
    const initialIncome = initialOverview.income;

    await check('13.1 Expense: Zomato ₹450 -> personalExpense increases by exactly ₹450', async () => {
      await createTransaction(userId, {
        amount: 45000,
        merchant: 'Zomato',
        description: '',
        type: 'expense',
        categoryId: String(catFood._id),
        accountId: hdfcId,
        paymentMethod: 'upi',
        date: new Date('2026-09-17T12:00:00Z'),
      });

      const updated = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(updated.personalExpense - initialExpenses, 45000);
      assert.equal(updated.income, initialIncome, 'Income must remain unchanged');
    });

    await check('13.2 Income: Salary ₹50,000 -> income increases by exactly ₹50,000', async () => {
      await createTransaction(userId, {
        amount: 5000000,
        merchant: 'Employer Inc',
        description: '',
        type: 'income',
        categoryId: String(catIncome._id),
        accountId: hdfcId,
        paymentMethod: 'bank_transfer',
        date: new Date('2026-09-17T12:00:00Z'),
      });

      const updated = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(updated.income - initialIncome, 5000000);
    });

    await check('13.3 Lending: Lent Rahul ₹5,000 -> personalExpense UNCHANGED', async () => {
      const expensesBefore = (await getOverview(userId, currentRange, previousRange, label)).personalExpense;

      const rahul = await createPerson(userId, { name: 'Rahul Sharma' });
      await createMoneyOwed(userId, {
        personId: rahul.id,
        direction: 'owed_to_me',
        type: 'loan',
        amount: 500000,
        purpose: 'Personal loan to Rahul',
        accountId: hdfcId,
      });

      const overviewAfter = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(
        overviewAfter.personalExpense,
        expensesBefore,
        'Lent money must NOT increase personal expense',
      );
    });

    await check('13.4 Borrowing: Borrowed ₹5,000 from Amit -> income UNCHANGED', async () => {
      const incomeBefore = (await getOverview(userId, currentRange, previousRange, label)).income;

      const amit = await createPerson(userId, { name: 'Amit Kumar' });
      await createMoneyOwed(userId, {
        personId: amit.id,
        direction: 'i_owe',
        type: 'borrowed',
        amount: 500000,
        purpose: 'Borrowed for emergency',
        accountId: hdfcId,
      });

      const overviewAfter = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(
        overviewAfter.income,
        incomeBefore,
        'Borrowed money must NOT increase income',
      );
    });

    await check('13.5 Paid for someone: Paid ₹1,200 for Priya -> personalExpense UNCHANGED', async () => {
      const expensesBefore = (await getOverview(userId, currentRange, previousRange, label)).personalExpense;

      const priya = await createPerson(userId, { name: 'Priya Patel' });
      await createMoneyOwed(userId, {
        personId: priya.id,
        direction: 'owed_to_me',
        type: 'paid_for',
        amount: 120000,
        purpose: 'Paid dinner for Priya',
        accountId: hdfcId,
      });

      const overviewAfter = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(
        overviewAfter.personalExpense,
        expensesBefore,
        'Paid for someone obligation must NOT increase personal expense',
      );
    });

    await check('13.6 Transfer: HDFC -> Cash ₹5,000 -> expense/income UNCHANGED', async () => {
      const before = await getOverview(userId, currentRange, previousRange, label);

      await createTransaction(userId, {
        amount: 500000,
        type: 'transfer',
        merchant: '',
        accountId: hdfcId,
        destinationAccountId: cashId,
        description: 'ATM withdrawal',
        paymentMethod: 'other',
        date: new Date('2026-09-17T12:00:00Z'),
      });

      const after = await getOverview(userId, currentRange, previousRange, label);
      assert.equal(
        after.personalExpense,
        before.personalExpense,
        'Transfer must NOT affect personal expense',
      );
      assert.equal(
        after.income,
        before.income,
        'Transfer must NOT affect income',
      );
    });

  } finally {
    await new Promise((r) => setTimeout(r, 200));
    await mongoose.disconnect();
  }

  console.log('\n========================================');
  console.log(`Phase D.1 & D.1.1 Tests Finished: ${passed} Passed, ${failed} Failed`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

void runTests();
