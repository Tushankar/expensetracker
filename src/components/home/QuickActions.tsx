import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon, Text, usePressAnimation, withAlpha, type IconName } from '@/components/ui';
import { useTheme, type ActionHue } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

/** Tighter than the spacing scale: four tiles have to clear one line of label. */
const TILE_GAP = 8;

type ActionSpec = {
  key: ActionHue;
  label: string;
  icon: IconName;
  hint: string;
  hue: string;
};

export type QuickActionsProps = {
  onAction: (key: ActionHue) => void;
};

/**
 * The four things someone opens this app to do.
 *
 * Each tile is one hue at low opacity rather than a saturated fill: four bright
 * chips in a row compete with the balance card directly above them, and the
 * balance is what the screen is for. Colour here is for recognition — you learn
 * that income is green and stop reading the labels — not for emphasis.
 */
export function QuickActions({ onAction }: QuickActionsProps) {
  const theme = useTheme();

  const actions: readonly ActionSpec[] = [
    {
      key: 'expense',
      label: 'Expense',
      icon: 'minus',
      hint: 'Records money out',
      // Follows the active accent, because it is the action the app is built around.
      hue: theme.colors.brandText,
    },
    {
      key: 'income',
      label: 'Income',
      icon: 'arrowUpRight',
      hint: 'Records money in',
      hue: theme.colors.positive,
    },
    {
      key: 'transfer',
      label: 'Transfer',
      icon: 'repeat',
      hint: 'Moves money between your accounts',
      hue: theme.colors.warning,
    },
    {
      key: 'accounts',
      label: 'Accounts',
      icon: 'wallet',
      hint: 'Opens your accounts',
      hue: theme.colors.info,
    },
  ];

  return (
    <View style={{ flexDirection: 'row', gap: TILE_GAP }}>
      {actions.map((action) => (
        <ActionTile key={action.key} action={action} onPress={() => onAction(action.key)} />
      ))}
    </View>
  );
}

function ActionTile({ action, onPress }: { action: ActionSpec; onPress: () => void }) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(theme.pressScale.card);

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityHint={action.hint}
      style={{ flex: 1, minWidth: 0 }}
    >
      <Animated.View
        style={[
          animatedStyle,
          theme.shadows.sm,
          {
            height: 86,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: 4,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surface,
            borderWidth: theme.layout.hairline,
            borderColor: theme.colors.border,
            // A lighter top edge reads as a light source above the row.
            borderTopColor: withAlpha(action.hue, 0.22),
          },
        ]}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 38,
            height: 38,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(action.hue, 0.16),
            borderWidth: theme.layout.hairline,
            borderColor: withAlpha(action.hue, 0.26),
          }}
        >
          <Icon name={action.icon} size={19} color={action.hue} strokeWidth={2.2} />
        </View>

        <Text variant="caption" align="center" numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {action.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
