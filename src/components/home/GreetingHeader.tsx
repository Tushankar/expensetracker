import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';

import { IconButton, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { greetingFor } from '@/utils/date';

export type GreetingHeaderProps = {
  firstName: string;
  initials: string;
  onProfilePress: () => void;
  onNotificationsPress: () => void;
  onSearchPress: () => void;
  /** Drives the badge on the bell. Zero hides it. */
  unreadCount?: number;
};

/** Greeting, name and the two persistent entry points. */
export function GreetingHeader({
  firstName,
  initials,
  onProfilePress,
  onNotificationsPress,
  onSearchPress,
  unreadCount = 0,
}: GreetingHeaderProps) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <Pressable
        onPress={onProfilePress}
        accessibilityRole="button"
        accessibilityLabel={`Profile, ${firstName}`}
        accessibilityHint="Opens settings"
        hitSlop={8}
      >
        <LinearGradient
          colors={[theme.colors.brandText, theme.colors.brandPressed]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="labelSm" color={theme.colors.textOnAccent}>
            {initials}
          </Text>
        </LinearGradient>
      </Pressable>

      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text variant="caption" tone="tertiary">
          {`${greetingFor()},`}
        </Text>
        <Text variant="h2" numberOfLines={1}>
          {`${firstName} \u{1F44B}`}
        </Text>
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          Take control of your finances
        </Text>
      </View>

      <IconButton
        name="search"
        onPress={onSearchPress}
        accessibilityLabel="Search transactions"
        variant="surface"
        size="md"
      />

      <View>
        <IconButton
          name="bell"
          onPress={onNotificationsPress}
          accessibilityLabel={
            unreadCount > 0 ? `Alerts, ${unreadCount} unread` : 'Alerts'
          }
          variant="surface"
          size="md"
        />
        {unreadCount > 0 ? (
          // A count rather than a dot: "3 budgets need looking at" and "one
          // subscription renews tomorrow" deserve different urgency, and the
          // number is the cheapest way to say which this is.
          <View
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              top: 2,
              right: 0,
              minWidth: 18,
              height: 18,
              paddingHorizontal: 5,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.negative,
              borderWidth: 2,
              borderColor: theme.colors.background,
            }}
          >
            <Text
              variant="caption"
              color="#FFFFFF"
              maxFontSizeMultiplier={1.1}
              style={{ fontSize: 10, lineHeight: 12 }}
            >
              {unreadCount > 9 ? '9+' : String(unreadCount)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
