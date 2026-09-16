import type { NavigatorScreenParams } from '@react-navigation/native';

/** Tabs live inside the root stack so modal-style screens can cover them. */
export type MainTabParamList = {
  Home: undefined;
  Transactions: undefined;
  Budgets: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  /** The signed-out half of the app. Mounted instead of `Tabs`, never beside it. */
  Auth: undefined;
  Tabs: NavigatorScreenParams<MainTabParamList>;
  TransactionDetail: { id: string };
  /** No id means "create". */
  AccountForm: { id?: string } | undefined;
  Accounts: undefined;
  Recurring: undefined;
  /** No id means "create". */
  RecurringForm: { id?: string } | undefined;
  Notifications: undefined;
  DesignSystem: undefined;
};

/**
 * Makes `useNavigation()` type-safe everywhere without passing generics at each
 * call site.
 */
declare global {
  namespace ReactNavigation {
    // Module augmentation requires an empty extending interface; there is no other
    // way to register the param list with React Navigation.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
