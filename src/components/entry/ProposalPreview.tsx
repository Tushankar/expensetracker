import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { QuickEntryProposal } from '@/api';
import { Badge, Button, Card, Divider, Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';
import { RUPEE, formatAmountInput, formatINR, paiseToRupeeInput } from '@/utils/currency';
import { formatDayLabel } from '@/utils/date';

export type ProposalPreviewProps = {
  proposal: QuickEntryProposal;
  /** What the app resolved the account to, which may differ from the server's guess. */
  accountName?: string;
  methodLabel: string;
  onSave: () => void;
  onEdit: () => void;
  onPickCategory?: () => void;
  onPickAccount?: () => void;
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
 * The whole feature rests on this screen: nothing parsed is saved automatically.
 * The amount is prominent, inferred fields show their source, and low-confidence
 * categories prompt the user with "Select category".
 */
export function ProposalPreview({
  proposal,
  accountName,
  methodLabel,
  onSave,
  onEdit,
  onPickCategory,
  onPickAccount,
  saving,
}: ProposalPreviewProps) {
  const theme = useTheme();

  const canSave =
    proposal.amount !== null &&
    (Boolean(proposal.categoryId) || Boolean(proposal.obligation)) &&
    Boolean(proposal.accountId);

  const rows: {
    icon: IconName;
    label: string;
    value: string;
    hint?: string;
    isCategory?: boolean;
    isAccount?: boolean;
  }[] = [
    {
      icon: 'list',
      label: 'Category',
      value: proposal.categoryName ?? 'Select category',
      hint: proposal.categoryName ? proposal.categoryReason : 'Tap to choose one',
      isCategory: true,
    },
    {
      icon: 'wallet',
      label: 'Account',
      value: accountName ?? proposal.accountName ?? 'Select account',
      hint: !proposal.accountId ? 'Tap to choose one' : undefined,
      isAccount: true,
    },
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
      {/* Detected Amount and Merchant */}
      <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
        <Text variant="caption" tone="tertiary" style={{ letterSpacing: 0.5 }}>
          DETECTED
        </Text>
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

      {proposal.possibleDuplicate ? (
        <View
          accessibilityLiveRegion="assertive"
          style={{
            gap: theme.spacing.xs,
            padding: theme.spacing.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.warningSurface,
            borderWidth: 1,
            borderColor: theme.colors.warning,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="alertTriangle" size={16} color={theme.colors.warning} />
            <Text variant="labelSm" color={theme.colors.warning} style={{ fontWeight: '600' }}>
              Possible duplicate
            </Text>
          </View>
          <Text variant="caption" tone="secondary">
            A similar transaction of {formatINR(proposal.possibleDuplicate.amount)}
            {proposal.possibleDuplicate.merchant ? ` at ${proposal.possibleDuplicate.merchant}` : ''} was recorded{' '}
            {proposal.possibleDuplicate.minutesAgo <= 1
              ? 'just now'
              : `${proposal.possibleDuplicate.minutesAgo} minutes ago`}
            .
          </Text>
        </View>
      ) : null}

      {proposal.warnings.filter((w) => !w.startsWith('Similar transaction added')).length > 0 ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            gap: theme.spacing.xs,
            padding: theme.spacing.md,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.warningSurface,
          }}
        >
          {proposal.warnings
            .filter((w) => !w.startsWith('Similar transaction added'))
            .map((warning) => (
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

                {row.isAccount && onPickAccount ? (
                  <Pressable
                    onPress={onPickAccount}
                    accessibilityRole="button"
                    accessibilityLabel={
                      proposal.accountId
                        ? `Account ${row.value}. Tap to change.`
                        : 'Select account'
                    }
                    style={{
                      flex: 1,
                      minWidth: 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 6,
                    }}
                  >
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      {proposal.accountId ? (
                        <Text variant="labelSm" numberOfLines={1}>
                          {row.value}
                        </Text>
                      ) : (
                        <View
                          style={{
                            paddingHorizontal: theme.spacing.sm,
                            paddingVertical: 3,
                            borderRadius: theme.radius.sm,
                            backgroundColor: theme.colors.warningSurface,
                            borderWidth: theme.layout.hairline,
                            borderColor: theme.colors.warning,
                          }}
                        >
                          <Text variant="labelSm" color={theme.colors.warning}>
                            Select account
                          </Text>
                        </View>
                      )}
                      {row.hint ? (
                        <Text variant="caption" tone="tertiary" numberOfLines={1}>
                          {row.hint}
                        </Text>
                      ) : null}
                    </View>
                    <Icon name="chevronRight" size={14} color={theme.colors.textTertiary} />
                  </Pressable>
                ) : row.isCategory && onPickCategory ? (
                  <Pressable
                    onPress={onPickCategory}
                    accessibilityRole="button"
                    accessibilityLabel={
                      proposal.categoryName
                        ? `Category ${proposal.categoryName}. Tap to change.`
                        : 'Select category'
                    }
                    style={{
                      flex: 1,
                      minWidth: 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 6,
                    }}
                  >
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      {proposal.categoryName ? (
                        <Text variant="labelSm" numberOfLines={1}>
                          {proposal.categoryName}
                        </Text>
                      ) : (
                        <View
                          style={{
                            paddingHorizontal: theme.spacing.sm,
                            paddingVertical: 3,
                            borderRadius: theme.radius.sm,
                            backgroundColor: theme.colors.brandSurface,
                            borderWidth: theme.layout.hairline,
                            borderColor: theme.colors.brand,
                          }}
                        >
                          <Text variant="labelSm" tone="brand">
                            Select category
                          </Text>
                        </View>
                      )}
                      {row.hint ? (
                        <Text variant="caption" tone="tertiary" numberOfLines={1}>
                          {row.hint}
                        </Text>
                      ) : null}
                    </View>
                    <Icon name="chevronRight" size={14} color={theme.colors.textTertiary} />
                  </Pressable>
                ) : (
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
                )}
              </View>
            </Fragment>
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Button
          label="Edit details"
          onPress={onEdit}
          variant="secondary"
          size="lg"
          leftIcon="pencil"
          style={{ flex: 1 }}
        />
        <Button
          label={
            proposal.possibleDuplicate
              ? 'Add anyway'
              : proposal.obligation
                ? proposal.obligation.direction === 'owed_to_me'
                  ? 'Record loan'
                  : 'Record borrowed'
                : proposal.type === 'income'
                  ? 'Add income'
                  : 'Add expense'
          }
          onPress={onSave}
          variant={proposal.type === 'income' ? 'primary' : 'brand'}
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
            : !proposal.accountId
              ? 'Choose an account before saving.'
              : 'Choose a category before saving.'}
        </Text>
      ) : null}
    </Animated.View>
  );
}
