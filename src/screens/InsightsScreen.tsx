import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { EmptyState, PageHeader, Screen } from '@/components/ui';

/**
 * Insights tab. Reserved for the AI-generated summaries of spending behaviour.
 */
export function InsightsScreen() {
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <Screen scroll={false} bottomInset={tabBarHeight} testID="insights-screen">
      <PageHeader title="Insights" subtitle="Patterns in how you spend" />
      <EmptyState
        fill
        icon="sparkles"
        title="Insights are on the way"
        description="Soon this is where you'll see spending trends, unusual charges and where there is room to cut back."
      />
    </Screen>
  );
}
