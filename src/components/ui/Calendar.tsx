import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

import { Gloss } from './GlassSurface';
import { IconButton } from './IconButton';
import { Text } from './Text';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

const MONTHS = [
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

/** What a day is worth, for the spending view. 0–1, already normalised. */
export type DayMarker = { intensity: number; label?: string };

export type CalendarProps = {
  /** `single` picks a date; `range` picks two, tapping start then end. */
  mode?: 'single' | 'range';
  value: Date;
  /** The other end, in range mode. */
  endValue?: Date;
  onChange: (date: Date) => void;
  onChangeRange?: (from: Date, to: Date) => void;
  /** Days after this are not selectable. Defaults to today. */
  maxDate?: Date;
  /** Keyed `YYYY-MM-DD`. Tints a day by how much was spent on it. */
  markers?: Map<string, DayMarker>;
  /** Called when the visible month changes, so a caller can fetch its data. */
  onMonthChange?: (monthStart: Date) => void;
  /** Starts on this month rather than the selected date's. */
  initialMonth?: Date;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function keyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Month grid, used for picking a transaction date, choosing a custom range, and
 * browsing spending day by day.
 *
 * Hand-built rather than `@react-native-community/datetimepicker` because that
 * renders the OS's own picker — a separate modal in the system's styling, which
 * lands in the middle of a dark themed sheet looking like it came from another
 * app. This one reads from the same tokens as everything else and behaves
 * identically on both platforms.
 *
 * Weeks start on Monday, matching the rest of the app. Future dates are disabled
 * by default: you cannot have spent money tomorrow, and a transaction dated
 * forward quietly corrupts every total it lands in.
 */
export function Calendar({
  mode = 'single',
  value,
  endValue,
  onChange,
  onChangeRange,
  maxDate,
  markers,
  onMonthChange,
  initialMonth,
}: CalendarProps) {
  const theme = useTheme();
  const today = useMemo(() => startOfDay(new Date()), []);
  const limit = maxDate ? startOfDay(maxDate) : today;

  const [cursor, setCursor] = useState(() => {
    const base = initialMonth ?? value;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  /** In range mode, the first tap of a new selection. */
  const [anchor, setAnchor] = useState<Date | null>(null);

  const cells = useMemo(() => {
    const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
    // Monday-first: Sunday (0) sits at the end of the previous week.
    const leading = firstWeekday === 0 ? 6 : firstWeekday - 1;
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

    const list: (Date | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      list.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    }
    return list;
  }, [cursor]);

  const atLimit =
    cursor.getFullYear() === limit.getFullYear() && cursor.getMonth() === limit.getMonth();

  function step(months: number) {
    tapFeedback();
    setCursor((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + months, 1);
      onMonthChange?.(next);
      return next;
    });
  }

  function handlePress(date: Date) {
    tapFeedback();

    if (mode === 'single') {
      onChange(date);
      return;
    }

    // Range: the first tap starts a new selection, the second closes it. Tapping
    // before the anchor swaps the ends rather than refusing — dragging backwards
    // is a perfectly normal way to pick a range.
    if (!anchor) {
      setAnchor(date);
      onChange(date);
      return;
    }

    const [from, to] = date.getTime() < anchor.getTime() ? [date, anchor] : [anchor, date];
    setAnchor(null);
    onChangeRange?.(from, to);
  }

  const rangeStart = anchor ?? value;
  const rangeEnd = anchor ? null : (endValue ?? null);

  function stateFor(date: Date): 'start' | 'end' | 'between' | 'none' {
    if (mode !== 'range') return sameDay(date, value) ? 'start' : 'none';
    if (sameDay(date, rangeStart)) return 'start';
    if (rangeEnd && sameDay(date, rangeEnd)) return 'end';
    if (
      rangeEnd &&
      date.getTime() > rangeStart.getTime() &&
      date.getTime() < rangeEnd.getTime()
    ) {
      return 'between';
    }
    return 'none';
  }

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: theme.spacing.md,
        }}
      >
        <IconButton
          name="chevronLeft"
          accessibilityLabel="Previous month"
          variant="tonal"
          size="sm"
          onPress={() => step(-1)}
        />
        <Text variant="label">{`${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`}</Text>
        <IconButton
          name="chevronRight"
          accessibilityLabel="Next month"
          variant="tonal"
          size="sm"
          disabled={atLimit}
          onPress={() => step(1)}
        />
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((day, index) => (
          <View key={`${day}-${index}`} style={{ width: '14.285%', alignItems: 'center' }}>
            <Text variant="caption" tone="tertiary" maxFontSizeMultiplier={1.2}>
              {day}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.spacing.sm }}>
        {cells.map((date, index) => {
          if (!date) {
            return <View key={`blank-${index}`} style={{ width: '14.285%', height: 44 }} />;
          }

          const selection = stateFor(date);
          const selected = selection === 'start' || selection === 'end';
          const isToday = sameDay(date, today);
          const disabled = date.getTime() > limit.getTime();
          const marker = markers?.get(keyOf(date));

          return (
            <Pressable
              key={date.toISOString()}
              disabled={disabled}
              onPress={() => handlePress(date)}
              accessibilityRole="button"
              accessibilityLabel={
                marker?.label
                  ? `${date.getDate()} ${MONTHS[date.getMonth()]}, ${marker.label}`
                  : `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
              }
              accessibilityState={{ selected, disabled }}
              style={{
                width: '14.285%',
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                // The connecting band on a range, drawn behind the end caps.
                backgroundColor:
                  selection === 'between' ? theme.colors.brandSurface : 'transparent',
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected
                    ? theme.colors.brand
                    : marker
                      ? withIntensity(theme.colors.brandText, marker.intensity)
                      : 'transparent',
                  borderWidth: !selected && isToday ? theme.layout.hairline : 0,
                  borderColor: theme.colors.borderStrong,
                  opacity: disabled ? 0.28 : 1,
                  overflow: 'hidden',
                }}
              >
                {/* A selected day is a solid bead of brand and a heat-mapped one a
                    tinted pane, so both take the light. An unmarked day has no
                    fill to catch it and gets nothing. */}
                {selected || marker ? <Gloss radius={18} rim={!selected} /> : null}

                <Text
                  variant="bodySm"
                  color={selected ? theme.colors.textOnAccent : theme.colors.textPrimary}
                  maxFontSizeMultiplier={1.2}
                >
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * A day's tint, scaled by how much was spent.
 *
 * Capped at 30% so the busiest day is still a background and the date on top of
 * it stays legible — a heatmap that swallows its own labels is decoration, not
 * information. The floor keeps a ₹20 day visible at all.
 */
function withIntensity(hex: string, intensity: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return 'transparent';
  const value = parseInt(match[1], 16);
  const alpha = 0.08 + Math.min(1, Math.max(0, intensity)) * 0.22;
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha.toFixed(3)})`;
}
