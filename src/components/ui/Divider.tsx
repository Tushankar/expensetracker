import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type DividerProps = {
  /** Left inset, used to align a divider with list-row text rather than the icon. */
  inset?: number;
  style?: ViewStyle;
};

/**
 * A true hairline. `StyleSheet.hairlineWidth` disappears on some Android densities,
 * so this uses a 1dp line in a low-contrast colour instead.
 *
 * `colors.divider` is translucent white, so the line is a scratch of light across
 * whatever it is drawn on rather than a grey that only works on one surface.
 */
export function Divider({ inset = 0, style }: DividerProps) {
  const { colors, layout } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { height: layout.hairline, backgroundColor: colors.divider, marginLeft: inset },
        style,
      ]}
    />
  );
}
