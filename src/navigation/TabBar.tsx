import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassFill,
  GlassSurface,
  Gloss,
  Icon,
  Text,
  usePressAnimation,
  type IconName,
} from '@/components/ui';
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
 *
 * The bar itself is the heaviest glass in the app. It has a whole scrolling screen
 * passing underneath it, which is the one place where a thin material would leave
 * a caption competing with a chart, and the one place where the blur is genuinely
 * showing you something: you can see where the content has got to.
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
    <View style={{ height: barHeight + FAB_OVERHANG, pointerEvents: 'box-none' }}>
      {/* The glass bar, inset from the top so the overhang strip stays clear. Round
          across the top, square along the bottom where it meets the screen edge. */}
      <GlassSurface
        tone="chrome"
        shadow="lg"
        corners={{ topLeft: theme.radius.xl, topRight: theme.radius.xl }}
        style={[StyleSheet.absoluteFill, styles.noTouch, { top: FAB_OVERHANG }]}
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
        <View style={{ width: FAB_SIZE + theme.spacing.lg, pointerEvents: 'none' }} />

        {routes.slice(half).map((route, index) => renderTab(route, index + half))}
      </View>

      <View style={[styles.fabWrap, styles.passThrough]}>
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

  const color = focused ? theme.colors.brandText : theme.colors.textTertiary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={styles.tab}
    >
      <Animated.View style={[iconStyle, styles.tabPill]}>
        {/* The selected tab gets its own lozenge of accent glass, sitting on the
            bar glass. Two thin materials rather than one thick one, so the pill
            reads as a highlight on the bar and not as a hole cut through it. */}
        {focused ? <GlassFill tone="brand" radius="pill" sheen={false} /> : null}
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
        {/* The one button on the screen that stays solid: it is the primary action
            and it has to read at a glance against anything scrolling behind it.
            What it borrows from the glass is the optics — a lit top edge, a
            diagonal sheen, and a shaded underside, so a flat circle of brand
            colour becomes a bead of it. */}
        <Gloss radius={FAB_SIZE / 2} strength="bright" />
        <Icon name="plus" size={26} color={theme.colors.textOnAccent} strokeWidth={2.4} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  noTouch: { pointerEvents: 'none' },
  passThrough: { pointerEvents: 'box-none' },
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
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
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
    overflow: 'hidden',
  },
});
