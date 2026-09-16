import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage, isApiError, useUpdateProfile } from '@/api';
import { BottomSheet, Button, Icon, Input, Text } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme';
import { errorFeedback, successFeedback } from '@/utils/haptics';

export type EditProfileSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Name and currency. The email is the account's identity and is not editable here.
 *
 * The caller passes a `key` that changes each time the sheet is opened, so the
 * fields below start from the current profile without an effect that copies props
 * into state every time either one changes.
 */
export function EditProfileSheet({ visible, onClose }: EditProfileSheetProps) {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const update = useUpdateProfile();

  const [name, setName] = useState(user?.name ?? '');
  const [currency, setCurrency] = useState(user?.currency ?? 'INR');
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSave() {
    setError(undefined);
    setFieldErrors({});

    if (name.trim().length === 0) {
      setFieldErrors({ name: 'Tell us your name' });
      errorFeedback();
      return;
    }

    try {
      await update.mutateAsync({ name: name.trim(), currency: currency.trim().toUpperCase() });
      successFeedback();
      onClose();
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
      title="Edit profile"
      footer={
        <Button
          label="Save"
          onPress={() => void handleSave()}
          variant="brand"
          size="lg"
          fullWidth
          loading={update.isPending}
        />
      }
    >
      <View style={{ gap: theme.spacing.lg }}>
        <Input
          label="Name"
          value={name}
          onChangeText={setName}
          error={fieldErrors.name}
          autoCapitalize="words"
          maxLength={80}
          returnKeyType="next"
        />

        <Input
          label="Currency"
          value={currency}
          onChangeText={(next) => setCurrency(next.toUpperCase().slice(0, 3))}
          error={fieldErrors.currency}
          helperText="Three-letter code. Amounts are formatted for India regardless."
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={3}
          returnKeyType="done"
        />

        <View>
          <Text variant="caption" tone="tertiary">
            Email
          </Text>
          <Text variant="bodySm" tone="secondary" style={{ marginTop: 4 }}>
            {user?.email ?? ''}
          </Text>
        </View>
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
