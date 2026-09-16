/** The sliver of `react-native` that the API layer touches. */
type OS = 'ios' | 'android' | 'web';

export const Platform: {
  OS: OS;
  select: <T>(specifics: { ios?: T; android?: T; web?: T; default?: T }) => T | undefined;
} = {
  OS: 'ios',
  select: (specifics) => specifics.ios ?? specifics.default,
};
