import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, usePressAnimation, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';
import { mediumFeedback, tapFeedback } from '@/utils/haptics';

import type { MainTabParamList } from './types';

const TAB_ICONS: Record<keyof MainTabParamList, IconName> = {
  Home: 'home',
  Transactions: 'list',
  Insights: 'pieChart',
  Budgets: 'target',
};

const FAB_SIZE = 56;
/**
 * How far the add button rises above the bar's painted edge.
 *
 * The container is this much taller than the bar itself and the button sits
 * *inside* those bounds. Android does not deliver touches to a child drawn outside
 * its parent, so a negative margin here would render a button that cannot be
 * tapped on half our users' devices.
 */
const FAB_OVERHANG = 22;

export type TabBarProps = BottomTabBarProps & {
  onAddPress: () => void;
};

/**
 * Custom tab bar. Replacing the default buys three things the stock bar cannot do:
 * the raised add button in the middle, Inter at the right size for the labels, and
 * icon/label colours that come from our tokens rather than React Navigation's.
 *
 * The add button is an action, not a route — it sits in a gap between the second
 * and third tabs rather than being a fifth screen.
 */
export function TabBar({ state, descriptors, navigation, onAddPress }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const routes = state.routes;
  const half = Math.ceil(routes.length / 2);
  const bottomPad = insets.bottom > 0 ? insets.bottom : theme.spacing.sm;
  const barHeight = theme.layout.tabBarHeight + bottomPad;

  function renderTab(route: (typeof routes)[number], index: number) {
    const focused = state.index === index;
    const { options } = descriptors[route.key] ?? {};
    const label = options?.title ?? route.name;

    function onPress() {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (focused || event.defaultPrevented) return;
      tapFeedback();
      navigation.navigate(route.name);
    }

    return (
      <TabButton
        key={route.key}
        icon={TAB_ICONS[route.name as keyof MainTabParamList] ?? 'circle'}
        label={label}
        focused={focused}
        onPress={onPress}
      />
    );
  }

  return (
    // box-none lets taps fall through the transparent strip beside the add button.
    <View style={{ height: barHeight + FAB_OVERHANG }} pointerEvents="box-none">
      {/* The painted bar, inset from the top so the overhang strip stays clear. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            top: FAB_OVERHANG,
            backgroundColor: theme.colors.surface,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.border,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
          },
        ]}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          marginTop: FAB_OVERHANG,
          paddingTop: 8,
          paddingBottom: bottomPad,
        }}
      >
        {routes.slice(0, half).map((route, index) => renderTab(route, index))}

        {/* Reserves the add button's footprint so the tabs stay evenly spaced. */}
        <View style={{ width: FAB_SIZE + theme.spacing.lg }} pointerEvents="none" />

        {routes.slice(half).map((route, index) => renderTab(route, index + half))}
      </View>

      <View style={styles.fabWrap} pointerEvents="box-none">
        <AddButton onPress={onAddPress} />
      </View>
    </View>
  );
}

type TabButtonProps = {
  icon: IconName;
  label: string;
  focused: boolean;
  onPress: () => void;
};

function TabButton({ icon, label, focused, onPress }: TabButtonProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  // A small lift on selection — enough to register, not enough to notice twice.
  const lift = useDerivedValue(() =>
    withSpring(focused && !reduceMotion ? 1 : 0, theme.spring.gentle),
  );

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 2 }],
  }));

  const color = focused ? theme.colors.brand : theme.colors.textTertiary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={styles.tab}
    >
      <Animated.View
        style={[
          iconStyle,
          {
            paddingHorizontal: 14,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: focused ? theme.colors.brandSurface : 'transparent',
          },
        ]}
      >
        <Icon name={icon} size={21} color={color} strokeWidth={focused ? 2.2 : 1.9} />
      </Animated.View>
      <Text
        variant="caption"
        color={color}
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={styles.tabLabel}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AddButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.9);

  return (
    <Pressable
      onPress={() => {
        mediumFeedback();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
      accessibilityHint="Opens the new transaction sheet"
      hitSlop={8}
    >
      <Animated.View
        style={[
          styles.fab,
          animatedStyle,
          theme.shadows.lg,
          {
            backgroundColor: theme.colors.brand,
            // A tinted elevation shadow reads better than Android's default grey
            // under a saturated fill.
            ...Platform.select({
              android: { elevation: 8, shadowColor: theme.colors.brand },
              default: {},
            }),
          },
        ]}
      >
        <Icon name="plus" size={26} color={theme.colors.textOnAccent} strokeWidth={2.4} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    // Keeps the whole column tappable, not just the glyph.
    paddingTop: 2,
    minHeight: 44,
  },
  tabLabel: { textAlign: 'center' },
  fabWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
