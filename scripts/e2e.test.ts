import assert from 'node:assert/strict';

import { accountApi, authApi, categoryApi, transactionApi, userApi } from '../src/api/endpoints';
import { ApiError, NetworkError, errorMessage } from '../src/api/errors';
import { useAuthStore } from '../src/store/authStore';
import { periodRange } from '../src/utils/period';

/**
 * The mobile data layer, against a real server and a real database.
 *
 *   npm run server        (in one terminal)
 *   npm run verify:e2e    (in another)
 *
 * `client.test.ts` proves the client behaves correctly against a fake server;
 * this proves the two halves actually agree. It calls the same `accountApi`,
 * `categoryApi` and `transactionApi` functions the screens call, so a field
 * renamed on one side and not the other fails here rather than on a device.
 *
 * Point it elsewhere with `EXPO_PUBLIC_API_URL`.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    passed += 1;
    console.log(`  [32mPASS[0m  ${name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.log(`  [31mFAIL[0m  ${name}`);
    console.log(`        ${message.split('\n')[0]}`);
  }
}

function section(title: string): void {
  console.log(`\n[1m${title}[0m`);
}

const rupees = (value: number) => Math.round(value * 100);

async function main(): Promise<void> {
  const stamp = Date.now();
  const email = `e2e.${stamp}@paisa.test`;
  const password = 'Password123';

  console.log(`\nPaisa mobile-to-API checks\n${'='.repeat(60)}`);

  // ------------------------------------------------------------------ auth
  section('Session');

  await test('registering signs the app in and persists the session', async () => {
    const session = await authApi.register({ name: 'E2E User', email, password });
    await useAuthStore.getState().signIn(session);

    const state = useAuthStore.getState();
    assert.equal(state.status, 'signedIn');
    assert.equal(state.user?.email, email);
    assert.ok(state.accessToken && state.refreshToken);
  });

  await test('an authenticated read works without touching the token by hand', async () => {
    const { user } = await authApi.me();
    assert.equal(user.email, email);
  });

  await test('a wrong password surfaces a readable message, not a stack trace', async () => {
    await assert.rejects(
      () => authApi.login({ email, password: 'WrongPassword1' }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 401);
        assert.equal(errorMessage(error), 'Email or password is incorrect');
        return true;
      },
    );
  });

  await test('a short password comes back as a field issue the form can show', async () => {
    await assert.rejects(
      () => authApi.register({ name: 'X', email: `short.${stamp}@paisa.test`, password: 'abc' }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.ok(error.issueFor('password'), 'no issue named password');
        return true;
      },
    );
  });

  // ------------------------------------------------------------ categories
  section('Categories');

  let expenseCategoryId = '';
  let incomeCategoryId = '';

  await test('the Indian default tree arrives grouped and in order', async () => {
    const { categories, groups } = await categoryApi.list();
    assert.ok(categories.length >= 100, `expected 100+, got ${categories.length}`);
    assert.equal(groups[0], 'Food', 'Food should lead, not an alphabetical accident');
    assert.ok(groups.includes('Alcohol & Smoking'));
    assert.ok(groups.includes('Income'));

    const swiggy = categories.find((category) => category.name === 'Swiggy');
    assert.ok(swiggy, 'Swiggy is missing');
    assert.equal(swiggy.group, 'Food');
    assert.equal(swiggy.type, 'expense');
    // The client resolves both of these, so a rename on the server would show up
    // as a grey dot on a device and as a failure here.
    assert.ok(swiggy.icon.length > 0);
    assert.ok(swiggy.color.length > 0);

    expenseCategoryId = swiggy.id;
    const salary = categories.find((category) => category.name === 'Salary');
    assert.ok(salary);
    incomeCategoryId = salary.id;
  });

  await test('every category icon resolves to a glyph the app actually ships', async () => {
    const { toIconName } = await import('../src/components/icons/registry');
    const { categories } = await categoryApi.list();
    const missing = categories.filter((category) => toIconName(category.icon) !== category.icon);
    assert.equal(
      missing.length,
      0,
      `these would fall back to a dot: ${missing.map((c) => `${c.name}:${c.icon}`).join(', ')}`,
    );
  });

  await test('every category colour resolves to a real hue', async () => {
    const { categoryColor } = await import('../src/theme/colors');
    const { categoryHues } = await import('../src/theme/palette');
    const { categories } = await categoryApi.list();
    const unknown = categories.filter(
      (category) => !(category.color in categoryHues) && categoryColor(category.color) === categoryHues.other,
    );
    assert.equal(unknown.length, 0, `unknown hues: ${[...new Set(unknown.map((c) => c.color))].join(', ')}`);
  });

  // -------------------------------------------------------------- accounts
  section('Accounts');

  let bankId = '';
  let cashId = '';

  await test('a new account starts with two default accounts at zero', async () => {
    const accounts = await accountApi.list();
    assert.equal(accounts.length, 2);
    assert.ok(accounts.every((account) => account.balance === 0));
  });

  await test('accounts can be created with an opening balance', async () => {
    const bank = await accountApi.create({
      name: 'HDFC Savings',
      type: 'bank',
      balance: rupees(50000),
      icon: 'bank',
      color: '#4C8DFF',
      institution: 'HDFC Bank',
      last4: '4821',
    });
    const cash = await accountApi.create({
      name: 'Pocket Cash',
      type: 'cash',
      balance: rupees(2000),
      icon: 'cash',
      color: '#2BD98C',
    });

    bankId = bank.id;
    cashId = cash.id;
    assert.equal(bank.balance, rupees(50000));
    assert.equal(bank.last4, '4821');
    assert.equal(cash.balance, rupees(2000));
  });

  // ---------------------------------------------------------- transactions
  section('Transactions');

  let expenseId = '';

  await test('an expense posts and debits the account', async () => {
    const transaction = await transactionApi.create({
      type: 'expense',
      amount: rupees(450),
      categoryId: expenseCategoryId,
      accountId: bankId,
      merchant: 'Swiggy',
      paymentMethod: 'upi',
    });

    expenseId = transaction.id;
    assert.equal(transaction.type, 'expense');
    assert.equal(transaction.destinationAccountId, null);
    assert.equal((await accountApi.get(bankId)).balance, rupees(49550));
  });

  await test('income posts and credits the account', async () => {
    await transactionApi.create({
      type: 'income',
      amount: rupees(145000),
      categoryId: incomeCategoryId,
      accountId: bankId,
      merchant: 'Salary credit',
      paymentMethod: 'net_banking',
    });
    assert.equal((await accountApi.get(bankId)).balance, rupees(194550));
  });

  await test('editing an amount moves the balance by the difference', async () => {
    await transactionApi.update(expenseId, { amount: rupees(600) });
    assert.equal((await accountApi.get(bankId)).balance, rupees(194400));
  });

  await test('deleting a transaction puts the balance back', async () => {
    await transactionApi.remove(expenseId);
    assert.equal((await accountApi.get(bankId)).balance, rupees(195000));
    await assert.rejects(() => transactionApi.get(expenseId), ApiError);
  });

  // ------------------------------------------------------------- transfers
  section('Transfers');

  await test('a transfer moves money without spending it', async () => {
    const transfer = await transactionApi.create({
      type: 'transfer',
      amount: rupees(10000),
      accountId: bankId,
      destinationAccountId: cashId,
      merchant: 'ATM withdrawal',
      paymentMethod: 'bank_transfer',
    });

    assert.equal(transfer.categoryId, null);
    assert.equal((await accountApi.get(bankId)).balance, rupees(185000));
    assert.equal((await accountApi.get(cashId)).balance, rupees(12000));
  });

  await test('the summary the Home cards read excludes transfers from both totals', async () => {
    const range = periodRange('month');
    const summary = await transactionApi.summary({ from: range.from, to: range.to });

    assert.equal(summary.income, rupees(145000));
    assert.equal(summary.expense, 0, 'the transfer showed up as spending');
    assert.equal(summary.transferred, rupees(10000));
    assert.equal(summary.net, rupees(145000));
    assert.equal(summary.byCategory.length, 0, 'the transfer reached the category donut');
  });

  await test('the balance card total matches the sum of the accounts', async () => {
    const accounts = await accountApi.list();
    const total = accounts.reduce((sum, account) => sum + account.balance, 0);
    // Two seeded accounts at zero, plus the two created above.
    assert.equal(total, rupees(197000));
  });

  await test('a transfer into the same account is refused', async () => {
    await assert.rejects(
      () =>
        transactionApi.create({
          type: 'transfer',
          amount: rupees(100),
          accountId: bankId,
          destinationAccountId: bankId,
        }),
      ApiError,
    );
  });

  // ------------------------------------------------------ search and paging
  section('Search, filters and paging');

  await test('the list comes back newest first with paging metadata', async () => {
    for (let index = 0; index < 8; index += 1) {
      await transactionApi.create({
        type: 'expense',
        amount: rupees(100 + index),
        categoryId: expenseCategoryId,
        accountId: cashId,
        merchant: `Chai ${index}`,
        paymentMethod: 'cash',
        date: new Date(Date.now() - index * 86_400_000).toISOString(),
      });
    }

    const page = await transactionApi.list({ limit: 5, page: 1 });
    assert.equal(page.transactions.length, 5);
    assert.equal(page.meta.hasMore, true);
    assert.ok(page.meta.total >= 10);

    const dates = page.transactions.map((row) => new Date(row.date).getTime());
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a), 'not newest first');
  });

  await test('the second page does not repeat the first', async () => {
    const first = await transactionApi.list({ limit: 5, page: 1 });
    const second = await transactionApi.list({ limit: 5, page: 2 });
    const ids = new Set(first.transactions.map((row) => row.id));
    for (const row of second.transactions) {
      assert.ok(!ids.has(row.id), `${row.id} appeared on both pages`);
    }
  });

  await test('search matches part of a merchant name', async () => {
    const result = await transactionApi.list({ q: 'chai' });
    assert.equal(result.transactions.length, 8);
  });

  await test('filters narrow by account, type and amount', async () => {
    assert.ok((await transactionApi.list({ accountId: cashId })).transactions.length >= 8);
    assert.equal((await transactionApi.list({ type: 'income' })).transactions.length, 1);
    assert.equal((await transactionApi.list({ type: 'transfer' })).transactions.length, 1);

    const large = await transactionApi.list({ minAmount: rupees(1000) });
    assert.ok(large.transactions.every((row) => row.amount >= rupees(1000)));
  });

  await test('sorting by amount actually sorts by amount', async () => {
    const result = await transactionApi.list({ sort: '-amount', limit: 5 });
    const amounts = result.transactions.map((row) => row.amount);
    assert.deepEqual(amounts, [...amounts].sort((a, b) => b - a));
  });

  // ------------------------------------------------------------- validation
  section('Validation and error states');

  await test('a zero amount is refused with a message for the field', async () => {
    await assert.rejects(
      () =>
        transactionApi.create({
          type: 'expense',
          amount: 0,
          categoryId: expenseCategoryId,
          accountId: bankId,
        }),
      ApiError,
    );
  });

  await test('an income filed under a spending category is refused', async () => {
    await assert.rejects(
      () =>
        transactionApi.create({
          type: 'income',
          amount: rupees(100),
          categoryId: expenseCategoryId,
          accountId: bankId,
        }),
      ApiError,
    );
  });

  await test('a missing transaction is a 404 the detail screen can render', async () => {
    await assert.rejects(
      () => transactionApi.get('000000000000000000000000'),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        return true;
      },
    );
  });

  // -------------------------------------------------------- account removal
  section('Account lifecycle');

  await test('an account with history is archived rather than deleted', async () => {
    const result = await accountApi.remove(cashId);
    assert.equal(result.archived, true);
    assert.equal(result.deleted, false);

    assert.ok(!(await accountApi.list()).some((account) => account.id === cashId));
    assert.ok((await accountApi.list(true)).some((account) => account.id === cashId));
  });

  // ----------------------------------------------------------------- offline
  section('Network failure');

  await test('an unreachable server produces an offline error, not a crash', async () => {
    // A port nothing is listening on is the closest thing to aeroplane mode that
    // a test can arrange, and it exercises the same branch.
    const original = process.env.EXPO_PUBLIC_API_URL;
    const { request } = await import('../src/api/client');

    // The base URL is resolved at import time, so reach past the endpoint
    // wrappers and aim a raw request at a dead port.
    const dead = 'http://127.0.0.1:59999/api/v1/accounts';
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
      realFetch(dead, init as RequestInit)) as typeof fetch;

    try {
      await assert.rejects(
        () => request('/accounts'),
        (error: unknown) => {
          assert.ok(error instanceof NetworkError, `expected NetworkError, got ${String(error)}`);
          assert.match(errorMessage(error), /connection|reach/i);
          return true;
        },
      );
    } finally {
      globalThis.fetch = realFetch;
      process.env.EXPO_PUBLIC_API_URL = original;
    }
  });

  // ------------------------------------------------------------- sign out
  section('Sign out');

  await test('changing the password ends the session the app is holding', async () => {
    await userApi.changePassword(password, 'BrandNewPass1');

    await assert.rejects(() => authApi.me(), ApiError);
    // The client signs out rather than leaving a token that fails every request.
    assert.equal(useAuthStore.getState().status, 'signedOut');
    assert.ok(useAuthStore.getState().expiredReason);

    const session = await authApi.login({ email, password: 'BrandNewPass1' });
    await useAuthStore.getState().signIn(session);
    assert.equal(useAuthStore.getState().status, 'signedIn');
  });

  await test('signing out clears the stored session', async () => {
    const { refreshToken } = useAuthStore.getState();
    assert.ok(refreshToken);
    await authApi.logout(refreshToken);
    await useAuthStore.getState().signOut();

    assert.equal(useAuthStore.getState().status, 'signedOut');
    assert.equal(useAuthStore.getState().accessToken, null);
  });

  console.log(`\n${'='.repeat(60)}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(`  - ${failure}`);
  }
  console.log(`${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error('\nRun could not finish:', error);
  console.error('\nIs the API running? Start it with `npm run server`.');
  process.exit(1);
});
