import { Pressable, ScrollView, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

import { GlassFill } from './GlassSurface';
import { Text } from './Text';

export type Chip<T extends string> = {
  value: T;
  label: string;
};

export type ChipRowProps<T extends string> = {
  options: readonly Chip<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `sm` tightens the padding so more chips fit beside another control. */
  size?: 'md' | 'sm';
  accessibilityLabel?: string;
  style?: ViewStyle;
};

/**
 * Horizontally scrolling filter pills — the period selector above the spending
 * cards.
 *
 * Scrolling rather than squeezing: five ranges cannot fit a phone width at a
 * readable size, and a row that scrolls is better than one nobody can read.
 *
 * Selection is a change of material, not just of colour: the chosen chip is a
 * bead of accent glass with a brand rim, the rest are thin and unlit.
 */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  accessibilityLabel,
  style,
}: ChipRowProps<T>) {
  const theme = useTheme();
  const padding = size === 'sm' ? theme.spacing.md : theme.spacing.xl;

  return (
    <View style={style} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.lg }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                if (selected) return;
                tapFeedback();
                onChange(option.value);
              }}
              accessibilityRole="tab"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: padding,
                // 36dp tall, extended to the 48dp minimum with hitSlop.
                height: 36,
                justifyContent: 'center',
                borderRadius: theme.radius.pill,
                overflow: 'hidden',
              }}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <GlassFill
                tone={selected ? 'brand' : 'thin'}
                radius="pill"
                rimColor={selected ? theme.colors.brand : undefined}
                sheen={!selected}
              />
              <Text
                variant="labelSm"
                color={selected ? theme.colors.brandText : theme.colors.textSecondary}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
