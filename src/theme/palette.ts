/**
 * Raw colour values. Nothing in the app should import these directly — they exist
 * only so that `colors.ts` can compose semantic tokens from a single source of
 * truth.
 *
 * The app is dark-only and ships three accents. An accent is not just a brand
 * colour: it tints the whole neutral ramp, so a violet build has violet-cast
 * greys and a green build has green-cast greys. That tint is most of what makes
 * each one feel deliberate rather than recoloured.
 */

export type AccentId = 'violet' | 'green' | 'red';

export type AccentSpec = {
  id: AccentId;
  label: string;

  /** Canvas → card → nested card → muted fill → pressed → strong border. */
  ink: {
    canvas: string;
    surface: string;
    elevated: string;
    muted: string;
    strong: string;
    border: string;
  };

  textSecondary: string;
  textTertiary: string;

  /** Solid brand fill. */
  brand: string;
  brandPressed: string;
  /** Brand as text or an icon on a dark surface — lighter than `brand`. */
  brandText: string;
  brandSurface: string;
  brandGlow: string;
  /**
   * Text that sits on a `brand` fill. Green is too light to carry white text, so
   * it takes near-black; the other two take white.
   */
  textOnAccent: string;

  /** The balance card: a deeper slab the rest of the screen sits under. */
  heroSurface: string;
  heroSurfaceEnd: string;
  heroTile: string;
  heroBorder: string;
  heroTextMuted: string;
};

export const accents: Record<AccentId, AccentSpec> = {
  violet: {
    id: 'violet',
    label: 'Violet',
    ink: {
      canvas: '#07060F',
      surface: '#110F1D',
      elevated: '#171426',
      muted: '#1E1A30',
      strong: '#262138',
      border: '#332C48',
    },
    textSecondary: '#A29CBD',
    textTertiary: '#837CA0',
    brand: '#7856F0',
    brandPressed: '#6A46E0',
    brandText: '#9B84FF',
    brandSurface: '#1C1638',
    brandGlow: 'rgba(155, 132, 255, 0.16)',
    textOnAccent: '#FFFFFF',
    heroSurface: '#221A4A',
    heroSurfaceEnd: '#150F2E',
    heroTile: '#291F55',
    heroBorder: 'rgba(155, 132, 255, 0.18)',
    heroTextMuted: '#A9A1CC',
  },

  green: {
    id: 'green',
    label: 'Emerald',
    ink: {
      canvas: '#040C09',
      surface: '#0A1712',
      elevated: '#0E1F18',
      muted: '#122922',
      strong: '#173028',
      border: '#1E3C32',
    },
    textSecondary: '#8FA69C',
    textTertiary: '#6B837A',
    brand: '#00E28C',
    brandPressed: '#00C97C',
    brandText: '#00E28C',
    brandSurface: '#0C2B20',
    brandGlow: 'rgba(0, 226, 140, 0.16)',
    // Mint is far too light for white text; near-black on it reads at 11:1.
    textOnAccent: '#04120C',
    heroSurface: '#0B2119',
    heroSurfaceEnd: '#071510',
    heroTile: '#0E241B',
    heroBorder: 'rgba(0, 226, 140, 0.16)',
    heroTextMuted: '#8FA69C',
  },

  red: {
    id: 'red',
    label: 'Crimson',
    ink: {
      canvas: '#0E0608',
      surface: '#1A1013',
      elevated: '#22161A',
      muted: '#2B1D22',
      strong: '#35252A',
      border: '#453137',
    },
    textSecondary: '#C6A8AE',
    textTertiary: '#A0787F',
    brand: '#D12B40',
    brandPressed: '#B81F33',
    brandText: '#FF7A88',
    brandSurface: '#2E1219',
    brandGlow: 'rgba(255, 122, 136, 0.16)',
    textOnAccent: '#FFFFFF',
    heroSurface: '#3A1520',
    heroSurfaceEnd: '#1F0C12',
    heroTile: '#441A26',
    heroBorder: 'rgba(255, 122, 136, 0.18)',
    heroTextMuted: '#C6A8AE',
  },
};

export const accentList: readonly AccentSpec[] = [accents.violet, accents.green, accents.red];

/**
 * Direction of money. Shared by every accent and never used decoratively — a green
 * chip that does not mean income is a bug.
 */
export const money = {
  in: '#2BD98C',
  inSurface: 'rgba(43, 217, 140, 0.14)',
  out: '#FF5F6D',
  outSurface: 'rgba(255, 95, 109, 0.14)',
} as const;

export const amber = { base: '#FFB020', surface: 'rgba(255, 176, 32, 0.14)' } as const;
export const blue = { base: '#4C8DFF', surface: 'rgba(76, 141, 255, 0.14)' } as const;

/**
 * Chart and category hues, shared by every accent so a chart reads the same way
 * whichever brand colour is active.
 */
export const categoryHues = {
  food: '#2BD98C',
  rent: '#FFB020',
  transport: '#4C8DFF',
  shopping: '#FF6FB5',
  bills: '#FF5F6D',
  health: '#FF8A5B',
  entertainment: '#C77DFF',
  education: '#38BDF8',
  investment: '#9B84FF',
  income: '#2BD98C',
  transfer: '#8D86A8',
  other: '#6E6690',

  /**
   * The remaining groups in the default category tree.
   *
   * Two are new hues — lime for groceries, teal for travel — chosen to sit in the
   * gaps this wheel already leaves. The rest are deliberate aliases: Home *is* the
   * bills group, Financial *is* investments, and Personal leads with education, so
   * giving each its own near-duplicate colour would make a chart harder to read
   * rather than more informative.
   *
   * Alcohol takes the amber that Home no longer needs, which also happens to be
   * the colour of the thing.
   */
  grocery: '#8ED04E',
  travel: '#2DD4BF',
  home: '#FF5F6D',
  alcohol: '#FFB020',
  financial: '#9B84FF',
  personal: '#38BDF8',
} as const;

export type CategoryHue = keyof typeof categoryHues;

/**
 * Quick-action tiles on Home. `glyph` says whether the fill needs a dark mark.
 *
 * `expense` is the primary action, so it follows the active accent rather than a
 * fixed hue — see `QuickActions`. Its entry here is only the fallback.
 */
export const actionHues: Record<string, { fill: string; glyph: 'dark' | 'light' }> = {
  expense: { fill: '#7856F0', glyph: 'light' },
  income: { fill: '#12905A', glyph: 'light' },
  transfer: { fill: '#FFB020', glyph: 'dark' },
  accounts: { fill: '#4C8DFF', glyph: 'light' },
};

export type ActionHue = keyof typeof actionHues;

/**
 * Merchant monogram tints. Picked deterministically from the merchant name so a
 * given brand always gets the same colour without shipping anyone's trademark.
 */
export const merchantTints: readonly { fill: string; text: string }[] = [
  { fill: '#2BD98C', text: '#04120C' },
  { fill: '#FFB020', text: '#1A1205' },
  { fill: '#FF6FB5', text: '#2A0A1B' },
  { fill: '#4C8DFF', text: '#04101F' },
  { fill: '#C77DFF', text: '#1B0A2A' },
  { fill: '#FF8A5B', text: '#2A1108' },
  { fill: '#38BDF8', text: '#04141F' },
  { fill: '#FF5F6D', text: '#2A0A0E' },
];
