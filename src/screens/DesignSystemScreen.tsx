import { useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  Calendar,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  Keypad,
  LoadingState,
  Screen,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  SkeletonRow,
  Text,
} from '@/components/ui';
import { BudgetRow } from '@/components/budgets/BudgetRow';
import type { BudgetProgress } from '@/api/types';
import { useTheme, type TypeVariant } from '@/theme';
import { RUPEE, applyAmountKey, formatAmountInput } from '@/utils/currency';

const TYPE_SAMPLES: { variant: TypeVariant; label: string }[] = [
  { variant: 'display', label: 'Display' },
  { variant: 'h1', label: 'Heading 1' },
  { variant: 'h2', label: 'Heading 2' },
  { variant: 'h3', label: 'Heading 3' },
  { variant: 'body', label: 'Body' },
  { variant: 'label', label: 'Label' },
  { variant: 'caption', label: 'Caption' },
  { variant: 'overline', label: 'Overline' },
];

/**
 * The three states a budget bar can be in, side by side. Colour carries the
 * meaning here, so a change to the palette has to be checked against all three
 * at once rather than one at a time on a real screen.
 */
const BUDGET_SAMPLES: BudgetProgress[] = [
  {
    id: 'on-track',
    scope: 'category',
    categoryId: 'c1',
    categoryName: 'Transport',
    categoryIcon: 'transport',
    categoryColor: 'transport',
    amount: 300000,
    spent: 210000,
    remaining: 90000,
    overBy: 0,
    percent: 70,
    warnAtPercent: 80,
    state: 'on_track',
    isActive: true,
  },
  {
    id: 'warning',
    scope: 'category',
    categoryId: 'c2',
    categoryName: 'Shopping',
    categoryIcon: 'shopping',
    categoryColor: 'shopping',
    amount: 500000,
    spent: 380000,
    remaining: 120000,
    overBy: 0,
    percent: 76,
    warnAtPercent: 75,
    state: 'warning',
    isActive: true,
  },
  {
    id: 'exceeded',
    scope: 'category',
    categoryId: 'c3',
    categoryName: 'Food',
    categoryIcon: 'food',
    categoryColor: 'food',
    amount: 700000,
    spent: 770000,
    remaining: 0,
    overBy: 70000,
    percent: 110,
    warnAtPercent: 80,
    state: 'exceeded',
    isActive: true,
  },
];

type StateDemo = 'loading' | 'empty' | 'error';

const STATE_OPTIONS = [
  { value: 'loading' as const, label: 'Loading' },
  { value: 'empty' as const, label: 'Empty' },
  { value: 'error' as const, label: 'Error' },
];

/**
 * Component gallery.
 *
 * Every primitive rendered in one place, in both themes, so regressions in
 * spacing, contrast or press behaviour are visible without hunting through the
 * product screens. Reachable from Settings.
 */
export function DesignSystemScreen() {
  const theme = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stateDemo, setStateDemo] = useState<StateDemo>('loading');
  const [email, setEmail] = useState('');
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [amount, setAmount] = useState('1248');
  const [day, setDay] = useState(() => new Date());

  return (
    <Screen topInset={false} bottomInset={theme.spacing.xxl} testID="design-system-screen">
      <View style={{ marginTop: theme.spacing.sm }}>
        <SectionHeader title="Typography" />
        <Card radius="xl">
          <View style={{ gap: theme.spacing.lg }}>
            {TYPE_SAMPLES.map((sample) => (
              <View key={sample.variant} style={{ gap: 2 }}>
                <Text variant="caption" tone="tertiary">
                  {sample.variant}
                </Text>
                <Text variant={sample.variant} numberOfLines={1}>
                  {sample.label}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </View>

      <View style={{ marginTop: theme.spacing.xxxl }}>
        <SectionHeader title="Buttons" />
        <Card radius="xl">
          <View style={{ gap: theme.spacing.md }}>
            <Button label="Primary" onPress={() => {}} fullWidth />
            <Button label="Brand" variant="brand" onPress={() => {}} fullWidth />
            <Button label="Secondary" variant="secondary" onPress={() => {}} fullWidth />
            <Button label="Tonal" variant="tonal" onPress={() => {}} fullWidth />
            <Button label="Ghost" variant="ghost" onPress={() => {}} fullWidth />
            <Button label="Destructive" variant="destructive" onPress={() => {}} fullWidth />

            <View style={{ flexDirection: 'row', gap: theme.spacing.md, flexWrap: 'wrap' }}>
              <Button label="Small" size="sm" variant="secondary" onPress={() => {}} />
              <Button label="With icon" size="sm" leftIcon="plus" onPress={() => {}} />
              <Button label="Disabled" size="sm" variant="secondary" disabled onPress={() => {}} />
              <Button
                label={loadingDemo ? 'Saving' : 'Show loading'}
                size="sm"
                variant="tonal"
                loading={loadingDemo}
                onPress={() => {
                  setLoadingDemo(true);
                  setTimeout(() => setLoadingDemo(false), 1600);
                }}
              />
            </View>
          </View>
        </Card>
      </View>

      <View style={{ marginTop: theme.spacing.xxxl }}>
        <SectionHeader title="Inputs" />
        <Card radius="xl">
          <View style={{ gap: theme.spacing.lg }}>
            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              leftIcon="user"
              keyboardType="email-address"
              autoCapitalize="none"
              helperText="We never share this."
            />
            <Input
              label="UPI ID"
              placeholder="name@bank"
              defaultValue="not-a-upi-id"
              error="That does not look like a valid UPI ID"
            />
            <Input label="PIN" placeholder="Enter PIN" secure keyboardType="number-pad" />
            <Input label="Disabled" placeholder="Read only" editable={false} />
          </View>
        </Card>
      </View>

      <View style={{ marginTop: theme.spacing.xxxl }}>
        <SectionHeader title="Badges" />
        <Card radius="xl">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Badge label="Neutral" />
            <Badge label="Brand" tone="brand" />
            <Badge label="On track" tone="positive" />
            <Badge label="Over budget" tone="negative" />
            <Badge label="Due soon" tone="warning" />
            <Badge label="Recurring" tone="info" />
          </View>
        </Card>
      </View>

      <View style={{ marginTop: theme.spacing.xxxl }}>
        <SectionHeader title="States" />
        <SegmentedControl
          options={STATE_OPTIONS}
          value={stateDemo}
          onChange={setStateDemo}
          accessibilityLabel="State preview"
          style={{ marginBottom: theme.spacing.lg }}
        />
        <Card radius="xl" padding={0}>
          <View style={{ minHeight: 280, justifyContent: 'center' }}>
            {stateDemo === 'loading' ? <LoadingState label="Loading transactions" /> : null}
            {stateDemo === 'empty' ? (
              <EmptyState
                icon="inbox"
                title="Nothing here yet"
                description="When there is something to show, it appears in this space."
                action={{ label: 'Add something', onPress: () => {} }}
              />
            ) : null}
            {stateDemo === 'error' ? (
              <ErrorState
                icon="wifiOff"
                title="No connection"
                description="We could not reach the server. Check your network and try again."
                onRetry={() => {}}
              />
            ) : null}
          </View>
        </Card>
      </View>

      <View style={{ marginTop: theme.spacing.xxxl }}>
        <SectionHeader title="Skeletons" />
        <Card radius="xl">
          <Skeleton width="45%" height={26} />
          <View style={{ height: theme.spacing.lg }} />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      </View>

      <View style={{ marginTop: theme.spacing.xxxl }}>
        <SectionHeader title="Amount keypad" />
        <Card radius="xl">
          <Text variant="displayLg" align="center" numberOfLines={1} adjustsFontSizeToFit>
            {`${RUPEE}${formatAmountInput(amount)}`}
          </Text>
          <Keypad
            onKey={(key) => setAmount((current) => applyAmountKey(current, key))}
            onLongBackspace={() => setAmount('')}
            style={{ marginTop: theme.spacing.lg }}
          />
        </Card>
      </View>

      <View style={{ marginTop: theme.spacing.xxxl }}>
        <SectionHeader title="Budget states" />
        <Card padding={0} radius="xl">
          <View style={{ paddingHorizontal: theme.spacing.lg }}>
            {BUDGET_SAMPLES.map((budget) => (
              <BudgetRow key={budget.id} budget={budget} />
            ))}
          </View>
        </Card>
      </View>

      <View style={{ marginTop: theme.spacing.xxxl }}>
        <SectionHeader title="Calendar" />
        <Card radius="xl">
          <Calendar value={day} onChange={setDay} />
        </Card>
      </View>

      <View style={{ marginTop: theme.spacing.xxxl }}>
        <SectionHeader title="Bottom sheet" />
        <Button
          label="Open a sheet"
          variant="secondary"
          leftIcon="chevronUp"
          fullWidth
          onPress={() => setSheetOpen(true)}
        />
      </View>

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Bottom sheet"
        subtitle="Drag the handle down, or tap outside"
        footer={
          <Button label="Got it" variant="brand" size="lg" fullWidth onPress={() => setSheetOpen(false)} />
        }
      >
        <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
          <Text variant="body" tone="secondary">
            Sheets spring in, respect the safe area, move out of the keyboard&rsquo;s way and close
            on a downward flick or a tap on the scrim.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="info" size={17} color={theme.colors.info} />
            <Text variant="bodySm" tone="tertiary" style={{ flex: 1 }}>
              The Android back button closes them too.
            </Text>
          </View>
        </View>
      </BottomSheet>
    </Screen>
  );
}
