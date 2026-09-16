import type { ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Wrap content in a ScrollView. Turn off for screens that own a FlatList. */
  scroll?: boolean;
  /** Apply the standard horizontal gutter. Off for edge-to-edge lists. */
  padded?: boolean;
  /** Respect the top safe area. Off when a header already handles it. */
  topInset?: boolean;
  /** Extra bottom room so content clears the tab bar or a pinned CTA. */
  bottomInset?: number;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Every screen's outer shell: themed background, safe areas, the shared gutter and
 * a max content width so the layout does not stretch into unreadable lines on
 * tablets or the web build.
 */
export function Screen({
  children,
  scroll = true,
  padded = true,
  topInset = true,
  bottomInset = 0,
  refreshControl,
  contentContainerStyle,
  style,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const content: StyleProp<ViewStyle> = [
    styles.content,
    {
      paddingTop: topInset ? insets.top : 0,
      paddingHorizontal: padded ? theme.layout.screenGutter : 0,
      maxWidth: theme.layout.maxContentWidth,
    },
  ];

  const scrollPadding = {
    paddingBottom: bottomInset + (scroll ? theme.spacing.xxxl : 0),
  };

  if (!scroll) {
    return (
      <View
        testID={testID}
        style={[styles.root, { backgroundColor: theme.colors.background }, style]}
      >
        <View style={[content, styles.flex, scrollPadding, contentContainerStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.root, { backgroundColor: theme.colors.background }, style]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[content, scrollPadding, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        // iOS keeps the keyboard open over a scrolling list otherwise.
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    // Centres the column once the screen is wider than maxContentWidth.
    alignSelf: 'center',
  },
});
