import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon, Text, usePressAnimation, type IconName } from '@/components/ui';
import { useTheme, type ActionHue } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

/** Tighter than the spacing scale: four tiles have to clear one line of label. */
const TILE_GAP = 8;

type ActionSpec = {
  key: ActionHue;
  label: string;
  icon: IconName;
  hint: string;
  gradient: readonly [string, string];
  glowColor: string;
};

export type QuickActionsProps = {
  onAction: (key: ActionHue) => void;
};

/**
 * Ultra-Premium Quick Actions.
 *
 * Designed with luminous frosted glass cards, Apple-style top specular highlights,
 * glowing gradient orbs with 1px glass rings, and high-readability typography.
 */
export function QuickActions({ onAction }: QuickActionsProps) {
  const theme = useTheme();

  const actions: readonly ActionSpec[] = [
    {
      key: 'expense',
      label: 'Add Expense',
      icon: 'plus',
      hint: 'Records money out',
      gradient: [theme.colors.brand, theme.colors.brandPressed],
      glowColor: theme.colors.brandGlow || 'rgba(16, 185, 129, 0.45)',
    },
    {
      key: 'income',
      label: 'Add Income',
      icon: 'arrowUpRight',
      hint: 'Records money in',
      gradient: ['#06B6D4', '#0D9488'],
      glowColor: 'rgba(6, 182, 212, 0.45)',
    },
    {
      key: 'transfer',
      label: 'Transfer',
      icon: 'repeat',
      hint: 'Moves money between your accounts',
      gradient: ['#8B5CF6', '#6D28D9'],
      glowColor: 'rgba(139, 92, 246, 0.45)',
    },
    {
      key: 'accounts',
      label: 'Accounts',
      icon: 'wallet',
      hint: 'Opens your accounts',
      gradient: ['#F59E0B', '#D97706'],
      glowColor: 'rgba(245, 158, 11, 0.45)',
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
      <Animated.View style={animatedStyle}>
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            theme.shadows.sm,
            {
              height: 88,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingHorizontal: 4,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.08)',
              borderTopColor: 'rgba(255, 255, 255, 0.18)',
              overflow: 'hidden',
            },
          ]}
        >
          {/* Luminous Glowing Gradient Orb */}
          <View
            style={{
              shadowColor: action.glowColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.55,
              shadowRadius: 8,
              elevation: 5,
            }}
          >
            <LinearGradient
              colors={action.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.32)',
              }}
            >
              <Icon
                name={action.icon}
                size={18}
                color="#FFFFFF"
                strokeWidth={2.4}
              />
            </LinearGradient>
          </View>

          {/* Crisp, High-Contrast Modern Label */}
          <Text
            variant="caption"
            align="center"
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}
            style={{
              fontSize: 11.5,
              lineHeight: 14,
              fontWeight: '600',
              color: theme.colors.textPrimary,
              letterSpacing: -0.1,
            }}
          >
            {action.label}
          </Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}
