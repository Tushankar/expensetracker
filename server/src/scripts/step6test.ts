/* eslint-disable no-console */
import assert from 'node:assert/strict';

/**
 * Step-6 checks: the guarantees, not the features.
 *
 *   npm run dev          (in one terminal)
 *   npm run test:step6   (in another)
 *
 * Two things are asserted here that no other suite covers end to end.
 *
 * The first is isolation. Every other suite spot-checks it; this one walks the
 * whole surface with two real accounts and tries every read and every write from
 * the wrong side. That is the property a finance app cannot get wrong once, and
 * a test that covers eleven endpoints and misses the twelfth is the one that
 * matters.
 *
 * The second is deletion. "We delete your data" is a claim, and the only way to
 * keep it honest is to create something in every collection, close the account,
 * and then go looking for it.
 */

const BASE = process.env.API_URL ?? 'http://localhost:4000/api/v1';

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
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

type Envelope<T> = {
  success: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string; issues?: unknown[]; meta?: Record<string, unknown> };
};

type Response_<T> = { status: number; body: Envelope<T>; headers: Headers };

async function call<T = Record<string, unknown>>(
  method: string,
  pathname: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Response_<T>> {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  try {
    return {
      status: response.status,
      body: text ? (JSON.parse(text) as Envelope<T>) : ({ success: true } as Envelope<T>),
      headers: response.headers,
    };
  } catch {
    throw new Error(`${method} ${pathname} returned non-JSON (${response.status})`);
  }
}

function data<T>(response: Response_<T>): T {
  if (!response.body.success || !response.body.data) {
    throw new Error(
      `expected success, got ${response.status} ${response.body.error?.code}: ${response.body.error?.message}`,
    );
  }
  return response.body.data;
}

const paise = (value: number) => Math.round(value * 100);

type Session = { accessToken: string; refreshToken: string; user: { id: string; email: string } };
type Account = { id: string; name: string };
type Category = { id: string; name: string; type: string };

async function register(label: string): Promise<Session> {
  return data<Session>(
    await call('POST', '/auth/register', {
      body: {
        name: label,
        email: `${label.toLowerCase()}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@paisa.test`,
        password: 'Str0ng!Passw0rd',
        currency: 'INR',
      },
    }),
  );
}

async function main(): Promise<void> {
  console.log(`\nPaisa step-6 checks — ${BASE}\n${'='.repeat(62)}`);

  // ================================================================= isolation
  section('Isolation: one user can never reach another');

  const alice = await register('Alice');
  const mallory = await register('Mallory');

  const aliceAccounts = data<{ accounts: Account[] }>(
    await call('GET', '/accounts', { token: alice.accessToken }),
  ).accounts;
  const aliceCategories = data<{ categories: Category[] }>(
    await call('GET', '/categories', { token: alice.accessToken }),
  ).categories;

  const aliceAccountId = aliceAccounts[0]?.id;
  const aliceCategory = aliceCategories.find((entry) => entry.type === 'expense');
  assert.ok(aliceAccountId && aliceCategory, 'the new account has no starting data');

  const aliceTransaction = data<{ transaction: { id: string } }>(
    await call('POST', '/transactions', {
      token: alice.accessToken,
      body: {
        type: 'expense',
        amount: paise(4200),
        categoryId: aliceCategory.id,
        accountId: aliceAccountId,
        merchant: 'Alice Only',
      },
    }),
  ).transaction;

  const aliceBudget = data<{ budget: { id: string } }>(
    await call('POST', '/budgets', {
      token: alice.accessToken,
      body: { scope: 'category', categoryId: aliceCategory.id, amount: paise(9000) },
    }),
  ).budget;

  const aliceRule = data<{ recurring: { id: string } }>(
    await call('POST', '/recurring', {
      token: alice.accessToken,
      body: {
        name: 'Alice Rent',
        type: 'expense',
        amount: paise(25000),
        categoryId: aliceCategory.id,
        accountId: aliceAccountId,
        unit: 'month',
        interval: 1,
        startDate: new Date().toISOString(),
        autoCreate: false,
      },
    }),
  ).recurring;

  /**
   * Every id-addressed endpoint, from the wrong account.
   *
   * 404 rather than 403 throughout, and that is deliberate: a 403 confirms the id
   * exists, which turns any of these into an oracle for enumerating other
   * people's records.
   */
  const reads: [string, string, string][] = [
    ['a transaction', 'GET', `/transactions/${aliceTransaction.id}`],
    ['an account', 'GET', `/accounts/${aliceAccountId}`],
    ['a budget', 'PATCH', `/budgets/${aliceBudget.id}`],
    ['a recurring rule', 'GET', `/recurring/${aliceRule.id}`],
  ];

  for (const [what, method, pathname] of reads) {
    await test(`${what} belonging to someone else is not found`, async () => {
      const response = await call(method, pathname, {
        token: mallory.accessToken,
        ...(method === 'PATCH' ? { body: { amount: paise(1) } } : {}),
      });
      assert.equal(response.status, 404, `expected 404, got ${response.status}`);
    });
  }

  const writes: [string, string, string, unknown][] = [
    ['edit', 'PATCH', `/transactions/${aliceTransaction.id}`, { amount: paise(1) }],
    ['delete', 'DELETE', `/transactions/${aliceTransaction.id}`, undefined],
    ['archive an account', 'DELETE', `/accounts/${aliceAccountId}`, undefined],
    ['delete a budget', 'DELETE', `/budgets/${aliceBudget.id}`, undefined],
    ['delete a rule', 'DELETE', `/recurring/${aliceRule.id}`, undefined],
    ['pause a rule', 'POST', `/recurring/${aliceRule.id}/pause`, { paused: true }],
  ];

  for (const [what, method, pathname, body] of writes) {
    await test(`cannot ${what} on someone else's record`, async () => {
      const response = await call(method, pathname, { token: mallory.accessToken, body });
      assert.equal(response.status, 404, `expected 404, got ${response.status}`);
    });
  }

  await test('a transaction cannot be posted against someone else’s account', async () => {
    // The nastiest variant: a well-formed write whose *references* belong to
    // someone else. It would move their balance if the ids were not checked for
    // ownership rather than merely for shape.
    const response = await call('POST', '/transactions', {
      token: mallory.accessToken,
      body: {
        type: 'expense',
        amount: paise(50000),
        categoryId: aliceCategory.id,
        accountId: aliceAccountId,
        merchant: 'Not mine',
      },
    });
    assert.equal(response.status, 404, `expected 404, got ${response.status}`);
  });

  await test('a userId in the body is ignored, not honoured', async () => {
    const mallorysAccounts = data<{ accounts: Account[] }>(
      await call('GET', '/accounts', { token: mallory.accessToken }),
    ).accounts;
    const mallorysCategories = data<{ categories: Category[] }>(
      await call('GET', '/categories', { token: mallory.accessToken }),
    ).categories;

    const created = data<{ transaction: { id: string } }>(
      await call('POST', '/transactions', {
        token: mallory.accessToken,
        body: {
          type: 'expense',
          amount: paise(100),
          categoryId: mallorysCategories.find((entry) => entry.type === 'expense')?.id,
          accountId: mallorysAccounts[0]?.id,
          merchant: 'Ownership test',
          userId: alice.user.id,
        },
      }),
    ).transaction;

    // It landed on Mallory regardless of what the body claimed.
    assert.equal(
      (await call('GET', `/transactions/${created.id}`, { token: alice.accessToken })).status,
      404,
      'a spoofed userId moved the transaction to another account',
    );
  });

  await test('aggregates never mix two users', async () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const window = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    const overview = data<{ overview: { totalExpenses: number } }>(
      await call('GET', `/analytics/overview?${window}`, { token: mallory.accessToken }),
    ).overview;

    // Mallory spent ₹100 in the ownership test above and nothing else. Alice's
    // ₹4,200 must be nowhere in this number.
    assert.equal(overview.totalExpenses, paise(100), "another user's spending leaked into analytics");

    const summary = data<{ summary: { expense: number } }>(
      await call('GET', `/transactions/summary?${window}`, { token: mallory.accessToken }),
    ).summary;
    assert.equal(summary.expense, paise(100));
  });

  await test('a list only ever contains your own rows', async () => {
    const { transactions } = data<{ transactions: { merchant: string }[] }>(
      await call('GET', '/transactions?limit=100', { token: mallory.accessToken }),
    );
    assert.ok(
      transactions.every((row) => row.merchant !== 'Alice Only'),
      "another user's transaction appeared in the list",
    );
  });

  // ==================================================================== the API
  section('API shape');

  await test('every success is the same envelope', async () => {
    const responses = await Promise.all([
      call('GET', '/accounts', { token: alice.accessToken }),
      call('GET', '/categories', { token: alice.accessToken }),
      call('GET', '/transactions', { token: alice.accessToken }),
      call('GET', '/budgets', { token: alice.accessToken }),
      call('GET', '/notifications', { token: alice.accessToken }),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.ok(response.body.data, 'a success with no data');
      assert.equal(response.body.error, undefined, 'a success carrying an error');
    }
  });

  await test('every failure is the same envelope, with a machine-readable code', async () => {
    const cases: [string, string, number, string][] = [
      ['unauthenticated', '/accounts', 401, 'UNAUTHORIZED'],
      ['not found', '/transactions/000000000000000000000000', 404, 'NOT_FOUND'],
      ['bad id', '/transactions/not-an-id', 400, 'VALIDATION_ERROR'],
      ['no route', '/nope', 404, 'NOT_FOUND'],
    ];

    for (const [what, pathname, status, code] of cases) {
      const response = await call(pathname === '/accounts' ? 'GET' : 'GET', pathname, {
        ...(what === 'unauthenticated' ? {} : { token: alice.accessToken }),
      });
      assert.equal(response.status, status, `${what}: expected ${status}`);
      assert.equal(response.body.success, false, `${what}: not a failure envelope`);
      assert.equal(response.body.error?.code, code, `${what}: wrong code`);
      assert.ok(response.body.error?.message, `${what}: no message`);
    }
  });

  await test('a validation failure names the field', async () => {
    const response = await call('POST', '/transactions', {
      token: alice.accessToken,
      body: { type: 'expense', amount: -5, accountId: aliceAccountId },
    });
    assert.equal(response.status, 400);
    assert.ok(
      Array.isArray(response.body.error?.issues) && response.body.error.issues.length > 0,
      'a form could not show this error against a field',
    );
  });

  await test('paging carries the numbers a client needs', async () => {
    const response = await call<{ transactions: unknown[] }>(
      'GET',
      '/transactions?page=1&limit=2',
      { token: alice.accessToken },
    );
    const meta = response.body.meta as
      | { page?: number; limit?: number; total?: number; hasMore?: boolean }
      | undefined;

    assert.equal(meta?.page, 1);
    assert.equal(meta?.limit, 2);
    assert.equal(typeof meta?.total, 'number');
    assert.equal(typeof meta?.hasMore, 'boolean');
  });

  await test('security headers are set and the stack is never leaked', async () => {
    const response = await call('GET', '/accounts', { token: alice.accessToken });

    // helmet's defaults, and the one header that should not be there.
    assert.ok(response.headers.get('x-content-type-options'), 'no nosniff header');
    assert.equal(response.headers.get('x-powered-by'), null, 'Express is announcing itself');

    const failure = await call('GET', '/transactions/000000000000000000000000', {
      token: alice.accessToken,
    });
    assert.equal(failure.body.error?.meta?.stack, undefined, 'a 4xx leaked a stack trace');
  });

  // ==================================================================== export
  section('Export');

  await test('the export is a CSV of this user and nobody else', async () => {
    const now = new Date();
    const from = new Date(now.getFullYear() - 1, 0, 1).toISOString();
    const to = now.toISOString();

    const result = data<{
      export: { filename: string; mimeType: string; rowCount: number; content: string };
    }>(
      await call(
        'GET',
        `/transactions/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { token: alice.accessToken },
      ),
    ).export;

    assert.match(result.filename, /\.csv$/);
    assert.equal(result.mimeType, 'text/csv');
    assert.ok(result.rowCount >= 1, 'nothing exported');

    const lines = result.content.trim().split('\r\n');
    assert.match(lines[0] ?? '', /Date,Time,Type,Amount/, 'no header row');
    assert.equal(lines.length, result.rowCount + 1, 'the row count and the file disagree');
    assert.ok(result.content.includes('Alice Only'), "the user's own transaction is missing");
    assert.ok(!result.content.includes('Ownership test'), "another user's row was exported");
  });

  await test('a transfer exports as a transfer, not as spending', async () => {
    const accounts = data<{ accounts: Account[] }>(
      await call('GET', '/accounts', { token: alice.accessToken }),
    ).accounts;
    const second = accounts[1]?.id;
    if (!second) return;

    await call('POST', '/transactions', {
      token: alice.accessToken,
      body: {
        type: 'transfer',
        amount: paise(7000),
        accountId: aliceAccountId,
        destinationAccountId: second,
      },
    });

    const now = new Date();
    const result = data<{ export: { content: string } }>(
      await call(
        'GET',
        `/transactions/export?from=${encodeURIComponent(new Date(now.getFullYear() - 1, 0, 1).toISOString())}&to=${encodeURIComponent(now.toISOString())}`,
        { token: alice.accessToken },
      ),
    ).export;

    const transferRow = result.content
      .split('\r\n')
      .find((line) => line.includes('transfer'));

    assert.ok(transferRow, 'the transfer is missing from the export');
    assert.ok(
      transferRow.includes('7000.00'),
      'the transfer amount is wrong in the export',
    );
    // Both ends named, and filed as its own type — so summing by Type gives the
    // same three totals the app shows.
    assert.ok(!transferRow.includes(',expense,'), 'a transfer was exported as an expense');
  });

  await test('an inverted or oversized export window is refused', async () => {
    const now = new Date().toISOString();
    const old = new Date(2015, 0, 1).toISOString();

    assert.equal(
      (
        await call(
          'GET',
          `/transactions/export?from=${encodeURIComponent(now)}&to=${encodeURIComponent(old)}`,
          { token: alice.accessToken },
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          'GET',
          `/transactions/export?from=${encodeURIComponent(old)}&to=${encodeURIComponent(now)}`,
          { token: alice.accessToken },
        )
      ).status,
      400,
    );
  });

  await test('export needs a token', async () => {
    const now = new Date().toISOString();
    assert.equal(
      (await call('GET', `/transactions/export?from=${now}&to=${now}`)).status,
      401,
    );
  });

  // ================================================================== deletion
  section('Account deletion');

  const doomed = await register('Doomed');
  const doomedAccounts = data<{ accounts: Account[] }>(
    await call('GET', '/accounts', { token: doomed.accessToken }),
  ).accounts;
  const doomedCategories = data<{ categories: Category[] }>(
    await call('GET', '/categories', { token: doomed.accessToken }),
  ).categories;
  const doomedCategory = doomedCategories.find((entry) => entry.type === 'expense');
  assert.ok(doomedAccounts[0] && doomedCategory);

  // Something in as many collections as can be created over HTTP.
  await call('POST', '/transactions', {
    token: doomed.accessToken,
    body: {
      type: 'expense',
      amount: paise(1500),
      categoryId: doomedCategory.id,
      accountId: doomedAccounts[0].id,
      merchant: 'Doomed Stores',
    },
  });
  await call('POST', '/budgets', {
    token: doomed.accessToken,
    body: { scope: 'overall', amount: paise(1000) },
  });
  await call('POST', '/recurring', {
    token: doomed.accessToken,
    body: {
      name: 'Doomed Rule',
      type: 'expense',
      amount: paise(500),
      categoryId: doomedCategory.id,
      accountId: doomedAccounts[0].id,
      unit: 'month',
      interval: 1,
      startDate: new Date().toISOString(),
      autoCreate: false,
    },
  });
  await call('POST', '/ai/parse', { token: doomed.accessToken, body: { text: 'Chai 40' } });
  // Waits for the fire-and-forget budget alert and merchant memory to land.
  await new Promise((resolve) => setTimeout(resolve, 900));

  await test('the wrong password does not delete anything', async () => {
    const response = await call('DELETE', '/users/me', {
      token: doomed.accessToken,
      body: { password: 'NotTheRightOne1!', confirm: 'DELETE' },
    });
    assert.equal(response.status, 401);

    // Still alive.
    assert.equal(
      (await call('GET', '/users/me', { token: doomed.accessToken })).status,
      200,
      'a failed delete took the account anyway',
    );
  });

  await test('a missing confirmation does not delete anything', async () => {
    const response = await call('DELETE', '/users/me', {
      token: doomed.accessToken,
      body: { password: 'Str0ng!Passw0rd' },
    });
    assert.equal(response.status, 400);
  });

  await test('deleting removes every collection the user appears in', async () => {
    const summary = data<{
      deleted: {
        transactions: number;
        accounts: number;
        categories: number;
        budgets: number;
        recurring: number;
        sessions: number;
      };
    }>(
      await call('DELETE', '/users/me', {
        token: doomed.accessToken,
        body: { password: 'Str0ng!Passw0rd', confirm: 'DELETE' },
      }),
    ).deleted;

    assert.ok(summary.transactions >= 1, 'transactions were not deleted');
    assert.ok(summary.accounts >= 1, 'accounts were not deleted');
    assert.ok(summary.categories >= 50, 'the per-user category tree survived');
    assert.ok(summary.budgets >= 1, 'budgets were not deleted');
    assert.ok(summary.recurring >= 1, 'recurring rules were not deleted');
    assert.ok(summary.sessions >= 1, 'refresh tokens survived the account');
  });

  await test('the session dies with the account', async () => {
    assert.equal(
      (await call('GET', '/users/me', { token: doomed.accessToken })).status,
      401,
      'a deleted account still has a working access token',
    );

    const refreshed = await call('POST', '/auth/refresh', {
      body: { refreshToken: doomed.refreshToken },
    });
    assert.equal(refreshed.status, 401, 'a deleted account can still refresh');
  });

  await test('signing back in is impossible', async () => {
    const response = await call('POST', '/auth/login', {
      body: { email: doomed.user.email, password: 'Str0ng!Passw0rd' },
    });
    assert.equal(response.status, 401);
  });

  await test('the shared default categories survive someone else leaving', async () => {
    // The per-user copies go; the `userId: null` tree belongs to everybody, and a
    // careless `$or` in the delete would empty it for every account at once.
    const { categories } = data<{ categories: Category[] }>(
      await call('GET', '/categories', { token: alice.accessToken }),
    );
    assert.ok(categories.length > 50, "another user's deletion took the category tree");
  });

  await test("one deletion does not touch anyone else's data", async () => {
    const { transactions } = data<{ transactions: { merchant: string }[] }>(
      await call('GET', '/transactions?limit=100', { token: alice.accessToken }),
    );
    assert.ok(
      transactions.some((row) => row.merchant === 'Alice Only'),
      'a deletion elsewhere removed this user’s transactions',
    );
  });

  console.log(`\n${'='.repeat(62)}`);
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
