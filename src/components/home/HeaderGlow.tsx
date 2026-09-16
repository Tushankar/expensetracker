import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

export type HeaderGlowProps = {
  width: number;
  height?: number;
};

/**
 * The green bloom behind the greeting.
 *
 * Purely atmospheric — it gives the top of the screen some depth so the hero card
 * does not sit on a flat black field. Absolutely positioned and non-interactive, so
 * it never affects layout or touch.
 */
export function HeaderGlow({ width, height = 220 }: HeaderGlowProps) {
  const theme = useTheme();

  return (
    <Svg
      width={width}
      height={height}
      // Anchored at the content top: a ScrollView clips anything above it.
      style={styles.glow}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="headerBloom" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={theme.colors.brand} stopOpacity={0.22} />
          <Stop offset="0.55" stopColor={theme.colors.brand} stopOpacity={0.06} />
          <Stop offset="1" stopColor={theme.colors.brand} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      <Ellipse cx={width * 0.82} cy={height * 0.42} rx={width * 0.52} ry={height * 0.5} fill="url(#headerBloom)" />

      {/* Two faint rings, echoing the ring motif the savings card uses. */}
      <Circle
        cx={width * 0.88}
        cy={height * 0.4}
        r={78}
        stroke={theme.colors.brand}
        strokeOpacity={0.12}
        strokeWidth={1}
        fill="none"
      />
      <Circle
        cx={width * 0.88}
        cy={height * 0.4}
        r={112}
        stroke={theme.colors.brand}
        strokeOpacity={0.07}
        strokeWidth={1}
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0 },
});
