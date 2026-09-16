import assert from 'node:assert/strict';

import { __reset as resetKeychain } from 'expo-secure-store';

import { request } from '../src/api/client';
import { ApiError, NetworkError } from '../src/api/errors';
import { useAuthStore } from '../src/store/authStore';

/**
 * Behaviour tests for the API client's token handling.
 *
 *   npm run verify:client
 *
 * This is the piece of mobile code most likely to be subtly wrong and least
 * likely to be caught by hand: an expired access token has to be refreshed once,
 * shared across every request in flight, and never retried into a loop. Getting
 * the single-flight part wrong does not look like a bug in testing — it looks
 * like the app randomly signing people out, because a rotating refresh endpoint
 * correctly reads two simultaneous uses of one token as theft.
 *
 * `fetch` is replaced with a recorder, so these run against no server at all.
 * `expo-secure-store`, `expo-constants` and `react-native` resolve to the stubs
 * in `scripts/stubs` via this directory's tsconfig paths.
 */

let passed = 0;
let failed = 0;

async function test(name: string, run: () => Promise<void>): Promise<void> {
  resetKeychain();
  await useAuthStore.getState().signOut();
  calls.length = 0;

  try {
    await run();
    passed += 1;
    console.log(`  [32mPASS[0m  ${name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  [31mFAIL[0m  ${name}`);
    console.log(`        ${message.split('\n')[0]}`);
  }
}

type Call = { url: string; method: string; authorization?: string; body?: unknown };

const calls: Call[] = [];

type Reply = { status: number; body: unknown };
type Responder = (call: Call, index: number) => Reply | Promise<Reply>;

let responder: Responder = () => ({ status: 200, body: { success: true, data: {} } });

globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const call: Call = {
    url: String(input),
    method: init?.method ?? 'GET',
    authorization: headers.authorization,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
  const index = calls.length;
  calls.push(call);

  const result = await responder(call, index);
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    text: async () => JSON.stringify(result.body),
  } as Response;
}) as typeof fetch;

/** Puts a session in the store without going through the network. */
async function signIn(accessToken = 'access-1', refreshToken = 'refresh-1'): Promise<void> {
  await useAuthStore.getState().signIn({
    accessToken,
    refreshToken,
    expiresIn: 900,
    user: {
      id: 'u1',
      name: 'Test User',
      email: 'test@paisa.test',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      notificationPrefs: { budgetAlerts: true, recurringAlerts: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
}

const success = (data: unknown): Reply => ({ status: 200, body: { success: true, data } });
const failure = (status: number, code: string, message = 'nope'): Reply => ({
  status,
  body: { success: false, error: { code, message } },
});

function isRefresh(call: Call): boolean {
  return call.url.endsWith('/auth/refresh');
}

async function main(): Promise<void> {
  console.log(`\nPaisa API client checks\n${'='.repeat(60)}\n`);

  await test('sends the access token and returns the envelope data', async () => {
    await signIn();
    responder = () => success({ accounts: [] });

    const result = await request<{ accounts: unknown[] }>('/accounts');

    assert.deepEqual(result.data, { accounts: [] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.authorization, 'Bearer access-1');
  });

  await test('passes the envelope meta through for paginated reads', async () => {
    await signIn();
    responder = () => ({
      status: 200,
      body: { success: true, data: { transactions: [] }, meta: { page: 1, hasMore: true } },
    });

    const result = await request('/transactions');
    assert.deepEqual(result.meta, { page: 1, hasMore: true });
  });

  await test('omits the header entirely when auth is off', async () => {
    responder = () => success({ ok: true });
    await request('/auth/login', { method: 'POST', body: {}, auth: false });
    assert.equal(calls[0]?.authorization, undefined);
  });

  await test('a 400 throws an ApiError carrying the field issues', async () => {
    await signIn();
    responder = () => ({
      status: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some fields need fixing',
          issues: [{ field: 'amount', message: 'Enter an amount greater than zero' }],
        },
      },
    });

    await assert.rejects(
      () => request('/transactions', { method: 'POST', body: {} }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 400);
        assert.equal(error.issueFor('amount'), 'Enter an amount greater than zero');
        return true;
      },
    );
    // A 400 is the caller's problem. Retrying it would send the same bad request.
    assert.equal(calls.length, 1);
  });

  await test('an expired access token refreshes once and replays the request', async () => {
    await signIn();
    responder = (call, index) => {
      if (index === 0) return failure(401, 'TOKEN_EXPIRED');
      if (isRefresh(call)) {
        return success({
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
          expiresIn: 900,
          user: {
            id: 'u1',
            name: 'Test User',
            email: 'test@paisa.test',
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            notificationPrefs: { budgetAlerts: true, recurringAlerts: true },
            createdAt: '',
            updatedAt: '',
          },
        });
      }
      return success({ accounts: ['ok'] });
    };

    const result = await request<{ accounts: string[] }>('/accounts');

    assert.deepEqual(result.data, { accounts: ['ok'] });
    assert.equal(calls.length, 3, 'expected request, refresh, replay');
    assert.ok(isRefresh(calls[1] as Call));
    assert.equal(calls[2]?.authorization, 'Bearer access-2', 'the replay used the stale token');
    assert.equal(useAuthStore.getState().accessToken, 'access-2');
    assert.equal(useAuthStore.getState().refreshToken, 'refresh-2');
  });

  await test('four requests failing at once share a single refresh', async () => {
    await signIn();
    let refreshes = 0;

    responder = async (call) => {
      if (isRefresh(call)) {
        refreshes += 1;
        // A real refresh takes a round trip; without the delay the calls would
        // serialise by accident and the test would pass for the wrong reason.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return success({
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
          expiresIn: 900,
          user: {
            id: 'u1',
            name: 'Test User',
            email: 'test@paisa.test',
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            notificationPrefs: { budgetAlerts: true, recurringAlerts: true },
            createdAt: '',
            updatedAt: '',
          },
        });
      }
      return call.authorization === 'Bearer access-1'
        ? failure(401, 'TOKEN_EXPIRED')
        : success({ ok: true });
    };

    await Promise.all([
      request('/accounts'),
      request('/categories'),
      request('/transactions'),
      request('/transactions/summary'),
    ]);

    assert.equal(refreshes, 1, `expected one refresh, got ${refreshes}`);
  });

  await test('a rejected refresh signs the user out with an explanation', async () => {
    await signIn();
    responder = (call, index) => {
      if (index === 0) return failure(401, 'TOKEN_EXPIRED');
      if (isRefresh(call)) return failure(401, 'UNAUTHORIZED', 'Session expired, sign in again');
      return success({});
    };

    await assert.rejects(() => request('/accounts'), ApiError);

    assert.equal(useAuthStore.getState().status, 'signedOut');
    assert.equal(useAuthStore.getState().refreshToken, null);
    assert.ok(useAuthStore.getState().expiredReason);
  });

  await test('a refresh that fails on the network keeps the session', async () => {
    await signIn();
    responder = (call, index) => {
      if (index === 0) return failure(401, 'TOKEN_EXPIRED');
      if (isRefresh(call)) return Promise.reject(new TypeError('Network request failed'));
      return success({});
    };

    await assert.rejects(() => request('/accounts'), NetworkError);

    // The token may well still be good; losing signal must not sign anyone out.
    assert.equal(useAuthStore.getState().status, 'signedIn');
    assert.equal(useAuthStore.getState().refreshToken, 'refresh-1');
  });

  await test('a second 401 after refreshing is not retried again', async () => {
    await signIn();
    responder = (call) => {
      if (isRefresh(call)) {
        return success({
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
          expiresIn: 900,
          user: {
            id: 'u1',
            name: 'Test User',
            email: 'test@paisa.test',
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            notificationPrefs: { budgetAlerts: true, recurringAlerts: true },
            createdAt: '',
            updatedAt: '',
          },
        });
      }
      return failure(401, 'TOKEN_EXPIRED');
    };

    await assert.rejects(() => request('/accounts'), ApiError);
    // request, refresh, replay — and then it stops rather than looping forever.
    assert.equal(calls.length, 3);
  });

  await test('a 403 is not mistaken for an expired token', async () => {
    await signIn();
    responder = () => failure(403, 'FORBIDDEN');

    await assert.rejects(() => request('/categories/x', { method: 'PATCH', body: {} }), ApiError);
    assert.equal(calls.length, 1, 'a 403 must not trigger a refresh');
  });

  await test('an unreachable server is a NetworkError, not an ApiError', async () => {
    await signIn();
    responder = () => Promise.reject(new TypeError('Network request failed'));

    await assert.rejects(
      () => request('/accounts'),
      (error: unknown) => {
        assert.ok(error instanceof NetworkError);
        assert.match(error.message, /connection/i);
        return true;
      },
    );
  });

  await test('an HTML error page is a NetworkError, not a parse crash', async () => {
    await signIn();
    responder = () => ({ status: 502, body: undefined });
    globalThis.fetch = (async () =>
      ({ ok: false, status: 502, text: async () => '<html>502 Bad Gateway</html>' }) as Response) as typeof fetch;

    await assert.rejects(() => request('/accounts'), NetworkError);

    // Put the recorder back for the cases after this one.
    globalThis.fetch = recordingFetch;
  });

  await test('query parameters drop undefined and empty values', async () => {
    await signIn();
    responder = () => success({});

    await request('/transactions', {
      params: { page: 1, q: '', type: undefined, accountId: 'a1', limit: 25 },
    });

    const url = calls[0]?.url ?? '';
    assert.ok(url.includes('page=1'));
    assert.ok(url.includes('accountId=a1'));
    assert.ok(!url.includes('q='), 'an empty search should not be sent');
    assert.ok(!url.includes('type='), 'an absent filter should not be sent');
  });

  await test('query parameters are encoded, not concatenated', async () => {
    await signIn();
    responder = () => success({});

    await request('/transactions', { params: { q: 'chai & samosa' } });
    assert.ok(calls[0]?.url.includes('q=chai%20%26%20samosa'));
  });

  await test('an aborted request rejects with the abort, not a network error', async () => {
    await signIn();
    const controller = new AbortController();
    responder = () => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    };

    await assert.rejects(
      () => request('/transactions', { signal: controller.signal }),
      (error: unknown) => {
        // React Query aborts superseded queries; surfacing those as "you are
        // offline" would put an error state on a screen that is working fine.
        assert.ok(!(error instanceof NetworkError));
        return true;
      },
    );
  });

  console.log(`\n${'='.repeat(60)}\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

const recordingFetch = globalThis.fetch;

void main();
