import assert from 'node:assert/strict';

import {
  applyAmountKey,
  formatAmountInput,
  formatCompactINR,
  formatINR,
  groupIndian,
  paiseToRupeeInput,
  percentChange,
  rupeesToPaise,
} from '../src/utils/currency';
import { formatDayLabel, formatTime, groupByDay, monthRangeLabel } from '../src/utils/date';
import { periodRange } from '../src/utils/period';

/**
 * Unit checks for the pure logic behind the screens.
 *
 *   npm run verify
 *
 * These are the parts that are easy to get quietly wrong and impossible to eyeball
 * in a simulator: Indian digit grouping, what each keypad press does to the amount,
 * and where a period's boundaries land. The API's own behaviour is covered by
 * `server/src/scripts/apitest.ts`, which runs against a real database.
 *
 * Run with Node's type stripping — no test framework, because three dependencies to
 * assert `groupIndian(1234567) === '12,34,567'` is three dependencies too many.
 */

let passed = 0;
let failed = 0;

function test(name: string, run: () => void): void {
  try {
    run();
    passed += 1;
    console.log(`  [32mPASS[0m  ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  [31mFAIL[0m  ${name}`);
    console.log(`        ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
}

function section(title: string): void {
  console.log(`\n[1m${title}[0m`);
}

console.log(`\nPaisa app checks\n${'='.repeat(60)}`);

// ------------------------------------------------------------------- currency
section('Indian number formatting');

test('groups the last three digits, then pairs', () => {
  assert.equal(groupIndian(1), '1');
  assert.equal(groupIndian(999), '999');
  assert.equal(groupIndian(1000), '1,000');
  assert.equal(groupIndian(99999), '99,999');
  assert.equal(groupIndian(100000), '1,00,000');
  assert.equal(groupIndian(1234567), '12,34,567');
  assert.equal(groupIndian(123456789), '12,34,56,789');
});

test('formats paise as rupees', () => {
  assert.equal(formatINR(124800), '₹1,248');
  assert.equal(formatINR(0), '₹0');
  assert.equal(formatINR(124850, { showPaise: true }), '₹1,248.50');
  assert.equal(formatINR(124800, { symbol: false }), '1,248');
});

test('a negative balance keeps its minus without being asked', () => {
  assert.equal(formatINR(-1846000), '−₹18,460');
});

test('signed amounts use a real minus sign, not a hyphen', () => {
  assert.equal(formatINR(45000, { signed: true, negative: true }), '−₹450');
  assert.equal(formatINR(45000, { signed: true }), '+₹450');
  // U+2212, which aligns with digits; a hyphen does not.
  assert.ok(formatINR(45000, { signed: true, negative: true }).startsWith('−'));
});

test('compact form uses lakh and crore, not millions', () => {
  assert.equal(formatCompactINR(450000), '₹4.5K');
  assert.equal(formatCompactINR(12500000), '₹1.3L');
  assert.equal(formatCompactINR(125000000), '₹12.5L');
  assert.equal(formatCompactINR(1500000000), '₹1.5Cr');
});

test('rupee text converts to paise without float drift', () => {
  assert.equal(rupeesToPaise('1248.50'), 124850);
  assert.equal(rupeesToPaise('0.1'), 10);
  assert.equal(rupeesToPaise('1,248'), 124800);
  assert.equal(rupeesToPaise(''), 0);
  assert.equal(rupeesToPaise('abc'), 0);
  // The classic IEEE-754 trap: 19.99 * 100 is 1998.9999999999998.
  assert.equal(rupeesToPaise('19.99'), 1999);
});

test('paise round-trip back to the amount field', () => {
  assert.equal(paiseToRupeeInput(124850), '1248.50');
  assert.equal(paiseToRupeeInput(124800), '1248');
  assert.equal(paiseToRupeeInput(5), '0.05');
});

test('percent change reports null when there is no baseline', () => {
  assert.equal(percentChange(100, 0), null);
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(50, 100), -50);
});

// -------------------------------------------------------------------- keypad
section('Amount keypad');

test('digits append', () => {
  assert.equal(applyAmountKey('', '1'), '1');
  assert.equal(applyAmountKey('12', '4'), '124');
});

test('a leading zero is replaced, not extended', () => {
  assert.equal(applyAmountKey('0', '5'), '5');
});

test('there is only ever one decimal point', () => {
  assert.equal(applyAmountKey('12', '.'), '12.');
  assert.equal(applyAmountKey('12.', '.'), '12.');
  assert.equal(applyAmountKey('12.5', '.'), '12.5');
});

test('a point with nothing before it becomes 0.', () => {
  assert.equal(applyAmountKey('', '.'), '0.');
});

test('paise stop at two decimals', () => {
  assert.equal(applyAmountKey('12.5', '0'), '12.50');
  assert.equal(applyAmountKey('12.50', '9'), '12.50');
});

test('backspace removes one character and stops at empty', () => {
  assert.equal(applyAmountKey('124', 'back'), '12');
  assert.equal(applyAmountKey('1', 'back'), '');
  assert.equal(applyAmountKey('', 'back'), '');
});

test('the whole part is capped so a double still holds it exactly', () => {
  assert.equal(applyAmountKey('123456789', '0'), '123456789');
});

test('the display groups as you type and keeps a half-typed decimal', () => {
  assert.equal(formatAmountInput(''), '0');
  assert.equal(formatAmountInput('1234567'), '12,34,567');
  assert.equal(formatAmountInput('1248.'), '1,248.');
  assert.equal(formatAmountInput('1248.5'), '1,248.5');
});

test('every reachable sequence produces a valid amount', () => {
  // Fuzz the rules against each other: whatever someone types, the field must
  // always parse, so there is no "that is not a number" state to design.
  const keys = ['0', '1', '5', '9', '.', 'back'];
  let value = '';
  let seed = 42;
  for (let index = 0; index < 5000; index += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    value = applyAmountKey(value, keys[seed % keys.length] as string);
    assert.ok(Number.isFinite(rupeesToPaise(value)), `unparseable: "${value}"`);
    assert.ok((value.match(/\./g) ?? []).length <= 1, `two points: "${value}"`);
    const fraction = value.split('.')[1];
    assert.ok(fraction === undefined || fraction.length <= 2, `too many paise: "${value}"`);
  }
});

// ---------------------------------------------------------------------- dates
section('Dates');

test('day labels are relative for the two days people care about', () => {
  const now = new Date(2026, 8, 16, 12, 0, 0);
  const yesterday = new Date(2026, 8, 15, 23, 30, 0);
  assert.equal(formatDayLabel(now.toISOString(), now), 'Today');
  assert.equal(formatDayLabel(yesterday.toISOString(), now), 'Yesterday');
  assert.equal(formatDayLabel(new Date(2026, 8, 2).toISOString(), now), '2 Sep');
  // The year only appears once the date leaves the current one.
  assert.equal(formatDayLabel(new Date(2025, 11, 25).toISOString(), now), '25 Dec 2025');
});

test('times use a 12-hour clock with a lowercase meridiem', () => {
  assert.equal(formatTime(new Date(2026, 8, 16, 0, 5).toISOString()), '12:05 am');
  assert.equal(formatTime(new Date(2026, 8, 16, 13, 7).toISOString()), '1:07 pm');
  assert.equal(formatTime(new Date(2026, 8, 16, 12, 0).toISOString()), '12:00 pm');
});

test('grouping by day keeps the list order', () => {
  const now = new Date(2026, 8, 16, 12, 0, 0);
  const groups = groupByDay(
    [
      { date: new Date(2026, 8, 16, 19).toISOString() },
      { date: new Date(2026, 8, 16, 9).toISOString() },
      { date: new Date(2026, 8, 15, 18).toISOString() },
    ].map((row) => ({ occurredAt: row.date })),
    now,
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.label, 'Today');
  assert.equal(groups[0]?.items.length, 2);
  assert.equal(groups[1]?.label, 'Yesterday');
});

test('a month range names its last day correctly, leap year included', () => {
  assert.equal(monthRangeLabel(new Date(2026, 1, 10)), '1–28 February');
  assert.equal(monthRangeLabel(new Date(2028, 1, 10)), '1–29 February');
  assert.equal(monthRangeLabel(new Date(2026, 8, 10)), '1–30 September');
});

// -------------------------------------------------------------------- periods
section('Period ranges');

const now = new Date(2026, 8, 16, 14, 30, 0);

test('this month runs from local midnight to the last millisecond', () => {
  const range = periodRange('month', now);
  const from = new Date(range.from);
  const to = new Date(range.to);

  assert.equal(from.getDate(), 1);
  assert.equal(from.getMonth(), 8);
  assert.equal(from.getHours(), 0);
  assert.equal(to.getDate(), 30);
  assert.equal(to.getHours(), 23);
  assert.equal(to.getMinutes(), 59);
});

test('the comparison window is the month immediately before', () => {
  const range = periodRange('month', now);
  assert.equal(new Date(range.previousFrom).getMonth(), 7);
  assert.equal(new Date(range.previousTo).getMonth(), 7);
  assert.equal(new Date(range.previousTo).getDate(), 31);
});

test('last month selects August and compares against July', () => {
  const range = periodRange('last', now);
  assert.equal(new Date(range.from).getMonth(), 7);
  assert.equal(new Date(range.to).getMonth(), 7);
  assert.equal(new Date(range.previousFrom).getMonth(), 6);
  assert.equal(range.label, 'August 2026');
});

test('three months covers July to September and compares with April to June', () => {
  const range = periodRange('3m', now);
  assert.equal(new Date(range.from).getMonth(), 6);
  assert.equal(new Date(range.to).getMonth(), 8);
  assert.equal(new Date(range.previousFrom).getMonth(), 3);
  assert.equal(new Date(range.previousTo).getMonth(), 5);
});

test('six months covers April to September', () => {
  const range = periodRange('6m', now);
  assert.equal(new Date(range.from).getMonth(), 3);
  assert.equal(new Date(range.to).getMonth(), 8);
});

test('the year runs January to December and compares with the year before', () => {
  const range = periodRange('year', now);
  assert.equal(new Date(range.from).getFullYear(), 2026);
  assert.equal(new Date(range.from).getMonth(), 0);
  assert.equal(new Date(range.to).getMonth(), 11);
  assert.equal(new Date(range.previousFrom).getFullYear(), 2025);
  assert.equal(range.label, '2026');
});

test('ranges never overlap their own comparison window', () => {
  for (const period of ['month', 'last', '3m', '6m', 'year'] as const) {
    const range = periodRange(period, now);
    assert.ok(
      new Date(range.previousTo).getTime() < new Date(range.from).getTime(),
      `${period}: the previous window runs into the current one`,
    );
    assert.ok(
      new Date(range.from).getTime() < new Date(range.to).getTime(),
      `${period}: the range is inverted`,
    );
  }
});

test('a year boundary does not roll the previous month into the wrong year', () => {
  const january = new Date(2026, 0, 10, 12);
  const range = periodRange('month', january);
  assert.equal(new Date(range.previousFrom).getFullYear(), 2025);
  assert.equal(new Date(range.previousFrom).getMonth(), 11);
});

console.log(`\n${'='.repeat(60)}\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
