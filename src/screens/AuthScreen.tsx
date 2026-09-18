import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  type TextInput,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage, isApiError, useLogin, useRegister } from '@/api';
import { HeaderGlow } from '@/components/home';
import {
  AmbientField,
  Button,
  Icon,
  Input,
  SegmentedControl,
  Text,
  type SegmentOption,
} from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme';
import { errorFeedback, successFeedback } from '@/utils/haptics';

type Mode = 'signIn' | 'signUp';

const MODES: readonly SegmentOption<Mode>[] = [
  { value: 'signIn', label: 'Sign in' },
  { value: 'signUp', label: 'Create account' },
];

/**
 * The sign-in / register screen.
 *
 * One screen with a segmented control rather than two routes: the fields overlap
 * almost entirely, and someone who taps "sign in" and discovers they never
 * registered should not have to go back and start over.
 *
 * Field-level errors come from the server's `issues` array, so "Use at least 8
 * characters" appears under the password rather than in a banner at the top that
 * makes you hunt for which input it meant.
 */
export function AuthScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const expiredReason = useAuthStore((state) => state.expiredReason);
  const clearExpiredReason = useAuthStore((state) => state.clearExpiredReason);

  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const login = useLogin();
  const register = useRegister();
  const busy = login.isPending || register.isPending;

  // The banner explains why the app returned here. It is worth showing once, not
  // every time someone mistypes a password afterwards.
  useEffect(() => () => clearExpiredReason(), [clearExpiredReason]);

  function switchMode(next: Mode) {
    setMode(next);
    setFormError(undefined);
    setFieldErrors({});
  }

  async function handleSubmit() {
    setFormError(undefined);
    setFieldErrors({});
    clearExpiredReason();

    const trimmedEmail = email.trim().toLowerCase();

    if (mode === 'signUp' && name.trim().length === 0) {
      setFieldErrors({ name: 'Tell us your name' });
      return;
    }
    if (trimmedEmail.length === 0) {
      setFieldErrors({ email: 'Enter your email address' });
      return;
    }
    if (password.length === 0) {
      setFieldErrors({ password: 'Enter your password' });
      return;
    }

    try {
      if (mode === 'signIn') {
        await login.mutateAsync({ email: trimmedEmail, password });
      } else {
        await register.mutateAsync({ name: name.trim(), email: trimmedEmail, password });
      }
      successFeedback();
      // No navigation call: the root navigator swaps on auth status, so there is
      // exactly one place that decides which half of the app is mounted.
    } catch (error) {
      errorFeedback();

      if (isApiError(error) && error.issues.length > 0) {
        const mapped: Record<string, string> = {};
        for (const issue of error.issues) mapped[issue.field] = issue.message;
        setFieldErrors(mapped);
        // A message that only repeats what is already under the field is noise.
        if (Object.keys(mapped).length === 0) setFormError(error.message);
        return;
      }

      setFormError(errorMessage(error));
    }
  }

  return (
    <AmbientField>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + theme.spacing.xxl,
            paddingBottom: Math.max(insets.bottom, theme.spacing.xxl),
            paddingHorizontal: theme.layout.screenGutter,
            maxWidth: theme.layout.maxContentWidth,
            width: '100%',
            alignSelf: 'center',
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <HeaderGlow width={theme.layout.maxContentWidth} height={260} />

          <Animated.View entering={FadeIn.duration(theme.duration.slow)}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: theme.radius.lg,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brandSurface,
                borderWidth: theme.layout.hairline,
                borderColor: theme.colors.brand,
              }}
            >
              <Icon name="rupee" size={28} color={theme.colors.brandText} strokeWidth={2} />
            </View>

            <Text variant="displayLg" style={{ marginTop: theme.spacing.xxl }}>
              Paisa
            </Text>
            <Text variant="body" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
              {mode === 'signIn'
                ? 'Welcome back. Pick up where you left off.'
                : 'Track every rupee, from Swiggy to SIPs.'}
            </Text>
          </Animated.View>

          {expiredReason ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                marginTop: theme.spacing.xxl,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.warningSurface,
              }}
            >
              <Icon name="info" size={17} color={theme.colors.warning} />
              <Text variant="caption" color={theme.colors.warning} style={{ flex: 1 }}>
                {expiredReason}
              </Text>
            </View>
          ) : null}

          <SegmentedControl
            options={MODES}
            value={mode}
            onChange={switchMode}
            accessibilityLabel="Sign in or create an account"
            style={{ marginTop: theme.spacing.xxxl }}
          />

          <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.lg }}>
            {mode === 'signUp' ? (
              <Input
                label="Name"
                placeholder="Aarav Sharma"
                value={name}
                onChangeText={setName}
                error={fieldErrors.name}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!busy}
              />
            ) : null}

            <Input
              ref={emailRef}
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              error={fieldErrors.email}
              leftIcon="user"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!busy}
            />

            <Input
              ref={passwordRef}
              label="Password"
              placeholder={mode === 'signUp' ? 'At least 8 characters' : 'Your password'}
              value={password}
              onChangeText={setPassword}
              error={fieldErrors.password}
              helperText={
                mode === 'signUp' && !fieldErrors.password
                  ? 'Eight characters or more. Length beats symbols.'
                  : undefined
              }
              leftIcon="lock"
              secure
              autoCapitalize="none"
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
              returnKeyType="go"
              onSubmitEditing={() => void handleSubmit()}
              editable={!busy}
            />
          </View>

          {formError ? (
            <View
              accessibilityLiveRegion="assertive"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                marginTop: theme.spacing.lg,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.negativeSurface,
              }}
            >
              <Icon name="alertCircle" size={17} color={theme.colors.negative} />
              <Text variant="caption" tone="negative" style={{ flex: 1 }}>
                {formError}
              </Text>
            </View>
          ) : null}

          <Button
            label={mode === 'signIn' ? 'Sign in' : 'Create account'}
            onPress={() => void handleSubmit()}
            variant="brand"
            size="lg"
            fullWidth
            loading={busy}
            style={{ marginTop: theme.spacing.xxl }}
          />

          <View style={{ flex: 1, minHeight: theme.spacing.xxl }} />

          <Pressable
            onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'signIn' ? 'Create an account instead' : 'Sign in instead'
            }
            hitSlop={12}
            style={{ alignItems: 'center', minHeight: 44, justifyContent: 'center' }}
          >
            <Text variant="bodySm" tone="secondary">
              {mode === 'signIn' ? 'New here? ' : 'Already have an account? '}
              <Text variant="labelSm" tone="brand">
                {mode === 'signIn' ? 'Create an account' : 'Sign in'}
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </AmbientField>
  );
}
