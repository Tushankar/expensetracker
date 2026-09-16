import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Fragment, useState } from 'react';
import { Alert, View } from 'react-native';

import { API_BASE_URL, useLogout, useSession } from '@/api';
import {
  Badge,
  Card,
  Divider,
  Icon,
  IconTile,
  ListRow,
  PageHeader,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { ChangePasswordSheet } from '@/screens/sheets/ChangePasswordSheet';
import { EditProfileSheet } from '@/screens/sheets/EditProfileSheet';
import { useAuthStore } from '@/store/authStore';
import { useAccentStore } from '@/store/themeStore';
import { accentList, colorsByAccent, useTheme } from '@/theme';

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
  const tabBarHeight = useBottomTabBarHeight();

  const accent = useAccentStore((state) => state.accent);
  const setAccent = useAccentStore((state) => state.setAccent);

  const user = useAuthStore((state) => state.user);
  const sessionQuery = useSession();
  const logout = useLogout();

  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
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
      <Screen bottomInset={tabBarHeight + theme.spacing.xxl} testID="settings-screen">
        <PageHeader title="Settings" />

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
              <Divider inset={44 + theme.spacing.md} />
              <ListRow
                title="Change password"
                subtitle="Signs out every other device"
                leading={<IconTile name="lock" color={theme.colors.textTertiary} />}
                showChevron
                onPress={() => openSheet(setPasswordOpen)}
              />
              <Divider inset={44 + theme.spacing.md} />
              <ListRow
                title="Accounts"
                subtitle="Banks, cards, cash and wallets"
                leading={<IconTile name="wallet" color={theme.colors.textTertiary} />}
                showChevron
                onPress={() => navigation.navigate('Tabs', { screen: 'Accounts' })}
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
                    {index > 0 ? <Divider inset={44 + theme.spacing.md} /> : null}
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
                      accessibilityHint={selected ? 'Currently selected' : 'Applies this accent'}
                    />
                  </Fragment>
                );
              })}
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
              <Divider inset={44 + theme.spacing.md} />
              <ListRow
                title="Sign out"
                subtitle="Ends this session on this device"
                leading={<IconTile name="arrowRight" color={theme.colors.negative} />}
                onPress={confirmSignOut}
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
      <ChangePasswordSheet
        key={`password-${sheetSession}`}
        visible={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />
    </>
  );
}
