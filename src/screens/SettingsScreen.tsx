import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Fragment } from 'react';
import { View } from 'react-native';

import { Card, Divider, Icon, IconTile, ListRow, Screen, SectionHeader, Text } from '@/components/ui';
import { user } from '@/data/mock';
import { useAccentStore } from '@/store/themeStore';
import { accentList, colorsByAccent, useTheme } from '@/theme';

/**
 * Settings. The accent picker, a couple of preferences and a link into the
 * component gallery — the rest lands once accounts and sync exist.
 */
export function SettingsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const accent = useAccentStore((state) => state.accent);
  const setAccent = useAccentStore((state) => state.setAccent);

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen topInset={false} bottomInset={theme.spacing.xxl} testID="settings-screen">
      <Card padding="xl" radius="xl" style={{ marginTop: theme.spacing.sm }}>
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
              {user.initials}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text variant="h3">{user.firstName}</Text>
            <Text variant="caption" tone="tertiary">
              Local profile · not signed in
            </Text>
          </View>
        </View>
      </Card>

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
        <SectionHeader title="Preferences" />
        <Card padding={0} radius="xl">
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            <ListRow
              title="Currency"
              subtitle="Indian Rupee (₹)"
              leading={<IconTile name="cash" color={theme.colors.textTertiary} />}
              trailing={
                <Text variant="labelSm" tone="tertiary">
                  INR
                </Text>
              }
            />
            <Divider inset={44 + theme.spacing.md} />
            <ListRow
              title="Notifications"
              subtitle="Bill reminders and weekly summaries"
              leading={<IconTile name="bell" color={theme.colors.textTertiary} />}
              showChevron
              onPress={() => {}}
            />
            <Divider inset={44 + theme.spacing.md} />
            <ListRow
              title="Design system"
              subtitle="Components, states and tokens"
              leading={<IconTile name="sparkles" color={theme.colors.brandText} />}
              showChevron
              onPress={() => navigation.navigate('DesignSystem')}
              accessibilityHint="Opens the component gallery"
            />
          </View>
        </Card>
      </View>

      <Text
        variant="caption"
        tone="tertiary"
        align="center"
        style={{ marginTop: theme.spacing.huge }}
      >
        {`Paisa · Version ${version}`}
      </Text>
    </Screen>
  );
}
