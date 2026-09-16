import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

import { IconButton } from './IconButton';
import { Text } from './Text';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

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

export type CalendarProps = {
  value: Date;
  onChange: (date: Date) => void;
  /** Days after this are not selectable. Defaults to today. */
  maxDate?: Date;
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

/**
 * Month grid for picking a transaction date.
 *
 * Hand-built rather than `@react-native-community/datetimepicker` because that
 * renders the OS's own picker — a separate modal in the system's styling, which
 * lands in the middle of a dark themed sheet looking like it came from another
 * app. This one is 90 lines, reads from the same tokens as everything else, and
 * behaves identically on both platforms.
 *
 * Future dates are disabled by default: you cannot have spent money tomorrow, and
 * a transaction dated forward quietly corrupts every total it lands in.
 */
export function Calendar({ value, onChange, maxDate }: CalendarProps) {
  const theme = useTheme();
  const today = useMemo(() => startOfDay(new Date()), []);
  const limit = maxDate ? startOfDay(maxDate) : today;

  const [cursor, setCursor] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  const cells = useMemo(() => {
    const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

    // Leading blanks so the first of the month lands under the right weekday.
    const list: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      list.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    }
    return list;
  }, [cursor]);

  const atLimit =
    cursor.getFullYear() === limit.getFullYear() && cursor.getMonth() === limit.getMonth();

  function step(months: number) {
    tapFeedback();
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + months, 1));
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
            return <View key={`blank-${index}`} style={{ width: '14.285%', height: 42 }} />;
          }

          const selected = sameDay(date, value);
          const isToday = sameDay(date, today);
          const disabled = date.getTime() > limit.getTime();

          return (
            <Pressable
              key={date.toISOString()}
              disabled={disabled}
              onPress={() => {
                tapFeedback();
                onChange(date);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`}
              accessibilityState={{ selected, disabled }}
              style={{ width: '14.285%', height: 42, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.brand : 'transparent',
                  borderWidth: !selected && isToday ? theme.layout.hairline : 0,
                  borderColor: theme.colors.borderStrong,
                  opacity: disabled ? 0.28 : 1,
                }}
              >
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
