import mongoose from 'mongoose';
import { env } from '../config/env';
import { AccountModel } from '../modules/accounts/account.model';
import { CategoryModel } from '../modules/categories/category.model';
import { UserModel } from '../modules/users/user.model';
import { PersonModel } from '../modules/people/person.model';
import { MoneyOwedModel } from '../modules/moneyOwed/moneyOwed.model';
import { RepaymentModel } from '../modules/moneyOwed/repayment.model';
import { createPerson, getPeopleSummary, listPeople, deletePerson } from '../modules/people/people.service';
import {
  createMoneyOwed,
  recordRepayment,
  writeOffObligation,
  listRepayments,
  deleteMoneyOwed,
} from '../modules/moneyOwed/moneyOwed.service';
import { TransactionModel } from '../modules/transactions/transaction.model';
import { getSummary } from '../modules/transactions/transaction.service';
import { createTransaction } from '../modules/transactions/transaction.service';

async function runTests() {
  console.log('--- Starting Phase B.5 Automated Comprehensive Verification ---');
  await mongoose.connect(env.MONGODB_URI);

  // Setup test user
  const email = `phaseb5_test_${Date.now()}@example.com`;
  const user = await UserModel.create({
    name: 'B5 Tester',
    email,
    passwordHash: 'hash123',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  });
  const userId = String(user._id);

  // Setup test account (HDFC with 50,000 INR = 5,000,000 paise)
  const initialPaise = 50000 * 100;
  const hdfc = await AccountModel.create({
    userId: user._id,
    name: 'HDFC Bank',
    type: 'bank',
    balance: initialPaise,
    currency: 'INR',
    icon: 'landmark',
    color: '#004C8F',
  });
  const accountId = String(hdfc._id);

  // Setup a test category
  const shoppingCategory = await CategoryModel.create({
    userId: user._id,
    name: 'Shopping',
    group: 'Shopping',
    type: 'expense',
    icon: 'shoppingBag',
    color: '#E91E63',
  });
  const categoryId = String(shoppingCategory._id);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Add Person
    // -------------------------------------------------------------
    const rahul = await createPerson(userId, { name: 'Rahul', phone: '9876543210' });
    assert(rahul.name === 'Rahul' && rahul.phone === '9876543210', 'Person Rahul created');

    // -------------------------------------------------------------
    // Scenario 1: Lend Rahul ₹5,000 from HDFC
    // Expected: HDFC -₹5,000, Rahul owes me ₹5,000, Personal expense unchanged (0)
    // -------------------------------------------------------------
    const loan = await createMoneyOwed(userId, {
      personId: rahul.id,
      direction: 'owed_to_me',
      type: 'loan',
      amount: 5000 * 100, // 5,000 INR
      purpose: 'Loan for travel',
      accountId,
    });
    assert(loan.remainingAmount === 5000 * 100, 'Loan record created with ₹5,000 remaining');

    const hdfcAfterLoan = await AccountModel.findById(accountId);
    assert(
      hdfcAfterLoan?.balance === initialPaise - 5000 * 100,
      'HDFC balance decreased by ₹5,000 (now ₹45,000)',
    );

    const analyticsAfterLoan = await getSummary(userId, {});
    assert(
      analyticsAfterLoan.expense === 0,
      'Personal expenses NOT increased by loan (remains ₹0)',
    );

    const peopleListAfterLoan = await listPeople(userId);
    const rahulInList = peopleListAfterLoan.find((p) => p.id === rahul.id);
    assert(rahulInList?.totalOwedToMe === 5000 * 100, 'Rahul totalOwedToMe is ₹5,000');

    // -------------------------------------------------------------
    // Scenario 2: Rahul repays ₹2,000 into HDFC
    // Expected: HDFC +₹2,000 (₹47,000), Rahul owes me ₹3,000, Income unchanged (0)
    // -------------------------------------------------------------
    const repay1 = await recordRepayment(userId, loan.id, {
      amount: 2000 * 100,
      accountId,
      date: new Date(),
      note: 'Partial repayment via UPI',
    });
    assert(repay1.obligation.remainingAmount === 3000 * 100, 'Loan remaining is now ₹3,000');
    assert(repay1.obligation.status === 'active', 'Loan status is still active');

    const hdfcAfterRepay1 = await AccountModel.findById(accountId);
    assert(
      hdfcAfterRepay1?.balance === initialPaise - 3000 * 100,
      'HDFC balance increased by ₹2,000 (now ₹47,000)',
    );

    const analyticsAfterRepay1 = await getSummary(userId, {});
    assert(analyticsAfterRepay1.income === 0, 'Income NOT increased by repayment (remains ₹0)');

    // -------------------------------------------------------------
    // Test: Overpayment rejection
    // -------------------------------------------------------------
    let overpaymentBlocked = false;
    try {
      await recordRepayment(userId, loan.id, {
        amount: 4000 * 100, // exceeds remaining 3,000
        accountId,
        date: new Date(),
      });
    } catch {
      overpaymentBlocked = true;
    }
    assert(overpaymentBlocked, 'Overpayment greater than remaining amount blocked');

    // -------------------------------------------------------------
    // Scenario: Final repayment of ₹3,000
    // Expected: Loan auto-settled, remaining = 0, HDFC = ₹50,000
    // -------------------------------------------------------------
    const repay2 = await recordRepayment(userId, loan.id, {
      amount: 3000 * 100,
      accountId,
      date: new Date(),
      note: 'Full settlement',
    });
    assert(repay2.obligation.remainingAmount === 0, 'Loan remaining is now ₹0');
    assert(repay2.obligation.status === 'settled', 'Loan status automatically marked settled');

    const hdfcAfterRepay2 = await AccountModel.findById(accountId);
    assert(hdfcAfterRepay2?.balance === initialPaise, 'HDFC balance restored to initial ₹50,000');

    // Repayment history check
    const repayments = await listRepayments(userId, loan.id);
    assert(repayments.length === 2, 'Repayment history contains both 2 repayments');

    // -------------------------------------------------------------
    // Scenario 3: "Paid for someone" ₹1,200 for Priya
    // Expected: HDFC -₹1,200 (₹48,800), Priya owes ₹1,200, personal expense still 0
    // -------------------------------------------------------------
    const priya = await createPerson(userId, { name: 'Priya' });
    const paidForPriya = await createMoneyOwed(userId, {
      personId: priya.id,
      direction: 'owed_to_me',
      type: 'paid_for',
      amount: 1200 * 100,
      purpose: 'Amazon purchase',
      categoryId,
      accountId,
    });
    assert(paidForPriya.remainingAmount === 1200 * 100, 'Priya owes ₹1,200 for purchase');

    const hdfcAfterPriya = await AccountModel.findById(accountId);
    assert(
      hdfcAfterPriya?.balance === initialPaise - 1200 * 100,
      'HDFC balance reduced by ₹1,200 (now ₹48,800)',
    );

    const analyticsAfterPriya = await getSummary(userId, {});
    assert(
      analyticsAfterPriya.expense === 0,
      'Paid for someone NOT counted as personal expense (remains ₹0)',
    );

    // -------------------------------------------------------------
    // Scenario 4: Priya pays back ₹1,200
    // Expected: HDFC +₹1,200 (₹50,000), Priya owes ₹0, income still 0
    // -------------------------------------------------------------
    const priyaRepay = await recordRepayment(userId, paidForPriya.id, {
      amount: 1200 * 100,
      accountId,
      date: new Date(),
    });
    assert(priyaRepay.obligation.status === 'settled', 'Priya obligation settled');

    const hdfcAfterPriyaRepay = await AccountModel.findById(accountId);
    assert(
      hdfcAfterPriyaRepay?.balance === initialPaise,
      'HDFC balance restored to initial ₹50,000',
    );

    const analyticsAfterPriyaRepay = await getSummary(userId, {});
    assert(
      analyticsAfterPriyaRepay.income === 0,
      'Priya repayment NOT counted as income (remains ₹0)',
    );

    // -------------------------------------------------------------
    // Scenario 5: Borrow ₹5,000 from Amit
    // Expected: HDFC +₹5,000 (₹55,000), I owe Amit ₹5,000, income still 0
    // -------------------------------------------------------------
    const amit = await createPerson(userId, { name: 'Amit' });
    const borrowedFromAmit = await createMoneyOwed(userId, {
      personId: amit.id,
      direction: 'i_owe',
      type: 'borrowed',
      amount: 5000 * 100,
      purpose: 'Borrowed money for rent',
      accountId,
    });
    assert(borrowedFromAmit.direction === 'i_owe', 'Direction is i_owe');

    const hdfcAfterBorrow = await AccountModel.findById(accountId);
    assert(
      hdfcAfterBorrow?.balance === initialPaise + 5000 * 100,
      'HDFC balance increased by ₹5,000 from borrowing (now ₹55,000)',
    );

    const analyticsAfterBorrow = await getSummary(userId, {});
    assert(
      analyticsAfterBorrow.income === 0,
      'Borrowed money NOT counted as income (remains ₹0)',
    );

    const peopleSummary = await getPeopleSummary(userId);
    assert(peopleSummary.totalIOwe === 5000 * 100, 'People summary totalIOwe is ₹5,000');

    // Repay Amit ₹5,000
    const repayAmit = await recordRepayment(userId, borrowedFromAmit.id, {
      amount: 5000 * 100,
      accountId,
      date: new Date(),
    });
    assert(repayAmit.obligation.status === 'settled', 'Debt to Amit settled');

    const hdfcAfterRepayAmit = await AccountModel.findById(accountId);
    assert(hdfcAfterRepayAmit?.balance === initialPaise, 'HDFC balance returned to ₹50,000');

    // -------------------------------------------------------------
    // Scenario 6: Split Dinner ₹3,000 (myself ₹1,000, Rahul ₹1,000, Priya ₹1,000)
    // -------------------------------------------------------------
    // User pays ₹3,000 out of HDFC.
    // 1) User records own personal share as an expense: ₹1,000
    await createTransaction(userId, {
      type: 'expense',
      amount: 1000 * 100,
      categoryId,
      accountId,
      merchant: 'Dinner Restaurant',
      description: 'Dinner personal share',
      paymentMethod: 'upi',
      date: new Date(),
    });
    // 2) User records Rahul's share as owed to user: ₹1,000
    const rahulDinner = await createMoneyOwed(userId, {
      personId: rahul.id,
      direction: 'owed_to_me',
      type: 'split',
      amount: 1000 * 100,
      purpose: 'Dinner split',
      accountId,
    });
    // 3) User records Priya's share as owed to user: ₹1,000
    const priyaDinner = await createMoneyOwed(userId, {
      personId: priya.id,
      direction: 'owed_to_me',
      type: 'split',
      amount: 1000 * 100,
      purpose: 'Dinner split',
      accountId,
    });

    // Verify account balance:
    // Started at 50,000; -1,000 expense, -1,000 Rahul split, -1,000 Priya split => ₹47,000
    const hdfcAfterDinner = await AccountModel.findById(accountId);
    assert(
      hdfcAfterDinner?.balance === initialPaise - 3000 * 100,
      'HDFC total paid was ₹3,000 (balance now ₹47,000)',
    );

    // Verify analytics: personal expense is exactly ₹1,000 (NOT ₹3,000)
    const analyticsAfterDinner = await getSummary(userId, {});
    assert(
      analyticsAfterDinner.expense === 1000 * 100,
      'Personal expense is exactly my share ₹1,000 (NOT ₹3,000)',
    );

    // -------------------------------------------------------------
    // Test: Write-off safety
    // -------------------------------------------------------------
    const writtenOff = await writeOffObligation(userId, rahulDinner.id, 'Friendly treat');
    assert(writtenOff.status === 'written_off', 'Obligation successfully written off');

    // Deletion protection check: Cannot delete obligation with active or repayment history
    let deleteActiveBlocked = false;
    try {
      await deleteMoneyOwed(userId, priyaDinner.id);
    } catch {
      deleteActiveBlocked = true;
    }
    assert(deleteActiveBlocked, 'Active obligation cannot be silently deleted');

    // Safe delete of person protection: cannot delete person with active obligations
    let deletePersonBlocked = false;
    try {
      await deletePerson(userId, priya.id);
    } catch {
      deletePersonBlocked = true;
    }
    assert(deletePersonBlocked, 'Person with active obligation cannot be deleted');

    // Clean up Priya's active obligation via repayment to allow person deletion
    await recordRepayment(userId, priyaDinner.id, {
      amount: 1000 * 100,
      accountId,
      date: new Date(),
    });

    console.log(`\n========================================`);
    console.log(`Tests Finished: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // Clean up test data
    await UserModel.deleteOne({ _id: user._id });
    await AccountModel.deleteMany({ userId: user._id });
    await CategoryModel.deleteMany({ userId: user._id });
    await PersonModel.deleteMany({ userId: user._id });
    await MoneyOwedModel.deleteMany({ userId: user._id });
    await RepaymentModel.deleteMany({ userId: user._id });
    await TransactionModel.deleteMany({ userId: user._id });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('Fatal error during tests:', err);
  process.exit(1);
});
