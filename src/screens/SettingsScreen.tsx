import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import {
  API_BASE_URL,
  errorMessage,
  useExportTransactions,
  useLogout,
  useNotificationPreferences,
  useSession,
  useUnreadCount,
  useUpdateNotificationPreferences,
  type NotificationPreviewMode,
} from '@/api';
import {
  Badge,
  Card,
  Divider,
  Icon,
  IconTile,
  ListRow,
  Screen,
  SegmentedControl,
  Text,
  withAlpha,
  type IconName,
  type SegmentOption,
} from '@/components/ui';
import type { ColorTokens } from '@/theme';
import { ChangePasswordSheet } from '@/screens/sheets/ChangePasswordSheet';
import { CloseAccountSheet } from '@/screens/sheets/CloseAccountSheet';
import { EditProfileSheet } from '@/screens/sheets/EditProfileSheet';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useAccentStore } from '@/store/themeStore';
import { accentList, colorsByAccent, spacing, useTheme } from '@/theme';
import { shareTextFile } from '@/services/exportFile';
import { errorFeedback, successFeedback, tapFeedback } from '@/utils/haptics';
import { exportWindow } from '@/utils/period';

/**
 * Lines a divider up with the row title rather than its icon tile: the tile is
 * 44dp wide and `ListRow` puts `spacing.md` between it and the text.
 */
const DIVIDER_INSET = 44 + spacing.md;

const PREVIEW_MODES: readonly SegmentOption<NotificationPreviewMode>[] = [
  { value: 'private', label: 'Private' },
  { value: 'basic', label: 'Basic' },
  { value: 'detailed', label: 'Detailed' },
];

/** What each choice actually looks like on a locked phone. */
const PREVIEW_HINTS: Record<NotificationPreviewMode, string> = {
  private: 'Shows only that Paisa has something for you. No names, no amounts.',
  basic: 'Shows the category or payee, but never the amount.',
  detailed: 'Shows the full line, amount included.',
};

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
  const unreadQuery = useUnreadCount();

  const prefsQuery = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();
  const prefs = prefsQuery.data;

  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<string>();

  const exportTransactions = useExportTransactions();
  const showToast = useUiStore((state) => state.showToast);

  /**
   * Exports everything, not a period.
   *
   * A backup with a date filter on it is not a backup. Five years back is the
   * server's own cap and comfortably older than this app, so in practice this is
   * "all of it" without needing an endpoint that says so.
   *
   * The window itself is `exportWindow()`, beside the rest of the range maths,
   * so the export test asserts against the same function this calls.
   */
  async function exportEverything() {
    if (exportTransactions.isPending) return;
    tapFeedback();

    try {
      const file = await exportTransactions.mutateAsync(exportWindow());

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
        <LinearGradient
          colors={[theme.colors.heroSurface, theme.colors.heroSurfaceEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[
            theme.shadows.md,
            {
              borderRadius: theme.radius.xl,
              borderWidth: theme.layout.hairline,
              borderColor: theme.colors.heroBorder,
              borderTopColor: 'rgba(255, 255, 255, 0.16)',
              overflow: 'hidden',
              padding: theme.spacing.xl,
            },
          ]}
        >
          <ProfileBloom color={theme.colors.brandText} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.heroTile,
                borderWidth: 1.5,
                borderColor: withAlpha(theme.colors.brandText, 0.4),
              }}
            >
              <Text variant="h3" color={theme.colors.brandText}>
                {initials || 'P'}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text variant="h3" color={theme.colors.heroText} numberOfLines={1}>
                {profile?.name ?? 'Your profile'}
              </Text>
              <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
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
              borderTopColor: theme.colors.heroTileBorder,
            }}
          >
            <Icon name="clock" size={14} color={theme.colors.heroTextMuted} />
            <Text
              variant="caption"
              color={theme.colors.heroTextMuted}
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {profile?.timezone ?? 'Asia/Kolkata'}
            </Text>
          </View>
        </LinearGradient>

        <Group title="Account">
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
        </Group>

        <Group title="Money">
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
                title="People"
                subtitle="Money owed, loans and repayments"
                leading={<IconTile name="users" color={theme.colors.textTertiary} />}
                showChevron
                onPress={() => navigation.navigate('People')}
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
        </Group>

        <Group title="Notify me about">
          <Card padding={0} radius="xl">
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ToggleRow
                title="Budgets"
                subtitle="Warning at 80% and alert when exceeded"
                icon="target"
                value={prefs?.budgetAlerts ?? true}
                busy={updatePrefs.isPending && pendingToggle === 'budget'}
                onChange={(budgetAlerts) => {
                  setPendingToggle('budget');
                  updatePrefs.mutate({ budgetAlerts });
                }}
              />
              <Divider inset={DIVIDER_INSET} />
              <ToggleRow
                title="Recurring"
                subtitle="Reminders 2 days before and on due date"
                icon="repeat"
                value={prefs?.recurringAlerts ?? true}
                busy={updatePrefs.isPending && pendingToggle === 'recurring'}
                onChange={(recurringAlerts) => {
                  setPendingToggle('recurring');
                  updatePrefs.mutate({ recurringAlerts });
                }}
              />
              <Divider inset={DIVIDER_INSET} />
              <ToggleRow
                title="People & Money Owed"
                subtitle="Reminders when loans or repayments are due"
                icon="user"
                value={prefs?.peopleAlerts ?? true}
                busy={updatePrefs.isPending && pendingToggle === 'people'}
                onChange={(peopleAlerts) => {
                  setPendingToggle('people');
                  updatePrefs.mutate({ peopleAlerts });
                }}
              />
              <Divider inset={DIVIDER_INSET} />
              <ToggleRow
                title="Spending Insights"
                subtitle="Alerts when category spending spikes"
                icon="trendingUp"
                value={prefs?.spendingAlerts ?? true}
                busy={updatePrefs.isPending && pendingToggle === 'spending'}
                onChange={(spendingAlerts) => {
                  setPendingToggle('spending');
                  updatePrefs.mutate({ spendingAlerts });
                }}
              />
              <Divider inset={DIVIDER_INSET} />
              <ToggleRow
                title="Monthly Summary"
                subtitle="Overview of previous month's spending"
                icon="pieChart"
                value={prefs?.monthlySummaryAlerts ?? true}
                busy={updatePrefs.isPending && pendingToggle === 'summary'}
                onChange={(monthlySummaryAlerts) => {
                  setPendingToggle('summary');
                  updatePrefs.mutate({ monthlySummaryAlerts });
                }}
              />
            </View>
          </Card>
        </Group>

        <Group
          title="Lock screen"
          caption="How much of a figure shows in a notification preview"
        >
          <Card padding="lg" radius="xl">
            <SegmentedControl
              options={PREVIEW_MODES}
              value={prefs?.previewMode ?? 'private'}
              onChange={(previewMode) => updatePrefs.mutate({ previewMode })}
              accessibilityLabel="Notification preview detail"
            />
            <Text variant="caption" tone="tertiary" style={{ marginTop: theme.spacing.md }}>
              {PREVIEW_HINTS[prefs?.previewMode ?? 'private']}
            </Text>
          </Card>
        </Group>

        <Group title="Quiet hours">
          <Card padding={0} radius="xl">
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ToggleRow
                title="Quiet hours"
                subtitle="Nothing pushes between 10:00 PM and 8:00 AM"
                icon="moon"
                value={prefs?.quietHours?.enabled ?? true}
                busy={updatePrefs.isPending && pendingToggle === 'quiet'}
                onChange={(enabled) => {
                  setPendingToggle('quiet');
                  updatePrefs.mutate({ quietHours: { enabled } });
                }}
              />
            </View>
          </Card>
        </Group>

        <Group title="Accent" caption="Tints the whole app, greys included">
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {accentList.map((option) => (
              <AccentSwatch
                key={option.id}
                label={option.label}
                preview={colorsByAccent[option.id]}
                selected={option.id === accent}
                onPress={() => setAccent(option.id)}
              />
            ))}
          </View>
        </Group>

        <Group title="Your data">
          <Card padding={0} radius="xl">
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <ListRow
                title="Export transactions"
                subtitle="Every transaction, as a CSV"
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
        </Group>

        <Group title="App">
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
        </Group>

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

/**
 * A settings group: a small caps label, an optional line of explanation, and the
 * card that holds the rows.
 *
 * The label is deliberately quieter than a section title elsewhere in the app. On
 * a screen that is nothing but stacked cards, headings competing with the rows
 * they introduce is what makes a settings list feel like a form.
 */
function Group({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={{ marginTop: theme.spacing.xxxl }}>
      <View
        style={{
          gap: 3,
          marginBottom: theme.spacing.sm,
          paddingHorizontal: theme.spacing.xs,
        }}
      >
        <Text variant="overline" tone="tertiary" accessibilityRole="header">
          {title}
        </Text>
        {caption ? (
          <Text variant="caption" tone="tertiary">
            {caption}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * One accent, previewed as the thing it actually changes.
 *
 * An accent here is not just a brand colour — it tints the whole neutral ramp —
 * so the swatch shows a miniature card on that accent's own canvas rather than a
 * dot of the brand colour, which would look near-identical across all three.
 */
function AccentSwatch({
  label,
  preview,
  selected,
  onPress,
}: {
  label: string;
  preview: ColorTokens;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => {
        if (selected) return;
        tapFeedback();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      accessibilityHint={selected ? 'Currently selected' : 'Applies this accent'}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.75 : 1 })}
    >
      <View
        style={{
          padding: theme.spacing.sm,
          gap: theme.spacing.sm,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surface,
          borderWidth: selected ? 1.5 : theme.layout.hairline,
          borderColor: selected ? preview.brandText : theme.colors.border,
        }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            height: 54,
            borderRadius: theme.radius.sm,
            backgroundColor: preview.background,
            borderWidth: theme.layout.hairline,
            borderColor: preview.border,
            padding: theme.spacing.sm,
            justifyContent: 'space-between',
          }}
        >
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: preview.brand,
            }}
          />
          <View style={{ gap: 3 }}>
            <View
              style={{
                height: 3,
                width: '80%',
                borderRadius: 2,
                backgroundColor: preview.brandText,
                opacity: 0.55,
              }}
            />
            <View
              style={{
                height: 3,
                width: '45%',
                borderRadius: 2,
                backgroundColor: preview.textTertiary,
                opacity: 0.6,
              }}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text
            variant="labelSm"
            numberOfLines={1}
            style={{ flex: 1, minWidth: 0 }}
            color={selected ? theme.colors.textPrimary : theme.colors.textSecondary}
          >
            {label}
          </Text>
          {selected ? (
            <Icon name="check" size={14} color={preview.brandText} strokeWidth={2.6} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Atmosphere on the profile slab. Non-interactive and outside the layout. */
function ProfileBloom({ color }: { color: string }) {
  return (
    <Svg
      width={260}
      height={200}
      style={styles.bloom}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="profileBloom" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.22} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.05} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={190} cy={50} rx={120} ry={95} fill="url(#profileBloom)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bloom: { position: 'absolute', top: -36, right: -36, pointerEvents: 'none' },
});
