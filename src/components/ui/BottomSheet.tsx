import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Pinned below the scroll area — the place for the sheet's primary action. */
  footer?: ReactNode;
  /** Fraction of screen height the sheet may grow to. */
  maxHeightRatio?: number;
  /** Hide the grabber when the sheet is not meant to be swiped away. */
  showHandle?: boolean;
  /** Set false for destructive confirmations that need an explicit choice. */
  dismissOnBackdropPress?: boolean;
  /**
   * Controls beside the close button — usually one or two `IconButton`s.
   *
   * For alternative ways into the same sheet rather than for actions: the entry
   * sheet uses it to offer typing or a photograph without spending a row of the
   * body on either, which would slow the path it is built for.
   */
  headerAction?: ReactNode;
};

/** Drag distance past which the sheet closes instead of springing back. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

/**
 * The app's modal surface: a spring-in sheet with a drag-to-dismiss grabber and a
 * tappable scrim.
 *
 * It owns its own mount lifecycle. `visible` going false starts the exit animation
 * and only then unmounts the native `Modal`, otherwise the sheet would vanish
 * instantly instead of sliding away.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeightRatio = 0.9,
  showHandle = true,
  dismissOnBackdropPress = true,
  headerAction,
}: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const [mounted, setMounted] = useState(visible);

  const translateY = useSharedValue(screenHeight);
  const backdrop = useSharedValue(0);
  const dragStart = useSharedValue(0);

  const unmount = useCallback(() => setMounted(false), []);

  // Mount during render rather than from an effect. React's documented pattern for
  // reacting to a prop change, and it avoids the extra commit an effect would cost
  // on every open.
  if (visible && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    // Entry is driven by the Modal's onShow; this effect only handles the exit.
    if (visible) return;
    // Play the exit, then unmount from the animation callback.
    backdrop.value = withTiming(0, { duration: theme.duration.fast });
    translateY.value = reduceMotion
      ? withTiming(screenHeight, { duration: 0 }, () => runOnJS(unmount)())
      : withTiming(
          screenHeight,
          { duration: theme.duration.base, easing: theme.easing.accelerate },
          (finished) => {
            if (finished) runOnJS(unmount)();
          },
        );
  }, [
    backdrop,
    reduceMotion,
    screenHeight,
    theme.duration.base,
    theme.duration.fast,
    theme.easing.accelerate,
    translateY,
    unmount,
    visible,
  ]);

  // Runs once the Modal is actually on screen, so the entrance is never dropped.
  const handleShow = useCallback(() => {
    backdrop.value = withTiming(1, { duration: theme.duration.base });
    translateY.value = reduceMotion
      ? withTiming(0, { duration: 0 })
      : withSpring(0, theme.spring.sheet);
  }, [backdrop, reduceMotion, theme.duration.base, theme.spring.sheet, translateY]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStart.value = translateY.value;
    })
    .onUpdate((event) => {
      // Downward only — dragging up must not detach the sheet from the bottom.
      translateY.value = Math.max(0, dragStart.value + event.translationY);
    })
    .onEnd((event) => {
      const shouldDismiss =
        event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, theme.spring.sheet);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!mounted) return null;

  const header = title || showHandle;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onShow={handleShow}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      {/* A Modal is a separate native root on Android, so gestures inside it need
          their own provider. */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFill, backdropStyle, { backgroundColor: theme.colors.overlay }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissOnBackdropPress ? onClose : undefined}
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityHint="Dismisses the sheet"
          />
        </Animated.View>

        <KeyboardAvoidingView
          // Android resizes the modal window itself; adding padding would double up.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
          pointerEvents="box-none"
        >
          <Animated.View
            accessibilityViewIsModal
            style={[
              sheetStyle,
              styles.sheet,
              theme.shadows.lg,
              {
                backgroundColor: theme.colors.surface,
                borderTopLeftRadius: theme.radius.xxl,
                borderTopRightRadius: theme.radius.xxl,
                maxHeight: screenHeight * maxHeightRatio,
                paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
              },
            ]}
          >
            {header ? (
              <GestureDetector gesture={panGesture}>
                <View style={{ paddingHorizontal: theme.spacing.xl }}>
                  {showHandle ? (
                    <View style={styles.handleRow}>
                      <View
                        style={{
                          width: 40,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: theme.colors.borderStrong,
                        }}
                      />
                    </View>
                  ) : (
                    <View style={{ height: theme.spacing.lg }} />
                  )}

                  {title ? (
                    <View style={[styles.titleRow, { marginBottom: theme.spacing.lg }]}>
                      <View style={styles.titleText}>
                        <Text variant="h2" numberOfLines={1}>
                          {title}
                        </Text>
                        {subtitle ? (
                          <Text variant="bodySm" tone="secondary" style={{ marginTop: 2 }}>
                            {subtitle}
                          </Text>
                        ) : null}
                      </View>
                      {headerAction}
                      <IconButton
                        name="close"
                        onPress={onClose}
                        accessibilityLabel="Close"
                        variant="tonal"
                        size="sm"
                      />
                    </View>
                  ) : null}
                </View>
              </GestureDetector>
            ) : null}

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={{ paddingHorizontal: theme.spacing.xl }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {children}
            </ScrollView>

            {footer ? (
              <View
                style={{
                  paddingHorizontal: theme.spacing.xl,
                  paddingTop: theme.spacing.lg,
                }}
              >
                {footer}
              </View>
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  keyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', overflow: 'hidden' },
  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titleText: { flex: 1 },
  scroll: { flexGrow: 0 },
});
