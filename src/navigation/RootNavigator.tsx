import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { BudgetsScreen } from '@/screens/BudgetsScreen';
import { DesignSystemScreen } from '@/screens/DesignSystemScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { InsightsScreen } from '@/screens/InsightsScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TransactionsScreen } from '@/screens/TransactionsScreen';
import { useUiStore } from '@/store/uiStore';
import { useTheme } from '@/theme';

import { TabBar } from './TabBar';
import type { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  const openAddSheet = useUiStore((state) => state.openAddSheet);

  return (
    <Tab.Navigator
      // Screens own their own headers so each can have its own layout.
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} onAddPress={openAddSheet} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{ title: 'Activity' }}
      />
      <Tab.Screen name="Budgets" component={BudgetsScreen} options={{ title: 'Budgets' }} />
      <Tab.Screen name="Insights" component={InsightsScreen} options={{ title: 'Insights' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        headerTintColor: theme.colors.textPrimary,
        // The native header takes a flat style object, so the scale is read from
        // the h3 token rather than re-declared.
        headerTitleStyle: {
          fontFamily: theme.fontFamily.semibold,
          fontSize: theme.type.h3.fontSize,
          color: theme.colors.textPrimary,
        },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: true, title: 'Settings' }}
      />
      <Stack.Screen
        name="DesignSystem"
        component={DesignSystemScreen}
        options={{ headerShown: true, title: 'Design system' }}
      />
    </Stack.Navigator>
  );
}
