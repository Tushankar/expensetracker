import { Image } from 'expo-image';
import { Fragment } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { Receipt } from '@/api';
import { errorMessage, isNetworkError } from '@/api';
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  ProgressBar,
  Spinner,
  Text,
} from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';

export type ReceiptPanelProps = {
  receipt: Receipt | null;
  /** 0–1 while the image is going up, null when it is not. */
  progress: number | null;
  uploading: boolean;
  reading: boolean;
  /** False when the server has no vision model — upload works, reading does not. */
  canRead: boolean;
  error: unknown;
  onPickCamera: () => void;
  onPickLibrary: () => void;
  onApply: () => void;
  onDiscard: () => void;
};

/**
 * Photograph a bill, see what was read, decide what to keep.
 *
 * The important word is *decide*. This is the one place in the app where a number
 * comes from a model rather than from the database, and nothing on this panel is
 * written anywhere until "Use these details" is tapped — at which point it fills
 * the form, which still has to be saved. Two confirmations for a figure nobody
 * else can check.
 *
 * The line the total was read from is shown verbatim next to it. That turns "trust
 * the model" into "check it against the paper in your hand", which is the only
 * verification available when the source is a photograph.
 */
export function ReceiptPanel({
  receipt,
  progress,
  uploading,
  reading,
  canRead,
  error,
  onPickCamera,
  onPickLibrary,
  onApply,
  onDiscard,
}: ReceiptPanelProps) {
  const theme = useTheme();
  const extraction = receipt?.extraction ?? null;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {!receipt ? (
        <View style={{ gap: theme.spacing.md }}>
          <View
            style={{
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.xxl,
              borderRadius: theme.radius.lg,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.border,
              borderStyle: 'dashed',
              backgroundColor: theme.colors.surfaceMuted,
            }}
          >
            <Icon name="scan" size={28} color={theme.colors.textTertiary} />
            <Text variant="labelSm" tone="secondary">
              Attach a bill
            </Text>
            <Text
              variant="caption"
              tone="tertiary"
              align="center"
              style={{ paddingHorizontal: theme.spacing.xl }}
            >
              {canRead
                ? 'The amount, shop and date are read off it for you to check.'
                : 'Stored with the expense. Reading bills is not set up on this server.'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <Button
              label="Camera"
              leftIcon="camera"
              variant="secondary"
              size="lg"
              onPress={onPickCamera}
              disabled={uploading}
              style={{ flex: 1 }}
            />
            <Button
              label="Gallery"
              leftIcon="image"
              variant="secondary"
              size="lg"
              onPress={onPickLibrary}
              disabled={uploading}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(theme.duration.base)} style={{ gap: theme.spacing.lg }}>
          <Image
            source={{ uri: receipt.thumbnailUrl }}
            style={{
              width: '100%',
              height: 190,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surfaceMuted,
            }}
            contentFit="cover"
            transition={180}
            accessibilityLabel="The receipt you attached"
          />

          {reading ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
            >
              <Spinner />
              <Text variant="bodySm" tone="tertiary">
                Reading the bill…
              </Text>
            </View>
          ) : extraction ? (
            <Card padding={0} radius="lg" variant="muted">
              <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    paddingVertical: theme.spacing.sm,
                  }}
                >
                  <Icon name="scan" size={15} color={theme.colors.brandText} />
                  <Text variant="caption" tone="tertiary" style={{ flex: 1 }}>
                    READ FROM THE BILL
                  </Text>
                  <Badge
                    label={extraction.confidence === 'high' ? 'Clear' : extraction.confidence === 'medium' ? 'Mostly clear' : 'Hard to read'}
                    tone={extraction.confidence === 'high' ? 'positive' : extraction.confidence === 'medium' ? 'neutral' : 'warning'}
                  />
                </View>

                <Divider />

                <Row label="Total" value={extraction.amount === null ? 'Not legible' : formatINR(extraction.amount)} hint={extraction.amountText || undefined} />
                <Divider />
                <Row label="Shop" value={extraction.merchant || 'Not legible'} />
                <Divider />
                <Row
                  label="Date"
                  value={extraction.date ? formatDayLabel(extraction.date) : 'Not legible'}
                />

                {extraction.items.length > 0 ? (
                  <>
                    <Divider />
                    <View style={{ paddingVertical: theme.spacing.md, gap: 6 }}>
                      <Text variant="caption" tone="tertiary">
                        {`${extraction.items.length} ${extraction.items.length === 1 ? 'item' : 'items'}`}
                      </Text>
                      {extraction.items.slice(0, 5).map((item, index) => (
                        <Fragment key={`${item.name}-${index}`}>
                          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                            <Text
                              variant="caption"
                              tone="secondary"
                              numberOfLines={1}
                              style={{ flex: 1, minWidth: 0 }}
                            >
                              {item.name}
                            </Text>
                            {item.amount !== null ? (
                              <Text variant="caption" tone="tertiary">
                                {formatINR(item.amount)}
                              </Text>
                            ) : null}
                          </View>
                        </Fragment>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            </Card>
          ) : null}

          {/* Said plainly, because the whole panel rests on it. */}
          {extraction ? (
            <Text variant="caption" tone="tertiary" align="center">
              Check these against the bill. Nothing is saved until you do.
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <Button
              label="Remove"
              leftIcon="trash"
              variant="secondary"
              size="lg"
              onPress={onDiscard}
              style={{ flex: 1 }}
            />
            <Button
              label={extraction ? 'Use these details' : 'Keep receipt'}
              variant="brand"
              size="lg"
              onPress={onApply}
              disabled={reading}
              style={{ flex: 1.4 }}
            />
          </View>
        </Animated.View>
      )}

      {uploading ? (
        <View style={{ gap: theme.spacing.sm }} accessibilityLiveRegion="polite">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
              {progress !== null && progress < 1 ? 'Uploading…' : 'Finishing up…'}
            </Text>
            <Text variant="caption" tone="tertiary">
              {`${Math.round((progress ?? 0) * 100)}%`}
            </Text>
          </View>
          {/* A real fraction of bytes sent, not a fake crawl: this is exactly why
              the upload uses XMLHttpRequest rather than fetch. */}
          <ProgressBar value={progress ?? 0} />
        </View>
      ) : null}

      {error ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.negativeSurface,
          }}
        >
          <Icon
            name={isNetworkError(error) ? 'wifiOff' : 'alertCircle'}
            size={16}
            color={theme.colors.negative}
          />
          <Text variant="caption" tone="negative" style={{ flex: 1 }}>
            {isNetworkError(error)
              ? 'No connection, so the image could not be sent. It is still on your phone.'
              : errorMessage(error)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
      }}
    >
      <Text variant="caption" tone="tertiary" style={{ width: 52 }}>
        {label}
      </Text>
      <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 }}>
        <Text variant="labelSm" numberOfLines={1}>
          {value}
        </Text>
        {hint ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {`“${hint}”`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
