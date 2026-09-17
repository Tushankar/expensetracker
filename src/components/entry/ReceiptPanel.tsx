import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { Receipt, ReceiptConfidenceLevel } from '@/api';
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
  selectedAccountId?: string | null;
  accountName?: string | null;
  categoryName?: string | null;
  onPickCamera: () => void;
  onPickLibrary: () => void;
  onApply: () => void;
  onConfirmDirect?: () => void;
  onRetryExtract?: () => void;
  onPickAccount?: () => void;
  onDiscard: () => void;
  saving?: boolean;
};

export function ReceiptPanel({
  receipt,
  progress,
  uploading,
  reading,
  canRead,
  error,
  selectedAccountId,
  accountName,
  categoryName,
  onPickCamera,
  onPickLibrary,
  onApply,
  onConfirmDirect,
  onRetryExtract,
  onPickAccount,
  onDiscard,
  saving = false,
}: ReceiptPanelProps) {
  const theme = useTheme();
  const [fullscreenImage, setFullscreenImage] = useState(false);
  const extraction = receipt?.extraction ?? null;

  const hasUnresolvedAccount =
    extraction &&
    !selectedAccountId &&
    !extraction.suggestedAccountId &&
    extraction.accountStatus === 'unresolved';

  const canDirectSave =
    Boolean(extraction?.amount && extraction.amount > 0) &&
    (Boolean(selectedAccountId) || Boolean(extraction?.suggestedAccountId));

  const isDuplicate = Boolean(extraction?.possibleDuplicate);

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
            <Icon name="scan" size={32} color={theme.colors.brandText} />
            <Text variant="label" tone="primary">
              Attach receipt or bill
            </Text>
            <Text
              variant="caption"
              tone="tertiary"
              align="center"
              style={{ paddingHorizontal: theme.spacing.xl }}
            >
              {canRead
                ? 'Take a photo or pick an image. Amount, merchant, tax and payment method will be read automatically for confirmation.'
                : 'Receipts are stored with the transaction. Bill reading is not configured.'}
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
        <Animated.View entering={FadeIn.duration(theme.duration.base)} style={{ gap: theme.spacing.md }}>
          {/* Thumbnail preview with tap-to-enlarge */}
          <Pressable
            onPress={() => setFullscreenImage(true)}
            accessibilityRole="button"
            accessibilityLabel="Receipt image preview. Tap to view full screen."
            style={({ pressed }) => ({
              borderRadius: theme.radius.lg,
              overflow: 'hidden',
              opacity: pressed ? 0.9 : 1,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.border,
            })}
          >
            <Image
              source={{ uri: receipt.thumbnailUrl }}
              style={{
                width: '100%',
                height: 160,
                backgroundColor: theme.colors.surfaceMuted,
              }}
              contentFit="cover"
              transition={180}
              accessibilityLabel="The receipt you attached"
            />
            <View
              style={{
                position: 'absolute',
                right: theme.spacing.sm,
                bottom: theme.spacing.sm,
                backgroundColor: 'rgba(0,0,0,0.65)',
                borderRadius: theme.radius.pill,
                paddingHorizontal: 8,
                paddingVertical: 4,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Icon name="eye" size={12} color="#FFFFFF" />
              <Text variant="caption" style={{ color: '#FFFFFF', fontSize: 11 }}>
                View Full
              </Text>
            </View>
          </Pressable>

          {/* Reading State */}
          {reading ? (
            <Card padding="lg" radius="lg" variant="muted">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <Spinner />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="labelSm" tone="primary">
                    Reading receipt…
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    Extracting total, taxes, merchant & payment method.
                  </Text>
                </View>
              </View>
            </Card>
          ) : extraction ? (
            <Card padding={0} radius="lg" variant="muted">
              <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm }}>
                {/* Header info */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: theme.spacing.sm,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="sparkles" size={14} color={theme.colors.brandText} />
                    <Text variant="caption" tone="tertiary">
                      RECEIPT INTELLIGENCE
                    </Text>
                  </View>
                  <Badge
                    label={
                      extraction.confidence === 'high'
                        ? 'Clear'
                        : extraction.confidence === 'medium'
                          ? 'Mostly clear'
                          : 'Needs check'
                    }
                    tone={
                      extraction.confidence === 'high'
                        ? 'positive'
                        : extraction.confidence === 'medium'
                          ? 'neutral'
                          : 'warning'
                    }
                  />
                </View>

                <Divider />

                {/* Main Total Highlight */}
                <View style={{ paddingVertical: theme.spacing.md, gap: 4 }}>
                  <Text variant="caption" tone="tertiary">
                    GRAND TOTAL READ
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Text variant="h1" tone={extraction.amount ? 'primary' : 'tertiary'}>
                      {extraction.amount !== null ? formatINR(extraction.amount) : 'Not legible'}
                    </Text>
                    {extraction.amountText ? (
                      <Text variant="caption" tone="tertiary" numberOfLines={1}>
                        from “{extraction.amountText}”
                      </Text>
                    ) : null}
                  </View>
                </View>

                <Divider />

                {/* Core Transaction Fields */}
                <Row label="Shop" value={extraction.merchant || 'Not legible'} />
                <Divider />

                <Row
                  label="Category"
                  value={categoryName || extraction.categoryHint || 'Not categorized'}
                  hint={extraction.categoryHint && !categoryName ? 'Suggested' : undefined}
                />
                <Divider />

                {/* Account row with strict confirmation */}
                <Pressable
                  onPress={onPickAccount}
                  accessibilityRole="button"
                  accessibilityLabel={`Payment Account: ${accountName || 'Needs confirmation'}. Tap to select.`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: theme.spacing.md,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text variant="caption" tone="tertiary" style={{ width: 60 }}>
                    Account
                  </Text>
                  <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
                    {hasUnresolvedAccount ? (
                      <Badge label="Needs confirmation" tone="warning" />
                    ) : (
                      <Text variant="labelSm" tone="primary" numberOfLines={1}>
                        {accountName || (extraction.accountHint ? `Account: ${extraction.accountHint}` : 'Default account')}
                      </Text>
                    )}
                    {extraction.accountHint && !hasUnresolvedAccount ? (
                      <Text variant="caption" tone="tertiary">
                        Matched “{extraction.accountHint}”
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ marginLeft: 6 }}>
                    <Icon name="chevronRight" size={14} color={theme.colors.textTertiary} />
                  </View>
                </Pressable>
                <Divider />

                <Row
                  label="Payment"
                  value={
                    extraction.paymentMethod
                      ? extraction.paymentMethod.replace(/_/g, ' ').toUpperCase()
                      : 'Not specified'
                  }
                />
                <Divider />

                <Row
                  label="Date"
                  value={extraction.date ? formatDayLabel(extraction.date) : 'Today'}
                  hint={extraction.isDateDefault ? 'Date not found — today' : undefined}
                />

                {/* Financial Breakdown (Subtotal, GST, Discount) */}
                {(extraction.subtotal !== null || extraction.tax !== null || extraction.discount !== null) ? (
                  <>
                    <Divider />
                    <View style={{ paddingVertical: theme.spacing.sm, gap: 6 }}>
                      <Text variant="caption" tone="tertiary">
                        TAX & CHARGES BREAKDOWN
                      </Text>
                      {extraction.subtotal !== null ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="caption" tone="secondary">
                            Subtotal
                          </Text>
                          <Text variant="caption" tone="tertiary">
                            {formatINR(extraction.subtotal)}
                          </Text>
                        </View>
                      ) : null}
                      {extraction.tax !== null ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="caption" tone="secondary">
                            GST / Taxes
                          </Text>
                          <Text variant="caption" tone="tertiary">
                            +{formatINR(extraction.tax)}
                          </Text>
                        </View>
                      ) : null}
                      {extraction.discount !== null ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="caption" tone="secondary">
                            Discount
                          </Text>
                          <Text variant="caption" tone="positive">
                            -{formatINR(extraction.discount)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </>
                ) : null}

                {/* Confidence Chips */}
                {extraction.confidenceDetails ? (
                  <>
                    <Divider />
                    <View style={{ paddingVertical: theme.spacing.sm, gap: 6 }}>
                      <Text variant="caption" tone="tertiary">
                        FIELD CONFIDENCE
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        <ConfidenceChip label="Shop" status={extraction.confidenceDetails.merchant} />
                        <ConfidenceChip label="Amount" status={extraction.confidenceDetails.amount} />
                        <ConfidenceChip label="Date" status={extraction.confidenceDetails.date} />
                        <ConfidenceChip label="Account" status={extraction.confidenceDetails.account} />
                        <ConfidenceChip label="Method" status={extraction.confidenceDetails.paymentMethod} />
                      </View>
                    </View>
                  </>
                ) : null}

                {/* Purchased items preview */}
                {extraction.items.length > 0 ? (
                  <>
                    <Divider />
                    <View style={{ paddingVertical: theme.spacing.sm, gap: 6 }}>
                      <Text variant="caption" tone="tertiary">
                        {`${extraction.items.length} ${extraction.items.length === 1 ? 'item' : 'items'} found`}
                      </Text>
                      {extraction.items.slice(0, 4).map((item, index) => (
                        <View key={`${item.name}-${index}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                            {item.name}
                          </Text>
                          {item.amount !== null ? (
                            <Text variant="caption" tone="tertiary">
                              {formatINR(item.amount)}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            </Card>
          ) : null}

          {/* Duplicate warning */}
          {isDuplicate && extraction?.possibleDuplicate ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.warningSurface,
                borderWidth: theme.layout.hairline,
                borderColor: theme.colors.warning,
              }}
            >
              <Icon name="alertCircle" size={18} color={theme.colors.warning} />
              <Text variant="caption" tone="warning" style={{ flex: 1 }}>
                Possible duplicate: A similar transaction of {formatINR(extraction.possibleDuplicate.amount)} was recorded {extraction.possibleDuplicate.minutesAgo}m ago.
              </Text>
            </View>
          ) : null}

          {/* Account warning if unresolved */}
          {hasUnresolvedAccount ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.warningSurface,
                borderWidth: theme.layout.hairline,
                borderColor: theme.colors.warning,
              }}
            >
              <Icon name="alertCircle" size={18} color={theme.colors.warning} />
              <Text variant="caption" tone="warning" style={{ flex: 1 }}>
                Account needs confirmation before saving. Tap "Account" above to select.
              </Text>
            </View>
          ) : null}

          {/* User Confirmation Reminder */}
          {extraction ? (
            <Text variant="caption" tone="tertiary" align="center">
              Check these against the bill. Nothing is saved until you confirm.
            </Text>
          ) : null}

          {/* Action Buttons */}
          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
            {extraction && onConfirmDirect ? (
              <Button
                label={isDuplicate ? 'Add anyway' : 'Add expense'}
                variant="brand"
                size="lg"
                onPress={onConfirmDirect}
                disabled={!canDirectSave || reading || saving}
                loading={saving}
              />
            ) : null}

            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <Button
                label="Remove"
                leftIcon="trash"
                variant="secondary"
                size="md"
                onPress={onDiscard}
                style={{ flex: 1 }}
              />
              {onRetryExtract ? (
                <Button
                  label="Try again"
                  leftIcon="refresh"
                  variant="secondary"
                  size="md"
                  onPress={onRetryExtract}
                  disabled={reading}
                  style={{ flex: 1 }}
                />
              ) : null}
              <Button
                label={extraction ? 'Review & edit' : 'Enter manually'}
                leftIcon="pencil"
                variant={onConfirmDirect ? 'secondary' : 'brand'}
                size="md"
                onPress={onApply}
                disabled={reading}
                style={{ flex: 1.2 }}
              />
            </View>
          </View>
        </Animated.View>
      )}

      {/* Uploading progress */}
      {uploading ? (
        <View style={{ gap: theme.spacing.sm }} accessibilityLiveRegion="polite">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
              {progress !== null && progress < 1 ? 'Uploading receipt…' : 'Finishing up…'}
            </Text>
            <Text variant="caption" tone="tertiary">
              {`${Math.round((progress ?? 0) * 100)}%`}
            </Text>
          </View>
          <ProgressBar value={progress ?? 0} />
        </View>
      ) : null}

      {/* Error state */}
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
              ? 'No connection. The image is still on your phone.'
              : errorMessage(error)}
          </Text>
        </View>
      ) : null}

      {/* Fullscreen Image Preview Modal */}
      <Modal visible={fullscreenImage} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.92)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={() => setFullscreenImage(false)}
            accessibilityRole="button"
            accessibilityLabel="Close full receipt view"
            style={{
              position: 'absolute',
              top: 50,
              right: 20,
              zIndex: 10,
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: theme.radius.pill,
              padding: 10,
            }}
          >
            <Icon name="close" size={20} color="#FFFFFF" />
          </Pressable>

          <ScrollView
            maximumZoomScale={3}
            minimumZoomScale={1}
            contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
            style={{ width: '100%', height: '100%' }}
          >
            {receipt ? (
              <Image
                source={{ uri: receipt.url }}
                style={{ width: '92%', height: '80%' }}
                contentFit="contain"
              />
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function ConfidenceChip({ label, status }: { label: string; status: ReceiptConfidenceLevel }) {
  const isHigh = status === 'high';
  const isReview = status === 'needs_review';
  const tone = isHigh ? 'positive' : isReview ? 'warning' : 'neutral';

  return (
    <Badge
      label={`${label} ${isHigh ? '✓' : isReview ? '⚠' : '?'}`}
      tone={tone}
    />
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
      <Text variant="caption" tone="tertiary" style={{ width: 60 }}>
        {label}
      </Text>
      <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 }}>
        <Text variant="labelSm" numberOfLines={1}>
          {value}
        </Text>
        {hint ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
