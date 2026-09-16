import { Image } from 'expo-image';
import { useState } from 'react';
import { View, type ImageStyle, type ViewStyle } from 'react-native';

import { LOGO_REQUEST_HEADERS, merchantLogoUrl } from '@/services/logos';
import { merchantTint, useTheme } from '@/theme';

import { Text } from './Text';

export type MerchantAvatarProps = {
  name: string;
  /** Brand domain for the logo lookup. Omit for anything that is not a business. */
  domain?: string;
  size?: number;
  style?: ViewStyle;
};

/**
 * A merchant's logo, or a monogram when there is no logo to show.
 *
 * Logos come from LogoKit, which serves square marks on the brand's own background,
 * so they need no tile of their own — just a rounded clip. Anything without a
 * domain, that fails to load, or that loads while offline falls back to a
 * deterministic initial and tint, so a row is never empty.
 */
export function MerchantAvatar({ name, domain, size = 44, style }: MerchantAvatarProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);

  // Request 128px: enough for a 40–44dp tile on a 3x screen without over-fetching.
  const uri = failed ? null : merchantLogoUrl(domain, 128);

  // Left un-annotated so the same literal satisfies both ViewStyle and ImageStyle.
  const box = {
    width: size,
    height: size,
    borderRadius: theme.radius.sm,
  };

  if (uri) {
    return (
      <Image
        source={{ uri, headers: LOGO_REQUEST_HEADERS }}
        onError={() => setFailed(true)}
        // Keeps the right image on the right row when the list recycles views.
        recyclingKey={domain}
        contentFit="cover"
        transition={140}
        cachePolicy="memory-disk"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        // expo-image wants an ImageStyle; the keys callers actually pass here
        // (margins, size, radius) mean the same thing in both.
        style={[box, { backgroundColor: theme.colors.surfaceMuted }, style as ImageStyle]}
      />
    );
  }

  const tint = merchantTint(name);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        box,
        {
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint.fill,
        },
        style,
      ]}
    >
      <Text
        variant="labelSm"
        color={tint.text}
        maxFontSizeMultiplier={1.1}
        style={{ fontSize: size * 0.34, lineHeight: size * 0.42 }}
      >
        {monogram(name)}
      </Text>
    </View>
  );
}

/** Up to two initials, ignoring punctuation: "Indian Oil" -> "IO", "Zepto" -> "Z". */
function monogram(name: string): string {
  const words = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2);

  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] ?? '').slice(0, 1).toUpperCase();
  return words.map((word) => word.slice(0, 1).toUpperCase()).join('');
}
