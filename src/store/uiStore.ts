import { create } from 'zustand';

import type { PaymentMethod, Transaction, TransactionType } from '@/api/types';

export type EntrySheetState =
  | { mode: 'closed' }
  | { mode: 'create'; type: TransactionType }
  | { mode: 'edit'; transaction: Transaction };

type UiState = {
  entrySheet: EntrySheetState;
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

  openAddSheet: (type = 'expense') => set({ entrySheet: { mode: 'create', type } }),
  openEditSheet: (transaction) => set({ entrySheet: { mode: 'edit', transaction } }),
  closeEntrySheet: () => set({ entrySheet: { mode: 'closed' } }),

  lastUsed: {},
  rememberChoice: (type, choice) =>
    set((state) => ({
      lastUsed: { ...state.lastUsed, [type]: { ...state.lastUsed[type], ...choice } },
    })),
}));
