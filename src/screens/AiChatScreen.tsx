import { useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  errorMessage,
  isNetworkError,
  SUGGESTED_QUESTIONS,
  useAiChat,
  useAiStatus,
  useAskAi,
  useClearAiChat,
  type AiChatMessage,
} from '@/api';
import { ChatBubble, SuggestionChips, ThinkingBubble } from '@/components/insights';
import {
  Button,
  Card,
  Icon,
  IconButton,
  Input,
  Skeleton,
  Text,
} from '@/components/ui';
import { DateRangeSheet } from '@/screens/sheets/DateRangeSheet';
import { useTheme } from '@/theme';
import { errorFeedback, tapFeedback } from '@/utils/haptics';
import { periodRange, type PeriodSelection } from '@/utils/period';

/** Long enough for any real question, short enough to keep a prompt cheap. */
const MAX_QUESTION = 300;

/** Room for the composer to grow before it starts scrolling internally. */
const COMPOSER_MAX_HEIGHT = 112;

/**
 * The assistant.
 *
 * Every answer here follows the same path: the server resolves what is being
 * asked, queries MongoDB for the figures itself, and only then asks the model to
 * put those figures into a sentence. The model never sees a raw balance to add up
 * and never chooses a number — a reply containing any figure the server did not
 * compute is rejected and replaced with the server's own wording, which is what
 * the "Computed" badge under a bubble means.
 *
 * So this screen is a view onto real data with a friendlier grammar, not a
 * chatbot that happens to talk about money.
 */
export function AiChatScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const [draft, setDraft] = useState('');
  const [selection, setSelection] = useState<PeriodSelection>({ period: 'month' });
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeSession, setRangeSession] = useState(0);

  const range = useMemo(() => periodRange(selection), [selection]);

  const statusQuery = useAiStatus();
  const chatQuery = useAiChat();
  const ask = useAskAi();
  const clear = useClearAiChat();

  const messages: AiChatMessage[] = chatQuery.data ?? [];

  /**
   * The question in flight, echoed immediately.
   *
   * Taken from the mutation rather than held in its own state: the server writes
   * both turns of the transcript, so the moment it answers, the history query is
   * the single source of truth and this disappears on its own. Two copies of the
   * same message would eventually disagree.
   */
  const lastAsked = ask.variables?.question ?? null;
  const pending = ask.isPending ? lastAsked : null;

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const send = useCallback(
    (question: string) => {
      const text = question.trim();
      if (!text || ask.isPending) return;

      tapFeedback();
      setDraft('');
      ask.mutate(
        {
          question: text,
          from: range.from,
          to: range.to,
          previousFrom: range.previousFrom,
          previousTo: range.previousTo,
          label: range.label,
        },
        {
          onError: () => errorFeedback(),
          onSettled: () => requestAnimationFrame(scrollToEnd),
        },
      );
      requestAnimationFrame(scrollToEnd);
    },
    [ask, range, scrollToEnd],
  );

  function confirmClear() {
    Alert.alert('Clear this conversation?', 'The messages are deleted. Your data is untouched.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clear.mutate();
          ask.reset();
        },
      },
    ]);
  }

  function openRangeSheet() {
    setRangeSession((current) => current + 1);
    setRangeOpen(true);
  }

  const empty = messages.length === 0 && !pending && !chatQuery.isLoading;
  const canSend = draft.trim().length > 0 && !ask.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ---------------------------------------------------------- header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingTop: insets.top + theme.spacing.sm,
            paddingBottom: theme.spacing.md,
            paddingHorizontal: theme.spacing.sm,
            borderBottomWidth: theme.layout.hairline,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.background,
          }}
        >
          <IconButton
            name="chevronLeft"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
          />

          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="h3" numberOfLines={1}>
              Assistant
            </Text>
            {/* The window every answer is scoped to, on screen rather than
                assumed. "How much did I spend" is meaningless without it. */}
            <Text
              variant="caption"
              tone="tertiary"
              numberOfLines={1}
              onPress={openRangeSheet}
              accessibilityRole="button"
              accessibilityHint="Change the period answers cover"
            >
              {`Answers cover ${range.label}  ·  Change`}
            </Text>
          </View>

          {messages.length > 0 ? (
            <IconButton
              name="close"
              accessibilityLabel="Clear conversation"
              onPress={confirmClear}
              disabled={clear.isPending}
            />
          ) : null}
        </View>

        {/* -------------------------------------------------------- transcript */}
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
          contentContainerStyle={{
            flexGrow: 1,
            gap: theme.spacing.lg,
            padding: theme.layout.screenGutter,
            paddingBottom: theme.spacing.xl,
            width: '100%',
            maxWidth: theme.layout.maxContentWidth,
            alignSelf: 'center',
          }}
        >
          {chatQuery.isLoading ? (
            <View style={{ gap: theme.spacing.lg }}>
              <Skeleton height={44} radius={theme.radius.md} width="60%" />
              <Skeleton height={72} radius={theme.radius.md} />
            </View>
          ) : null}

          {empty ? (
            <Welcome
              unavailable={statusQuery.data ? !statusQuery.data.available : false}
              onSelect={send}
            />
          ) : null}

          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}

          {pending ? (
            <>
              <ChatBubble
                message={{
                  id: 'pending',
                  role: 'user',
                  text: pending,
                  context: { intent: 'pending', periodLabel: range.label },
                  fromModel: false,
                  limitedData: false,
                  createdAt: '',
                }}
              />
              <ThinkingBubble />
            </>
          ) : null}

          {ask.isError ? (
            <Card variant="outlined" radius="md" padding="lg" style={{ gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Icon
                  name={isNetworkError(ask.error) ? 'wifiOff' : 'alertTriangle'}
                  size={17}
                  color={theme.colors.negative}
                />
                <Text variant="bodySm" tone="secondary" style={{ flex: 1, minWidth: 0 }}>
                  {isNetworkError(ask.error)
                    ? 'No connection, so that question never reached your data.'
                    : errorMessage(ask.error)}
                </Text>
              </View>
              {lastAsked ? (
                <Button
                  label="Try again"
                  variant="secondary"
                  size="sm"
                  onPress={() => send(lastAsked)}
                />
              ) : null}
            </Card>
          ) : null}
        </ScrollView>

        {/* ---------------------------------------------------------- composer */}
        <View
          style={{
            borderTopWidth: theme.layout.hairline,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            paddingTop: theme.spacing.md,
            paddingBottom: Math.max(insets.bottom, theme.spacing.md),
          }}
        >
          {/* Follow-ups, offered only while the box is empty so they never
              compete with something half-typed. */}
          {!empty && draft.length === 0 ? (
            <SuggestionChips
              questions={SUGGESTED_QUESTIONS.slice(0, 4)}
              onSelect={send}
              disabled={ask.isPending}
              style={{ marginBottom: theme.spacing.md }}
            />
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: theme.spacing.sm,
              paddingHorizontal: theme.layout.screenGutter,
              width: '100%',
              maxWidth: theme.layout.maxContentWidth,
              alignSelf: 'center',
            }}
          >
            <Input
              ref={inputRef}
              containerStyle={{ flex: 1, minWidth: 0, maxHeight: COMPOSER_MAX_HEIGHT }}
              placeholder="Ask about your money"
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={MAX_QUESTION}
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={() => send(draft)}
              editable={!ask.isPending}
            />

            <IconButton
              name="arrowUpRight"
              accessibilityLabel="Send question"
              variant="tonal"
              size="lg"
              color={canSend ? theme.colors.brand : theme.colors.textTertiary}
              disabled={!canSend}
              onPress={() => send(draft)}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      <DateRangeSheet
        key={rangeSession}
        visible={rangeOpen}
        value={selection}
        onClose={() => setRangeOpen(false)}
        onApply={(next) => {
          setSelection(next);
          setRangeOpen(false);
        }}
      />
    </View>
  );
}

/**
 * The opening screen of the conversation.
 *
 * It states the boundary before the first question rather than after a
 * disappointing answer: this reads your transactions and will not guess, and it
 * does not give investment advice.
 */
function Welcome({ unavailable, onSelect }: { unavailable: boolean; onSelect: (q: string) => void }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.sm }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brandSurface,
          }}
        >
          <Icon name="sparkles" size={22} color={theme.colors.brandText} strokeWidth={2} />
        </View>
        <Text variant="h2">Ask about your money</Text>
        <Text variant="body" tone="secondary" style={{ lineHeight: 23 }}>
          Every answer is worked out from your own transactions before it is written
          — no estimates, no guesses, and no investment advice.
        </Text>
      </View>

      {unavailable ? (
        <Card variant="muted" radius="md" padding="lg">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="info" size={15} color={theme.colors.textTertiary} />
            <Text variant="caption" tone="tertiary" style={{ flex: 1, minWidth: 0 }}>
              The language model is not configured on this server, so answers come
              back in the app&apos;s own wording. The figures are the same.
            </Text>
          </View>
        </Card>
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        <Text variant="labelSm" tone="tertiary">
          TRY ASKING
        </Text>
        <SuggestionChips questions={SUGGESTED_QUESTIONS} onSelect={onSelect} layout="wrap" />
      </View>
    </View>
  );
}
