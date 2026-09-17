import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { errorMessage, useDeleteProfile } from '@/api';
import { BottomSheet, Button, Icon, Input, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { errorFeedback } from '@/utils/haptics';

export type CloseAccountSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** What has to be typed. Checked here and again on the server. */
const CONFIRM_WORD = 'DELETE';

/**
 * Closing an account for good.
 *
 * Three obstacles, deliberately: the password, a typed word, and a plain list of
 * what is about to go. None of them is friction for its own sake — this is the
 * one action in the app that cannot be undone, and the person doing it is often
 * angry, or in a hurry, or both.
 *
 * The list is specific rather than "all your data" because vagueness at this
 * moment is how people delete something they meant to keep. If they have a year
 * of receipts, they should read the word "receipts" before it happens.
 */
export function CloseAccountSheet({ visible, onClose }: CloseAccountSheetProps) {
  const theme = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();
  const confirmRef = useRef<TextInput>(null);

  const deleteProfile = useDeleteProfile();

  const ready = password.length > 0 && confirm.trim().toUpperCase() === CONFIRM_WORD;

  async function submit() {
    if (!ready || deleteProfile.isPending) return;

    try {
      await deleteProfile.mutateAsync(password);
      // The session is gone with the account, so the navigator unmounts this
      // whole tree on its own. There is nothing to close.
    } catch (cause) {
      errorFeedback();
      setError(errorMessage(cause));
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Close your account?"
      subtitle="This cannot be undone."
      dismissOnBackdropPress={false}
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          {error ? (
            <View
              accessibilityLiveRegion="assertive"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radius.sm,
                backgroundColor: theme.colors.negativeSurface,
              }}
            >
              <Icon name="alertCircle" size={16} color={theme.colors.negative} />
              <Text variant="caption" tone="negative" style={{ flex: 1 }}>
                {error}
              </Text>
            </View>
          ) : null}

          <Button
            label="Delete everything"
            variant="destructive"
            size="lg"
            fullWidth
            disabled={!ready}
            loading={deleteProfile.isPending}
            onPress={() => void submit()}
            accessibilityHint={
              ready
                ? 'Deletes your account and everything in it'
                : `Enter your password and type ${CONFIRM_WORD} above to enable this`
            }
          />
          <Button label="Keep my account" variant="ghost" size="md" fullWidth onPress={onClose} />
        </View>
      }
    >
      <View style={{ gap: theme.spacing.lg }}>
        <View
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.negativeSurface,
          }}
        >
          <Text variant="labelSm" tone="negative">
            This deletes, permanently:
          </Text>
          {[
            'Every transaction and transfer',
            'Your accounts and their balances',
            'Budgets and recurring rules',
            'Receipt photographs',
            'Your categories and merchant history',
            'Assistant conversations',
          ].map((line) => (
            <View
              key={line}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
            >
              {/* A dot, not a cross. Six red ×s repeat the sheet's own close
                  button down the list and read as things to dismiss, which is
                  the opposite of what they are. */}
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  marginHorizontal: 4,
                  backgroundColor: theme.colors.negative,
                }}
              />
              <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
                {line}
              </Text>
            </View>
          ))}
        </View>

        <Text variant="bodySm" tone="secondary">
          Want a copy first? Close this and use{' '}
          <Text variant="labelSm">Export transactions</Text> — it takes a few seconds and the file
          is yours to keep.
        </Text>

        <Input
          label="Your password"
          placeholder="Enter your password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError(undefined);
          }}
          secure
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          submitBehavior="submit"
        />

        <Input
          ref={confirmRef}
          label={`Type ${CONFIRM_WORD} to confirm`}
          // Not the word itself: a field pre-printed with "DELETE" looks filled
          // in, and someone who reads it that way is left staring at a disabled
          // button with no idea what it is waiting for.
          placeholder={`${CONFIRM_WORD.toLowerCase()}…`}
          value={confirm}
          onChangeText={(value) => {
            setConfirm(value);
            setError(undefined);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          // A little slack over the word itself: the match is trimmed, and a
          // hard stop at exactly six characters turns a stray leading space
          // into a field that silently refuses the last letter.
          maxLength={CONFIRM_WORD.length + 2}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
      </View>
    </BottomSheet>
  );
}
