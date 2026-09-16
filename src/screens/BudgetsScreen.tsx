import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { EmptyState, PageHeader, Screen } from '@/components/ui';

/**
 * Budgets tab. Monthly caps per category, tracked against actual spend.
 */
export function BudgetsScreen() {
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <Screen scroll={false} bottomInset={tabBarHeight} testID="budgets-screen">
      <PageHeader title="Budgets" subtitle="Monthly limits by category" />
      <EmptyState
        fill
        icon="pieChart"
        title="No budgets set"
        description="Set a monthly limit for groceries, food or fuel and track how much of it is left."
      />
    </Screen>
  );
}
