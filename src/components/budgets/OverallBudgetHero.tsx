import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import type { BudgetProgress } from '@/api/types';
import { BudgetGauge } from '@/components/budgets/BudgetGauge';
import { stateColor } from '@/components/budgets/BudgetRow';
import { Badge, Icon, IconButton, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';
import { formatINR } from '@/utils/currency';

export type OverallBudgetHeroProps = {
  budget: BudgetProgress;
  monthLabel: string;
  /** Days left in the month. Zero for a month that has already closed. */
  daysRemaining: number;
  /** Day the month has reached — the whole month once it is in the past. */
  dayOfMonth: number;
  totalDays: number;
  isCurrentMonth: boolean;
  onEdit: () => void;
};

/**
 * The anchor of the Budgets tab: one cap, how full it is, and what that implies
 * for the rest of the month.
 *
 * The dial carries the state on its own — the notch marks where the app will warn,
 * the fill says how close that is — which lets the figures beside it stay quiet
 * and be read second. Everything below the dial is a consequence of it, never a
 * restatement.
 */
export function OverallBudgetHero({
  budget,
  monthLabel,
  daysRemaining,
  dayOfMonth,
  totalDays,
  isCurrentMonth,
  onEdit,
}: OverallBudgetHeroProps) {
  const theme = useTheme();
  const accent = stateColor(budget.state, theme);

  const filled = budget.amount > 0 ? budget.spent / budget.amount : 0;

  // What is still spendable per day if the rest of the month is to land on target.
  const safeDaily =
    isCurrentMonth && daysRemaining > 0 && budget.remaining > 0
      ? Math.floor(budget.remaining / daysRemaining)
      : null;

  // Where the spend *should* sit today if the cap were spread evenly over the month.
  // Pace is the one thing a percentage cannot tell you: 60% used is healthy on the
  // 20th and alarming on the 5th.
  const expected = totalDays > 0 ? (budget.amount * dayOfMonth) / totalDays : 0;
  const drift = Math.round(budget.spent - expected);
  const onPace = Math.abs(drift) < budget.amount * 0.02;

  const paceTone = onPace
    ? theme.colors.heroTextMuted
    : drift > 0
      ? theme.colors.negative
      : theme.colors.positive;

  const paceLine = onPace
    ? 'Tracking almost exactly on plan for this point in the month'
    : drift > 0
      ? `${formatINR(drift)} ahead of an even pace for day ${dayOfMonth}`
      : `${formatINR(Math.abs(drift))} under an even pace for day ${dayOfMonth}`;

  // Short on purpose: the amount it would otherwise carry is already the line under
  // the dial, and a badge that wraps drags the whole header row out of shape.
  const statusLabel =
    budget.state === 'exceeded'
      ? 'Over cap'
      : budget.state === 'warning'
        ? 'Near cap'
        : 'On track';

  const statusTone =
    budget.state === 'exceeded' ? 'negative' : budget.state === 'warning' ? 'warning' : 'positive';

  return (
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
          // A lighter top edge reads as a light source above the card — the cheapest
          // depth cue there is on a near-black canvas.
          borderTopColor: 'rgba(255, 255, 255, 0.16)',
          overflow: 'hidden',
          padding: theme.spacing.xl,
        },
      ]}
    >
      <HeroBloom color={accent} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name="target" size={15} color={theme.colors.heroTextMuted} strokeWidth={2} />
        <Text
          variant="overline"
          color={theme.colors.heroTextMuted}
          style={{ flex: 1, minWidth: 0 }}
          numberOfLines={1}
        >
          Monthly ceiling
        </Text>
        <Badge label={statusLabel} tone={statusTone} />
        <IconButton
          name="sliders"
          accessibilityLabel="Edit the overall budget"
          accessibilityHint="Opens the cap and its alert threshold"
          size="sm"
          color={theme.colors.heroText}
          onPress={onEdit}
          style={{ backgroundColor: theme.colors.heroTile, borderRadius: 18 }}
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.lg,
          marginTop: theme.spacing.lg,
        }}
      >
        <BudgetGauge
          value={filled}
          size={124}
          thickness={11}
          color={accent}
          colorEnd={budget.state === 'on_track' ? theme.colors.brandText : accent}
          trackColor="rgba(255, 255, 255, 0.10)"
          warnAt={budget.warnAtPercent / 100}
          warnColor={theme.colors.heroSurfaceEnd}
          gradientId="overallBudgetGauge"
          accessibilityLabel={`${budget.percent} percent of the monthly cap used`}
        >
          <Text variant="h1" color={theme.colors.heroText} maxFontSizeMultiplier={1.1}>
            {`${budget.percent}%`}
          </Text>
          <Text variant="caption" color={theme.colors.heroTextMuted} maxFontSizeMultiplier={1.2}>
            of cap
          </Text>
        </BudgetGauge>

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text variant="overline" color={theme.colors.heroTextMuted}>
            Spent
          </Text>
          <Text
            variant="h1"
            color={theme.colors.heroText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {formatINR(budget.spent)}
          </Text>
          <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
            {`of ${formatINR(budget.amount)} cap`}
          </Text>

          <View
            style={{
              height: theme.layout.hairline,
              backgroundColor: theme.colors.heroTileBorder,
              marginVertical: theme.spacing.sm,
            }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon
              name={budget.state === 'exceeded' ? 'alertCircle' : 'shieldCheck'}
              size={14}
              color={accent}
              strokeWidth={2.1}
            />
            <Text
              variant="labelSm"
              color={accent}
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0 }}
            >
              {budget.state === 'exceeded'
                ? `${formatINR(budget.overBy)} over`
                : `${formatINR(budget.remaining)} left`}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          backgroundColor: theme.colors.heroTile,
          borderRadius: theme.radius.lg,
          borderWidth: theme.layout.hairline,
          borderColor: theme.colors.heroTileBorder,
          paddingVertical: theme.spacing.md,
          marginTop: theme.spacing.lg,
        }}
      >
        <Pillar
          icon="gauge"
          label="Safe daily"
          value={safeDaily !== null ? `${formatINR(safeDaily)}/d` : '—'}
        />
        <PillarDivider />
        <Pillar
          icon="flag"
          label={isCurrentMonth ? 'Days left' : 'Closed'}
          value={isCurrentMonth ? String(daysRemaining) : `${totalDays}d`}
        />
        <PillarDivider />
        <Pillar icon="bellAlert" label="Alert at" value={`${budget.warnAtPercent}%`} />
      </View>

      {isCurrentMonth ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: theme.spacing.md,
          }}
        >
          <Icon
            name={drift > 0 ? 'trendingUp' : 'trendingDown'}
            size={13}
            color={paceTone}
            strokeWidth={2.2}
          />
          <Text
            variant="caption"
            color={paceTone}
            numberOfLines={2}
            style={{ flex: 1, minWidth: 0 }}
          >
            {paceLine}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.md }}>
          <Icon name="calendar" size={13} color={theme.colors.heroTextMuted} strokeWidth={2.2} />
          <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
            {`${monthLabel} is closed — this is the final figure`}
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

function Pillar({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{ flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name={icon} size={12} color={theme.colors.heroTextMuted} strokeWidth={2} />
        <Text variant="caption" color={theme.colors.heroTextMuted} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text
        variant="amountSm"
        color={theme.colors.heroText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
    </View>
  );
}

function PillarDivider() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: theme.layout.hairline,
        alignSelf: 'center',
        height: 28,
        backgroundColor: theme.colors.heroTileBorder,
      }}
    />
  );
}

/**
 * Atmosphere behind the dial. Absolutely positioned and non-interactive, so it
 * costs the layout nothing and can never swallow a tap.
 */
function HeroBloom({ color }: { color: string }) {
  return (
    <Svg
      width={300}
      height={240}
      style={styles.bloom}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id="budgetHeroBloom" cx="50%" cy="50%" r="50%">
          {/* Capped: this bloom sits over glass that is itself over the ambient
          field, and the two together were taking captions on this card under
          AA. What shows inside the card was always the falloff anyway. */}
          <Stop offset="0" stopColor={color} stopOpacity={0.1} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.03} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={80} cy={130} rx={150} ry={110} fill="url(#budgetHeroBloom)" />
      <Circle
        cx={80}
        cy={130}
        r={96}
        stroke={color}
        strokeOpacity={0.08}
        strokeWidth={1}
        fill="none"
      />
      <Circle
        cx={80}
        cy={130}
        r={132}
        stroke={color}
        strokeOpacity={0.05}
        strokeWidth={1}
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bloom: { position: 'absolute', top: -24, left: -34, pointerEvents: 'none' },
});
