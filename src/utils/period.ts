import { monthLabel, monthRangeLabel } from './date';

/**
 * The windows the app can summarise over.
 *
 * Declared here rather than beside the card that renders the chips, because the
 * range maths is the primary thing and the chips are one way of choosing it —
 * a utility reaching back into a component for a type is the dependency pointing
 * the wrong way.
 */
export type Period = 'month' | 'last' | '3m' | '6m' | 'year';

export const PERIOD_OPTIONS: readonly { value: Period; label: string }[] = [
  { value: 'month', label: 'This Month' },
  { value: 'last', label: 'Last Month' },
  { value: '3m', label: '3 Months' },
  { value: '6m', label: '6 Months' },
  { value: 'year', label: 'This Year' },
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
};

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function shiftMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/**
 * Turns a period chip into the date window the summary endpoint takes, plus the
 * window before it.
 *
 * Boundaries are local midnight to local 23:59:59.999, not UTC. A transaction
 * entered at 11pm IST on the 31st belongs to that month, and comparing against a
 * UTC boundary would quietly move it into the next one for everyone east of
 * Greenwich — which is to say, for every user this app is built for.
 */
export function periodRange(period: Period, now: Date = new Date()): Range {
  switch (period) {
    case 'last': {
      const month = shiftMonths(now, -1);
      const before = shiftMonths(now, -2);
      return {
        from: startOfMonth(month).toISOString(),
        to: endOfMonth(month).toISOString(),
        label: monthLabel(month),
        previousFrom: startOfMonth(before).toISOString(),
        previousTo: endOfMonth(before).toISOString(),
      };
    }

    case '3m':
      return rollingMonths(now, 3, '3 months');

    case '6m':
      return rollingMonths(now, 6, '6 months');

    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return {
        from: start.toISOString(),
        to: end.toISOString(),
        label: String(now.getFullYear()),
        previousFrom: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
        previousTo: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999).toISOString(),
      };
    }

    default:
      return {
        from: startOfMonth(now).toISOString(),
        to: endOfMonth(now).toISOString(),
        label: monthRangeLabel(now),
        previousFrom: startOfMonth(shiftMonths(now, -1)).toISOString(),
        previousTo: endOfMonth(shiftMonths(now, -1)).toISOString(),
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
  };
}
