// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*'],
  },
  {
    rules: {
      /**
       * Disabled project-wide because it cannot see through Reanimated.
       *
       * `sharedValue.value = withTiming(...)` is Reanimated's documented API, but
       * the React Compiler's immutability rule reads it as mutating a value passed
       * to a hook and errors on every animation in the design system.
       * See https://github.com/facebook/react/issues/29640.
       */
      'react-hooks/immutability': 'off',
    },
  },
]);
