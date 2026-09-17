import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { AiSummary } from '@/api/types';
import { Badge, Button, Card, Icon, Skeleton, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export type AiSummaryCardProps = {
  summary: AiSummary | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onAsk: () => void;
};

/**
 * The assistant's read on the period.
 *
 * Two things are always visible: that this was written by a model, and — when it
 * was not — that the app wrote it instead. A financial app that blurs who said a
 * number has given up the only thing that makes the number worth reading.
 */
export function AiSummaryCard({ summary, loading, error, onRetry, onAsk }: AiSummaryCardProps) {
  const theme = useTheme();

  return (
    <Card radius="xl" padding="xl">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brandSurface,
          }}
        >
          <Icon name="sparkles" size={15} color={theme.colors.brandText} strokeWidth={2} />
        </View>
        <Text variant="labelSm" style={{ flex: 1, minWidth: 0 }}>
          Your month, in a line
        </Text>
        {summary && !summary.fromModel ? (
          // Said plainly rather than hidden: the figures are identical either
          // way, and pretending a fallback was the assistant would be the kind of
          // small dishonesty that costs trust in everything else on the screen.
          <Badge label="Computed" tone="neutral" />
        ) : null}
      </View>

      <View style={{ marginTop: theme.spacing.lg }}>
        {loading ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Skeleton height={13} />
            <Skeleton height={13} />
            <Skeleton height={13} width="70%" />
          </View>
        ) : error ? (
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="bodySm" tone="secondary">
              The assistant could not answer just now. Your figures are all still below.
            </Text>
            <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} />
          </View>
        ) : summary ? (
          <Animated.View entering={FadeIn.duration(theme.duration.base)}>
            <Text variant="body" style={{ lineHeight: 23 }}>
              {summary.text}
            </Text>

            {summary.limitedData ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  marginTop: theme.spacing.md,
                  padding: theme.spacing.md,
                  borderRadius: theme.radius.sm,
                  backgroundColor: theme.colors.warningSurface,
                }}
              >
                <Icon name="info" size={15} color={theme.colors.warning} />
                <Text variant="caption" color={theme.colors.warning} style={{ flex: 1 }}>
                  Based on very little data so far, so treat this as a sketch.
                </Text>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
      </View>

      <Button
        label="Ask about your money"
        leftIcon="sparkles"
        variant="tonal"
        size="md"
        fullWidth
        onPress={onAsk}
        style={{ marginTop: theme.spacing.lg }}
      />
    </Card>
  );
}
