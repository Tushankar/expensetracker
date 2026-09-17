import { DateTime } from 'luxon';

/**
 * Every boundary the server computes for itself — which month a budget is for,
 * when a recurring rule fires next, which day a transaction falls in — is a
 * *local* boundary, and local means the user's zone rather than the server's.
 *
 * Getting this wrong is not a rounding error. A transaction entered at 11pm IST
 * on the 30th lands in the following month under UTC, which moves it out of the
 * budget it was meant to count against and into one that has not started yet.
 * The user sees a budget that does not add up and no way to explain it.
 *
 * Luxon rather than hand-rolled `Intl` arithmetic. India has no DST, so nothing
 * here would visibly break today — but "our users do not have DST" is an
 * assumption that quietly becomes false the first time someone travels, and
 * offset maths is the classic place to be subtly wrong for years.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** True for an IANA zone this build can actually resolve. */
export function isValidTimezone(zone: string): boolean {
  return DateTime.local().setZone(zone).isValid;
}

export function zoneOrDefault(zone: string | undefined | null): string {
  return zone && isValidTimezone(zone) ? zone : DEFAULT_TIMEZONE;
}

export type Range = { from: Date; to: Date };

function at(instant: Date, zone: string): DateTime {
  return DateTime.fromJSDate(instant, { zone });
}

/** Local midnight that starts the day `instant` falls in. */
export function startOfDay(instant: Date, zone: string): Date {
  return at(instant, zone).startOf('day').toJSDate();
}

/** The last millisecond of that same local day. */
export function endOfDay(instant: Date, zone: string): Date {
  return at(instant, zone).endOf('day').toJSDate();
}

export function dayRange(instant: Date, zone: string): Range {
  return { from: startOfDay(instant, zone), to: endOfDay(instant, zone) };
}

/**
 * The calendar month `instant` falls in, as a half-open-feeling inclusive range.
 *
 * `endOf('month')` is 23:59:59.999 local, which is what a `$lte` filter wants —
 * an exclusive "first of next month" bound would need every caller to remember
 * which comparison to use.
 */
export function monthRange(instant: Date, zone: string): Range {
  const local = at(instant, zone);
  return { from: local.startOf('month').toJSDate(), to: local.endOf('month').toJSDate() };
}

/** The same, for a `YYYY-MM` key rather than an instant. */
export function monthRangeFromKey(key: string, zone: string): Range {
  const local = DateTime.fromFormat(key, 'yyyy-MM', { zone });
  if (!local.isValid) throw new Error(`Not a YYYY-MM month: ${key}`);
  return { from: local.startOf('month').toJSDate(), to: local.endOf('month').toJSDate() };
}

/** `YYYY-MM` for the month an instant falls in, locally. */
export function monthKey(instant: Date, zone: string): string {
  return at(instant, zone).toFormat('yyyy-MM');
}

/** `YYYY-MM-DD` for the local day an instant falls in. */
export function dayKey(instant: Date, zone: string): string {
  return at(instant, zone).toFormat('yyyy-MM-dd');
}

/**
 * The week `instant` falls in, Monday to Sunday.
 *
 * Luxon's ISO week starts on Monday, which is also how an Indian work week is
 * counted — a Sunday-first week would put a Saturday and the Sunday after it in
 * different weeks, which is not how anyone thinks about a weekend's spending.
 */
export function weekRange(instant: Date, zone: string): Range {
  const local = at(instant, zone);
  return { from: local.startOf('week').toJSDate(), to: local.endOf('week').toJSDate() };
}

export function yearRange(instant: Date, zone: string): Range {
  const local = at(instant, zone);
  return { from: local.startOf('year').toJSDate(), to: local.endOf('year').toJSDate() };
}

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

/**
 * The instant of the `index`-th occurrence after an anchor, counting from zero.
 *
 * Computed from the anchor every time rather than by repeatedly adding one
 * interval to the last result, because the two disagree at month ends: a rule
 * anchored on the 31st advanced step-by-step becomes the 28th in February and
 * then *stays* the 28th forever. Anchoring keeps the 31st and only clamps the
 * months that are short, which is what "monthly on the 31st" means to a person.
 */
export function occurrenceAt(
  anchor: Date,
  unit: RecurrenceUnit,
  interval: number,
  index: number,
  zone: string,
): Date {
  const steps = interval * index;
  return at(anchor, zone)
    .plus({ [`${unit}s`]: steps })
    .toJSDate();
}

/**
 * How many whole intervals have elapsed since the anchor — used to fast-forward a
 * rule that was paused, or that nobody ran while the process was down, without
 * looping once per missed occurrence.
 */
export function occurrencesElapsed(
  anchor: Date,
  unit: RecurrenceUnit,
  interval: number,
  until: Date,
  zone: string,
): number {
  const start = at(anchor, zone);
  const end = at(until, zone);
  if (end <= start) return 0;

  const diff = end.diff(start, `${unit}s`).as(`${unit}s`);
  return Math.max(0, Math.floor(diff / interval));
}

/** A human label for a day, in the user's zone. Used in notification copy. */
export function formatDay(instant: Date, zone: string): string {
  return at(instant, zone).toFormat('d LLL');
}

/**
 * Parses a client-supplied `YYYY-MM-DD` as a local day in `zone`.
 *
 * Custom ranges arrive as calendar dates, not instants: the user picked "12
 * September", and which instant that starts at depends on where they are.
 */
export function parseLocalDay(value: string, zone: string, edge: 'start' | 'end'): Date {
  const local = DateTime.fromFormat(value, 'yyyy-MM-dd', { zone });
  if (!local.isValid) throw new Error(`Not a YYYY-MM-DD date: ${value}`);
  return (edge === 'start' ? local.startOf('day') : local.endOf('day')).toJSDate();
}
