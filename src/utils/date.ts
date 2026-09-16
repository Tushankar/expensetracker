const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Time-of-day greeting. Boundaries chosen to feel right in IST, not UTC. */
export function greetingFor(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Relative day label for a transaction list: "Today", "Yesterday", then a date.
 * The year is only shown once the date is outside the current one.
 */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (dayDelta === 0) return 'Today';
  if (dayDelta === 1) return 'Yesterday';

  const month = MONTHS_SHORT[date.getMonth()] ?? '';
  const base = `${date.getDate()} ${month}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** 12-hour clock with lowercase meridiem, which is how Indian apps show times. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const meridiem = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${meridiem}`;
}

export function monthLabel(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '';
  return `${MONTHS_LONG[date.getMonth()] ?? ''} ${date.getFullYear()}`;
}

/** e.g. "Sep 2026" — for pills and other space-constrained controls. */
export function monthLabelShort(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '';
  return `${MONTHS_SHORT[date.getMonth()] ?? ''} ${date.getFullYear()}`;
}

/** e.g. "1-30 September" — the range a monthly summary covers. */
export function monthRangeLabel(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '';
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return `1\u2013${lastDay} ${MONTHS_LONG[date.getMonth()] ?? ''}`;
}

/** Groups transactions under day headings while preserving their order. */
export function groupByDay<T extends { occurredAt: string }>(
  items: readonly T[],
  now: Date = new Date(),
): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];

  for (const item of items) {
    const label = formatDayLabel(item.occurredAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }

  return groups;
}
