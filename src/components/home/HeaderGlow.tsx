import { StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme';

export type HeaderGlowProps = {
  width: number;
  height?: number;
};

/**
 * Two faint rings behind the greeting, echoing the ring motif the savings card uses.
 *
 * This used to carry a brand bloom as well, to keep the hero card off a flat black
 * field. The ambient field does that now, app-wide and in the same corner — and
 * two blooms in one corner is not twice as atmospheric, it is a bright patch that
 * takes a caption on the card below it under AA. So the bloom is gone and the rings,
 * which are hairlines and cost the contrast budget nothing, stayed.
 *
 * Absolutely positioned and non-interactive, so it never affects layout or touch.
 */
export function HeaderGlow({ width, height = 220 }: HeaderGlowProps) {
  const theme = useTheme();

  return (
    <Svg
      width={width}
      height={height}
      // Anchored at the content top: a ScrollView clips anything above it.
      style={styles.glow}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle
        cx={width * 0.88}
        cy={height * 0.4}
        r={78}
        stroke={theme.colors.brandText}
        strokeOpacity={0.14}
        strokeWidth={1}
        fill="none"
      />
      <Circle
        cx={width * 0.88}
        cy={height * 0.4}
        r={112}
        stroke={theme.colors.brandText}
        strokeOpacity={0.08}
        strokeWidth={1}
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
  },
});
