import { create } from 'zustand';

import type { AccentId } from '@/theme/palette';

type AccentState = {
  accent: AccentId;
  setAccent: (accent: AccentId) => void;
};

/**
 * Which accent the app is wearing. In memory for now — wrap with zustand's
 * `persist` middleware once a storage layer lands and nothing else changes.
 */
export const useAccentStore = create<AccentState>((set) => ({
  accent: 'violet',
  setAccent: (accent) => set({ accent }),
}));
