// Imported per weight, not from the package root. The root barrel `require`s all
// 18 faces (every weight plus italics), and Metro bundles every asset it sees —
// about 6MB of fonts the app never renders.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from '@/navigation/RootNavigator';
import { toNavigationTheme } from '@/navigation/navigationTheme';
import { AddTransactionSheet } from '@/screens/sheets/AddTransactionSheet';
import { ThemeProvider, useTheme } from '@/theme';

// Hold the native splash until Inter is ready, so text never renders in the
// system font and then reflow into Inter a frame later.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // A font that fails to download should degrade to the system face, not block the
  // app behind a splash screen forever.
  const ready = fontsLoaded || fontError !== null;

  const onLayout = useCallback(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onLayout}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Split out so it can read the theme that `ThemeProvider` supplies. */
function AppShell() {
  const theme = useTheme();

  useEffect(() => {
    // Paints the window behind the React tree, which is what shows during rotation
    // and overscroll. Without it Android flashes white when switching to dark.
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <NavigationContainer theme={toNavigationTheme(theme)}>
        <StatusBar style="light" />
        <RootNavigator />
        {/* Mounted at the root so it can cover the tab bar it is launched from. */}
        <AddTransactionSheet />
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
