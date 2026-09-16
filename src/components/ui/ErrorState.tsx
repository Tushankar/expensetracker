import type { ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import type { IconName } from './Icon';
import { MessageState, type MessageStateAction } from './MessageState';

export type ErrorStateProps = {
  icon?: IconName;
  title?: string;
  description?: string;
  /** Wire this to a refetch. An error state without a way out is a dead end. */
  onRetry?: () => void;
  retryLabel?: string;
  secondaryAction?: MessageStateAction;
  fill?: boolean;
  style?: ViewStyle;
};

/**
 * Something-went-wrong state. Carries the negative accent so it is
 * distinguishable from an empty list at a glance, and always offers a retry.
 */
export function ErrorState({
  icon = 'alertTriangle',
  title = 'Something went wrong',
  description = 'We could not load this right now. Check your connection and try again.',
  onRetry,
  retryLabel = 'Try again',
  secondaryAction,
  fill,
  style,
}: ErrorStateProps) {
  const { colors } = useTheme();
  return (
    <MessageState
      icon={icon}
      title={title}
      description={description}
      accent={colors.negative}
      haloColor={colors.negativeSurface}
      action={onRetry ? { label: retryLabel, onPress: onRetry, variant: 'secondary' } : undefined}
      secondaryAction={secondaryAction}
      fill={fill}
      style={style}
    />
  );
}
