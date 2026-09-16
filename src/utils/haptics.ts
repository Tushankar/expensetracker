import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics are iOS/Android only and should never be able to break a press handler,
 * so every call is fire-and-forget with the rejection swallowed.
 */
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

function safely(run: () => Promise<void>) {
  if (!enabled) return;
  void run().catch(() => {
    // A device without a taptic engine is not an error worth surfacing.
  });
}

/** Light tick. Buttons, tab changes, sheet handles. */
export function tapFeedback() {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Slightly heavier. Reserved for the primary add action. */
export function mediumFeedback() {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function successFeedback() {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function errorFeedback() {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
