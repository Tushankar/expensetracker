import { LinearGradient } from 'expo-linear-gradient';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import type { Category } from '@/api/types';
import {
  Badge,
  Button,
  Card,
  Divider,
  Icon,
  IconTile,
  Text,
  withAlpha,
  type IconName,
} from '@/components/ui';
import { categoryColor, useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';
import { tapFeedback } from '@/utils/haptics';

export type BudgetPreset = {
  nameMatch: string[];
  title: string;
  /** Rupees, as the amount keypad would have them typed. */
  amount: string;
  icon: IconName;
  color: string;
  subtitle: string;
};

export const POPULAR_PRESETS: readonly BudgetPreset[] = [
  {
    nameMatch: ['food', 'dining', 'restaurant', 'groceries', 'swiggy', 'zomato'],
    title: 'Food & Dining',
    amount: '8000',
    icon: 'food',
    color: 'food',
    subtitle: 'Daily meals, groceries & takeout',
  },
  {
    nameMatch: ['transport', 'fuel', 'cab', 'uber', 'ola', 'commute', 'petrol'],
    title: 'Transport & Fuel',
    amount: '3500',
    icon: 'transport',
    color: 'transport',
    subtitle: 'Petrol, metro & ride-hails',
  },
  {
    nameMatch: ['shopping', 'clothes', 'electronics', 'lifestyle', 'amazon'],
    title: 'Shopping & Spends',
    amount: '5000',
    icon: 'shopping',
    color: 'shopping',
    subtitle: 'Clothing, gadgets & personal',
  },
  {
    nameMatch: ['bills', 'utilities', 'utility', 'electricity', 'wifi', 'recharge'],
    title: 'Bills & Utilities',
    amount: '4000',
    icon: 'bills',
    color: 'bills',
    subtitle: 'Electricity, wifi & recharge',
  },
  {
    nameMatch: ['entertainment', 'movies', 'subscriptions', 'ott', 'netflix'],
    title: 'Entertainment',
    amount: '2500',
    icon: 'entertainment',
    color: 'entertainment',
    subtitle: 'OTT, movies & outings',
  },
  {
    nameMatch: ['health', 'medical', 'pharmacy', 'fitness', 'doctor'],
    title: 'Health & Wellness',
    amount: '2000',
    icon: 'health',
    color: 'health',
    subtitle: 'Medicines, gym & checkups',
  },
];

/** Presets are authored in rupees; everything that displays money speaks paise. */
function presetPaise(preset: BudgetPreset): number {
  return Math.round(Number(preset.amount) * 100);
}

export type BudgetStarterViewProps = {
  categories: Category[];
  monthLabel: string;
  onCreateCustom: () => void;
  onSetOverall: () => void;
  onSelectPreset: (preset: { categoryId?: string; amount: string; title: string }) => void;
};

/**
 * What the tab looks like before a single cap exists.
 *
 * An empty state is the only screen every new user is guaranteed to see, so this
 * one does three jobs in order: say what budgets do here, offer a one-tap way in
 * with amounts already filled, and explain what the app will do with the number
 * once it has it.
 */
export function BudgetStarterView({
  categories,
  monthLabel,
  onCreateCustom,
  onSetOverall,
  onSelectPreset,
}: BudgetStarterViewProps) {
  const theme = useTheme();

  function handlePresetPress(preset: BudgetPreset) {
    tapFeedback();
    // Find best category match
    const matched = categories.find((cat) => {
      const catLower = cat.name.toLowerCase();
      return (
        preset.nameMatch.some((m) => catLower.includes(m)) ||
        catLower === preset.title.toLowerCase()
      );
    });

    onSelectPreset({
      categoryId: matched?.id,
      amount: preset.amount,
      title: preset.title,
    });
  }

  return (
    <View style={{ gap: theme.spacing.xxl, paddingBottom: theme.spacing.xxl }}>
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
        <StarterBloom color={theme.colors.brandText} />

        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Badge label="Smart budgeting" tone="brand" />
          <Text variant="caption" color={theme.colors.heroTextMuted}>
            {monthLabel}
          </Text>
        </View>

        <Text variant="h1" color={theme.colors.heroText} style={{ marginTop: theme.spacing.lg }}>
          Decide where the month goes
        </Text>
        <Text
          variant="bodySm"
          color={theme.colors.heroTextMuted}
          style={{ marginTop: theme.spacing.xs, lineHeight: 21 }}
        >
          Set a cap and Paisa watches the pace for you — a nudge at 80%, a flag the
          moment you cross it, and a safe daily number in between.
        </Text>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.xs,
            marginTop: theme.spacing.lg,
          }}
        >
          <HeroChip icon="bellAlert" label="80% alerts" />
          <HeroChip icon="gauge" label="Daily pace" />
          <HeroChip icon="shieldCheck" label="Category caps" />
        </View>

        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
          <Button
            label="Create your first budget"
            leftIcon="sparkle"
            variant="brand"
            size="lg"
            fullWidth
            onPress={onCreateCustom}
          />
          <Button
            label="Set an overall monthly cap"
            leftIcon="target"
            variant="secondary"
            size="md"
            fullWidth
            onPress={onSetOverall}
          />
        </View>
      </LinearGradient>

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 3 }}>
          <Text variant="overline" tone="tertiary">
            Quick start
          </Text>
          <Text variant="h3">Recommended starter caps</Text>
          <Text variant="caption" tone="secondary">
            Typical monthly limits for an Indian household. Tap one — the amount is
            already filled in, and you can change it before saving.
          </Text>
        </View>

        <Card padding={0} radius="xl">
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            {POPULAR_PRESETS.map((preset, index) => {
              const hue = categoryColor(preset.color);
              return (
                <Fragment key={preset.title}>
                  {index > 0 ? <Divider inset={36 + theme.spacing.md} /> : null}
                  <Pressable
                    onPress={() => handlePresetPress(preset)}
                    accessibilityRole="button"
                    accessibilityLabel={`${preset.title}, ${formatINR(presetPaise(preset))} a month`}
                    accessibilityHint="Opens the budget sheet with this amount filled in"
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.md,
                      paddingVertical: theme.spacing.md,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <IconTile name={preset.icon} color={hue} size="sm" />

                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text variant="label" numberOfLines={1}>
                        {preset.title}
                      </Text>
                      <Text variant="caption" tone="tertiary" numberOfLines={1}>
                        {preset.subtitle}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text variant="amountSm" numberOfLines={1}>
                        {formatINR(presetPaise(preset))}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        per month
                      </Text>
                    </View>

                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.colors.brandSurface,
                        borderWidth: theme.layout.hairline,
                        borderColor: withAlpha(theme.colors.brandText, 0.24),
                      }}
                    >
                      <Icon
                        name="plus"
                        size={15}
                        color={theme.colors.brandText}
                        strokeWidth={2.4}
                      />
                    </View>
                  </Pressable>
                </Fragment>
              );
            })}
          </View>
        </Card>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 3 }}>
          <Text variant="overline" tone="tertiary">
            How it works
          </Text>
          <Text variant="h3">What a cap gets you</Text>
        </View>

        <Card radius="xl" padding="lg">
          <View style={{ gap: theme.spacing.lg }}>
            <Feature
              icon="bellAlert"
              tint={theme.colors.warning}
              title="A warning, not a post-mortem"
              body="One push at 80% of the cap and one if you cross it. Never more than that, and never after the money has already gone."
            />
            <Divider />
            <Feature
              icon="gauge"
              tint={theme.colors.brandText}
              title="A safe number for today"
              body="Paisa divides what is left by the days that remain, so there is always one figure to spend against rather than a total to interpret."
            />
            <Divider />
            <Feature
              icon="shieldCheck"
              tint={theme.colors.positive}
              title="Guardrails per category"
              body="Dining and impulse shopping get their own ceilings, so neither can quietly eat the month's bills or savings."
            />
          </View>
        </Card>
      </View>
    </View>
  );
}

function Feature({
  icon,
  tint,
  title,
  body,
}: {
  icon: IconName;
  tint: string;
  title: string;
  body: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 38,
          height: 38,
          borderRadius: theme.radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha(tint, 0.14),
          borderWidth: theme.layout.hairline,
          borderColor: withAlpha(tint, 0.22),
          marginTop: 1,
        }}
      >
        <Icon name={icon} size={19} color={tint} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text variant="label">{title}</Text>
        <Text variant="bodySm" tone="secondary" style={{ lineHeight: 20 }}>
          {body}
        </Text>
      </View>
    </View>
  );
}

function HeroChip({ icon, label }: { icon: IconName; label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        height: 28,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.heroTile,
        borderWidth: theme.layout.hairline,
        borderColor: theme.colors.heroTileBorder,
      }}
    >
      <Icon name={icon} size={13} color={theme.colors.brandText} strokeWidth={2} />
      <Text variant="caption" color={theme.colors.heroText}>
        {label}
      </Text>
    </View>
  );
}

/** Purely atmospheric — the same bloom the active hero uses, so the two states match. */
function StarterBloom({ color }: { color: string }) {
  return (
    <Svg
      width={320}
      height={260}
      style={styles.bloom}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="budgetStarterBloom" cx="50%" cy="50%" r="50%">
          {/* Capped: this bloom sits over glass that is itself over the ambient
          field, and the two together were taking captions on this card under
          AA. What shows inside the card was always the falloff anyway. */}
          <Stop offset="0" stopColor={color} stopOpacity={0.1} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.03} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={240} cy={60} rx={160} ry={120} fill="url(#budgetStarterBloom)" />
      <Circle
        cx={248}
        cy={52}
        r={86}
        stroke={color}
        strokeOpacity={0.09}
        strokeWidth={1}
        fill="none"
      />
      <Circle
        cx={248}
        cy={52}
        r={124}
        stroke={color}
        strokeOpacity={0.05}
        strokeWidth={1}
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bloom: { position: 'absolute', top: -40, right: -40, pointerEvents: 'none' },
});
