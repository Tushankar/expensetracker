import { create } from 'zustand';

import type { PaymentMethod, Transaction, TransactionType } from '@/api/types';

export type EntrySheetState =
  | { mode: 'closed' }
  | { mode: 'create'; type: TransactionType }
  | { mode: 'edit'; transaction: Transaction };

/** A one-off confirmation. Null when nothing is being announced. */
export type ToastState = {
  id: number;
  message: string;
  detail?: string;
  tone?: 'success' | 'error' | 'neutral';
} | null;

type UiState = {
  entrySheet: EntrySheetState;
  /**
   * Bumped every time the sheet opens, and used as its React `key`.
   *
   * Remounting on open is how the form starts empty without an effect that resets
   * a dozen `useState`s — and because the counter only changes on the way *in*,
   * the closing animation still plays over the form the user was just looking at
   * rather than over a blank one.
   */
  entrySession: number;
  openAddSheet: (type?: TransactionType) => void;
  openEditSheet: (transaction: Transaction) => void;
  closeEntrySheet: () => void;

  /**
   * What the entry sheet pre-fills, remembered per transaction type.
   *
   * Most people's spending is repetitive: the same UPI app, the same bank account,
   * a handful of categories. Defaulting to whatever was used last turns the
   * common case into "type the amount, tap save" and leaves the pickers for the
   * times it is actually a different kind of spend.
   */
  lastUsed: Partial<
    Record<
      TransactionType,
      { categoryId?: string; accountId?: string; destinationAccountId?: string; paymentMethod?: PaymentMethod }
    >
  >;
  rememberChoice: (
    type: TransactionType,
    choice: {
      categoryId?: string;
      accountId?: string;
      destinationAccountId?: string;
      paymentMethod?: PaymentMethod;
    },
  ) => void;

  /**
   * The last confirmation, if any.
   *
   * Lives here rather than in the sheet because the sheet is unmounting at the
   * moment it has something to say: "saved" has to outlive the screen that saved
   * it, or it never appears at all.
   */
  toast: ToastState;
  showToast: (toast: { message: string; detail?: string; tone?: 'success' | 'error' | 'neutral' }) => void;
  dismissToast: () => void;
};

/**
 * Transient UI that more than one part of the tree needs to read or drive.
 *
 * The entry sheet is triggered from the tab bar but has to render above the whole
 * navigator, so its state cannot live in either place — it lives here and the
 * sheet is mounted once at the app root.
 */
export const useUiStore = create<UiState>((set) => ({
  entrySheet: { mode: 'closed' },
  entrySession: 0,

  openAddSheet: (type = 'expense') =>
    set((state) => ({
      entrySheet: { mode: 'create', type },
      entrySession: state.entrySession + 1,
    })),
  openEditSheet: (transaction) =>
    set((state) => ({
      entrySheet: { mode: 'edit', transaction },
      entrySession: state.entrySession + 1,
    })),
  closeEntrySheet: () => set({ entrySheet: { mode: 'closed' } }),

  toast: null,
  // The id forces a remount, so a second confirmation restarts the animation
  // instead of inheriting the first one's half-finished timer.
  showToast: (toast) => set({ toast: { ...toast, id: Date.now() } }),
  dismissToast: () => set({ toast: null }),

  lastUsed: {},
  rememberChoice: (type, choice) =>
    set((state) => ({
      lastUsed: { ...state.lastUsed, [type]: { ...state.lastUsed[type], ...choice } },
    })),
}));
