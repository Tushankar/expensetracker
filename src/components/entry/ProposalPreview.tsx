import { Fragment } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { QuickEntryProposal } from '@/api';
import { Badge, Button, Card, Divider, Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';
import { RUPEE, formatAmountInput, paiseToRupeeInput } from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';

export type ProposalPreviewProps = {
  proposal: QuickEntryProposal;
  /** What the app resolved the account to, which may differ from the server's guess. */
  accountName?: string;
  methodLabel: string;
  onSave: () => void;
  onEdit: () => void;
  saving: boolean;
};

const SOURCE_LABEL: Record<QuickEntryProposal['categorySource'], string> = {
  memory: 'From your history',
  merchant: 'Known merchant',
  model: 'Best guess',
  none: 'Not sure',
};

/**
 * What the app thinks you meant, before it writes anything down.
 *
 * The whole feature rests on this screen. A parser that is right nine times in ten
 * is delightful with a confirmation step and a slow-motion disaster without one —
 * the tenth entry is wrong, nobody notices, and it surfaces six weeks later as a
 * number in a chart that cannot be traced back to anything.
 *
 * So the amount is display-sized, every inferred field says where it came from,
 * and anything the parser was unsure about is stated in words rather than implied
 * by a colour. Save is disabled outright when there is no amount: offering to save
 * a blank is offering to save a mistake.
 */
export function ProposalPreview({
  proposal,
  accountName,
  methodLabel,
  onSave,
  onEdit,
  saving,
}: ProposalPreviewProps) {
  const theme = useTheme();

  const canSave = proposal.amount !== null && Boolean(proposal.categoryId);

  const rows: { icon: IconName; label: string; value: string; hint?: string }[] = [
    {
      icon: 'list',
      label: 'Category',
      value: proposal.categoryName ?? 'Not set',
      hint: proposal.categoryName ? proposal.categoryReason : 'Tap Edit to choose one',
    },
    { icon: 'wallet', label: 'Account', value: accountName ?? proposal.accountName ?? 'Not set' },
    { icon: 'card', label: 'Method', value: methodLabel },
    {
      icon: 'calendar',
      label: 'Date',
      value: formatDayLabel(proposal.date),
      hint: proposal.matched.date ? `read from "${proposal.matched.date}"` : undefined,
    },
  ];

  return (
    <Animated.View
      entering={FadeInDown.duration(theme.duration.base)}
      style={{ gap: theme.spacing.lg }}
    >
      {/* The amount, at the size it deserves: it is the one field where being
          wrong actually costs something. */}
      <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
          <Text variant="h2" tone="tertiary" style={{ marginTop: 6 }} maxFontSizeMultiplier={1.2}>
            {RUPEE}
          </Text>
          <Text
            variant="displayLg"
            tone={proposal.amount === null ? 'tertiary' : 'primary'}
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.15}
          >
            {proposal.amount === null
              ? '—'
              : formatAmountInput(paiseToRupeeInput(proposal.amount))}
          </Text>
        </View>

        {proposal.merchant ? (
          <Text variant="label" tone="secondary" numberOfLines={1}>
            {proposal.merchant}
          </Text>
        ) : null}

        <Badge
          label={SOURCE_LABEL[proposal.categorySource]}
          tone={
            proposal.categorySource === 'memory'
              ? 'positive'
              : proposal.categorySource === 'merchant'
                ? 'brand'
                : proposal.categorySource === 'model'
                  ? 'info'
                  : 'warning'
          }
        />
      </View>

      {proposal.warnings.length > 0 ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            gap: theme.spacing.xs,
            padding: theme.spacing.md,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.warningSurface,
          }}
        >
          {proposal.warnings.map((warning) => (
            <View
              key={warning}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
            >
              <Icon name="alertTriangle" size={14} color={theme.colors.warning} />
              <Text variant="caption" color={theme.colors.warning} style={{ flex: 1 }}>
                {warning}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Card padding={0} radius="lg" variant="muted">
        <View style={{ paddingHorizontal: theme.spacing.lg }}>
          {rows.map((row, index) => (
            <Fragment key={row.label}>
              {index > 0 ? <Divider /> : null}
              <View
                accessible
                accessibilityLabel={`${row.label}, ${row.value}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  paddingVertical: theme.spacing.md,
                }}
              >
                <Icon name={row.icon} size={16} color={theme.colors.textTertiary} />
                <Text variant="caption" tone="tertiary" style={{ width: 72 }}>
                  {row.label}
                </Text>
                <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 }}>
                  <Text variant="labelSm" numberOfLines={1}>
                    {row.value}
                  </Text>
                  {row.hint ? (
                    <Text variant="caption" tone="tertiary" numberOfLines={1}>
                      {row.hint}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Fragment>
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Button
          label="Edit"
          onPress={onEdit}
          variant="secondary"
          size="lg"
          leftIcon="pencil"
          style={{ flex: 1 }}
        />
        <Button
          label="Save"
          onPress={onSave}
          variant="brand"
          size="lg"
          loading={saving}
          disabled={!canSave}
          style={{ flex: 1 }}
        />
      </View>

      {!canSave ? (
        <Text variant="caption" tone="tertiary" align="center">
          {proposal.amount === null
            ? 'No amount was found, so there is nothing to save yet. Tap Edit to enter one.'
            : 'Choose a category before saving.'}
        </Text>
      ) : null}
    </Animated.View>
  );
}
