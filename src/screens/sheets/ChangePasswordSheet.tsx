import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { errorMessage, isApiError, useChangePassword } from '@/api';
import { BottomSheet, Button, Icon, Input, Text } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme';
import { errorFeedback, successFeedback } from '@/utils/haptics';

export type ChangePasswordSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Change password.
 *
 * On success the server has already revoked every session, including this one, so
 * the app signs itself out and returns to the sign-in screen with an explanation.
 * Pretending the current session survived would leave the user holding a token
 * that fails on the very next request, which looks like a bug rather than the
 * security feature it is.
 */
export function ChangePasswordSheet({ visible, onClose }: ChangePasswordSheetProps) {
  const theme = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const change = useChangePassword();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) return;
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(undefined);
    setFieldErrors({});
  }, [visible]);

  async function handleSave() {
    setError(undefined);
    setFieldErrors({});

    if (current.length === 0) {
      setFieldErrors({ currentPassword: 'Enter your current password' });
      return;
    }
    if (next.length < 8) {
      setFieldErrors({ newPassword: 'Use at least 8 characters' });
      return;
    }
    if (next !== confirm) {
      setFieldErrors({ confirm: 'These do not match' });
      return;
    }

    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      successFeedback();
      onClose();
      await signOut('Password changed. Sign in with your new one.');
    } catch (cause) {
      errorFeedback();
      if (isApiError(cause) && cause.issues.length > 0) {
        const mapped: Record<string, string> = {};
        for (const issue of cause.issues) mapped[issue.field] = issue.message;
        setFieldErrors(mapped);
        return;
      }
      setError(errorMessage(cause));
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Change password"
      subtitle="Every signed-in device will be signed out"
      footer={
        <Button
          label="Change password"
          onPress={() => void handleSave()}
          variant="brand"
          size="lg"
          fullWidth
          loading={change.isPending}
        />
      }
    >
      <View style={{ gap: theme.spacing.lg }}>
        <Input
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          error={fieldErrors.currentPassword}
          secure
          autoCapitalize="none"
          textContentType="password"
          returnKeyType="next"
        />
        <Input
          label="New password"
          value={next}
          onChangeText={setNext}
          error={fieldErrors.newPassword}
          helperText={fieldErrors.newPassword ? undefined : 'Eight characters or more.'}
          secure
          autoCapitalize="none"
          textContentType="newPassword"
          returnKeyType="next"
        />
        <Input
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          error={fieldErrors.confirm}
          secure
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => void handleSave()}
        />
      </View>

      {error ? (
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
            {error}
          </Text>
        </View>
      ) : null}

      <View style={{ height: theme.spacing.md }} />
    </BottomSheet>
  );
}
