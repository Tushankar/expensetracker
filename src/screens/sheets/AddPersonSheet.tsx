import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage, isApiError, useCreatePerson, type Person } from '@/api';
import { BottomSheet, Button, Icon, Input, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { errorFeedback, successFeedback } from '@/utils/haptics';

export type AddPersonSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Called with the new person, so the caller can go straight to their page. */
  onCreated?: (person: Person) => void;
};

/**
 * Adds someone to track money with.
 *
 * Only the name is required. A phone number is useful for telling two Rahuls
 * apart and for nothing else here, so asking for it as anything but optional
 * would be asking for data the app does not need.
 *
 * The caller passes a `key` that changes each time the sheet is opened, so the
 * fields start empty without an effect that clears them.
 */
export function AddPersonSheet({ visible, onClose, onCreated }: AddPersonSheetProps) {
  const theme = useTheme();
  const create = useCreatePerson();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSave() {
    setError(undefined);
    setFieldErrors({});

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setFieldErrors({ name: 'Who is this?' });
      errorFeedback();
      return;
    }

    try {
      const person = await create.mutateAsync({
        name: trimmed,
        // Empty strings would be stored as empty strings; the field is absent
        // when it is blank so the record simply does not carry it.
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
      });
      successFeedback();
      onCreated?.(person);
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
      title="Add a person"
      subtitle="Then record what you lent, borrowed or covered"
      footer={
        <Button
          label="Add person"
          onPress={() => void handleSave()}
          variant="brand"
          size="lg"
          fullWidth
          loading={create.isPending}
        />
      }
    >
      <View style={{ gap: theme.spacing.lg }}>
        <Input
          label="Name"
          value={name}
          onChangeText={setName}
          error={fieldErrors.name}
          placeholder="Rahul Sharma"
          autoCapitalize="words"
          autoFocus
          maxLength={80}
          returnKeyType="next"
        />

        <Input
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          error={fieldErrors.phone}
          placeholder="Optional"
          leftIcon="smartphone"
          keyboardType="phone-pad"
          autoCorrect={false}
          maxLength={20}
          returnKeyType="next"
        />

        <Input
          label="Note"
          value={note}
          onChangeText={setNote}
          error={fieldErrors.note}
          placeholder="Optional — flatmate, cousin, colleague"
          autoCapitalize="sentences"
          maxLength={140}
          returnKeyType="done"
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
