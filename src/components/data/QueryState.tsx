import type { ReactNode } from 'react';

import { errorMessage, isNetworkError } from '@/api';
import { EmptyState, ErrorState, LoadingState, type MessageStateAction } from '@/components/ui';

export type QueryStateProps = {
  isLoading: boolean;
  error: unknown;
  /** True when the query succeeded but returned nothing. */
  isEmpty?: boolean;
  onRetry?: () => void;
  /** Rendered instead of the default spinner — usually a skeleton of the real layout. */
  loadingFallback?: ReactNode;
  empty?: { icon?: Parameters<typeof EmptyState>[0]['icon']; title: string; description?: string; action?: MessageStateAction };
  loadingLabel?: string;
  fill?: boolean;
  children: ReactNode;
};

/**
 * The one place the app decides what a screen shows while it is waiting, when it
 * failed, and when there is genuinely nothing there.
 *
 * Centralised because those three states are what separate an app that feels
 * finished from one that does not, and because they are exactly the states that
 * get skipped when each screen rolls its own. In particular it distinguishes a
 * network failure from a server error: "check your connection" and "try again"
 * are different instructions, and giving the wrong one sends people to their
 * router for no reason.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty = false,
  onRetry,
  loadingFallback,
  empty,
  loadingLabel,
  fill = true,
  children,
}: QueryStateProps) {
  if (isLoading) {
    return <>{loadingFallback ?? <LoadingState label={loadingLabel} fill={fill} />}</>;
  }

  if (error) {
    const offline = isNetworkError(error);
    return (
      <ErrorState
        fill={fill}
        icon={offline ? 'wifiOff' : 'alertTriangle'}
        title={offline ? "You're offline" : 'Could not load this'}
        description={
          offline
            ? 'Paisa needs a connection to reach your data. Reconnect and try again.'
            : errorMessage(error)
        }
        onRetry={onRetry}
      />
    );
  }

  if (isEmpty && empty) {
    return (
      <EmptyState
        fill={fill}
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    );
  }

  return <>{children}</>;
}
