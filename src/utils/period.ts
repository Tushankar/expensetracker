import { monthLabel, monthRangeLabel } from './date';

/**
 * The windows the dashboard can summarise over.
 *
 * Declared here rather than beside the control that renders them, because the
 * range maths is the primary thing and a chip row is one way of choosing it — a
 * utility reaching back into a component for a type is the dependency pointing
 * the wrong way.
 */
export type Period = 'week' | 'month' | 'last' | '3m' | '6m' | 'year' | 'custom';

export type PeriodSelection = {
  period: Period;
  /** Local `YYYY-MM-DD` days. Only read when `period` is `custom`. */
  customFrom?: string;
  customTo?: string;
};

/** The four the picker leads with. The rest are presets inside the range sheet. */
export const PRIMARY_PERIODS: readonly { value: Period; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'last', label: 'Last Month' },
  { value: 'custom', label: 'Custom' },
];

export const EXTRA_PERIODS: readonly { value: Period; label: string }[] = [
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: 'year', label: 'This year' },
];

export const ALL_PERIODS: readonly { value: Period; label: string }[] = [
  ...PRIMARY_PERIODS.filter((option) => option.value !== 'custom'),
  ...EXTRA_PERIODS,
];

export type Range = {
  /** Inclusive start, ISO. */
  from: string;
  /** Inclusive end, ISO. */
  to: string;
  label: string;
  /** The equivalent window immediately before, for the "vs last" comparisons. */
  previousFrom: string;
  previousTo: string;
  /**
   * `YYYY-MM` for the month this window sits in, which is what budget progress is
   * always scoped to. A week in September asks for September's budgets.
   */
  monthKey: string;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function shiftMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Monday, because that is how a week is counted here and because a Sunday-first
 * week puts a Saturday and the Sunday after it in different weeks — which is not
 * how anyone thinks about a weekend's spending.
 */
function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const backToMonday = day === 0 ? 6 : day - 1;
  return startOfDay(addDays(date, -backToMonday));
}

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` for a local day. The format the custom range and calendar use. */
export function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** Parses a `YYYY-MM-DD` back into a local date. */
export function dayFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function shortDay(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()] ?? ''}`;
}

/**
 * Turns a period selection into the date window the API takes, plus the window
 * immediately before it.
 *
 * Boundaries are local midnight to local 23:59:59.999, not UTC. A transaction
 * entered at 11pm IST on the 31st belongs to that month, and comparing against a
 * UTC boundary would quietly move it into the next one for everyone east of
 * Greenwich — which is to say, for every user this app is built for. The server
 * does the same arithmetic in the account's stored zone; keeping the two in step
 * is why the app syncs the device zone on launch.
 */
export function periodRange(selection: PeriodSelection | Period, now: Date = new Date()): Range {
  const value: PeriodSelection =
    typeof selection === 'string' ? { period: selection } : selection;

  switch (value.period) {
    case 'week': {
      const from = startOfWeek(now);
      const to = endOfDay(addDays(from, 6));
      const previousFrom = addDays(from, -7);
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        label: `${shortDay(from)} – ${shortDay(to)}`,
        previousFrom: previousFrom.toISOString(),
        previousTo: endOfDay(addDays(previousFrom, 6)).toISOString(),
        monthKey: monthKeyOf(now),
      };
    }

    case 'last': {
      const month = shiftMonths(now, -1);
      const before = shiftMonths(now, -2);
      return {
        from: startOfMonth(month).toISOString(),
        to: endOfMonth(month).toISOString(),
        label: monthLabel(month),
        previousFrom: startOfMonth(before).toISOString(),
        previousTo: endOfMonth(before).toISOString(),
        // Budgets follow the month being looked at, not the month it is now.
        monthKey: monthKeyOf(month),
      };
    }

    case '3m':
      return rollingMonths(now, 3, 'Last 3 months');

    case '6m':
      return rollingMonths(now, 6, 'Last 6 months');

    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return {
        from: start.toISOString(),
        to: end.toISOString(),
        label: String(now.getFullYear()),
        previousFrom: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
        previousTo: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999).toISOString(),
        monthKey: monthKeyOf(now),
      };
    }

    case 'custom': {
      // A half-set custom range falls back to the current month rather than
      // producing an inverted window the API would reject.
      if (!value.customFrom || !value.customTo) return periodRange('month', now);

      const from = startOfDay(dayFromKey(value.customFrom));
      const to = endOfDay(dayFromKey(value.customTo));
      const span = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));

      const sameDay = dayKeyOf(from) === dayKeyOf(to);
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        label: sameDay ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`,
        // The same number of days again, immediately before — the only honest
        // comparison for an arbitrary window.
        previousFrom: startOfDay(addDays(from, -span)).toISOString(),
        previousTo: endOfDay(addDays(from, -1)).toISOString(),
        monthKey: monthKeyOf(from),
      };
    }

    default:
      return {
        from: startOfMonth(now).toISOString(),
        to: endOfMonth(now).toISOString(),
        label: monthRangeLabel(now),
        previousFrom: startOfMonth(shiftMonths(now, -1)).toISOString(),
        previousTo: endOfMonth(shiftMonths(now, -1)).toISOString(),
        monthKey: monthKeyOf(now),
      };
  }
}

/** A window of whole months ending with the current one. */
function rollingMonths(now: Date, months: number, label: string): Range {
  const start = startOfMonth(shiftMonths(now, -(months - 1)));
  const end = endOfMonth(now);
  const previousStart = startOfMonth(shiftMonths(now, -(months * 2 - 1)));
  const previousEnd = endOfMonth(shiftMonths(now, -months));

  return {
    from: start.toISOString(),
    to: end.toISOString(),
    label,
    previousFrom: previousStart.toISOString(),
    previousTo: previousEnd.toISOString(),
    monthKey: monthKeyOf(now),
  };
}

/** The label for a selection, without computing the whole range. */
export function periodLabel(selection: PeriodSelection, now: Date = new Date()): string {
  return periodRange(selection, now).label;
}

/**
 * The window "Export transactions" asks for: everything, expressed as the widest
 * range the API will accept.
 *
 * The server caps an export at `5 * 366` days. Anchoring the start to the first
 * of the month instead of to today put the window at 1,843 days, so the button
 * returned 400 from the 6th of every month onwards. Anchored to the day it is at
 * most 1,828 days — five calendar years, both possible leap days, and the slack
 * between local midnight and now.
 *
 * It lives here, beside the other range maths, so the export test can assert
 * against the same function the button calls rather than a copy of it that can
 * drift.
 */
export function exportWindow(now: Date = new Date()): { from: string; to: string } {
  const from = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return { from: from.toISOString(), to: now.toISOString() };
}

/** The server's own limit, so a caller can assert it rather than restate it. */
export const EXPORT_MAX_DAYS = 5 * 366;
