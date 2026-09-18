import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Gloss } from './GlassSurface';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { withAlpha } from './IconTile';

export type CategoryChipProps = {
  label: string;
  icon: IconName;
  color: string;
  /**
   * Drop the label and keep the glyph. For narrow screens, where the label would
   * otherwise push the timestamp out of the row.
   */
  iconOnly?: boolean;
  style?: ViewStyle;
};

/**
 * Category tag on a transaction row: the glyph in the category's colour over the
 * same colour at low opacity. Reads at a glance without competing with the amount.
 *
 * Tinted rather than blurred. A long list is hundreds of these, and at eleven
 * points tall the light along the top edge is all the glass anyone can see.
 */
export function CategoryChip({ label, icon, color, iconOnly = false, style }: CategoryChipProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: iconOnly ? 0 : 4,
          paddingHorizontal: iconOnly ? 6 : theme.spacing.sm,
          paddingVertical: 5,
          borderRadius: theme.radius.pill,
          backgroundColor: withAlpha(color, 0.14),
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Gloss radius="pill" />
      <Icon name={icon} size={iconOnly ? 13 : 11} color={color} strokeWidth={2.2} />
      {iconOnly ? null : (
        <Text
          variant="caption"
          color={color}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={{ fontSize: 11, lineHeight: 14 }}
        >
          {label}
        </Text>
      )}
    </View>
  );
}
