import { View, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Button, type ButtonVariant } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type MessageStateAction = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
};

export type MessageStateProps = {
  icon: IconName;
  title: string;
  description?: string;
  /** Glyph colour. The halo behind it is derived from this at low opacity. */
  accent?: string;
  haloColor?: string;
  action?: MessageStateAction;
  secondaryAction?: MessageStateAction;
  /** Centre in the available space rather than sitting at its natural height. */
  fill?: boolean;
  style?: ViewStyle;
};

/**
 * Shared layout behind the empty and error states so both read as the same
 * component family: one glyph, one line of what happened, one line of what to do,
 * then the action.
 */
export function MessageState({
  icon,
  title,
  description,
  accent,
  haloColor,
  action,
  secondaryAction,
  fill = false,
  style,
}: MessageStateProps) {
  const theme = useTheme();
  const glyph = accent ?? theme.colors.textTertiary;

  return (
    <Animated.View
      entering={FadeIn.duration(theme.duration.base)}
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.xxxl,
          gap: theme.spacing.sm,
        },
        fill && { flex: 1 },
        style,
      ]}
    >
      <View
        style={{
          width: 68,
          height: 68,
          borderRadius: 34,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: haloColor ?? theme.colors.surfaceMuted,
          borderWidth: 1,
          borderColor: theme.colors.border,
          marginBottom: theme.spacing.md,
        }}
      >
        <Icon name={icon} size={30} color={glyph} strokeWidth={1.8} />
      </View>

      <Text variant="h3" align="center">
        {title}
      </Text>

      {description ? (
        <Text
          variant="bodySm"
          tone="secondary"
          align="center"
          style={{ maxWidth: 300, lineHeight: 21 }}
        >
          {description}
        </Text>
      ) : null}

      {action || secondaryAction ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg }}>
          {action ? (
            <Button
              label={action.label}
              onPress={action.onPress}
              variant={action.variant ?? 'primary'}
              size="md"
            />
          ) : null}
          {secondaryAction ? (
            <Button
              label={secondaryAction.label}
              onPress={secondaryAction.onPress}
              variant={secondaryAction.variant ?? 'ghost'}
              size="md"
            />
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}
