import mongoose, { Types } from 'mongoose';
import { env } from '../config/env';
import { AccountModel } from '../modules/accounts/account.model';
import { CategoryModel } from '../modules/categories/category.model';
import { UserModel } from '../modules/users/user.model';
import { PersonModel } from '../modules/people/person.model';
import { MoneyOwedModel } from '../modules/moneyOwed/moneyOwed.model';
import { RepaymentModel } from '../modules/moneyOwed/repayment.model';
import { ReceiptModel } from '../modules/receipts/receipt.model';
import { TransactionModel } from '../modules/transactions/transaction.model';
import { createPerson } from '../modules/people/people.service';
import { createMoneyOwed } from '../modules/moneyOwed/moneyOwed.service';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
  getSummary,
} from '../modules/transactions/transaction.service';
import {
  parseDeterministicSearch,
  parseNaturalLanguageSearch,
  parseSearchAmount,
} from '../modules/transactions/searchParser';
import { listTransactionsSchema } from '../modules/transactions/transaction.schemas';

async function runTests() {
  console.log('=== Starting Phase D.3: Transaction Search, Filters & Detail Intelligence Comprehensive Test Suite ===\n');
  await mongoose.connect(env.MONGODB_URI);
  await ReceiptModel.deleteMany({ publicId: { $regex: '^test_d3_receipt' } });

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // User A Setup
  const userA = await UserModel.create({
    name: 'User A Tester',
    email: `phase_d3_userA_${Date.now()}@example.com`,
    passwordHash: 'hash123',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  });
  const userAId = String(userA._id);

  // User B Setup (for isolation verification)
  const userB = await UserModel.create({
    name: 'User B Tester',
    email: `phase_d3_userB_${Date.now()}@example.com`,
    passwordHash: 'hash123',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  });
  const userBId = String(userB._id);

  // User A Accounts
  const initialHdfcPaise = 50_000 * 100; // ₹50,000
  const hdfc = await AccountModel.create({
    userId: userA._id,
    name: 'HDFC Bank',
    type: 'bank',
    balance: initialHdfcPaise,
    currency: 'INR',
    icon: 'landmark',
    color: '#004C8F',
  });
  const hdfcId = String(hdfc._id);

  const initialIciciPaise = 30_000 * 100; // ₹30,000
  const icici = await AccountModel.create({
    userId: userA._id,
    name: 'ICICI Bank',
    type: 'bank',
    balance: initialIciciPaise,
    currency: 'INR',
    icon: 'landmark',
    color: '#F37021',
  });
  const iciciId = String(icici._id);

  const cash = await AccountModel.create({
    userId: userA._id,
    name: 'Cash',
    type: 'cash',
    balance: 5_000 * 100, // ₹5,000
    currency: 'INR',
    icon: 'wallet',
    color: '#4CAF50',
  });
  const cashId = String(cash._id);

  // User B Account
  const userBAccount = await AccountModel.create({
    userId: userB._id,
    name: 'Axis Bank',
    type: 'bank',
    balance: 10_000 * 100,
    currency: 'INR',
    icon: 'landmark',
    color: '#97144D',
  });
  const userBAccountId = String(userBAccount._id);

  // User A Categories
  const foodCat = await CategoryModel.create({
    userId: userA._id,
    name: 'Food & Dining',
    group: 'Food',
    type: 'expense',
    icon: 'utensils',
    color: '#FF5722',
  });
  const foodCatId = String(foodCat._id);

  const shoppingCat = await CategoryModel.create({
    userId: userA._id,
    name: 'Shopping',
    group: 'Shopping',
    type: 'expense',
    icon: 'shoppingBag',
    color: '#E91E63',
  });
  const shoppingCatId = String(shoppingCat._id);

  const salaryCat = await CategoryModel.create({
    userId: userA._id,
    name: 'Salary',
    group: 'Income',
    type: 'income',
    icon: 'briefcase',
    color: '#4CAF50',
  });
  const salaryCatId = String(salaryCat._id);

  try {
    // =========================================================================
    // 1. Search & Structured Filter Tests (Section 38)
    // =========================================================================
    console.log('--- 1. Search & Filter Capabilities ---');

    // Create a base set of transactions
    const now = new Date();
    await createTransaction(userAId, {
      type: 'expense',
      amount: 450 * 100, // ₹450
      merchant: 'Zomato',
      description: 'Dinner delivery',
      categoryId: foodCatId,
      accountId: hdfcId,
      paymentMethod: 'upi',
      date: now,
    });

    await createTransaction(userAId, {
      type: 'expense',
      amount: 3200 * 100, // ₹3,200
      merchant: 'Amazon',
      description: 'Wireless headphones',
      categoryId: shoppingCatId,
      accountId: iciciId,
      paymentMethod: 'credit_card',
      date: now,
    });

    await createTransaction(userAId, {
      type: 'expense',
      amount: 1200 * 100, // ₹1,200
      merchant: 'IndianOil Petrol',
      description: 'Fuel for car',
      categoryId: foodCatId,
      accountId: cashId,
      paymentMethod: 'cash',
      date: now,
    });

    await createTransaction(userAId, {
      type: 'income',
      amount: 50_000 * 100, // ₹50,000
      merchant: 'Acme Corp',
      description: 'Monthly salary payout',
      categoryId: salaryCatId,
      accountId: hdfcId,
      paymentMethod: 'net_banking',
      date: now,
    });

    // 1.1 Merchant Search
    const searchZomato = await listTransactions(userAId, {
      search: 'Zomato',
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      searchZomato.transactions.length === 1 && searchZomato.transactions[0]?.merchant === 'Zomato',
      '1.1 Merchant search finds "Zomato"',
    );

    // 1.2 Note / Description Search
    const searchHeadphones = await listTransactions(userAId, {
      q: 'headphones',
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      searchHeadphones.transactions.length === 1 && searchHeadphones.transactions[0]?.merchant === 'Amazon',
      '1.2 Note search finds "headphones" -> Amazon transaction',
    );

    // 1.3 Category Filter
    const filterFood = await listTransactions(userAId, {
      categoryId: foodCatId,
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      filterFood.transactions.length === 2 &&
        filterFood.transactions.every((t) => t.categoryId === foodCatId),
      '1.3 Category filter returns matching food transactions',
    );

    // 1.4 Type Filter
    const filterIncome = await listTransactions(userAId, {
      type: 'income',
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      filterIncome.transactions.length === 1 && filterIncome.transactions[0]?.amount === 5000000,
      '1.4 Type filter returns only income',
    );

    // 1.5 Account Filter
    const filterHdfc = await listTransactions(userAId, {
      accountId: hdfcId,
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      filterHdfc.transactions.length === 2 &&
        filterHdfc.transactions.every((t) => t.accountId === hdfcId),
      '1.5 Account filter returns transactions touching HDFC',
    );

    // 1.6 Payment Method Filter
    const filterCash = await listTransactions(userAId, {
      paymentMethod: 'cash',
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      filterCash.transactions.length === 1 && filterCash.transactions[0]?.paymentMethod === 'cash',
      '1.6 Payment method filter returns cash transaction',
    );

    // 1.7 Amount Min
    const filterMin = await listTransactions(userAId, {
      minAmount: 2000 * 100, // >= ₹2,000
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      filterMin.transactions.length === 2 &&
        filterMin.transactions.every((t) => t.amount >= 200000),
      '1.7 Amount min filter (>= ₹2,000) returns Amazon & Salary',
    );

    // 1.8 Amount Max
    const filterMax = await listTransactions(userAId, {
      maxAmount: 1000 * 100, // <= ₹1,000
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      filterMax.transactions.length === 1 && filterMax.transactions[0]?.merchant === 'Zomato',
      '1.8 Amount max filter (<= ₹1,000) returns only Zomato',
    );

    // 1.9 Amount Range
    const filterRange = await listTransactions(userAId, {
      minAmount: 1000 * 100,
      maxAmount: 3500 * 100,
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      filterRange.transactions.length === 2 &&
        filterRange.transactions.every((t) => t.amount >= 100000 && t.amount <= 350000),
      '1.9 Amount range filter (₹1,000 - ₹3,500) returns Petrol & Amazon',
    );

    // 1.10 Combined Filters
    const combined = await listTransactions(userAId, {
      type: 'expense',
      accountId: iciciId,
      paymentMethod: 'credit_card',
      minAmount: 200000,
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      combined.transactions.length === 1 && combined.transactions[0]?.merchant === 'Amazon',
      '1.10 Combined filters (Expense + ICICI + Credit Card + >=₹2,000) returns exact match',
    );

    // 1.11 Filtered Summary (Section 32)
    assert(
      combined.summary.count === 1 && combined.summary.totalExpense === 320000,
      '1.11 Filtered summary reports accurate count and total expense for matched subset',
    );

    // =========================================================================
    // 2. Security & Query Injection Tests (Section 36, 37, 39)
    // =========================================================================
    console.log('\n--- 2. Security & Query Injection Protection ---');

    // 2.1 User Isolation: User B cannot see User A's transactions
    const userBSearch = await listTransactions(userBId, {
      search: 'Zomato',
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      userBSearch.transactions.length === 0,
      '2.1 User Isolation: User B cannot see User A transactions',
    );

    // 2.2 User A cannot query with User B's account
    // A query for User B's account under User A must return 0 documents
    const crossAccountQuery = await listTransactions(userAId, {
      accountId: userBAccountId,
      page: 1,
      limit: 25,
      sort: '-date',
    });
    assert(
      crossAccountQuery.transactions.length === 0,
      '2.2 User A querying with User B accountId yields 0 results (scoped to userId)',
    );

    // 2.3 Injection Attack: $where or raw operator strings in search
    const maliciousQuery = {
      q: '{"$where": "sleep(1000)"}',
      page: 1,
      limit: 25,
      sort: '-date' as const,
    };
    const injectionResult = await listTransactions(userAId, maliciousQuery);
    assert(
      injectionResult.transactions.length === 0,
      '2.3 Injection Attack: Raw JSON/operators in search safely treated as literal text',
    );

    // 2.4 Pagination limits enforced
    const paginationTest = listTransactionsSchema.safeParse({ limit: 500 });
    assert(
      !paginationTest.success,
      '2.4 Excessive pagination limit (>100) is rejected by schema',
    );

    // 2.5 Malformed Dates rejected
    const malformedDateTest = listTransactionsSchema.safeParse({
      from: 'invalid-date-string',
    });
    assert(
      !malformedDateTest.success,
      '2.5 Malformed date parameter is rejected by schema',
    );

    // 2.6 Reversed amount range rejected
    const reversedAmountTest = listTransactionsSchema.safeParse({
      minAmount: 5000,
      maxAmount: 2000,
    });
    assert(
      !reversedAmountTest.success,
      '2.6 Reversed amount range (min > max) is rejected by schema',
    );

    // =========================================================================
    // 3. Accounting Invariants on Edit — HIGH PRIORITY (Section 20, 21, 23, 40)
    // =========================================================================
    console.log('\n--- 3. Accounting Invariants on Edit (HIGH PRIORITY) ---');

    // 3.1 Amount Increase: ₹500 -> ₹700 (Delta: -₹200)
    const initialHdfcBal = (await AccountModel.findById(hdfcId))!.balance;
    const editTx = await createTransaction(userAId, {
      type: 'expense',
      amount: 500 * 100, // ₹500
      merchant: 'Coffee Shop',
      description: 'Coffee',
      categoryId: foodCatId,
      accountId: hdfcId,
      paymentMethod: 'upi',
      date: now,
    });

    const balAfterCreate = (await AccountModel.findById(hdfcId))!.balance;
    assert(
      balAfterCreate === initialHdfcBal - 50000,
      '3.1a Expense creation debited ₹500 from HDFC',
    );

    // Edit amount to ₹700
    await updateTransaction(userAId, editTx.id, {
      amount: 700 * 100, // ₹700
    });

    const balAfterIncrease = (await AccountModel.findById(hdfcId))!.balance;
    assert(
      balAfterIncrease === balAfterCreate - 20000,
      '3.1b Amount Increase: ₹500 -> ₹700 debited exactly delta -₹200 from HDFC',
    );

    // 3.2 Amount Decrease: ₹700 -> ₹400 (Delta: +₹300)
    await updateTransaction(userAId, editTx.id, {
      amount: 400 * 100, // ₹400
    });

    const balAfterDecrease = (await AccountModel.findById(hdfcId))!.balance;
    assert(
      balAfterDecrease === balAfterIncrease + 30000,
      '3.2 Amount Decrease: ₹700 -> ₹400 restored exactly delta +₹300 to HDFC',
    );

    // 3.3 Account Switch: HDFC -> ICICI
    const hdfcBeforeSwitch = (await AccountModel.findById(hdfcId))!.balance;
    const iciciBeforeSwitch = (await AccountModel.findById(iciciId))!.balance;

    await updateTransaction(userAId, editTx.id, {
      accountId: iciciId,
    });

    const hdfcAfterSwitch = (await AccountModel.findById(hdfcId))!.balance;
    const iciciAfterSwitch = (await AccountModel.findById(iciciId))!.balance;

    assert(
      hdfcAfterSwitch === hdfcBeforeSwitch + 40000,
      '3.3a Account Switch: Old account (HDFC) restored by ₹400',
    );
    assert(
      iciciAfterSwitch === iciciBeforeSwitch - 40000,
      '3.3b Account Switch: New account (ICICI) debited by ₹400 (no double accounting)',
    );

    // 3.4 Amount + Account Change Simultaneously: ₹400 ICICI -> ₹600 HDFC
    const hdfcBeforeBoth = (await AccountModel.findById(hdfcId))!.balance;
    const iciciBeforeBoth = (await AccountModel.findById(iciciId))!.balance;

    await updateTransaction(userAId, editTx.id, {
      accountId: hdfcId,
      amount: 600 * 100, // ₹600
    });

    const hdfcAfterBoth = (await AccountModel.findById(hdfcId))!.balance;
    const iciciAfterBoth = (await AccountModel.findById(iciciId))!.balance;

    assert(
      iciciAfterBoth === iciciBeforeBoth + 40000,
      '3.4a Simultaneous Change: Old account (ICICI) restored by original ₹400',
    );
    assert(
      hdfcAfterBoth === hdfcBeforeBoth - 60000,
      '3.4b Simultaneous Change: New account (HDFC) debited by new amount ₹600',
    );

    // 3.5 Transfer Editing: HDFC -> Cash ₹1,000 changed to ICICI -> Cash ₹1,000
    const hdfcPreTransfer = (await AccountModel.findById(hdfcId))!.balance;
    const iciciPreTransfer = (await AccountModel.findById(iciciId))!.balance;
    const cashPreTransfer = (await AccountModel.findById(cashId))!.balance;

    const transferTx = await createTransaction(userAId, {
      type: 'transfer',
      amount: 1000 * 100, // ₹1,000
      merchant: '',
      description: 'Transfer',
      paymentMethod: 'other',
      accountId: hdfcId,
      destinationAccountId: cashId,
      date: now,
    });

    const hdfcAfterTransferCreate = (await AccountModel.findById(hdfcId))!.balance;
    const cashAfterTransferCreate = (await AccountModel.findById(cashId))!.balance;

    assert(
      hdfcAfterTransferCreate === hdfcPreTransfer - 100000 &&
        cashAfterTransferCreate === cashPreTransfer + 100000,
      '3.5a Transfer created: HDFC -₹1,000, Cash +₹1,000',
    );

    // Change source account from HDFC to ICICI
    await updateTransaction(userAId, transferTx.id, {
      accountId: iciciId,
      destinationAccountId: cashId,
    });

    const hdfcAfterTransferEdit = (await AccountModel.findById(hdfcId))!.balance;
    const iciciAfterTransferEdit = (await AccountModel.findById(iciciId))!.balance;
    const cashAfterTransferEdit = (await AccountModel.findById(cashId))!.balance;

    assert(
      hdfcAfterTransferEdit === hdfcPreTransfer,
      '3.5b Transfer Edit: HDFC restored back to pre-transfer balance',
    );
    assert(
      iciciAfterTransferEdit === iciciPreTransfer - 100000,
      '3.5c Transfer Edit: ICICI debited by ₹1,000',
    );
    assert(
      cashAfterTransferEdit === cashAfterTransferCreate,
      '3.5d Transfer Edit: Cash destination unchanged and preserved correctly',
    );

    // 3.6 Category Change: Food -> Shopping
    await updateTransaction(userAId, editTx.id, {
      categoryId: shoppingCatId,
    });
    const txAfterCat = await getTransaction(userAId, editTx.id);
    assert(
      txAfterCat.categoryId === shoppingCatId,
      '3.6 Category changed from Food to Shopping',
    );

    // 3.7 Merchant Change: Zomato -> Swiggy
    await updateTransaction(userAId, editTx.id, {
      merchant: 'Swiggy',
    });
    const txAfterMerch = await getTransaction(userAId, editTx.id);
    assert(
      txAfterMerch.merchant === 'Swiggy',
      '3.7 Merchant changed to Swiggy',
    );

    // 3.8 Receipt Preservation during edit
    const receiptDoc = await ReceiptModel.create({
      userId: userA._id,
      publicId: `test_d3_receipt_1_${Date.now()}`,
      url: 'https://res.cloudinary.com/demo/image/upload/sample1.jpg',
      bytes: 15420,
      extraction: {
        merchant: 'Swiggy',
        amount: 60000,
        currency: 'INR',
        date: now,
      },
      transactionId: new Types.ObjectId(editTx.id),
    });

    // Edit description/amount of the transaction
    await updateTransaction(userAId, editTx.id, {
      description: 'Late night snack',
    });

    const receiptAfterEdit = await ReceiptModel.findById(receiptDoc._id);
    assert(
      String(receiptAfterEdit?.transactionId) === editTx.id,
      '3.8 Receipt remains attached to transaction after editing fields',
    );

    // =========================================================================
    // 4. Accounting Invariants on Delete — HIGH PRIORITY (Section 27, 28, 41)
    // =========================================================================
    console.log('\n--- 4. Accounting Invariants on Delete (HIGH PRIORITY) ---');

    // 4.1 Expense Deletion restores balance
    const hdfcBalBeforeDelete = (await AccountModel.findById(hdfcId))!.balance;
    await deleteTransaction(userAId, editTx.id);
    const hdfcBalAfterDelete = (await AccountModel.findById(hdfcId))!.balance;
    assert(
      hdfcBalAfterDelete === hdfcBalBeforeDelete + 60000,
      '4.1 Expense Deletion: HDFC balance restored by exactly ₹600',
    );

    // 4.2 Receipt Detachment: Receipt image preserved in storage, detached from deleted transaction
    const receiptAfterDelete = await ReceiptModel.findById(receiptDoc._id);
    assert(
      receiptAfterDelete !== null && receiptAfterDelete.transactionId === null,
      '4.2 Receipt Preserved: Receipt detached rather than destroyed when transaction is deleted',
    );

    // 4.3 Transfer Deletion restores BOTH accounts
    const iciciPreTransferDel = (await AccountModel.findById(iciciId))!.balance;
    const cashPreTransferDel = (await AccountModel.findById(cashId))!.balance;

    await deleteTransaction(userAId, transferTx.id);

    const iciciPostTransferDel = (await AccountModel.findById(iciciId))!.balance;
    const cashPostTransferDel = (await AccountModel.findById(cashId))!.balance;

    assert(
      iciciPostTransferDel === iciciPreTransferDel + 100000,
      '4.3a Transfer Deletion: Source account (ICICI) restored by +₹1,000',
    );
    assert(
      cashPostTransferDel === cashPreTransferDel - 100000,
      '4.3b Transfer Deletion: Destination account (Cash) deducted by -₹1,000',
    );

    // =========================================================================
    // 5. B.5 Deletion Protection (Section 30, 42)
    // =========================================================================
    console.log('\n--- 5. B.5 Deletion Protection ---');

    const rahul = await createPerson(userAId, { name: 'Rahul Sharma' });
    const loanObligation = await createMoneyOwed(userAId, {
      personId: rahul.id,
      direction: 'owed_to_me',
      type: 'loan',
      amount: 5000 * 100, // ₹5,000
      purpose: 'Emergency loan',
      accountId: hdfcId,
    });

    // Attempt to delete active obligation via transaction delete endpoint
    let b5DeleteBlocked = false;
    try {
      await deleteTransaction(userAId, loanObligation.id);
    } catch (err: any) {
      if (err?.message?.includes('People & Money Owed')) {
        b5DeleteBlocked = true;
      }
    }
    assert(
      b5DeleteBlocked,
      '5.1 B.5 Protection: Active obligation cannot be deleted via transaction endpoint',
    );

    // =========================================================================
    // 6. Natural Language Search Parser (Section 43, 12, 13, 14, 15)
    // =========================================================================
    console.log('\n--- 6. Natural Language Search Parsing ---');

    // 6.1 "Zomato expenses this month"
    const p1 = parseDeterministicSearch('Zomato expenses this month', 'Asia/Kolkata', now);
    assert(
      p1.understood.merchant === 'Zomato' &&
        p1.understood.type === 'expense' &&
        p1.understood.periodLabel === 'This month' &&
        p1.confidence === 'high',
      '6.1 Parses "Zomato expenses this month" deterministically with high confidence',
    );

    // 6.2 "Amazon over ₹2,000"
    const p2 = parseDeterministicSearch('Amazon over ₹2,000', 'Asia/Kolkata', now);
    assert(
      p2.understood.merchant === 'Amazon' && p2.understood.minAmount === 200000,
      '6.2 Parses "Amazon over ₹2,000" -> minAmount 200,000 paise',
    );

    // 6.3 "Cash expenses last week"
    const p3 = parseDeterministicSearch('Cash expenses last week', 'Asia/Kolkata', now);
    assert(
      p3.understood.paymentMethod === 'cash' &&
        p3.understood.type === 'expense' &&
        p3.understood.periodLabel === 'Last week',
      '6.3 Parses "Cash expenses last week" -> method: cash, period: Last week',
    );

    // 6.4 "Everything I spent on food in August"
    const p4 = parseDeterministicSearch('Everything I spent on food in August', 'Asia/Kolkata', now);
    assert(
      Boolean(
        p4.understood.categoryName === 'Food & Dining' &&
          p4.understood.type === 'expense' &&
          p4.understood.periodLabel?.includes('August'),
      ),
      '6.4 Parses "Everything I spent on food in August" -> Food & Dining, August',
    );

    // 6.5 Indian Currency Normalization: ₹1,25,000, Rs 125000, INR 125000
    const amt1 = parseSearchAmount('expenses above ₹1,25,000');
    const amt2 = parseSearchAmount('Rs 125000');
    const amt3 = parseSearchAmount('INR 125000');
    assert(
      amt1?.minAmount === 12500000 && amt2?.minAmount === 12500000 && amt3?.minAmount === 12500000,
      '6.5 Normalizes Indian currency strings (₹1,25,000, Rs 125000, INR 125000) to 12,500,000 paise',
    );

    // 6.6 Amount Ranges: ₹500-₹2,000 and "between ₹500 and ₹2,000"
    const range1 = parseSearchAmount('₹500-₹2,000');
    const range2 = parseSearchAmount('between ₹500 and ₹2,000');
    assert(
      range1?.minAmount === 50000 &&
        range1?.maxAmount === 200000 &&
        range2?.minAmount === 50000 &&
        range2?.maxAmount === 200000,
      '6.6 Parses amount ranges "₹500-₹2,000" and "between ₹500 and ₹2,000"',
    );

    // 6.7 End-to-end Natural Language Search Service with entity mapping
    const nlResult = await parseNaturalLanguageSearch(userAId, 'Transactions from HDFC');
    assert(
      nlResult.filters.accountId === hdfcId,
      '6.7 parseNaturalLanguageSearch maps "from HDFC" to user A HDFC accountId',
    );

    // 6.8 B.5 intent: "Lent Rahul 5000"
    const b5Nl = parseDeterministicSearch('Lent Rahul 5000', 'Asia/Kolkata', now);
    assert(
      b5Nl.understood.obligationIntent?.personName === 'Rahul' &&
        b5Nl.understood.obligationIntent?.type === 'loan',
      '6.8 "Lent Rahul 5000" routes to obligation intent instead of personal expense',
    );

    // =========================================================================
    // 7. All 10 E2E Scenarios (Section 44-53)
    // =========================================================================
    console.log('\n--- 7. E2E Scenarios (Scenarios 1 through 10) ---');

    // Scenario 1: Search
    const e2e1 = await listTransactions(userAId, { search: 'Zomato', page: 1, limit: 10, sort: '-date' });
    assert(e2e1.transactions.some((t) => t.merchant === 'Zomato'), 'Scenario 1: Search Zomato appears');

    // Scenario 2: Amount Filter
    const e2e2 = await listTransactions(userAId, { minAmount: 200000, page: 1, limit: 10, sort: '-date' });
    assert(e2e2.transactions.some((t) => t.merchant === 'Amazon'), 'Scenario 2: Amazon appears for > ₹2,000');

    // Scenario 3: Date
    const augFrom = new Date(now.getFullYear(), 7, 1);
    const augTo = new Date(now.getFullYear(), 7, 31, 23, 59, 59);
    const augTx = await createTransaction(userAId, {
      type: 'expense',
      amount: 1500 * 100,
      merchant: 'August Book Store',
      description: 'Books',
      categoryId: shoppingCatId,
      accountId: hdfcId,
      paymentMethod: 'upi',
      date: augFrom,
    });
    const e2e3 = await listTransactions(userAId, {
      from: augFrom,
      to: augTo,
      page: 1,
      limit: 10,
      sort: '-date',
    });
    assert(
      e2e3.transactions.length === 1 && e2e3.transactions[0]?.id === augTx.id,
      'Scenario 3: Only August transactions appear for August filter',
    );

    // Scenario 4: Combined Filters
    const e2e4 = await listTransactions(userAId, {
      accountId: hdfcId,
      categoryId: foodCatId,
      page: 1,
      limit: 10,
      sort: '-date',
    });
    assert(
      e2e4.transactions.every((t) => t.accountId === hdfcId && t.categoryId === foodCatId),
      'Scenario 4: Combined filters returns only matching transactions',
    );

    // Scenario 5: Edit Amount
    const zomatoTx = await createTransaction(userAId, {
      type: 'expense',
      amount: 450 * 100,
      merchant: 'Zomato Scenario 5',
      description: 'Dinner',
      categoryId: foodCatId,
      accountId: hdfcId,
      paymentMethod: 'upi',
      date: now,
    });
    const hdfcBeforeE2E5 = (await AccountModel.findById(hdfcId))!.balance;
    const summaryBeforeE2E5 = await getSummary(userAId, {});

    await updateTransaction(userAId, zomatoTx.id, {
      amount: 500 * 100, // ₹450 -> ₹500 (+₹50 expense)
    });

    const hdfcAfterE2E5 = (await AccountModel.findById(hdfcId))!.balance;
    const summaryAfterE2E5 = await getSummary(userAId, {});

    assert(
      hdfcAfterE2E5 === hdfcBeforeE2E5 - 5000,
      'Scenario 5a: HDFC decreases by exactly ₹50 upon amount edit',
    );
    assert(
      summaryAfterE2E5.expense === summaryBeforeE2E5.expense + 5000,
      'Scenario 5b: Analytics personal spending increases by exactly ₹50',
    );

    // Scenario 6: Edit Account
    const hdfcBeforeE2E6 = (await AccountModel.findById(hdfcId))!.balance;
    const iciciBeforeE2E6 = (await AccountModel.findById(iciciId))!.balance;

    await updateTransaction(userAId, zomatoTx.id, {
      accountId: iciciId,
    });

    const hdfcAfterE2E6 = (await AccountModel.findById(hdfcId))!.balance;
    const iciciAfterE2E6 = (await AccountModel.findById(iciciId))!.balance;

    assert(
      hdfcAfterE2E6 === hdfcBeforeE2E6 + 50000,
      'Scenario 6a: HDFC restored by original ₹500',
    );
    assert(
      iciciAfterE2E6 === iciciBeforeE2E6 - 50000,
      'Scenario 6b: ICICI debited by ₹500 (no double accounting)',
    );

    // Scenario 7: Delete
    const iciciBeforeE2E7 = (await AccountModel.findById(iciciId))!.balance;
    const summaryBeforeE2E7 = await getSummary(userAId, {});

    await deleteTransaction(userAId, zomatoTx.id);

    const iciciAfterE2E7 = (await AccountModel.findById(iciciId))!.balance;
    const summaryAfterE2E7 = await getSummary(userAId, {});

    assert(
      iciciAfterE2E7 === iciciBeforeE2E7 + 50000,
      'Scenario 7a: ICICI balance restored by ₹500 upon deletion',
    );
    assert(
      summaryAfterE2E7.expense === summaryBeforeE2E7.expense - 50000,
      'Scenario 7b: Analytics spending returns to previous state after deletion',
    );

    // Scenario 8: Receipt attached and preserved on edit
    const receiptTx = await createTransaction(userAId, {
      type: 'expense',
      amount: 1200 * 100,
      merchant: 'Pharmacy',
      description: 'Medicine',
      categoryId: shoppingCatId,
      accountId: hdfcId,
      paymentMethod: 'upi',
      date: now,
    });
    const receiptD2 = await ReceiptModel.create({
      userId: userA._id,
      publicId: `test_d3_receipt_2_${Date.now()}`,
      url: 'https://res.cloudinary.com/demo/image/upload/sample2.jpg',
      bytes: 22000,
      transactionId: new Types.ObjectId(receiptTx.id),
    });

    await updateTransaction(userAId, receiptTx.id, {
      description: 'Medicine purchase for allergy',
    });
    const receiptCheck = await ReceiptModel.findById(receiptD2._id);
    assert(
      String(receiptCheck?.transactionId) === receiptTx.id,
      'Scenario 8: Attached receipt remains attached after editing transaction',
    );

    // Scenario 9: B.5 Search "Lent Rahul 5000"
    const parseLent = parseDeterministicSearch('Lent Rahul 5000', 'Asia/Kolkata', now);
    assert(
      parseLent.understood.obligationIntent?.type === 'loan',
      'Scenario 9: Search "Lent Rahul 5000" routes to obligation, not ordinary expense',
    );

    // Scenario 10: User Isolation
    const userASearchAll = await listTransactions(userAId, { page: 1, limit: 100, sort: '-date' });
    const userBSearchAll = await listTransactions(userBId, { page: 1, limit: 100, sort: '-date' });
    assert(
      userASearchAll.transactions.length > 0 &&
        userBSearchAll.transactions.length === 0,
      'Scenario 10: User A search returns User A transactions, User B sees none',
    );

    console.log(`\n========================================`);
    console.log(`Phase D.3 Tests Finished: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // Cleanup test data
    await UserModel.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    await AccountModel.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await CategoryModel.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await TransactionModel.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await PersonModel.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await MoneyOwedModel.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await RepaymentModel.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await ReceiptModel.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('Fatal error during Phase D.3 tests:', err);
  process.exit(1);
});
