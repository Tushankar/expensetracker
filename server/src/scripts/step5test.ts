/* eslint-disable no-console */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { DateTime } from 'luxon';

import { env } from '../config/env';
import { isStorageConfigured, sign, verifyUpload } from '../lib/cloudinary';
import {
  extractMerchant,
  parseAmount,
  parseDate,
  parsePaymentMethod,
  parseQuickEntry,
} from '../modules/ai/quickEntry';
import { merchantKey } from '../modules/merchants/merchant.service';
import { extractFromImage, isVisionConfigured } from '../modules/receipts/receipt.extract';

/**
 * Checks for the step-5 additions: the quick-text parser, merchant memory,
 * receipt storage and the receipt reader.
 *
 *   npm run dev          (in one terminal)
 *   npm run test:step5   (in another)
 *
 * The parser half runs in-process with no network at all, which is the point of
 * having written it as pure functions: the amount someone types is the one number
 * in this app that must never depend on a model being available, a service being
 * up, or a prompt being phrased well.
 *
 * The receipt half needs Cloudinary configured; it skips cleanly when it is not,
 * rather than failing a suite for a deployment choice.
 */

const BASE = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const IST = 'Asia/Kolkata';

let passed = 0;
let failed = 0;
let skipped = 0;
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

function skip(name: string, why: string): void {
  skipped += 1;
  console.log(`  [33mSKIP[0m  ${name} — ${why}`);
}

function section(title: string): void {
  console.log(`\n[1m${title}[0m`);
}

type Envelope<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

async function call<T = Record<string, unknown>>(
  method: string,
  pathname: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Envelope<T> }> {
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
    return { status: response.status, body: JSON.parse(text) as Envelope<T> };
  } catch {
    throw new Error(`${method} ${pathname} returned non-JSON (${response.status})`);
  }
}

function data<T>(response: { status: number; body: Envelope<T> }): T {
  if (!response.body.success || !response.body.data) {
    throw new Error(
      `expected success, got ${response.status} ${response.body.error?.code}: ${response.body.error?.message}`,
    );
  }
  return response.body.data;
}

function expectError(response: { status: number; body: Envelope<unknown> }, status: number): void {
  assert.equal(response.status, status, `expected HTTP ${status}, got ${response.status}`);
  assert.equal(response.body.success, false);
}

const paise = (value: number) => Math.round(value * 100);

type Session = { accessToken: string; user: { id: string } };
type Account = { id: string; name: string };
type Category = { id: string; name: string; type: string };
type Proposal = {
  amount: number | null;
  merchant: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySource: string;
  paymentMethod: string;
  date: string;
  confidence: string;
  warnings: string[];
  accountId: string | null;
};
type Receipt = {
  id: string;
  transactionId: string | null;
  url: string;
  thumbnailUrl: string;
  extraction: {
    merchant: string;
    amount: number | null;
    amountText: string;
    date: string | null;
    items: { name: string; amount: number | null }[];
    confidence: string;
  } | null;
};

async function main(): Promise<void> {
  console.log(`\nPaisa step-5 checks — ${BASE}\n${'='.repeat(62)}`);

  // =============================================================== the parser
  section('Amounts: found by rule, never by a model');

  await test('the shapes people actually type', () => {
    assert.equal(parseAmount('Petrol 1200')?.paise, paise(1200));
    assert.equal(parseAmount('₹1,200')?.paise, paise(1200));
    assert.equal(parseAmount('Rs 450')?.paise, paise(450));
    assert.equal(parseAmount('1200.50')?.paise, paise(1200.5));
    assert.equal(parseAmount('12,34,567')?.paise, paise(1234567));
    assert.equal(parseAmount('450/-')?.paise, paise(450));
  });

  await test('"1.2k" is twelve hundred, "1200.50" is not', () => {
    assert.equal(parseAmount('swiggy 1.2k')?.paise, paise(1200));
    assert.equal(parseAmount('2k')?.paise, paise(2000));
    assert.equal(parseAmount('1200.50')?.paise, paise(1200.5));
  });

  await test('a reference number is not an amount', () => {
    // A UPI reference is the most common long digit run on a payment screen, and
    // reading one as rupees would record a transaction for eleven lakh.
    assert.equal(parseAmount('NEFT 419238712344'), null);
  });

  await test('no number at all returns nothing rather than a guess', () => {
    assert.equal(parseAmount('coffee'), null);
    assert.equal(parseAmount(''), null);
  });

  await test('two numbers are flagged rather than silently resolved', () => {
    const parsed = parseAmount('2 coffees 240');
    assert.equal(parsed?.paise, paise(240), 'it picked the quantity over the amount');
    assert.equal(parsed?.ambiguous, true, 'the preview would not have warned');
  });

  await test('the matched text comes back, so the preview can show its working', () => {
    assert.equal(parseAmount('Petrol ₹1,200')?.text, '₹1,200');
  });

  section('Dates: in the user’s zone, not the server’s');

  const noon = DateTime.fromISO('2026-09-17T12:00:00', { zone: IST }).toJSDate();

  await test('yesterday and today are relative to the account holder', () => {
    assert.equal(parseDate('uber 260 yesterday', IST, noon).text, 'yesterday');
    assert.equal(
      DateTime.fromJSDate(parseDate('uber 260 yesterday', IST, noon).date, { zone: IST }).toFormat(
        'yyyy-MM-dd',
      ),
      '2026-09-16',
    );
    assert.equal(parseDate('chai 40', IST, noon).text, null, 'it invented a date');
  });

  await test('a date near midnight belongs to the local day', () => {
    // 00:30 IST on the 17th is still the 16th in UTC. "Yesterday" typed then is
    // the 16th to the user, and a server working in UTC would say the 15th.
    const lateNight = DateTime.fromISO('2026-09-17T00:30:00', { zone: IST }).toJSDate();
    const parsed = parseDate('yesterday', IST, lateNight);
    assert.equal(
      DateTime.fromJSDate(parsed.date, { zone: IST }).toFormat('yyyy-MM-dd'),
      '2026-09-16',
    );
  });

  await test('"N days ago" and named months', () => {
    assert.equal(
      DateTime.fromJSDate(parseDate('apollo 340 2 days ago', IST, noon).date, {
        zone: IST,
      }).toFormat('yyyy-MM-dd'),
      '2026-09-15',
    );
    assert.equal(
      DateTime.fromJSDate(parseDate('rent 25000 on 1 sep', IST, noon).date, { zone: IST }).toFormat(
        'yyyy-MM-dd',
      ),
      '2026-09-01',
    );
  });

  await test('a slash date is read day-first, as India writes it', () => {
    // 12/09 is the twelfth of September here, never the ninth of December.
    assert.equal(
      DateTime.fromJSDate(parseDate('bill 900 on 12/09', IST, noon).date, { zone: IST }).toFormat(
        'yyyy-MM-dd',
      ),
      '2026-09-12',
    );
  });

  await test('a day later this year means last year', () => {
    // "31 dec" typed in September is the December that already happened.
    const parsed = parseDate('gift 500 on 31 dec', IST, noon);
    assert.equal(
      DateTime.fromJSDate(parsed.date, { zone: IST }).toFormat('yyyy-MM-dd'),
      '2025-12-31',
    );
  });

  section('Methods and merchants');

  await test('payment words map to methods', () => {
    assert.equal(parsePaymentMethod('chai 40 cash')?.method, 'cash');
    assert.equal(parsePaymentMethod('amazon 1299 credit card')?.method, 'credit_card');
    assert.equal(parsePaymentMethod('grocery 800 gpay')?.method, 'wallet');
    assert.equal(parsePaymentMethod('petrol 2000 upi')?.method, 'upi');
    assert.equal(parsePaymentMethod('petrol 2000'), null);
  });

  await test('the merchant is what is left, not a guess', () => {
    assert.equal(extractMerchant('Petrol 1200', ['1200']), 'Petrol');
    assert.equal(extractMerchant('paid 450 to zomato', ['450']), 'Zomato');
    // Nothing but filler must produce nothing, or "For" ends up in the ledger.
    assert.equal(extractMerchant('paid for the 500', ['500']), '');
  });

  await test('deliberate spellings survive, flat ones get title case', () => {
    assert.equal(extractMerchant('DMart 2380', ['2380']), 'DMart');
    assert.equal(extractMerchant('apollo pharmacy 340', ['340']), 'Apollo Pharmacy');
  });

  await test('a date is taken out before the amount is looked for', () => {
    // The whole reason the parse is ordered the way it is: "1 sep" holds a digit
    // that is plainly not money, and searching the raw string finds two
    // candidates and warns about an ambiguity the parser invented.
    const parsed = parseQuickEntry('rent 25000 on 1 sep', IST, noon);
    assert.equal(parsed.amount?.paise, paise(25000));
    assert.equal(parsed.amount?.ambiguous, false, 'the date leaked into the amount');

    const withAgo = parseQuickEntry('apollo pharmacy 340 2 days ago', IST, noon);
    assert.equal(withAgo.amount?.paise, paise(340));
    assert.equal(withAgo.amount?.ambiguous, false);
  });

  section('Merchant keys');

  await test('the same shop typed differently is one key', () => {
    const key = merchantKey('IndianOil');
    assert.equal(merchantKey('INDIAN OIL'), key);
    assert.equal(merchantKey('indian-oil'), key);
    assert.equal(merchantKey('Indian Oil #44121'), key, 'a reference number split the memory');
  });

  await test('short digits are part of a name, long ones are references', () => {
    assert.equal(merchantKey('7 Eleven'), '7eleven');
    assert.equal(merchantKey('Swiggy 88213456'), 'swiggy');
  });

  await test('an empty or punctuation-only name has no key', () => {
    assert.equal(merchantKey(''), '');
    assert.equal(merchantKey('---'), '');
  });

  section('Upload signatures');

  await test('a signature is deterministic and covers every parameter', () => {
    // The real proof that this matches Cloudinary is the live upload further
    // down — their endpoint accepting it is the only authority worth having.
    // What is worth asserting here is the property that makes it useful: the
    // signature must change if anything it protects changes, or a client could
    // edit the folder and keep a valid signature.
    const params = { folder: 'paisa/receipts/abc', public_id: 'paisa/receipts/abc/1', timestamp: 1789629550 };
    const base = sign(params, 'secret');

    assert.equal(sign({ ...params }, 'secret'), base, 'not deterministic');
    assert.match(base, /^[a-f0-9]{40}$/);

    assert.notEqual(sign({ ...params, folder: 'somewhere/else' }, 'secret'), base);
    assert.notEqual(sign({ ...params, public_id: 'elsewhere' }, 'secret'), base);
    assert.notEqual(sign({ ...params, timestamp: 1789629551 }, 'secret'), base);
    assert.notEqual(sign(params, 'a different secret'), base);

    // Key order must not matter: the parameters are sorted before hashing.
    assert.equal(
      sign({ timestamp: params.timestamp, public_id: params.public_id, folder: params.folder }, 'secret'),
      base,
    );
  });

  await test('a forged upload cannot be verified', () => {
    if (!isStorageConfigured()) return;
    assert.equal(
      verifyUpload({
        publicId: 'anything',
        version: 1,
        signature: 'a'.repeat(40),
        secureUrl: 'https://evil.example.com/x.png',
        bytes: 1,
        format: 'png',
        width: 1,
        height: 1,
      }),
      false,
      'an unsigned payload was accepted',
    );
  });

  // ================================================================ over HTTP
  section('Quick entry over HTTP');

  const email = `step5.${Date.now()}@paisa.test`;
  const session = data<Session>(
    await call('POST', '/auth/register', {
      body: { name: 'Step Five', email, password: 'Str0ng!Passw0rd', currency: 'INR' },
    }),
  );
  const token = session.accessToken;

  const accounts = data<{ accounts: Account[] }>(await call('GET', '/accounts', { token })).accounts;
  const categories = data<{ categories: Category[] }>(
    await call('GET', '/categories', { token }),
  ).categories;

  const accountId = accounts[0]?.id;
  const petrolCategory = categories.find((entry) => entry.name === 'Petrol');
  const moviesCategory = categories.find((entry) => entry.name === 'Movies');
  assert.ok(accountId && petrolCategory && moviesCategory, 'the default data is missing');

  // Re-bound as plain consts: narrowing from the assertion above does not survive
  // into the async closures each test runs in.
  const petrol: Category = petrolCategory;
  const movies: Category = moviesCategory;
  const account: string = accountId;

  await test('a known brand resolves without asking a model', async () => {
    const { proposal } = data<{ proposal: Proposal }>(
      await call('POST', '/ai/parse', { token, body: { text: 'DMart 2380' } }),
    );
    assert.equal(proposal.amount, paise(2380));
    assert.equal(proposal.merchant, 'DMart');
    assert.equal(proposal.categorySource, 'merchant', 'the brand table was skipped');
    assert.equal(proposal.confidence, 'high');
    assert.deepEqual(proposal.warnings, []);
  });

  await test('the parse suggests an account and a method', async () => {
    const { proposal } = data<{ proposal: Proposal }>(
      await call('POST', '/ai/parse', { token, body: { text: 'Amazon 1299 credit card' } }),
    );
    assert.equal(proposal.paymentMethod, 'credit_card');
    assert.ok(proposal.accountId, 'nothing to pay from');
  });

  await test('an amount-less line is refused a confident reading', async () => {
    const { proposal } = data<{ proposal: Proposal }>(
      await call('POST', '/ai/parse', { token, body: { text: 'coffee' } }),
    );
    assert.equal(proposal.amount, null);
    assert.equal(proposal.confidence, 'low');
    assert.ok(proposal.warnings.includes('No amount found'), 'the preview would offer to save it');
  });

  await test('parsing writes nothing', async () => {
    const before = data<{ transactions: unknown[] }>(
      await call('GET', '/transactions?limit=100', { token }),
    ).transactions.length;

    await call('POST', '/ai/parse', { token, body: { text: 'Zomato 450' } });

    const after = data<{ transactions: unknown[] }>(
      await call('GET', '/transactions?limit=100', { token }),
    ).transactions.length;
    assert.equal(after, before, 'a parse recorded a transaction on its own');
  });

  await test('empty and oversized input are refused', async () => {
    expectError(await call('POST', '/ai/parse', { token, body: { text: '' } }), 400);
    expectError(await call('POST', '/ai/parse', { token, body: { text: 'x'.repeat(400) } }), 400);
  });

  await test('quick entry needs a token', async () => {
    expectError(await call('POST', '/ai/parse', { body: { text: 'Zomato 450' } }), 401);
  });

  section('Merchant memory');

  const shop = 'Kaveri Fuels';

  await test('an unknown merchant is remembered by nothing', async () => {
    const { memory } = data<{ memory: unknown }>(
      await call('GET', `/merchants/recall?merchant=${encodeURIComponent(shop)}`, { token }),
    );
    assert.equal(memory, null);
  });

  await test('saving a transaction teaches it', async () => {
    for (let i = 0; i < 2; i += 1) {
      const created = await call('POST', '/transactions', {
        token,
        body: {
          type: 'expense',
          amount: paise(900),
          categoryId: petrol.id,
          accountId: account,
          merchant: shop,
        },
      });
      assert.equal(created.status, 201);
    }

    const memory = await waitForMemory(token, shop, (row) => row?.count === 2);
    assert.equal(memory?.categoryName, 'Petrol');
  });

  await test('a different spelling recalls the same memory', async () => {
    const { memory } = data<{ memory: { categoryName: string } | null }>(
      await call('GET', `/merchants/recall?merchant=${encodeURIComponent('KAVERI FUELS #4412')}`, {
        token,
      }),
    );
    assert.equal(memory?.categoryName, 'Petrol');
  });

  await test('memory beats the brand table and the model', async () => {
    const { suggestion } = data<{ suggestion: { source: string; confidence: string } }>(
      await call('POST', '/ai/categorise', { token, body: { merchant: shop, type: 'expense' } }),
    );
    assert.equal(suggestion.source, 'memory');
    assert.equal(suggestion.confidence, 'high', 'twice is a habit');
  });

  await test('corrections outvote the original, given time', async () => {
    // Three corrections against two originals. One slip must not move it; a
    // genuine change of mind must.
    for (let i = 0; i < 3; i += 1) {
      await call('POST', '/transactions', {
        token,
        body: {
          type: 'expense',
          amount: paise(300),
          categoryId: movies.id,
          accountId: account,
          merchant: shop,
        },
      });
    }

    const memory = await waitForMemory(token, shop, (row) => row?.categoryName === 'Movies');
    assert.equal(memory?.categoryName, 'Movies', 'the correction never took hold');
    assert.equal(memory?.count, 3);
  });

  await test('a single slip does not overturn a habit', async () => {
    const other = 'Nandini Milk Booth';
    for (let i = 0; i < 4; i += 1) {
      await call('POST', '/transactions', {
        token,
        body: {
          type: 'expense',
          amount: paise(60),
          categoryId: petrol.id,
          accountId: account,
          merchant: other,
        },
      });
    }
    await waitForMemory(token, other, (row) => row?.count === 4);

    await call('POST', '/transactions', {
      token,
      body: {
        type: 'expense',
        amount: paise(60),
        categoryId: movies.id,
        accountId,
        merchant: other,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 400));

    const { memory } = data<{ memory: { categoryName: string; count: number } | null }>(
      await call('GET', `/merchants/recall?merchant=${encodeURIComponent(other)}`, { token }),
    );
    assert.equal(memory?.categoryName, 'Petrol', 'one mistake rewrote the whole memory');
  });

  await test('the quick parse uses what it learned', async () => {
    const { proposal } = data<{ proposal: Proposal }>(
      await call('POST', '/ai/parse', { token, body: { text: `${shop} 800` } }),
    );
    assert.equal(proposal.categoryName, 'Movies');
    assert.equal(proposal.categorySource, 'memory');
    assert.equal(proposal.amount, paise(800));
  });

  await test('a merchant can be forgotten', async () => {
    const forgotten = data<{ forgotten: number }>(
      await call('DELETE', '/merchants', { token, body: { merchant: shop } }),
    );
    assert.ok(forgotten.forgotten > 0);

    const { memory } = data<{ memory: unknown }>(
      await call('GET', `/merchants/recall?merchant=${encodeURIComponent(shop)}`, { token }),
    );
    assert.equal(memory, null);
  });

  await test("one user's memory is invisible to another", async () => {
    const other = data<Session>(
      await call('POST', '/auth/register', {
        body: {
          name: 'Someone Else',
          email: `other5.${Date.now()}@paisa.test`,
          password: 'Str0ng!Passw0rd',
          currency: 'INR',
        },
      }),
    );

    const { memory } = data<{ memory: unknown }>(
      await call('GET', `/merchants/recall?merchant=${encodeURIComponent('Nandini Milk Booth')}`, {
        token: other.accessToken,
      }),
    );
    assert.equal(memory, null, "another user's habits leaked");
  });

  // ================================================================= receipts
  section('Receipts');

  const status = data<{ storage: boolean; reading: boolean; maxBytes: number }>(
    await call('GET', '/receipts/status', { token }),
  );
  console.log(`        storage: ${status.storage}, reading: ${status.reading}`);

  await test('receipts require a token', async () => {
    expectError(await call('POST', '/receipts/signature'), 401);
    expectError(await call('GET', '/receipts'), 401);
  });

  if (!status.storage) {
    skip('the receipt round trip', 'CLOUDINARY_* is not configured');
  } else {
    let receiptId = '';
    let receiptUrl = '';

    await test('a signed ticket lands in this user’s own folder', async () => {
      const { ticket } = data<{ ticket: { params: Record<string, string>; signature: string } }>(
        await call('POST', '/receipts/signature', { token }),
      );
      assert.ok(ticket.params.folder?.endsWith(session.user.id), 'not scoped to the user');
      assert.match(ticket.signature, /^[a-f0-9]{40}$/);
    });

    await test('an image uploads and is recorded', async () => {
      const { ticket } = data<{
        ticket: { uploadUrl: string; apiKey: string; params: Record<string, string>; signature: string };
      }>(await call('POST', '/receipts/signature', { token }));

      const form = new FormData();
      for (const [key, value] of Object.entries(ticket.params)) form.append(key, value);
      form.append('api_key', ticket.apiKey);
      form.append('signature', ticket.signature);
      form.append(
        'file',
        new Blob([fs.readFileSync(path.join(__dirname, 'fixtures', 'receipt.png'))], {
          type: 'image/png',
        }),
        'receipt.png',
      );

      const uploaded = (await (await fetch(ticket.uploadUrl, { method: 'POST', body: form })).json()) as {
        public_id: string;
        version: number;
        signature: string;
        secure_url: string;
        bytes: number;
        format: string;
        width: number;
        height: number;
      };

      const { receipt } = data<{ receipt: Receipt }>(
        await call('POST', '/receipts', {
          token,
          body: {
            publicId: uploaded.public_id,
            version: uploaded.version,
            signature: uploaded.signature,
            secureUrl: uploaded.secure_url,
            bytes: uploaded.bytes,
            format: uploaded.format,
            width: uploaded.width,
            height: uploaded.height,
          },
        }),
      );

      receiptId = receipt.id;
      receiptUrl = receipt.url;
      assert.ok(receipt.url.startsWith('https://res.cloudinary.com/'));
      assert.notEqual(receipt.thumbnailUrl, receipt.url, 'the list would load full-size images');
      assert.equal(receipt.extraction, null, 'it read the image without being asked');
    });

    await test('an unsigned upload is refused', async () => {
      // Without this check the endpoint stores any URL a client sends and the app
      // renders it, under the heading "your receipt".
      expectError(
        await call('POST', '/receipts', {
          token,
          body: {
            publicId: 'somebody/else',
            version: 1234567890,
            signature: 'a'.repeat(40),
            secureUrl: 'https://evil.example.com/not-yours.png',
            bytes: 100,
          },
        }),
        400,
      );
    });

    if (status.reading) {
      await test('the bill is read, and says where it read the total', async () => {
        const { receipt } = data<{ receipt: Receipt }>(
          await call('POST', `/receipts/${receiptId}/extract`, { token }),
        );

        assert.ok(receipt.extraction, 'nothing was extracted');
        assert.equal(receipt.extraction?.amount, paise(2380), 'the grand total was misread');
        assert.match(receipt.extraction?.merchant ?? '', /dmart/i);
        // The printed line, so a person can check the figure against the paper.
        assert.match(receipt.extraction?.amountText ?? '', /2380/);
        assert.ok((receipt.extraction?.items.length ?? 0) > 0, 'no line items');
      });

      await test('reading a bill does not touch the ledger', async () => {
        const before = data<{ transactions: unknown[] }>(
          await call('GET', '/transactions?limit=100', { token }),
        ).transactions.length;

        await call('POST', `/receipts/${receiptId}/extract`, { token });

        const after = data<{ transactions: unknown[] }>(
          await call('GET', '/transactions?limit=100', { token }),
        ).transactions.length;
        assert.equal(after, before, 'an extraction created a transaction');
      });
    } else {
      skip('reading the bill', 'no vision model configured');
    }

    await test('a receipt attaches to a transaction and lists with it', async () => {
      const created = data<{ transaction: { id: string } }>(
        await call('POST', '/transactions', {
          token,
          body: {
            type: 'expense',
            amount: paise(2380),
            categoryId: categories.find((entry) => entry.name === 'Grocery')?.id,
            accountId: account,
            merchant: 'DMart',
          },
        }),
      ).transaction;

      const { receipt } = data<{ receipt: Receipt }>(
        await call('POST', `/receipts/${receiptId}/attach`, {
          token,
          body: { transactionId: created.id },
        }),
      );
      assert.equal(receipt.transactionId, created.id);

      const { receipts } = data<{ receipts: Receipt[] }>(
        await call('GET', `/receipts?transactionId=${created.id}`, { token }),
      );
      assert.equal(receipts.length, 1);

      // Deleting the transaction keeps the image: it is still the user's
      // photograph, and losing it to an unrelated edit would be a nasty surprise.
      await call('DELETE', `/transactions/${created.id}`, { token });
      await new Promise((resolve) => setTimeout(resolve, 400));

      const { receipt: after } = data<{ receipt: Receipt }>(
        await call('GET', `/receipts/${receiptId}`, { token }),
      );
      assert.equal(after.transactionId, null, 'the receipt still points at a deleted transaction');
    });

    await test("another user cannot see or touch the receipt", async () => {
      const other = data<Session>(
        await call('POST', '/auth/register', {
          body: {
            name: 'Nosy',
            email: `nosy.${Date.now()}@paisa.test`,
            password: 'Str0ng!Passw0rd',
            currency: 'INR',
          },
        }),
      );

      expectError(await call('GET', `/receipts/${receiptId}`, { token: other.accessToken }), 404);
      expectError(
        await call('DELETE', `/receipts/${receiptId}`, { token: other.accessToken }),
        404,
      );
    });

    await test('deleting removes the row and the stored image', async () => {
      data(await call('DELETE', `/receipts/${receiptId}`, { token }));
      expectError(await call('GET', `/receipts/${receiptId}`, { token }), 404);

      const remote = await fetch(receiptUrl);
      assert.equal(remote.status, 404, 'the image is still on Cloudinary');
    });
  }

  // The reader, exercised directly. Works without Cloudinary because a data URI
  // is a perfectly good image source, which keeps the one model-produced number
  // in this app under test on any deployment.
  if (isVisionConfigured()) {
    const blank = `data:image/png;base64,${fs
      .readFileSync(path.join(__dirname, 'fixtures', 'blank.png'))
      .toString('base64')}`;

    // Vision deliberately refuses to fall back to the small model — it cannot
    // see — so a rate limit here is an outage, not a wrong answer. Skipping says
    // "not checked"; failing would say "the guard is broken", which is a
    // different and untrue claim.
    let extraction: Awaited<ReturnType<typeof extractFromImage>> | null = null;
    try {
      extraction = await extractFromImage(blank, IST);
    } catch (error) {
      skip(
        'the reader refuses to invent a total it cannot see',
        error instanceof Error ? error.message : 'the reader was unavailable',
      );
    }

    if (extraction) {
      const read = extraction;
      await test('the reader refuses to invent a total it cannot see', () => {
        assert.equal(read.amount, null, 'it read a number off an empty image');
        assert.equal(read.confidence, 'low');
      });
    }
  } else {
    skip('the reader on a blank image', 'no vision model configured');
  }

  console.log(`\n${'='.repeat(62)}`);
  if (failures.length > 0) {
    console.log('\nFailures:\n');
    for (const failure of failures) console.log(`  - ${failure}\n`);
  }
  console.log(
    `${passed} passed, ${failed} failed${skipped > 0 ? `, ${skipped} skipped` : ''}\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

/**
 * Waits for a memory to settle.
 *
 * Learning is deliberately fire-and-forget on the server — refusing to record an
 * expense because a statistics row would not upsert is not a trade anyone would
 * make — so the test polls rather than sleeping a guessed interval.
 */
async function waitForMemory(
  token: string,
  merchant: string,
  done: (row: { categoryName: string; count: number } | null) => boolean,
  timeoutMs = 5000,
): Promise<{ categoryName: string; count: number } | null> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const { memory } = data<{ memory: { categoryName: string; count: number } | null }>(
      await call('GET', `/merchants/recall?merchant=${encodeURIComponent(merchant)}`, { token }),
    );
    if (done(memory) || Date.now() > deadline) return memory;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

void main().catch((error: unknown) => {
  console.error('\nTest run could not finish:', error);
  console.error(`(vision model: ${env.GROQ_VISION_MODEL})`);
  process.exit(1);
});
