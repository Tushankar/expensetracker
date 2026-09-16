import { create } from 'zustand';

type UiState = {
  /** The global "add transaction" sheet. Opened from the tab bar's centre button. */
  addSheetOpen: boolean;
  openAddSheet: () => void;
  closeAddSheet: () => void;
};

/**
 * Transient UI that more than one part of the tree needs to read or drive.
 *
 * The add sheet is triggered from the tab bar but has to render above the whole
 * navigator, so its state cannot live in either place — it lives here and the sheet
 * is mounted once at the app root.
 */
export const useUiStore = create<UiState>((set) => ({
  addSheetOpen: false,
  openAddSheet: () => set({ addSheetOpen: true }),
  closeAddSheet: () => set({ addSheetOpen: false }),
}));
