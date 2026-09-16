import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Fragment, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { ACCOUNT_TYPE_LABEL, useAccounts, type Account } from '@/api';
import { QueryState } from '@/components/data/QueryState';
import { toIconName } from '@/components/icons/registry';
import {
  Badge,
  Button,
  Card,
  Divider,
  IconButton,
  IconTile,
  ListRow,
  PageHeader,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
} from '@/components/ui';
import { useUiStore } from '@/store/uiStore';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';

/**
 * Accounts: what you have, and where.
 *
 * The headline is the sum of every active account, which is the same number the
 * Home hero shows — deliberately, because two screens disagreeing about how much
 * money you have is the fastest way to lose someone's trust in a ledger.
 */
export function AccountsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const openAddSheet = useUiStore((state) => state.openAddSheet);

  const [showArchived, setShowArchived] = useState(false);
  const query = useAccounts(showArchived);

  const accounts = query.data ?? [];
  const active = accounts.filter((account) => account.isActive);
  const archived = accounts.filter((account) => !account.isActive);

  const total = active.reduce((sum, account) => sum + account.balance, 0);
  const assets = active
    .filter((account) => account.balance > 0)
    .reduce((sum, account) => sum + account.balance, 0);
  const owed = active
    .filter((account) => account.balance < 0)
    .reduce((sum, account) => sum + account.balance, 0);

  return (
    <Screen
      bottomInset={tabBarHeight + theme.spacing.lg}
      testID="accounts-screen"
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={theme.colors.textTertiary}
          colors={[theme.colors.brand]}
          progressBackgroundColor={theme.colors.surface}
        />
      }
    >
      <PageHeader
        title="Accounts"
        subtitle="Every place your money sits"
        action={
          <IconButton
            name="plus"
            accessibilityLabel="Add an account"
            variant="surface"
            onPress={() => navigation.navigate('AccountForm', {})}
          />
        }
      />

      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingFallback={
          <View style={{ gap: theme.spacing.md }}>
            <Skeleton height={120} radius={theme.radius.xl} />
            <Skeleton height={220} radius={theme.radius.xl} />
          </View>
        }
      >
        <Card radius="xl" padding="xl">
          <Text variant="caption" tone="tertiary">
            Net worth
          </Text>
          <Text
            variant="amountLg"
            tone={total < 0 ? 'negative' : 'primary'}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={{ marginTop: 4 }}
          >
            {formatINR(total)}
          </Text>

          <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.lg }}>
            <Figure label="You have" value={formatINR(assets)} tone="positive" />
            {/* Shown as a positive magnitude under a label that says what it is —
                "−₹18,460 owed" reads as a double negative. */}
            <Figure label="You owe" value={formatINR(Math.abs(owed))} tone="negative" />
          </View>
        </Card>

        <View style={{ marginTop: theme.spacing.xxl }}>
          <SectionHeader title="Your accounts" />

          {active.length === 0 ? (
            <Card radius="xl" padding="xl">
              <Text variant="bodySm" tone="secondary" align="center">
                You have no active accounts. Add one to start recording transactions.
              </Text>
              <Button
                label="Add an account"
                variant="brand"
                size="md"
                onPress={() => navigation.navigate('AccountForm', {})}
                style={{ alignSelf: 'center', marginTop: theme.spacing.lg }}
              />
            </Card>
          ) : (
            <Card padding={0} radius="xl">
              <View style={{ paddingHorizontal: theme.spacing.lg }}>
                {active.map((account, index) => (
                  <Fragment key={account.id}>
                    {index > 0 ? <Divider inset={44 + theme.spacing.md} /> : null}
                    <AccountRow
                      account={account}
                      onPress={() => navigation.navigate('AccountForm', { id: account.id })}
                    />
                  </Fragment>
                ))}
              </View>
            </Card>
          )}
        </View>

        <Button
          label={showArchived ? 'Hide archived' : 'Show archived'}
          variant="ghost"
          size="sm"
          onPress={() => setShowArchived((current) => !current)}
          style={{ alignSelf: 'center', marginTop: theme.spacing.xl }}
        />

        {showArchived && archived.length > 0 ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <Card padding={0} radius="xl">
              <View style={{ paddingHorizontal: theme.spacing.lg }}>
                {archived.map((account, index) => (
                  <Fragment key={account.id}>
                    {index > 0 ? <Divider inset={44 + theme.spacing.md} /> : null}
                    <AccountRow
                      account={account}
                      onPress={() => navigation.navigate('AccountForm', { id: account.id })}
                    />
                  </Fragment>
                ))}
              </View>
            </Card>
            <Text
              variant="caption"
              tone="tertiary"
              align="center"
              style={{ marginTop: theme.spacing.md }}
            >
              Archived accounts stay out of the pickers, but their history is intact.
            </Text>
          </View>
        ) : null}

        <Button
          label="Move money between accounts"
          leftIcon="repeat"
          variant="secondary"
          size="md"
          fullWidth
          onPress={() => openAddSheet('transfer')}
          style={{ marginTop: theme.spacing.xxl }}
        />
      </QueryState>
    </Screen>
  );
}

function AccountRow({ account, onPress }: { account: Account; onPress: () => void }) {
  const theme = useTheme();

  const subtitle = [
    ACCOUNT_TYPE_LABEL[account.type],
    account.institution,
    account.last4 ? `·· ${account.last4}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      title={account.name}
      subtitle={subtitle}
      leading={<IconTile name={toIconName(account.icon)} color={account.color} />}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text variant="amountSm" tone={account.balance < 0 ? 'negative' : 'primary'} numberOfLines={1}>
            {formatINR(account.balance)}
          </Text>
          {!account.isActive ? <Badge label="Archived" tone="neutral" /> : null}
        </View>
      }
      showChevron
      onPress={onPress}
      accessibilityHint="Opens this account"
      style={{ paddingVertical: theme.spacing.sm }}
    />
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative';
}) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{
        flex: 1,
        minWidth: 0,
        gap: 3,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
      }}
    >
      <Text variant="caption" tone="tertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="labelSm" tone={tone} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}
