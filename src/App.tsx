// Imported per weight, not from the package root. The root barrel `require`s all
// 18 faces (every weight plus italics), and Metro bundles every asset it sees —
// about 6MB of fonts the app never renders.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createQueryClient, useTimezoneSync } from '@/api';
import { AmbientBackground, Toast } from '@/components/ui';
import { RootNavigator } from '@/navigation/RootNavigator';
import { toNavigationTheme } from '@/navigation/navigationTheme';
import { AddTransactionSheet } from '@/screens/sheets/AddTransactionSheet';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { ThemeProvider, useTheme } from '@/theme';

// Hold the native splash until Inter is ready, so text never renders in the
// system font and then reflow into Inter a frame later.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

// Created once outside the component: a client rebuilt on a re-render would throw
// away every cached query and refetch the whole app.
const queryClient = createQueryClient();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const restore = useAuthStore((state) => state.restore);
  const authStatus = useAuthStore((state) => state.status);

  // `restore` is a stable zustand action, so this runs exactly once. It moves the
  // store out of `restoring` when it finishes, which is what releases the splash.
  useEffect(() => {
    void restore();
  }, [restore]);

  // A font that fails to download should degrade to the system face, not block the
  // app behind a splash screen forever. Reading the keychain is held for, though —
  // showing the sign-in screen to someone who is already signed in, then swapping
  // it out a frame later, is worse than a slightly longer splash.
  const ready = (fontsLoaded || fontError !== null) && authStatus !== 'restoring';

  const onLayout = useCallback(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onLayout}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AppShell />
          </ThemeProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/** Split out so it can read the theme that `ThemeProvider` supplies. */
function AppShell() {
  const theme = useTheme();
  const signedIn = useAuthStore((state) => state.status === 'signedIn');

  // The server does its own date arithmetic in the account's stored zone, so the
  // two have to agree about which day it is. See the hook.
  useTimezoneSync();

  useEffect(() => {
    // Paints the window behind the React tree, which is what shows during rotation
    // and overscroll. Without it Android flashes white when switching to dark.
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  return (
    <AmbientBackground>
      {/* Every surface above this point is glass, and glass needs something to
          refract — see `AmbientBackground`. Which is also why the navigator and
          every screen under it are transparent rather than painted. */}
      <NavigationContainer theme={toNavigationTheme(theme)}>
        <StatusBar style="light" />
        <RootNavigator />
        {/* Mounted at the root so it can cover the tab bar it is launched from,
            and only while there is a session for it to write to. */}
        {signedIn ? <AddTransactionSheet /> : null}
        <ToastHost />
      </NavigationContainer>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

/**
 * Renders whatever the UI store last had to say.
 *
 * Keyed on the toast's id so a second message restarts the animation rather than
 * inheriting the first one's timer, and mounted above the navigator so it survives
 * the screen that raised it unmounting.
 */
function ToastHost() {
  const toast = useUiStore((state) => state.toast);
  const dismiss = useUiStore((state) => state.dismissToast);

  if (!toast) return null;

  return (
    <Toast
      key={toast.id}
      message={toast.message}
      detail={toast.detail}
      tone={toast.tone}
      onDismiss={dismiss}
    />
  );
}
