/* eslint-disable no-console */
import assert from 'node:assert/strict';

/**
 * End-to-end checks against a running server and the real database.
 *
 *   npm run dev        (in one terminal)
 *   npm run test:api   (in another)
 *
 * Not unit tests: these exist to prove the things that are expensive to be wrong
 * about — that a transfer never counts as spending, that balances survive an edit,
 * and that one user cannot touch another's rows. Every run registers throwaway
 * users and deletes what it created.
 */

const BASE = process.env.API_URL ?? 'http://localhost:4000/api/v1';

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
    failures.push(`${name}\n        ${message.split('\n').join('\n        ')}`);
    console.log(`  [31mFAIL[0m  ${name}`);
    console.log(`        ${message.split('\n')[0]}`);
  }
}

function section(title: string): void {
  console.log(`\n[1m${title}[0m`);
}

type ApiResponse<T> = {
  status: number;
  body: { success: boolean; data?: T; error?: { code: string; message: string; issues?: unknown[] }; meta?: Record<string, unknown> };
};

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const text = await response.text();
  let body: ApiResponse<T>['body'];
  try {
    body = JSON.parse(text) as ApiResponse<T>['body'];
  } catch {
    throw new Error(`${method} ${path} returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  return { status: response.status, body };
}

/** Unwraps a successful response, failing loudly with the API's own message. */
function data<T>(response: ApiResponse<T>): T {
  if (!response.body.success || !response.body.data) {
    throw new Error(
      `expected success, got ${response.status} ${response.body.error?.code}: ${response.body.error?.message}`,
    );
  }
  return response.body.data;
}

function expectError(response: ApiResponse<unknown>, status: number, code?: string): void {
  assert.equal(response.status, status, `expected HTTP ${status}, got ${response.status}`);
  assert.equal(response.body.success, false, 'expected success:false');
  if (code) {
    assert.equal(response.body.error?.code, code, `expected code ${code}, got ${response.body.error?.code}`);
  }
}

const rupees = (value: number) => Math.round(value * 100);

type Account = { id: string; name: string; balance: number; isActive: boolean; type: string };
type Category = { id: string; name: string; group: string; type: string; isDefault: boolean };
type Transaction = {
  id: string;
  type: string;
  amount: number;
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  merchant: string;
};
type Session = { accessToken: string; refreshToken: string; user: { id: string; email: string } };

async function balanceOf(token: string, accountId: string): Promise<number> {
  const response = await call<{ account: Account }>('GET', `/accounts/${accountId}`, { token });
  return data(response).account.balance;
}

async function main(): Promise<void> {
  console.log(`\nPaisa API tests — ${BASE}\n${'='.repeat(60)}`);

  const stamp = Date.now();
  const email = `test.${stamp}@paisa.test`;
  const otherEmail = `other.${stamp}@paisa.test`;
  const password = 'Password123';

  let session: Session = { accessToken: '', refreshToken: '', user: { id: '', email: '' } };
  let other: Session = { accessToken: '', refreshToken: '', user: { id: '', email: '' } };

  // ---------------------------------------------------------------- health
  section('Health');

  await test('health endpoint reports a connected database', async () => {
    const response = await call<{ status: string; database: string }>('GET', '/health');
    assert.equal(data(response).status, 'ok');
    assert.equal(data(response).database, 'connected');
  });

  // ------------------------------------------------------------------ auth
  section('Authentication');

  await test('register creates an account and returns a token pair', async () => {
    const response = await call<Session>('POST', '/auth/register', {
      body: { name: 'Test User', email, password },
    });
    assert.equal(response.status, 201);
    session = data(response);
    assert.ok(session.accessToken.length > 20, 'no access token');
    assert.ok(session.refreshToken.length > 20, 'no refresh token');
    assert.equal(session.user.email, email);
  });

  await test('register never echoes the password back', async () => {
    const response = await call<Session>('POST', '/auth/register', {
      body: { name: 'Other User', email: otherEmail, password },
    });
    other = data(response);
    assert.ok(!JSON.stringify(response.body).includes(password), 'password appears in the response');
    assert.ok(!JSON.stringify(response.body).includes('passwordHash'), 'hash appears in the response');
  });

  await test('register rejects a duplicate email', async () => {
    const response = await call('POST', '/auth/register', {
      body: { name: 'Test User', email, password },
    });
    expectError(response, 409, 'CONFLICT');
  });

  await test('register rejects a weak password and a bad email', async () => {
    const weak = await call('POST', '/auth/register', {
      body: { name: 'X', email: `w.${stamp}@paisa.test`, password: 'short' },
    });
    expectError(weak, 400, 'VALIDATION_ERROR');

    const bad = await call('POST', '/auth/register', {
      body: { name: 'X', email: 'not-an-email', password },
    });
    expectError(bad, 400, 'VALIDATION_ERROR');
  });

  await test('login succeeds with the right password', async () => {
    const response = await call<Session>('POST', '/auth/login', { body: { email, password } });
    assert.ok(data(response).accessToken);
  });

  await test('login fails with the wrong password, and says nothing useful', async () => {
    const response = await call('POST', '/auth/login', {
      body: { email, password: 'WrongPassword1' },
    });
    expectError(response, 401, 'UNAUTHORIZED');
    assert.equal(response.body.error?.message, 'Email or password is incorrect');
  });

  await test('login for an unknown email gives the identical answer', async () => {
    const response = await call('POST', '/auth/login', {
      body: { email: `ghost.${stamp}@paisa.test`, password },
    });
    expectError(response, 401, 'UNAUTHORIZED');
    assert.equal(response.body.error?.message, 'Email or password is incorrect');
  });

  await test('a protected route rejects a missing or malformed token', async () => {
    expectError(await call('GET', '/auth/me'), 401);
    expectError(await call('GET', '/auth/me', { token: 'not.a.jwt' }), 401);
  });

  await test('/auth/me returns the signed-in user', async () => {
    const response = await call<{ user: { email: string } }>('GET', '/auth/me', {
      token: session.accessToken,
    });
    assert.equal(data(response).user.email, email);
  });

  await test('a refresh token is rejected where an access token belongs', async () => {
    const response = await call('GET', '/auth/me', { token: session.refreshToken });
    expectError(response, 401);
  });

  await test('refresh rotates the pair and invalidates the old refresh token', async () => {
    const first = data(await call<Session>('POST', '/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    }));
    assert.notEqual(first.refreshToken, session.refreshToken, 'refresh token was not rotated');

    const replayed = await call('POST', '/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    });
    expectError(replayed, 401);

    // Reuse detection revoked every session, including the one just issued, so
    // sign in cleanly for the rest of the run.
    session = data(await call<Session>('POST', '/auth/login', { body: { email, password } }));
  });

  await test('logout revokes the refresh token it was given', async () => {
    const temp = data(await call<Session>('POST', '/auth/login', { body: { email, password } }));
    const out = await call('POST', '/auth/logout', { body: { refreshToken: temp.refreshToken } });
    assert.equal(out.status, 200);
    expectError(
      await call('POST', '/auth/refresh', { body: { refreshToken: temp.refreshToken } }),
      401,
    );
  });

  // ------------------------------------------------------------ categories
  section('Categories');

  let expenseCategories: Category[] = [];
  let incomeCategories: Category[] = [];

  await test('a new account is seeded with the Indian default tree', async () => {
    const response = await call<{ categories: Category[]; groups: string[] }>(
      'GET',
      '/categories',
      { token: session.accessToken },
    );
    const { categories, groups } = data(response);
    assert.ok(categories.length >= 100, `expected 100+ categories, got ${categories.length}`);

    for (const group of ['Food', 'Grocery', 'Transport', 'Home', 'Shopping', 'Entertainment', 'Alcohol & Smoking', 'Health', 'Financial', 'Travel', 'Personal', 'Income']) {
      assert.ok(groups.includes(group), `missing group: ${group}`);
    }

    const names = new Set(categories.map((category) => category.name));
    for (const name of ['Swiggy', 'Zomato', 'Petrol', 'Rapido', 'Metro', 'Rent', 'Netflix', 'EMI', 'Salary']) {
      assert.ok(names.has(name), `missing category: ${name}`);
    }
  });

  await test('categories filter by type', async () => {
    expenseCategories = data(
      await call<{ categories: Category[] }>('GET', '/categories?type=expense', {
        token: session.accessToken,
      }),
    ).categories;
    incomeCategories = data(
      await call<{ categories: Category[] }>('GET', '/categories?type=income', {
        token: session.accessToken,
      }),
    ).categories;

    assert.ok(expenseCategories.length > 90);
    assert.ok(incomeCategories.length >= 10);
    assert.ok(expenseCategories.every((category) => category.type === 'expense'));
    assert.ok(incomeCategories.every((category) => category.type === 'income'));
  });

  await test('a built-in category cannot be edited or deleted', async () => {
    const seeded = expenseCategories.find((category) => category.isDefault);
    assert.ok(seeded, 'no default category to test with');
    expectError(
      await call('PATCH', `/categories/${seeded.id}`, {
        token: session.accessToken,
        body: { name: 'Renamed' },
      }),
      403,
      'FORBIDDEN',
    );
    expectError(
      await call('DELETE', `/categories/${seeded.id}`, { token: session.accessToken }),
      403,
      'FORBIDDEN',
    );
  });

  await test('a user can add and remove their own category', async () => {
    const createdCategory = data(
      await call<{ category: Category }>('POST', '/categories', {
        token: session.accessToken,
        body: { name: 'Chai Tapri', group: 'Food', type: 'expense', icon: 'coffee', color: 'food' },
      }),
    ).category;
    assert.equal(createdCategory.isDefault, false);

    const renamed = data(
      await call<{ category: Category }>('PATCH', `/categories/${createdCategory.id}`, {
        token: session.accessToken,
        body: { name: 'Chai' },
      }),
    ).category;
    assert.equal(renamed.name, 'Chai');

    const removed = await call('DELETE', `/categories/${createdCategory.id}`, {
      token: session.accessToken,
    });
    assert.equal(removed.status, 200);
  });

  // -------------------------------------------------------------- accounts
  section('Accounts');

  let bank!: Account;
  let cash!: Account;
  let creditCard!: Account;

  await test('a new account starts with default accounts at zero', async () => {
    const accounts = data(
      await call<{ accounts: Account[] }>('GET', '/accounts', { token: session.accessToken }),
    ).accounts;
    assert.equal(accounts.length, 2);
    assert.ok(accounts.every((account) => account.balance === 0));
  });

  await test('accounts can be created with an opening balance', async () => {
    bank = data(
      await call<{ account: Account }>('POST', '/accounts', {
        token: session.accessToken,
        body: { name: 'HDFC Savings', type: 'bank', balance: rupees(50000), icon: 'bank', color: '#4C8DFF' },
      }),
    ).account;
    cash = data(
      await call<{ account: Account }>('POST', '/accounts', {
        token: session.accessToken,
        body: { name: 'Wallet Cash', type: 'cash', balance: rupees(2000), icon: 'cash', color: '#2BD98C' },
      }),
    ).account;
    creditCard = data(
      await call<{ account: Account }>('POST', '/accounts', {
        token: session.accessToken,
        body: { name: 'ICICI Card', type: 'credit_card', balance: rupees(-8000), icon: 'card', color: '#FF6FB5' },
      }),
    ).account;

    assert.equal(bank.balance, rupees(50000));
    assert.equal(cash.balance, rupees(2000));
    assert.equal(creditCard.balance, rupees(-8000), 'a credit card should carry a negative balance');
  });

  await test('duplicate account names are rejected', async () => {
    expectError(
      await call('POST', '/accounts', {
        token: session.accessToken,
        body: { name: 'HDFC Savings', type: 'bank' },
      }),
      409,
      'CONFLICT',
    );
  });

  await test('the balance cannot be edited directly', async () => {
    const before = await balanceOf(session.accessToken, bank.id);
    await call('PATCH', `/accounts/${bank.id}`, {
      token: session.accessToken,
      body: { name: 'HDFC Savings', balance: rupees(99999) },
    });
    assert.equal(await balanceOf(session.accessToken, bank.id), before);
  });

  // ---------------------------------------------------------- transactions
  section('Transactions');

  const food = expenseCategories.find((category) => category.name === 'Swiggy')!;
  const petrol = expenseCategories.find((category) => category.name === 'Petrol')!;
  const salary = incomeCategories.find((category) => category.name === 'Salary')!;

  let expenseId = '';

  await test('an expense debits its account', async () => {
    const before = await balanceOf(session.accessToken, bank.id);
    const transaction = data(
      await call<{ transaction: Transaction }>('POST', '/transactions', {
        token: session.accessToken,
        body: {
          type: 'expense',
          amount: rupees(450),
          categoryId: food.id,
          accountId: bank.id,
          merchant: 'Swiggy',
          paymentMethod: 'upi',
        },
      }),
    ).transaction;

    expenseId = transaction.id;
    assert.equal(transaction.amount, rupees(450));
    assert.equal(transaction.destinationAccountId, null);
    assert.equal(await balanceOf(session.accessToken, bank.id), before - rupees(450));
  });

  await test('income credits its account', async () => {
    const before = await balanceOf(session.accessToken, bank.id);
    await call('POST', '/transactions', {
      token: session.accessToken,
      body: {
        type: 'income',
        amount: rupees(145000),
        categoryId: salary.id,
        accountId: bank.id,
        merchant: 'Salary credit',
        paymentMethod: 'net_banking',
      },
    });
    assert.equal(await balanceOf(session.accessToken, bank.id), before + rupees(145000));
  });

  await test('editing an amount reverses the old effect and applies the new one', async () => {
    const before = await balanceOf(session.accessToken, bank.id);
    await call('PATCH', `/transactions/${expenseId}`, {
      token: session.accessToken,
      body: { amount: rupees(600) },
    });
    // The account was debited 450; it should now be debited 600 instead.
    assert.equal(await balanceOf(session.accessToken, bank.id), before - rupees(150));
  });

  await test('moving a transaction to another account moves the money with it', async () => {
    const bankBefore = await balanceOf(session.accessToken, bank.id);
    const cashBefore = await balanceOf(session.accessToken, cash.id);

    await call('PATCH', `/transactions/${expenseId}`, {
      token: session.accessToken,
      body: { accountId: cash.id },
    });

    assert.equal(await balanceOf(session.accessToken, bank.id), bankBefore + rupees(600));
    assert.equal(await balanceOf(session.accessToken, cash.id), cashBefore - rupees(600));
  });

  await test('deleting a transaction returns the money', async () => {
    const before = await balanceOf(session.accessToken, cash.id);
    const response = await call('DELETE', `/transactions/${expenseId}`, {
      token: session.accessToken,
    });
    assert.equal(response.status, 200);
    assert.equal(await balanceOf(session.accessToken, cash.id), before + rupees(600));
    expectError(
      await call('GET', `/transactions/${expenseId}`, { token: session.accessToken }),
      404,
      'NOT_FOUND',
    );
  });

  // ------------------------------------------------------------- transfers
  section('Transfers');

  let transferId = '';

  await test('a transfer debits one account and credits the other', async () => {
    const bankBefore = await balanceOf(session.accessToken, bank.id);
    const cashBefore = await balanceOf(session.accessToken, cash.id);

    const transaction = data(
      await call<{ transaction: Transaction }>('POST', '/transactions', {
        token: session.accessToken,
        body: {
          type: 'transfer',
          amount: rupees(10000),
          accountId: bank.id,
          destinationAccountId: cash.id,
          merchant: 'ATM withdrawal',
          paymentMethod: 'bank_transfer',
        },
      }),
    ).transaction;

    transferId = transaction.id;
    assert.equal(transaction.categoryId, null, 'a transfer must not carry a category');
    assert.equal(await balanceOf(session.accessToken, bank.id), bankBefore - rupees(10000));
    assert.equal(await balanceOf(session.accessToken, cash.id), cashBefore + rupees(10000));
  });

  await test('a transfer counts as neither income nor expense', async () => {
    const summary = data(
      await call<{ summary: { income: number; expense: number; transferred: number; net: number } }>(
        'GET',
        '/transactions/summary',
        { token: session.accessToken },
      ),
    ).summary;

    assert.equal(summary.income, rupees(145000), 'only the salary should count as income');
    assert.equal(summary.expense, 0, 'the transfer must not appear as spending');
    assert.equal(summary.transferred, rupees(10000), 'the transfer should be reported on its own');
    assert.equal(summary.net, rupees(145000), 'net must ignore transfers entirely');
  });

  await test('a transfer is excluded from the category breakdown', async () => {
    const summary = data(
      await call<{ summary: { byCategory: { categoryId: string }[] } }>(
        'GET',
        '/transactions/summary',
        { token: session.accessToken },
      ),
    ).summary;
    assert.equal(summary.byCategory.length, 0, 'a transfer leaked into the category totals');
  });

  await test('a transfer to the same account is rejected', async () => {
    expectError(
      await call('POST', '/transactions', {
        token: session.accessToken,
        body: {
          type: 'transfer',
          amount: rupees(100),
          accountId: bank.id,
          destinationAccountId: bank.id,
        },
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  await test('a transfer cannot be given a category', async () => {
    expectError(
      await call('PATCH', `/transactions/${transferId}`, {
        token: session.accessToken,
        body: { categoryId: food.id },
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  await test('editing a transfer amount moves both balances', async () => {
    const bankBefore = await balanceOf(session.accessToken, bank.id);
    const cashBefore = await balanceOf(session.accessToken, cash.id);

    await call('PATCH', `/transactions/${transferId}`, {
      token: session.accessToken,
      body: { amount: rupees(4000) },
    });

    assert.equal(await balanceOf(session.accessToken, bank.id), bankBefore + rupees(6000));
    assert.equal(await balanceOf(session.accessToken, cash.id), cashBefore - rupees(6000));
  });

  await test('deleting a transfer unwinds both sides', async () => {
    const bankBefore = await balanceOf(session.accessToken, bank.id);
    const cashBefore = await balanceOf(session.accessToken, cash.id);

    await call('DELETE', `/transactions/${transferId}`, { token: session.accessToken });

    assert.equal(await balanceOf(session.accessToken, bank.id), bankBefore + rupees(4000));
    assert.equal(await balanceOf(session.accessToken, cash.id), cashBefore - rupees(4000));
  });

  await test('the ledger and the balances agree', async () => {
    // Replay every transaction from scratch and compare against the stored
    // balances. This is the invariant the whole module exists to keep.
    const opening = new Map<string, number>([
      [bank.id, rupees(50000)],
      [cash.id, rupees(2000)],
      [creditCard.id, rupees(-8000)],
    ]);

    const rows = data(
      await call<{ transactions: Transaction[] }>('GET', '/transactions?limit=100', {
        token: session.accessToken,
      }),
    ).transactions;

    for (const row of rows) {
      if (row.type === 'income') {
        opening.set(row.accountId, (opening.get(row.accountId) ?? 0) + row.amount);
      } else {
        opening.set(row.accountId, (opening.get(row.accountId) ?? 0) - row.amount);
        if (row.type === 'transfer' && row.destinationAccountId) {
          opening.set(
            row.destinationAccountId,
            (opening.get(row.destinationAccountId) ?? 0) + row.amount,
          );
        }
      }
    }

    for (const [accountId, expected] of opening) {
      assert.equal(
        await balanceOf(session.accessToken, accountId),
        expected,
        `balance drifted on account ${accountId}`,
      );
    }
  });

  // ----------------------------------------------------- filters and search
  section('Search and filters');

  await test('seeded rows for filtering', async () => {
    const rows = [
      { type: 'expense', amount: rupees(2000), categoryId: petrol.id, accountId: creditCard.id, merchant: 'Indian Oil', paymentMethod: 'credit_card', date: '2026-02-10T09:00:00.000Z' },
      { type: 'expense', amount: rupees(340), categoryId: food.id, accountId: bank.id, merchant: 'Swiggy Instamart', paymentMethod: 'upi', date: '2026-02-14T19:00:00.000Z' },
      { type: 'expense', amount: rupees(120), categoryId: food.id, accountId: cash.id, merchant: 'Chai', paymentMethod: 'cash', date: '2026-03-02T08:00:00.000Z' },
    ];
    for (const row of rows) {
      const response = await call('POST', '/transactions', { token: session.accessToken, body: row });
      assert.equal(response.status, 201);
    }
  });

  await test('search matches a partial merchant name', async () => {
    const rows = data(
      await call<{ transactions: Transaction[] }>('GET', '/transactions?q=swig', {
        token: session.accessToken,
      }),
    ).transactions;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.merchant, 'Swiggy Instamart');
  });

  await test('search escapes regex metacharacters instead of crashing', async () => {
    const response = await call('GET', '/transactions?q=%28%5B', { token: session.accessToken });
    assert.equal(response.status, 200);
  });

  await test('filters by type, category, account, method and date range', async () => {
    const byType = data(
      await call<{ transactions: Transaction[] }>('GET', '/transactions?type=income', {
        token: session.accessToken,
      }),
    ).transactions;
    assert.ok(byType.every((row) => row.type === 'income'));

    const byCategory = data(
      await call<{ transactions: Transaction[] }>(`GET`, `/transactions?categoryId=${food.id}`, {
        token: session.accessToken,
      }),
    ).transactions;
    assert.equal(byCategory.length, 2);

    const byAccount = data(
      await call<{ transactions: Transaction[] }>(`GET`, `/transactions?accountId=${creditCard.id}`, {
        token: session.accessToken,
      }),
    ).transactions;
    assert.equal(byAccount.length, 1);

    const byMethod = data(
      await call<{ transactions: Transaction[] }>('GET', '/transactions?paymentMethod=cash', {
        token: session.accessToken,
      }),
    ).transactions;
    assert.equal(byMethod.length, 1);

    const byRange = data(
      await call<{ transactions: Transaction[] }>(
        'GET',
        '/transactions?from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.000Z',
        { token: session.accessToken },
      ),
    ).transactions;
    assert.equal(byRange.length, 2);
  });

  await test('an inverted date range is rejected', async () => {
    expectError(
      await call(
        'GET',
        '/transactions?from=2026-03-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z',
        { token: session.accessToken },
      ),
      400,
      'VALIDATION_ERROR',
    );
  });

  await test('pagination reports totals and never repeats a row', async () => {
    const first = await call<{ transactions: Transaction[] }>('GET', '/transactions?limit=2&page=1', {
      token: session.accessToken,
    });
    const second = await call<{ transactions: Transaction[] }>('GET', '/transactions?limit=2&page=2', {
      token: session.accessToken,
    });

    const meta = first.body.meta as { total: number; hasMore: boolean; totalPages: number };
    assert.ok(meta.total >= 4);
    assert.equal(meta.hasMore, true);

    const ids = new Set(data(first).transactions.map((row) => row.id));
    for (const row of data(second).transactions) {
      assert.ok(!ids.has(row.id), 'the same row appeared on two pages');
    }
  });

  await test('an over-large page size is rejected rather than served', async () => {
    expectError(
      await call('GET', '/transactions?limit=5000', { token: session.accessToken }),
      400,
      'VALIDATION_ERROR',
    );
  });

  // ------------------------------------------------------------ validation
  section('Validation');

  await test('an amount of zero or below is rejected', async () => {
    for (const amount of [0, -100]) {
      expectError(
        await call('POST', '/transactions', {
          token: session.accessToken,
          body: { type: 'expense', amount, categoryId: food.id, accountId: bank.id },
        }),
        400,
        'VALIDATION_ERROR',
      );
    }
  });

  await test('a fractional paisa is rejected', async () => {
    expectError(
      await call('POST', '/transactions', {
        token: session.accessToken,
        body: { type: 'expense', amount: 10.5, categoryId: food.id, accountId: bank.id },
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  await test('an expense without a category is rejected, and the issue names the field', async () => {
    const response = await call('POST', '/transactions', {
      token: session.accessToken,
      body: { type: 'expense', amount: rupees(10), accountId: bank.id },
    });
    expectError(response, 400, 'VALIDATION_ERROR');
    const issues = (response.body.error?.issues ?? []) as { field: string }[];
    assert.ok(issues.some((issue) => issue.field.includes('categoryId')), 'no issue named categoryId');
  });

  await test('an income filed under an expense category is rejected', async () => {
    expectError(
      await call('POST', '/transactions', {
        token: session.accessToken,
        body: { type: 'income', amount: rupees(100), categoryId: food.id, accountId: bank.id },
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  await test('an unknown transaction type is rejected', async () => {
    expectError(
      await call('POST', '/transactions', {
        token: session.accessToken,
        body: { type: 'refund', amount: rupees(100), accountId: bank.id },
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  await test('a malformed id is a 400, not a 500', async () => {
    expectError(
      await call('GET', '/transactions/not-an-id', { token: session.accessToken }),
      400,
      'VALIDATION_ERROR',
    );
  });

  await test('malformed JSON is a 400, not a crash', async () => {
    const response = await fetch(`${BASE}/transactions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.accessToken}`,
      },
      body: '{"type":"expense",',
    });
    assert.equal(response.status, 400);
  });

  // -------------------------------------------------------------- security
  section('Security');

  await test('a client-supplied userId is ignored, not honoured', async () => {
    const transaction = data(
      await call<{ transaction: Transaction & { userId?: string } }>('POST', '/transactions', {
        token: session.accessToken,
        body: {
          type: 'expense',
          amount: rupees(11),
          categoryId: food.id,
          accountId: bank.id,
          userId: other.user.id,
          merchant: 'Forged',
        },
      }),
    ).transaction;

    // It landed on the caller's own ledger, not the id they asked for.
    const mine = data(
      await call<{ transactions: Transaction[] }>('GET', '/transactions?q=Forged', {
        token: session.accessToken,
      }),
    ).transactions;
    assert.equal(mine.length, 1);

    const theirs = data(
      await call<{ transactions: Transaction[] }>('GET', '/transactions?q=Forged', {
        token: other.accessToken,
      }),
    ).transactions;
    assert.equal(theirs.length, 0, 'the forged userId reached the database');

    await call('DELETE', `/transactions/${transaction.id}`, { token: session.accessToken });
  });

  await test("one user cannot read another user's transaction", async () => {
    const theirs = data(
      await call<{ transactions: Transaction[] }>('GET', '/transactions?limit=1', {
        token: session.accessToken,
      }),
    ).transactions[0]!;

    expectError(
      await call('GET', `/transactions/${theirs.id}`, { token: other.accessToken }),
      404,
      'NOT_FOUND',
    );
    expectError(
      await call('PATCH', `/transactions/${theirs.id}`, {
        token: other.accessToken,
        body: { amount: rupees(1) },
      }),
      404,
    );
    expectError(
      await call('DELETE', `/transactions/${theirs.id}`, { token: other.accessToken }),
      404,
    );
  });

  await test("one user cannot spend from another user's account", async () => {
    const theirCategory = data(
      await call<{ categories: Category[] }>('GET', '/categories?type=expense', {
        token: other.accessToken,
      }),
    ).categories[0]!;

    expectError(
      await call('POST', '/transactions', {
        token: other.accessToken,
        body: {
          type: 'expense',
          amount: rupees(5000),
          categoryId: theirCategory.id,
          accountId: bank.id,
        },
      }),
      404,
      'NOT_FOUND',
    );
  });

  await test("one user cannot see or edit another user's accounts", async () => {
    const accounts = data(
      await call<{ accounts: Account[] }>('GET', '/accounts', { token: other.accessToken }),
    ).accounts;
    assert.ok(!accounts.some((account) => account.id === bank.id));

    expectError(await call('GET', `/accounts/${bank.id}`, { token: other.accessToken }), 404);
    expectError(
      await call('PATCH', `/accounts/${bank.id}`, {
        token: other.accessToken,
        body: { name: 'Hijacked' },
      }),
      404,
    );
  });

  await test("one user's summary contains only their own money", async () => {
    const summary = data(
      await call<{ summary: { income: number; expense: number } }>(
        'GET',
        '/transactions/summary',
        { token: other.accessToken },
      ),
    ).summary;
    assert.equal(summary.income, 0);
    assert.equal(summary.expense, 0);
  });

  await test('changing a password ends every existing session', async () => {
    const victim = `pw.${stamp}@paisa.test`;
    const first = data(
      await call<Session>('POST', '/auth/register', {
        body: { name: 'Password Test', email: victim, password },
      }),
    );

    const changed = await call('POST', '/users/me/password', {
      token: first.accessToken,
      body: { currentPassword: password, newPassword: 'BrandNewPass1' },
    });
    assert.equal(changed.status, 200);

    // The access token was valid a moment ago and must stop working immediately —
    // not in fifteen minutes when it would have expired on its own.
    expectError(await call('GET', '/auth/me', { token: first.accessToken }), 401);
    expectError(
      await call('POST', '/auth/refresh', { body: { refreshToken: first.refreshToken } }),
      401,
    );
    assert.ok(
      data(
        await call<Session>('POST', '/auth/login', {
          body: { email: victim, password: 'BrandNewPass1' },
        }),
      ).accessToken,
    );
  });

  // -------------------------------------------------------- account removal
  section('Account lifecycle');

  await test('an account with history is archived, not deleted', async () => {
    const response = await call<{ deleted: boolean; archived: boolean }>(
      'DELETE',
      `/accounts/${creditCard.id}`,
      { token: session.accessToken },
    );
    const result = data(response);
    assert.equal(result.archived, true);
    assert.equal(result.deleted, false);

    // Hidden from the picker, but its transactions still resolve.
    const active = data(
      await call<{ accounts: Account[] }>('GET', '/accounts', { token: session.accessToken }),
    ).accounts;
    assert.ok(!active.some((account) => account.id === creditCard.id));

    const all = data(
      await call<{ accounts: Account[] }>('GET', '/accounts?includeArchived=true', {
        token: session.accessToken,
      }),
    ).accounts;
    assert.ok(all.some((account) => account.id === creditCard.id));
  });

  await test('an untouched account is deleted outright', async () => {
    const spare = data(
      await call<{ account: Account }>('POST', '/accounts', {
        token: session.accessToken,
        body: { name: 'Spare Wallet', type: 'wallet' },
      }),
    ).account;

    const result = data(
      await call<{ deleted: boolean }>('DELETE', `/accounts/${spare.id}`, {
        token: session.accessToken,
      }),
    );
    assert.equal(result.deleted, true);
    expectError(await call('GET', `/accounts/${spare.id}`, { token: session.accessToken }), 404);
  });

  // ----------------------------------------------------------------- misc
  section('Errors');

  await test('an unknown route is a structured 404', async () => {
    const response = await call('GET', '/nope');
    expectError(response, 404, 'NOT_FOUND');
  });

  await test('every failure uses the same envelope', async () => {
    const responses = [
      await call('GET', '/auth/me'),
      await call('GET', '/nope'),
      await call('POST', '/auth/login', { body: {} }),
    ];
    for (const response of responses) {
      assert.equal(response.body.success, false);
      assert.ok(typeof response.body.error?.code === 'string');
      assert.ok(typeof response.body.error?.message === 'string');
    }
  });

  // ---------------------------------------------------------------- report
  console.log(`\n${'='.repeat(60)}`);
  if (failures.length > 0) {
    console.log('\nFailures:\n');
    for (const failure of failures) console.log(`  - ${failure}\n`);
  }
  console.log(`${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error('\nTest run could not finish:', error);
  process.exit(1);
});
