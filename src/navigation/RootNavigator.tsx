import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AccountFormScreen } from '@/screens/AccountFormScreen';
import { AccountsScreen } from '@/screens/AccountsScreen';
import { AuthScreen } from '@/screens/AuthScreen';
import { DesignSystemScreen } from '@/screens/DesignSystemScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TransactionDetailScreen } from '@/screens/TransactionDetailScreen';
import { TransactionsScreen } from '@/screens/TransactionsScreen';
import { useAuthStore } from '@/store/authStore';
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
      tabBar={(props) => <TabBar {...props} onAddPress={() => openAddSheet('expense')} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{ title: 'Activity' }}
      />
      <Tab.Screen name="Accounts" component={AccountsScreen} options={{ title: 'Accounts' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}

/**
 * The whole app is either signed in or signed out, and the navigator is the single
 * place that decides which.
 *
 * Two separate trees rather than one with guards: a signed-out user cannot
 * navigate to a screen that does not exist, and signing out unmounts every screen
 * holding someone's balances rather than leaving them behind a redirect.
 */
export function RootNavigator() {
  const theme = useTheme();
  const status = useAuthStore((state) => state.status);

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
      {status === 'signedIn' ? (
        <Stack.Group>
          <Stack.Screen name="Tabs" component={MainTabs} />
          <Stack.Screen
            name="TransactionDetail"
            component={TransactionDetailScreen}
            options={{ headerShown: true, title: 'Transaction' }}
          />
          <Stack.Screen
            name="AccountForm"
            component={AccountFormScreen}
            options={{ headerShown: true, title: 'Account' }}
          />
          <Stack.Screen
            name="DesignSystem"
            component={DesignSystemScreen}
            options={{ headerShown: true, title: 'Design system' }}
          />
        </Stack.Group>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}
