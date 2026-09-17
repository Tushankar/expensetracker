import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { env } from '../config/env';
import { AccountModel } from '../modules/accounts/account.model';
import { CategoryModel } from '../modules/categories/category.model';
import { UserModel } from '../modules/users/user.model';
import {
  parseReceiptData,
  selectAuthoritativeTotal,
  toPaise,
} from '../modules/receipts/receipt.extract';
import {
  matchReceiptEntities,
  recordUpload,
  getReceipt,
  deleteReceipt,
  attachReceipt,
} from '../modules/receipts/receipt.service';
import { createTransaction } from '../modules/transactions/transaction.service';
import { rememberMerchant } from '../modules/merchants/merchant.service';
import { getOverview } from '../modules/analytics/analytics.service';
import { createPerson } from '../modules/people/people.service';
import { createMoneyOwed } from '../modules/moneyOwed/moneyOwed.service';
import { sign } from '../lib/cloudinary';

async function runTests() {
  console.log('=== Starting Phase D.2: Receipt Intelligence & OCR Comprehensive Test Suite ===\n');
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
    const userA = await UserModel.create({
      name: 'User A Auditor',
      email: `usera_${runId}@paisa.test`,
      passwordHash: 'secret_hash',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    const userAId = String(userA._id);

    const userB = await UserModel.create({
      name: 'User B Auditor',
      email: `userb_${runId}@paisa.test`,
      passwordHash: 'secret_hash',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    const userBId = String(userB._id);

    // Accounts for User A: HDFC only
    const hdfcA = await AccountModel.create({
      userId: userA._id,
      name: 'HDFC Salary Account',
      type: 'savings',
      balance: 10000000, // ₹1,00,000
    });
    const hdfcAId = String(hdfcA._id);

    const cashA = await AccountModel.create({
      userId: userA._id,
      name: 'Cash In Hand',
      type: 'cash',
      balance: 500000, // ₹5,000
    });
    const cashAId = String(cashA._id);

    // Account for User B: ICICI only
    await AccountModel.create({
      userId: userB._id,
      name: 'ICICI Bank',
      type: 'savings',
      balance: 5000000,
    });

    // Standard Categories for User A
    const catFoodA = await CategoryModel.create({
      userId: userA._id,
      name: 'Food & Dining',
      type: 'expense',
      group: 'food',
      color: '#FF6B6B',
      icon: 'utensils',
      sortOrder: 1,
    });
    const catFoodAId = String(catFoodA._id);

    const catGroceriesA = await CategoryModel.create({
      userId: userA._id,
      name: 'Groceries',
      type: 'expense',
      group: 'groceries',
      color: '#4ECDC4',
      icon: 'shopping-cart',
      sortOrder: 2,
    });
    const catGroceriesAId = String(catGroceriesA._id);

    const catSalaryA = await CategoryModel.create({
      userId: userA._id,
      name: 'Salary',
      type: 'income',
      group: 'income',
      color: '#2EC4B6',
      icon: 'briefcase',
      sortOrder: 10,
    });

    console.log('--- 1. Extraction & Schema Parsing ---');

    await check('1.1 Parse structured receipt fields (merchant, amount, breakdown, items)', () => {
      const raw = {
        merchant: 'DMart Supermarket',
        total: '2380.00',
        totalLabel: 'GRAND TOTAL Rs 2,380.00',
        subtotal: '2150.00',
        tax: '280.00',
        discount: '50.00',
        date: '2026-09-17',
        categoryHint: 'Groceries',
        paymentMethod: 'upi',
        confidence: 'high',
        items: [
          { name: 'Aashirvaad Atta 10kg', amount: '450.00' },
          { name: 'Amul Butter 500g', amount: '275.00' },
        ],
      };

      const extracted = parseReceiptData(raw, 'Asia/Kolkata');
      assert.equal(extracted.merchant, 'DMart Supermarket');
      assert.equal(extracted.amount, 238000, 'paise conversion for ₹2380');
      assert.equal(extracted.subtotal, 215000);
      assert.equal(extracted.tax, 28000);
      assert.equal(extracted.discount, 5000);
      assert.equal(extracted.paymentMethod, 'upi');
      assert.equal(extracted.categoryHint, 'Groceries');
      assert.equal(extracted.confidence, 'high');
      assert.equal(extracted.items.length, 2);
      assert.equal(extracted.items[0]?.name, 'Aashirvaad Atta 10kg');
      assert.equal(extracted.items[0]?.amount, 45000);
    });

    console.log('\n--- 2. Total Amount Selection Priority (Section 8) ---');

    await check('2.1 Contextual priority: Grand Total ₹2,330 vs Subtotal ₹2,100 vs GST ₹280 vs Discount ₹50', () => {
      // Subtotal ₹2,100, GST ₹280, Discount ₹50, Grand Total ₹2,330
      // Transaction amount MUST be ₹2,330, NOT ₹2,100, NOT ₹280, NOT ₹2,380
      const chosen = selectAuthoritativeTotal(
        233000, // Grand Total ₹2,330
        210000, // Subtotal ₹2,100
        28000,  // GST ₹280
        5000,   // Discount ₹50
      );
      assert.equal(chosen, 233000, 'Must choose final Grand Total ₹2,330');
    });

    await check('2.2 Fallback total calculation when explicit grand total missing', () => {
      // Subtotal 2100 + Tax 280 - Discount 50 = 2330
      const calculated = selectAuthoritativeTotal(null, 210000, 28000, 5000);
      assert.equal(calculated, 233000);
    });

    await check('2.3 Parser selects Grand Total over subtotal when both present in receipt payload', () => {
      const raw = {
        merchant: 'DMart',
        total: '2330.00',
        totalLabel: 'Net Payable Rs 2330.00',
        subtotal: '2100.00',
        tax: '280.00',
        discount: '50.00',
      };
      const extracted = parseReceiptData(raw, 'Asia/Kolkata');
      assert.equal(extracted.amount, 233000);
      assert.notEqual(extracted.amount, 210000, 'Must NOT be subtotal');
      assert.notEqual(extracted.amount, 28000, 'Must NOT be tax');
      assert.notEqual(extracted.amount, 238000, 'Must NOT ignore discount');
    });

    console.log('\n--- 3. Indian Currency & Number Formats ---');

    await check('3.1 Parses Indian format variations: ₹, Rs, INR, commas, decimals', () => {
      assert.equal(toPaise('₹1,200'), 120000);
      assert.equal(toPaise('Rs 1200'), 120000);
      assert.equal(toPaise('INR 1200'), 120000);
      assert.equal(toPaise('₹1,25,000'), 12500000);
      assert.equal(toPaise('450.50'), 45050);
      assert.equal(toPaise('2380'), 238000);
    });

    await check('3.2 Rejects absurd figures (>1 crore or negative/zero)', () => {
      assert.equal(toPaise('-500'), null);
      assert.equal(toPaise('0'), null);
      assert.equal(toPaise('10000000000'), null); // > 100 crore
      assert.equal(toPaise('not a number'), null);
    });

    console.log('\n--- 4. Missing Fields & Graceful Defaults ---');

    await check('4.1 Missing date defaults safely to today with isDateDefault=true and warning', () => {
      const extracted = parseReceiptData({ merchant: 'Cafe Coffee Day', total: '180' }, 'Asia/Kolkata');
      assert.equal(extracted.isDateDefault, true);
      assert.ok(extracted.warnings.some((w) => w.includes('date not found')));
      assert.equal(extracted.confidenceDetails.date, 'needs_review');
    });

    await check('4.2 Missing payment method and account left null for user selection', () => {
      const extracted = parseReceiptData({ merchant: 'Zomato', total: '450' }, 'Asia/Kolkata');
      assert.equal(extracted.paymentMethod, null);
      assert.equal(extracted.accountHint, null);
      assert.equal(extracted.confidenceDetails.paymentMethod, 'unresolved');
    });

    await check('4.3 Missing tax or discount left null without fake values', () => {
      const extracted = parseReceiptData({ merchant: 'Swiggy', total: '350' }, 'Asia/Kolkata');
      assert.equal(extracted.tax, null);
      assert.equal(extracted.discount, null);
      assert.equal(extracted.subtotal, null);
    });

    console.log('\n--- 5. Strict D.1.1 Account Safety & Memory Conflict ---');

    await check('5.1 Known explicit account: "HDFC" on receipt resolves to user HDFC account', async () => {
      const raw = parseReceiptData({ merchant: 'DMart', total: '1200', accountHint: 'HDFC' }, 'Asia/Kolkata');
      const matched = await matchReceiptEntities(userAId, raw);

      assert.equal(String(matched?.suggestedAccountId), hdfcAId);
      assert.equal(matched?.accountStatus, 'resolved');
      assert.equal(matched?.confidenceDetails?.account, 'high');
    });

    await check('5.2 UNKNOWN EXPLICIT ACCOUNT: "ICICI" on receipt when user has NO ICICI -> Unresolved & NEVER falls back to default HDFC', async () => {
      // User A only has HDFC. Receipt says "ICICI".
      const raw = parseReceiptData({ merchant: 'DMart', total: '1200', accountHint: 'ICICI' }, 'Asia/Kolkata');
      const matched = await matchReceiptEntities(userAId, raw);

      assert.equal(
        matched?.suggestedAccountId,
        null,
        'CRITICAL SAFETY: Unmatched explicit account hint MUST NOT resolve to an account',
      );
      assert.equal(matched?.accountStatus, 'unresolved');
      assert.equal(matched?.confidenceDetails?.account, 'unresolved');
      assert.ok(
        matched?.warnings?.some((w) => w.includes('Account "ICICI" on receipt not found')),
        'Warning must prompt user that explicit account was not found',
      );
    });

    await check('5.3 No account on receipt -> safely suggests default/recent account with "suggested" status', async () => {
      const raw = parseReceiptData({ merchant: 'Zomato', total: '450' }, 'Asia/Kolkata');
      const matched = await matchReceiptEntities(userAId, raw);

      assert.ok(matched?.suggestedAccountId, 'Can suggest account when no explicit account was named');
      assert.equal(matched?.accountStatus, 'suggested');
      assert.equal(matched?.confidenceDetails?.account, 'needs_review');
    });

    await check('5.4 Merchant Memory conflict: Learned HDFC does NOT override explicit receipt account ICICI', async () => {
      // Teach memory that Zomato uses HDFC
      await rememberMerchant(userAId, 'Zomato', catFoodAId, { accountId: hdfcAId, paymentMethod: 'upi' });

      // Now receipt says "ICICI"
      const raw = parseReceiptData({ merchant: 'Zomato', total: '450', accountHint: 'ICICI' }, 'Asia/Kolkata');
      const matched = await matchReceiptEntities(userAId, raw);

      // Must NOT override with learned HDFC!
      assert.notEqual(
        String(matched?.suggestedAccountId),
        hdfcAId,
        'Learned HDFC preference must NEVER override explicit ICICI hint on receipt',
      );
      assert.equal(matched?.suggestedAccountId, null);
      assert.equal(matched?.accountStatus, 'unresolved');
    });

    console.log('\n--- 6. Duplicate Protection (Section 23) ---');

    await check('6.1 Identical transaction within 5 minutes flagged as duplicate with warning', async () => {
      // Create existing transaction
      await createTransaction(userAId, {
        amount: 45000,
        merchant: 'Zomato',
        description: 'Dinner delivery',
        accountId: hdfcAId,
        categoryId: catFoodAId,
        type: 'expense',
        paymentMethod: 'upi',
        date: new Date(),
      });

      // Receipt scanned for same merchant & amount
      const raw = parseReceiptData({ merchant: 'Zomato', total: '450' }, 'Asia/Kolkata');
      const matched = await matchReceiptEntities(userAId, raw);

      assert.ok(matched?.possibleDuplicate, 'Duplicate must be detected');
      assert.equal(matched?.possibleDuplicate?.amount, 45000);
      assert.ok(matched?.warnings?.some((w) => w.includes('Possible duplicate')));
    });

    await check('6.2 Different amount or older transaction is NOT flagged as duplicate', async () => {
      const raw = parseReceiptData({ merchant: 'Zomato', total: '890' }, 'Asia/Kolkata');
      const matched = await matchReceiptEntities(userAId, raw);

      assert.equal(matched?.possibleDuplicate, null);
    });

    console.log('\n--- 7. Security & User Isolation (Section 27) ---');

    let receiptDocA: any = null;

    await check('7.1 Record valid signed upload for User A', async () => {
      const secret = env.CLOUDINARY_API_SECRET || 'mock_secret';
      const cloudName = env.CLOUDINARY_CLOUD_NAME || 'mock_cloud';
      const publicId = `paisa/receipts/${userAId}/test-${Date.now()}`;
      const version = 12345;
      const signature = sign({ public_id: publicId, version }, secret);
      const secureUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v${version}/${publicId}.jpg`;

      receiptDocA = await recordUpload(userAId, {
        publicId,
        version,
        signature,
        secureUrl,
        bytes: 102400,
        format: 'jpg',
        width: 800,
        height: 1200,
      });

      assert.ok(receiptDocA.id);
      assert.equal(receiptDocA.url, secureUrl);
    });

    await check('7.2 User B CANNOT view User A receipt (User Isolation)', async () => {
      try {
        await getReceipt(userBId, receiptDocA.id);
        assert.fail('User B was able to view User A receipt!');
      } catch (err: any) {
        assert.equal(err.status, 404, 'Must return 404 not found for unowned receipt');
      }
    });

    await check('7.3 User B CANNOT delete User A receipt (User Isolation)', async () => {
      try {
        await deleteReceipt(userBId, receiptDocA.id);
        assert.fail('User B was able to delete User A receipt!');
      } catch (err: any) {
        assert.equal(err.status, 404, 'Must return 404 not found for unowned receipt');
      }
    });

    await check('7.4 User B CANNOT attach User A receipt to their transaction', async () => {
      try {
        await attachReceipt(userBId, receiptDocA.id, null);
        assert.fail('User B was able to attach User A receipt!');
      } catch (err: any) {
        assert.equal(err.status, 404);
      }
    });

    await check('7.5 Forged/Unsigned upload is rejected with 400 Bad Request', async () => {
      try {
        await recordUpload(userAId, {
          publicId: 'evil/hack',
          version: 111,
          signature: 'invalid_sha1_hash_0000000000000000000000',
          secureUrl: 'https://evil.com/fake.png',
          bytes: 50,
          format: 'png',
          width: 100,
          height: 100,
        });
        assert.fail('Unsigned upload was accepted!');
      } catch (err: any) {
        assert.equal(err.status, 400);
      }
    });

    console.log('\n--- 8. Provider Failure & Resilience (Section 24) ---');

    await check('8.1 Malformed or unreadable OCR output safely results in low confidence, NO auto transaction', () => {
      const extracted = parseReceiptData({ garbage: 'random text', total: null }, 'Asia/Kolkata');
      assert.equal(extracted.amount, null);
      assert.equal(extracted.confidence, 'low');
      assert.ok(extracted.warnings.some((w) => w.includes('No total amount could be read')));
    });

    console.log('\n--- 9. Section 29 E2E Scenarios ---');

    await check('9.1 Scenario 1: Simple receipt (Zomato ₹450 UPI) confirmed -> creates transaction with attached receipt', async () => {
      const raw = parseReceiptData({ merchant: 'Zomato', total: '450', paymentMethod: 'upi' }, 'Asia/Kolkata');
      const matched = await matchReceiptEntities(userAId, raw);

      assert.equal(matched?.merchant, 'Zomato');
      assert.equal(matched?.amount, 45000);
      assert.equal(matched?.paymentMethod, 'upi');

      // User confirms in UI -> transaction created via existing createTransaction service
      const tx = await createTransaction(userAId, {
        amount: matched?.amount as number,
        type: 'expense',
        accountId: hdfcAId,
        categoryId: catFoodAId,
        merchant: matched?.merchant ?? 'Zomato',
        description: 'Lunch receipt',
        paymentMethod: (matched?.paymentMethod as any) ?? 'upi',
        date: new Date(),
      });

      assert.ok(tx.id);
      assert.equal(tx.amount, 45000);

      // Attach receipt
      await attachReceipt(userAId, receiptDocA.id, tx.id);
      const attached = await getReceipt(userAId, receiptDocA.id);
      assert.equal(attached.transactionId, tx.id);
    });

    await check('9.2 Scenario 2: Grocery receipt (DMart Grand Total ₹2,330)', async () => {
      const raw = parseReceiptData(
        {
          merchant: 'DMart',
          total: '2330.00',
          subtotal: '2100.00',
          tax: '280.00',
          discount: '50.00',
        },
        'Asia/Kolkata',
      );
      const matched = await matchReceiptEntities(userAId, raw);
      assert.equal(matched?.amount, 233000, 'Transaction amount must be Grand Total ₹2,330');
      assert.equal(matched?.subtotal, 210000);
      assert.equal(matched?.tax, 28000);
      assert.equal(matched?.discount, 5000);
    });

    await check('9.3 Scenario 3: Missing account ("Paid via ICICI" when user has no ICICI -> blocked direct save)', async () => {
      const raw = parseReceiptData({ merchant: 'DMart', total: '1200', accountHint: 'ICICI' }, 'Asia/Kolkata');
      const matched = await matchReceiptEntities(userAId, raw);

      assert.equal(matched?.suggestedAccountId, null);
      assert.equal(matched?.accountStatus, 'unresolved');
    });

    await check('9.4 Scenario 4: Existing merchant memory conflict with receipt', async () => {
      await rememberMerchant(userAId, 'Starbucks', catFoodAId, { accountId: hdfcAId, paymentMethod: 'credit_card' });
      const raw = parseReceiptData({ merchant: 'Starbucks', total: '350', accountHint: 'Cash In Hand', paymentMethod: 'cash' }, 'Asia/Kolkata');
      const matched = await matchReceiptEntities(userAId, raw);

      // Explicit receipt account Cash In Hand wins over learned HDFC
      assert.equal(String(matched?.suggestedAccountId), cashAId);
      assert.equal(matched?.paymentMethod, 'cash');
    });

    console.log('\n--- 10. Accounting Regression Audit (Section 7 Invariants) ---');

    const currentRange = {
      from: new Date('2026-09-01T00:00:00Z'),
      to: new Date('2026-09-30T23:59:59Z'),
    };
    const previousRange = {
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-08-31T23:59:59Z'),
    };
    const label = 'September 2026';

    await check('10.1 Expense: ₹2,380 receipt expense -> personalExpense increases by exactly ₹2,380', async () => {
      const before = await getOverview(userAId, currentRange, previousRange, label);

      await createTransaction(userAId, {
        amount: 238000,
        type: 'expense',
        accountId: hdfcAId,
        categoryId: catGroceriesAId,
        merchant: 'DMart',
        description: 'Monthly grocery stock',
        paymentMethod: 'upi',
        date: new Date('2026-09-17T12:00:00Z'),
      });

      const after = await getOverview(userAId, currentRange, previousRange, label);
      assert.equal(
        after.personalExpense,
        before.personalExpense + 238000,
        'Personal expense must increase by exactly ₹2,380',
      );
    });

    await check('10.2 Income: Salary ₹50,000 -> income increases, personal expense UNCHANGED', async () => {
      const before = await getOverview(userAId, currentRange, previousRange, label);

      await createTransaction(userAId, {
        amount: 5000000,
        type: 'income',
        accountId: hdfcAId,
        categoryId: String(catSalaryA._id),
        merchant: 'Employer',
        description: 'September Salary',
        paymentMethod: 'bank_transfer',
        date: new Date('2026-09-17T12:00:00Z'),
      });

      const after = await getOverview(userAId, currentRange, previousRange, label);
      assert.equal(after.income, before.income + 5000000);
      assert.equal(after.personalExpense, before.personalExpense);
    });

    await check('10.3 Lending: Lent Rahul ₹5,000 -> personal expense UNCHANGED', async () => {
      const before = await getOverview(userAId, currentRange, previousRange, label);

      const rahul = await createPerson(userAId, { name: 'Rahul Test' });
      await createMoneyOwed(userAId, {
        personId: rahul.id,
        direction: 'owed_to_me',
        type: 'loan',
        amount: 500000,
        accountId: hdfcAId,
        purpose: 'Trip support',
      });

      const after = await getOverview(userAId, currentRange, previousRange, label);
      assert.equal(after.personalExpense, before.personalExpense);
    });

    await check('10.4 Transfer: HDFC -> Cash ₹5,000 -> expense/income UNCHANGED', async () => {
      const before = await getOverview(userAId, currentRange, previousRange, label);

      await createTransaction(userAId, {
        amount: 500000,
        type: 'transfer',
        merchant: '',
        accountId: hdfcAId,
        destinationAccountId: cashAId,
        description: 'ATM withdrawal',
        paymentMethod: 'other',
        date: new Date('2026-09-17T12:00:00Z'),
      });

      const after = await getOverview(userAId, currentRange, previousRange, label);
      assert.equal(after.personalExpense, before.personalExpense);
      assert.equal(after.income, before.income);
    });

  } finally {
    await new Promise((r) => setTimeout(r, 200));
    await mongoose.disconnect();
  }

  console.log('\n========================================');
  console.log(`Phase D.2 Tests Finished: ${passed} Passed, ${failed} Failed`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

void runTests();
