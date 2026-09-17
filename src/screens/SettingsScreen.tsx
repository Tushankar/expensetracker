import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Fragment, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  API_BASE_URL,
  errorMessage,
  useExportTransactions,
  useLogout,
  useSession,
  useUnreadCount,
  useUpdateProfile,
} from '@/api';
import {
  Badge,
  Card,
  Divider,
  Icon,
  IconTile,
  ListRow,
  Screen,
  SectionHeader,
  Text,
  type IconName,
} from '@/components/ui';
import { ChangePasswordSheet } from '@/screens/sheets/ChangePasswordSheet';
import { CloseAccountSheet } from '@/screens/sheets/CloseAccountSheet';
import { EditProfileSheet } from '@/screens/sheets/EditProfileSheet';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useAccentStore } from '@/store/themeStore';
import { accentList, colorsByAccent, spacing, useTheme } from '@/theme';
import { shareTextFile } from '@/services/exportFile';
import { errorFeedback, successFeedback, tapFeedback } from '@/utils/haptics';

/**
 * Lines a divider up with the row title rather than its icon tile: the tile is
 * 44dp wide and `ListRow` puts `spacing.md` between it and the text.
 */
const DIVIDER_INSET = 44 + spacing.md;

/**
 * Settings: who you are, how the app looks, and the way out.
 *
 * The API address is on screen on purpose in a development build. "Cannot reach
 * the server" is the single most common failure when running this against a
 * laptop, and being able to read the URL the app is actually using turns a
 * twenty-minute debugging session into a glance.
 */
export function SettingsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const accent = useAccentStore((state) => state.accent);
  const setAccent = useAccentStore((state) => state.setAccent);

  const user = useAuthStore((state) => state.user);
  const sessionQuery = useSession();
  const logout = useLogout();
  const updateProfile = useUpdateProfile();
  const unreadQuery = useUnreadCount();

  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  /**
   * Which switch is mid-flight. The mutation is shared, so without this both
   * rows grey out whenever either one is saving.
   */
  const [pendingToggle, setPendingToggle] = useState<'budget' | 'recurring'>();

  const exportTransactions = useExportTransactions();
  const showToast = useUiStore((state) => state.showToast);

  /**
   * Exports everything, not a period.
   *
   * A backup with a date filter on it is not a backup. Five years back is the
   * server's own cap and comfortably older than this app, so in practice this is
   * "all of it" without needing an endpoint that says so.
   */
  async function exportEverything() {
    if (exportTransactions.isPending) return;
    tapFeedback();

    const now = new Date();
    const from = new Date(now.getFullYear() - 5, now.getMonth(), 1);

    try {
      const file = await exportTransactions.mutateAsync({
        from: from.toISOString(),
        to: now.toISOString(),
      });

      if (file.rowCount === 0) {
        showToast({
          message: 'Nothing to export yet',
          detail: 'Record a transaction and try again',
          tone: 'neutral',
        });
        return;
      }

      const result = await shareTextFile({
        filename: file.filename,
        content: file.content,
        mimeType: file.mimeType,
        dialogTitle: 'Export transactions',
      });

      successFeedback();
      showToast({
        message: result.status === 'shared' ? 'Export ready' : 'Export saved',
        detail: `${file.rowCount} ${file.rowCount === 1 ? 'transaction' : 'transactions'}`,
      });
    } catch (cause) {
      errorFeedback();
      showToast({ message: 'Could not export', detail: errorMessage(cause), tone: 'error' });
    }
  }
  /**
   * Bumped on open and used as each sheet's `key`, so its fields are seeded fresh
   * from the current profile. Because it only changes on the way in, the closing
   * animation still plays over the form the user was looking at.
   */
  const [sheetSession, setSheetSession] = useState(0);

  function openSheet(open: (value: true) => void) {
    setSheetSession((current) => current + 1);
    open(true);
  }

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const profile = sessionQuery.data ?? user;

  const initials = (profile?.name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You will need your password to sign back in.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout.mutate() },
    ]);
  }

  return (
    <>
      <Screen
        // Reached from the stack now rather than a tab, so the bottom room it
        // needs is the home indicator's, not a tab bar's. The native header
        // already handles the top inset and carries the title.
        topInset={false}
        bottomInset={insets.bottom + theme.spacing.xxl}
        contentContainerStyle={{ paddingTop: theme.spacing.lg }}
        testID="settings-screen"
      >
        <Card padding="xl" radius="xl">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brandSurface,
              }}
            >
              <Text variant="h3" color={theme.colors.brandText}>
                {initials || 'P'}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text variant="h3" numberOfLines={1}>
                {profile?.name ?? 'Your profile'}
              </Text>
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                {profile?.email ?? ''}
              </Text>
            </View>
            <Badge label={profile?.currency ?? 'INR'} tone="brand" />
          </View>

          {/* Shown because every budget month and recurring date is computed in
              it. If this is wrong, a late-night expense lands in the wrong month
              and nothing else on screen explains why. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              marginTop: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              borderTopWidth: theme.layout.hairline,
              borderTopColor: theme.colors.divider,
            }}
          >
            <Icon name="clock" size={14} color={theme.colors.textTertiary} />
            <Text variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
              {profile?.timezone ?? 'Asia/Kolkata'}
            </Text>
          </View>
        </Card>

        <View style={{ marginTop: theme.spacing.xxxl }}>
          <SectionHeader title="Account" />
          <Card padding={0} radius="xl">
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title="Edit profile"
                subtitle="Your name and currency"
                leading={<IconTile name="user" color={theme.colors.textTertiary} />}
                showChevron
                onPress={() => openSheet(setProfileOpen)}
              />
              <Divider inset={DIVIDER_INSET} />
              <ListRow
                title="Change password"
                subtitle="Signs out every other device"
                leading={<IconTile name="lock" color={theme.colors.textTertiary} />}
                showChevron
                onPress={() => openSheet(setPasswordOpen)}
              />
            </View>
          </Card>
        </View>

        <View style={{ marginTop: theme.spacing.xxxl }}>
          <SectionHeader title="Money" />
          <Card padding={0} radius="xl">
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title="Accounts"
                subtitle="Banks, cards, cash and wallets"
                leading={<IconTile name="wallet" color={theme.colors.textTertiary} />}
                showChevron
                onPress={() => navigation.navigate('Accounts')}
              />
              <Divider inset={DIVIDER_INSET} />
              <ListRow
                title="Recurring"
                subtitle="Rent, subscriptions, EMIs and salary"
                leading={<IconTile name="repeat" color={theme.colors.textTertiary} />}
                showChevron
                onPress={() => navigation.navigate('Recurring')}
              />
              <Divider inset={DIVIDER_INSET} />
              <ListRow
                title="Alerts"
                subtitle="Budget and recurring notifications"
                leading={<IconTile name="bell" color={theme.colors.textTertiary} />}
                trailing={
                  (unreadQuery.data ?? 0) > 0 ? (
                    <Badge label={String(unreadQuery.data)} tone="negative" />
                  ) : null
                }
                showChevron
                onPress={() => navigation.navigate('Notifications')}
              />
            </View>
          </Card>
        </View>

        <View style={{ marginTop: theme.spacing.xxxl }}>
          <SectionHeader title="Notify me about" />
          <Card padding={0} radius="xl">
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              {/* Switched off at the source: the server checks these before it
                  writes an alert, so turning one off stops it being raised rather
                  than hiding it here. */}
              <ToggleRow
                title="Budgets"
                subtitle="Once when you get close, once if you go over"
                icon="target"
                value={profile?.notificationPrefs?.budgetAlerts ?? true}
                busy={updateProfile.isPending && pendingToggle === 'budget'}
                onChange={(budgetAlerts) => {
                  setPendingToggle('budget');
                  updateProfile.mutate({ notificationPrefs: { budgetAlerts } });
                }}
              />
              <Divider inset={DIVIDER_INSET} />
              <ToggleRow
                title="Recurring"
                subtitle="Before a charge is due, and when it is recorded"
                icon="repeat"
                value={profile?.notificationPrefs?.recurringAlerts ?? true}
                busy={updateProfile.isPending && pendingToggle === 'recurring'}
                onChange={(recurringAlerts) => {
                  setPendingToggle('recurring');
                  updateProfile.mutate({ notificationPrefs: { recurringAlerts } });
                }}
              />
            </View>
          </Card>
        </View>

        <View style={{ marginTop: theme.spacing.xxxl }}>
          <SectionHeader title="Accent" />
          <Card padding={0} radius="xl">
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              {accentList.map((option, index) => {
                const selected = option.id === accent;
                const preview = colorsByAccent[option.id];
                return (
                  <Fragment key={option.id}>
                    {index > 0 ? <Divider inset={DIVIDER_INSET} /> : null}
                    <ListRow
                      title={option.label}
                      subtitle={selected ? 'Active' : 'Tap to apply'}
                      leading={
                        // A two-tone swatch: the brand fill over the canvas it sits
                        // on, which is what actually changes between accents.
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: theme.radius.sm,
                            backgroundColor: preview.background,
                            borderWidth: theme.layout.hairline,
                            borderColor: preview.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <View
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              backgroundColor: preview.brand,
                            }}
                          />
                        </View>
                      }
                      trailing={
                        selected ? (
                          <Icon
                            name="check"
                            size={19}
                            color={theme.colors.brandText}
                            accessibilityLabel="Selected"
                          />
                        ) : null
                      }
                      onPress={() => setAccent(option.id)}
                      selected={selected}
                      accessibilityHint={selected ? 'Currently selected' : 'Applies this accent'}
                    />
                  </Fragment>
                );
              })}
            </View>
          </Card>
        </View>

        <View style={{ marginTop: theme.spacing.xxxl }}>
          <SectionHeader title="Your data" />
          <Card padding={0} radius="xl">
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title="Export transactions"
                subtitle="A spreadsheet of everything, to keep or share"
                leading={<IconTile name="package" color={theme.colors.brandText} />}
                onPress={() => void exportEverything()}
                accessibilityHint="Creates a CSV file and opens the share sheet"
                busy={exportTransactions.isPending}
                trailing={
                  exportTransactions.isPending ? (
                    <Text variant="caption" tone="tertiary">
                      Preparing…
                    </Text>
                  ) : null
                }
              />
              <Divider inset={DIVIDER_INSET} />
              <ListRow
                title="Close account"
                subtitle="Deletes everything, permanently"
                leading={<IconTile name="trash" color={theme.colors.negative} />}
                showChevron
                onPress={() => {
                  tapFeedback();
                  openSheet(setCloseOpen);
                }}
                accessibilityHint="Opens the account deletion confirmation"
              />
            </View>
          </Card>
        </View>

        <View style={{ marginTop: theme.spacing.xxxl }}>
          <SectionHeader title="App" />
          <Card padding={0} radius="xl">
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title="Design system"
                subtitle="Components, states and tokens"
                leading={<IconTile name="sparkles" color={theme.colors.brandText} />}
                showChevron
                onPress={() => navigation.navigate('DesignSystem')}
                accessibilityHint="Opens the component gallery"
              />
              <Divider inset={DIVIDER_INSET} />
              <ListRow
                title="Sign out"
                subtitle="Ends this session on this device"
                leading={<IconTile name="arrowRight" color={theme.colors.textTertiary} />}
                onPress={confirmSignOut}
                busy={logout.isPending}
                trailing={
                  logout.isPending ? (
                    <Text variant="caption" tone="tertiary">
                      Signing out…
                    </Text>
                  ) : null
                }
              />
            </View>
          </Card>
        </View>

        {__DEV__ ? (
          <Card variant="muted" radius="md" padding="lg" style={{ marginTop: theme.spacing.xxl }}>
            <Text variant="caption" tone="tertiary">
              API
            </Text>
            <Text variant="caption" tone="secondary" selectable style={{ marginTop: 2 }}>
              {API_BASE_URL}
            </Text>
          </Card>
        ) : null}

        <Text
          variant="caption"
          tone="tertiary"
          align="center"
          style={{ marginTop: theme.spacing.huge }}
        >
          {`Paisa · Version ${version}`}
        </Text>
      </Screen>

      <EditProfileSheet
        key={`profile-${sheetSession}`}
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
      <CloseAccountSheet
        key={`close-${sheetSession}`}
        visible={closeOpen}
        onClose={() => setCloseOpen(false)}
      />

      <ChangePasswordSheet
        key={`password-${sheetSession}`}
        visible={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />
    </>
  );
}

type ToggleRowProps = {
  title: string;
  subtitle: string;
  icon: IconName;
  value: boolean;
  busy: boolean;
  onChange: (value: boolean) => void;
};

/**
 * A preference switch.
 *
 * A tappable row rather than a `Switch`: the platform control comes with its own
 * colours and its own idea of size, and this is the one place a themed app
 * usually gives itself away.
 */
function ToggleRow({ title, subtitle, icon, value, busy, onChange }: ToggleRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => {
        if (busy) return;
        tapFeedback();
        onChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: busy }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: 64,
        paddingVertical: theme.spacing.md,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <IconTile
        name={icon}
        color={value ? theme.colors.brandText : theme.colors.textTertiary}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="tertiary" numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 46,
          height: 28,
          borderRadius: 14,
          padding: 3,
          justifyContent: 'center',
          alignItems: value ? 'flex-end' : 'flex-start',
          backgroundColor: value ? theme.colors.brand : theme.colors.surfaceStrong,
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: value ? theme.colors.textOnAccent : theme.colors.textTertiary,
          }}
        />
      </View>
    </Pressable>
  );
}
