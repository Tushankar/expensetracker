import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { BudgetProgress, BudgetState } from '@/api/types';
import { toIconName } from '@/components/icons/registry';
import { Icon, IconTile, Text, withAlpha } from '@/components/ui';
import { categoryColor, useTheme, type Theme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

export type BudgetRowProps = {
  budget: BudgetProgress;
  onPress?: (budget: BudgetProgress) => void;
  /** Hides the icon tile, for the compact strip on Home. */
  compact?: boolean;
};

/**
 * Colour by state, not by category.
 *
 * A budget bar answers one question — am I fine, close, or over — and the answer
 * has to survive a glance. Tinting the bar by the category's own hue would make
 * "Food at 110%" green, which is exactly backwards.
 */
export function stateColor(state: BudgetState, theme: Theme): string {
  switch (state) {
    case 'exceeded':
      return theme.colors.negative;
    case 'warning':
      return theme.colors.warning;
    default:
      return theme.colors.positive;
  }
}

const STATE_LABEL: Record<BudgetState, string> = {
  on_track: 'On track',
  warning: 'Getting close',
  exceeded: 'Over budget',
};

export function BudgetRow({ budget, onPress, compact = false }: BudgetRowProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const accent = stateColor(budget.state, theme);
  const label = budget.scope === 'overall' ? 'Monthly budget' : (budget.categoryName ?? 'Category');

  // The bar never overflows its track; going over is said in words and in colour,
  // not by a fill that runs off the end of the card.
  const filled = Math.min(1, budget.amount > 0 ? budget.spent / budget.amount : 0);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reduceMotion
      ? withTiming(filled, { duration: 0 })
      : withTiming(filled, { duration: theme.duration.slow, easing: theme.easing.decelerate });
  }, [filled, progress, reduceMotion, theme.duration.slow, theme.easing.decelerate]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const accessibilityLabel = [
    label,
    `${formatINR(budget.spent)} of ${formatINR(budget.amount)}`,
    `${budget.percent} percent`,
    budget.state === 'exceeded'
      ? `${formatINR(budget.overBy)} over`
      : `${formatINR(budget.remaining)} left`,
  ].join(', ');

  const body = (
    <View style={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        {compact ? null : (
          <IconTile
            name={toIconName(budget.categoryIcon ?? 'target')}
            color={
              budget.scope === 'overall'
                ? theme.colors.brandText
                : categoryColor(budget.categoryColor ?? 'other')
            }
            size="sm"
          />
        )}

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="label" numberOfLines={1}>
            {label}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {budget.state === 'on_track' ? null : (
              <Icon
                name={budget.state === 'exceeded' ? 'alertCircle' : 'alertTriangle'}
                size={12}
                color={accent}
                strokeWidth={2.2}
              />
            )}
            <Text
              variant="caption"
              color={budget.state === 'on_track' ? theme.colors.textTertiary : accent}
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0 }}
            >
              {budget.state === 'exceeded'
                ? `${formatINR(budget.overBy)} over cap`
                : `${formatINR(budget.remaining)} still available`}
            </Text>
          </View>
        </View>

        {/* The example from the brief, read straight off the row: ₹5,000 / ₹7,000. */}
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="amountSm" numberOfLines={1}>
            {formatINR(budget.spent)}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {`of ${formatINR(budget.amount)}`}
          </Text>
        </View>

        {onPress ? (
          <Icon name="chevronRight" size={16} color={theme.colors.textTertiary} strokeWidth={2} />
        ) : null}
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
      >
        <View
          style={{
            flex: 1,
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            backgroundColor: theme.colors.surfaceStrong,
          }}
        >
          <Animated.View
            style={[fillStyle, { height: '100%', borderRadius: 4, backgroundColor: accent }]}
          />
          {/* Where the alert fires, on the same track it will fire about. */}
          <View
            style={{
              position: 'absolute',
              left: `${Math.min(97, budget.warnAtPercent)}%`,
              top: 0,
              bottom: 0,
              width: 2,
              borderRadius: 1,
              backgroundColor: theme.colors.background,
              opacity: 0.85,
            }}
          />
        </View>

        <View
          style={{
            minWidth: 44,
            alignItems: 'center',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: theme.radius.pill,
            backgroundColor: withAlpha(accent, 0.14),
          }}
        >
          <Text variant="caption" color={accent} numberOfLines={1}>
            {`${budget.percent}%`}
          </Text>
        </View>
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress(budget);
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={`${STATE_LABEL[budget.state]}. Opens this budget.`}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}
