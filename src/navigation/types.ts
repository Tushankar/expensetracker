import type { NavigatorScreenParams } from '@react-navigation/native';

/** Tabs live inside the root stack so modal-style screens can cover them. */
export type MainTabParamList = {
  Home: undefined;
  Transactions: undefined;
  Budgets: undefined;
  Insights: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  Settings: undefined;
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
