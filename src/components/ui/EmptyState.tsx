import type { ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import type { IconName } from './Icon';
import { MessageState, type MessageStateAction } from './MessageState';

export type EmptyStateProps = {
  icon?: IconName;
  title: string;
  /** Say what would fill this space and how to put something here. */
  description?: string;
  action?: MessageStateAction;
  fill?: boolean;
  style?: ViewStyle;
};

/**
 * Nothing-here state. Neutral by design — an empty list is not a problem, so it
 * gets the quiet grey treatment rather than anything alarm-coloured.
 */
export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
  fill,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <MessageState
      icon={icon}
      title={title}
      description={description}
      accent={colors.textTertiary}
      haloColor={colors.surfaceMuted}
      action={action}
      fill={fill}
      style={style}
    />
  );
}
