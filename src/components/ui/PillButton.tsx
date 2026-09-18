import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { tapFeedback } from '@/utils/haptics';

import { GlassFill } from './GlassSurface';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type PillButtonProps = {
  label: string;
  leftIcon?: IconName;
  rightIcon?: IconName;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Sits on the hero slab rather than a normal card. */
  onHero?: boolean;
  style?: ViewStyle;
};

/**
 * Compact rounded control — the month selector and other inline pickers.
 *
 * On a plain screen it is thin glass on the ambient field. On the hero slab it
 * steps up a rung, because a thin material over a saturated one all but vanishes.
 */
export function PillButton({
  label,
  leftIcon,
  rightIcon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  onHero = false,
  style,
}: PillButtonProps) {
  const theme = useTheme();

  const labelColor = onHero ? theme.colors.heroText : theme.colors.textPrimary;
  const glyphColor = onHero ? theme.colors.heroTextMuted : theme.colors.textTertiary;

  const body = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: theme.spacing.md,
          height: 36,
          borderRadius: theme.radius.pill,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <GlassFill tone={onHero ? 'thick' : 'thin'} radius="pill" />
      {leftIcon ? <Icon name={leftIcon} size={13} color={glyphColor} strokeWidth={2} /> : null}
      <Text variant="caption" color={labelColor} numberOfLines={1}>
        {label}
      </Text>
      {rightIcon ? <Icon name={rightIcon} size={13} color={glyphColor} strokeWidth={2} /> : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      hitSlop={{ top: 6, bottom: 6 }}
    >
      {body}
    </Pressable>
  );
}
