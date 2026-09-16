import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon, Text, usePressAnimation, type IconName } from '@/components/ui';
import { actionStyle, useTheme, type ActionHue } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

/**
 * Glyph colours for the solid action fills. Literal rather than themed: the fill is
 * the same vivid hue in both themes, so the glyph on it has to be too.
 */
const GLYPH_DARK = '#07060F';

/** Tighter than the spacing scale: four tiles have to clear one line of label. */
const TILE_GAP = 6;
const GLYPH_LIGHT = '#FFFFFF';

type Action = {
  key: ActionHue;
  label: string;
  icon: IconName;
  hint: string;
};

const ACTIONS: readonly Action[] = [
  { key: 'expense', label: 'Add Expense', icon: 'plus', hint: 'Records money out' },
  { key: 'income', label: 'Add Income', icon: 'arrowUpRight', hint: 'Records money in' },
  { key: 'transfer', label: 'Transfer', icon: 'repeat', hint: 'Moves money between your accounts' },
  { key: 'accounts', label: 'Accounts', icon: 'wallet', hint: 'Opens your accounts' },
];

export type QuickActionsProps = {
  onAction: (key: ActionHue) => void;
};

/** The four things people open the app to do, one tap from Home. */
export function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <View style={{ flexDirection: 'row', gap: TILE_GAP }}>
      {ACTIONS.map((action) => (
        <ActionTile key={action.key} action={action} onPress={() => onAction(action.key)} />
      ))}
    </View>
  );
}

function ActionTile({ action, onPress }: { action: Action; onPress: () => void }) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(theme.pressScale.card);

  // Adding an expense is the primary action, so it wears the accent — the other
  // three keep fixed identities so they stay recognisable across accents.
  const isPrimary = action.key === 'expense';
  const { fill, glyph } = actionStyle(action.key);

  const tileFill = isPrimary ? theme.colors.brand : fill;
  const glyphColor = isPrimary
    ? theme.colors.textOnAccent
    : glyph === 'dark'
      ? GLYPH_DARK
      : GLYPH_LIGHT;

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
          {
            // Fixed height so a label that wraps on a narrow phone cannot make one
            // tile taller than its neighbours.
            height: 84,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: 4,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surface,
            borderWidth: theme.layout.hairline,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tileFill,
          }}
        >
          <Icon
            name={action.icon}
            size={17}
            color={glyphColor}
            strokeWidth={2.4}
          />
        </View>

        <Text
          variant="caption"
          tone="secondary"
          align="center"
          // 11px so every label clears one line at this tile width; two lines is
          // the fallback on a narrow phone, which still beats a truncated label.
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 11, lineHeight: 14 }}
        >
          {action.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
