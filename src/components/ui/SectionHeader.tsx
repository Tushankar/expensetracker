import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

export type SectionHeaderProps = {
  title: string;
  /** Optional trailing text button, e.g. "See all". */
  actionLabel?: string;
  onActionPress?: () => void;
  style?: ViewStyle;
};

/** Consistent heading + optional action above every content block. */
export function SectionHeader({ title, actionLabel, onActionPress, style }: SectionHeaderProps) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          marginBottom: spacing.md,
        },
        style,
      ]}
    >
      <Text variant="h3" style={{ flexShrink: 1 }} numberOfLines={1}>
        {title}
      </Text>

      {actionLabel ? (
        <Pressable
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}, ${title}`}
          hitSlop={12}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
        >
          <Text variant="labelSm" tone="secondary">
            {actionLabel}
          </Text>
          <Icon name="chevronRight" size={15} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}
