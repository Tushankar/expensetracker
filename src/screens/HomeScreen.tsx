import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Fragment } from 'react';
import { useWindowDimensions, View } from 'react-native';

import {
  BalanceCard,
  GreetingHeader,
  HeaderGlow,
  QuickActions,
  SavingsCard,
  SpendingOverview,
  TransactionItem,
} from '@/components/home';
import { Card, Divider, Screen, SectionHeader } from '@/components/ui';
import {
  balanceTrend,
  monthSummary,
  recentTransactions,
  spendingBreakdown,
  user,
  weeklySpend,
} from '@/data/mock';
import { useUiStore } from '@/store/uiStore';
import { useTheme, type ActionHue } from '@/theme';

/** Enough rows to show the shape of the month without turning Home into a ledger. */
const RECENT_COUNT = 4;

/** Lines a divider up with the row text rather than its icon tile. */
const DIVIDER_INSET = 44 + 12;

/**
 * Home.
 *
 * Reading order is deliberate: who you are, what you have, what you kept, where it
 * went, what you might do next, then what just happened. Each block answers one
 * question, so nothing needs a second glance.
 *
 * All data is static — see `src/data/mock.ts`.
 */
export function HomeScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();

  const openAddSheet = useUiStore((state) => state.openAddSheet);

  // The hero's trend line bleeds to the card edges, so it needs the card's width
  // up front rather than waiting for a layout pass.
  const contentWidth =
    Math.min(width, theme.layout.maxContentWidth) - theme.layout.screenGutter * 2;

  const recent = recentTransactions.slice(0, RECENT_COUNT);

  function handleQuickAction(key: ActionHue) {
    if (key === 'expense' || key === 'income') {
      openAddSheet();
      return;
    }
    navigation.navigate('Tabs', { screen: key === 'budget' ? 'Budgets' : 'Insights' });
  }

  return (
    <Screen testID="home-screen" bottomInset={tabBarHeight + theme.spacing.lg}>
      <HeaderGlow width={contentWidth} />

      <View style={{ paddingTop: theme.spacing.sm }}>
        <GreetingHeader
          firstName={user.firstName}
          initials={user.initials}
          hasUnread
          onProfilePress={() => navigation.navigate('Settings')}
          onNotificationsPress={() => navigation.navigate('Settings')}
          onSearchPress={() => navigation.navigate('Tabs', { screen: 'Transactions' })}
        />
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        <BalanceCard summary={monthSummary} trend={balanceTrend} width={contentWidth} />
      </View>

      <View style={{ marginTop: theme.spacing.md }}>
        <SavingsCard
          summary={monthSummary}
          onPress={() => navigation.navigate('Tabs', { screen: 'Insights' })}
        />
      </View>

      <View style={{ marginTop: theme.spacing.xxl }}>
        <SpendingOverview
          summary={monthSummary}
          breakdown={spendingBreakdown}
          weekly={weeklySpend}
          onSeeAll={() => navigation.navigate('Tabs', { screen: 'Transactions' })}
        />
      </View>

      <View style={{ marginTop: theme.spacing.lg }}>
        <QuickActions onAction={handleQuickAction} />
      </View>

      <View style={{ marginTop: theme.spacing.xxl }}>
        <SectionHeader
          title="Recent activity"
          actionLabel="See all"
          onActionPress={() => navigation.navigate('Tabs', { screen: 'Transactions' })}
        />

        <Card padding={0} radius="lg">
          <View
            style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.xs }}
          >
            {recent.map((transaction, index) => (
              <Fragment key={transaction.id}>
                {index > 0 ? <Divider inset={DIVIDER_INSET} /> : null}
                <TransactionItem transaction={transaction} />
              </Fragment>
            ))}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
