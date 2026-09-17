import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';

import type { Receipt } from '@/api';
import { Button, Card, Icon, IconButton, SectionHeader, Spinner, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

export type ReceiptCardProps = {
  receipt: Receipt | null;
  loading: boolean;
  /** Hidden entirely when storage is not configured on the server. */
  available: boolean;
  busy: boolean;
  onAttach: () => void;
  onRemove: () => void;
};

/**
 * The bill, kept with the expense.
 *
 * The extracted total is shown next to the receipt rather than merged into the
 * transaction, and where the two disagree both are visible. That is deliberate: a
 * split bill, a tip added later or a partial refund all produce an honest
 * mismatch, and a screen that hid it would be destroying the only evidence at
 * exactly the moment it becomes interesting.
 */
export function ReceiptCard({
  receipt,
  loading,
  available,
  busy,
  onAttach,
  onRemove,
}: ReceiptCardProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const [full, setFull] = useState(false);

  if (!available) return null;

  return (
    <View style={{ marginTop: theme.spacing.xl }}>
      <SectionHeader title="Receipt" />

      {loading ? (
        <Card radius="xl" padding="xl">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Spinner />
            <Text variant="bodySm" tone="tertiary">
              Looking for a receipt…
            </Text>
          </View>
        </Card>
      ) : receipt ? (
        <Card padding={0} radius="xl">
          <Pressable
            onPress={() => {
              tapFeedback();
              setFull(true);
            }}
            accessibilityRole="imagebutton"
            accessibilityLabel="Receipt. Opens full screen."
          >
            <Image
              source={{ uri: receipt.thumbnailUrl }}
              style={{
                width: '100%',
                height: 200,
                borderTopLeftRadius: theme.radius.xl,
                borderTopRightRadius: theme.radius.xl,
                backgroundColor: theme.colors.surfaceMuted,
              }}
              contentFit="cover"
              transition={180}
            />
          </Pressable>

          <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
            {receipt.extraction ? (
              <View style={{ gap: 4 }}>
                <Text variant="caption" tone="tertiary">
                  READ FROM THE BILL
                </Text>
                <Text variant="bodySm" tone="secondary">
                  {[
                    receipt.extraction.merchant || null,
                    receipt.extraction.amount !== null
                      ? formatINR(receipt.extraction.amount)
                      : null,
                  ]
                    .filter(Boolean)
                    .join('  ·  ') || 'Nothing legible'}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Button
                label="Replace"
                leftIcon="camera"
                variant="secondary"
                size="sm"
                onPress={onAttach}
                disabled={busy}
                style={{ flex: 1 }}
              />
              <Button
                label="Remove"
                leftIcon="trash"
                variant="secondary"
                size="sm"
                onPress={onRemove}
                disabled={busy}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </Card>
      ) : (
        <Card radius="xl" padding="xl">
          <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
            <Icon name="scan" size={24} color={theme.colors.textTertiary} />
            <Text variant="bodySm" tone="tertiary" align="center">
              No bill attached to this one.
            </Text>
            <Button
              label="Attach a bill"
              leftIcon="camera"
              variant="tonal"
              size="sm"
              onPress={onAttach}
              loading={busy}
            />
          </View>
        </Card>
      )}

      {/* Full screen, because the reason to keep a receipt is to be able to read
          the small print on it eighteen months later. */}
      <Modal visible={full} transparent animationType="fade" onRequestClose={() => setFull(false)}>
        <View style={{ flex: 1, backgroundColor: theme.colors.overlay }}>
          <Pressable style={{ flex: 1 }} onPress={() => setFull(false)} accessibilityLabel="Close">
            <Image
              source={{ uri: receipt?.url }}
              style={{ width, height: height * 0.85, marginTop: height * 0.075 }}
              contentFit="contain"
              transition={180}
              accessibilityLabel="The full receipt"
            />
          </Pressable>
          <View style={{ position: 'absolute', top: 48, right: 16 }}>
            <IconButton
              name="close"
              onPress={() => setFull(false)}
              accessibilityLabel="Close"
              variant="surface"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
