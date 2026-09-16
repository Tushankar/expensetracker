/**
 * Icon geometry, all drawn on a 24x24 grid with a 2px stroke, round caps and
 * round joins. Keeping every icon on one grid and one stroke weight is what makes
 * a line-icon set look bought rather than assembled.
 *
 * Shapes are plain data — `Icon.tsx` turns them into react-native-svg elements and
 * applies colour/stroke, so nothing here hard-codes a theme value.
 */

export type IconShape =
  | { t: 'path'; d: string }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number };

export const iconRegistry = {
  // ---------------------------------------------------------------- navigation
  home: [
    { t: 'path', d: 'M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { t: 'path', d: 'M9.5 22v-7.5h5V22' },
  ],
  list: [
    { t: 'path', d: 'M8 6h13' },
    { t: 'path', d: 'M8 12h13' },
    { t: 'path', d: 'M8 18h13' },
    { t: 'path', d: 'M3.5 6h.01' },
    { t: 'path', d: 'M3.5 12h.01' },
    { t: 'path', d: 'M3.5 18h.01' },
  ],
  pieChart: [
    { t: 'path', d: 'M21.2 15.9A10 10 0 1 1 8 2.8' },
    { t: 'path', d: 'M22 12A10 10 0 0 0 12 2v10z' },
  ],
  sparkles: [
    {
      t: 'path',
      d: 'M12 3 10.4 8a2 2 0 0 1-1.3 1.3L4 11l5.1 1.6A2 2 0 0 1 10.4 14L12 19l1.6-5a2 2 0 0 1 1.3-1.3L20 11l-5.1-1.7A2 2 0 0 1 13.6 8z',
    },
    { t: 'path', d: 'M19 3v3' },
    { t: 'path', d: 'M20.5 4.5h-3' },
    { t: 'path', d: 'M5 18v3' },
    { t: 'path', d: 'M6.5 19.5h-3' },
  ],

  // ------------------------------------------------------------------ controls
  plus: [
    { t: 'path', d: 'M12 5v14' },
    { t: 'path', d: 'M5 12h14' },
  ],
  minus: [{ t: 'path', d: 'M5 12h14' }],
  close: [
    { t: 'path', d: 'M18 6 6 18' },
    { t: 'path', d: 'M6 6l12 12' },
  ],
  check: [{ t: 'path', d: 'M20 6 9 17l-5-5' }],
  chevronRight: [{ t: 'path', d: 'M9 18l6-6-6-6' }],
  chevronLeft: [{ t: 'path', d: 'M15 18l-6-6 6-6' }],
  chevronDown: [{ t: 'path', d: 'M6 9.5l6 6 6-6' }],
  chevronUp: [{ t: 'path', d: 'M18 14.5l-6-6-6 6' }],
  arrowLeft: [
    { t: 'path', d: 'M19 12H5' },
    { t: 'path', d: 'M12 19l-7-7 7-7' },
  ],
  arrowRight: [
    { t: 'path', d: 'M5 12h14' },
    { t: 'path', d: 'M12 5l7 7-7 7' },
  ],
  arrowUpRight: [
    { t: 'path', d: 'M7 17 17 7' },
    { t: 'path', d: 'M8 7h9v9' },
  ],
  arrowDownLeft: [
    { t: 'path', d: 'M17 7 7 17' },
    { t: 'path', d: 'M16 17H7V8' },
  ],
  more: [
    { t: 'circle', cx: 12, cy: 12, r: 1 },
    { t: 'circle', cx: 19, cy: 12, r: 1 },
    { t: 'circle', cx: 5, cy: 12, r: 1 },
  ],
  search: [
    { t: 'circle', cx: 11, cy: 11, r: 7.5 },
    { t: 'path', d: 'M21 21l-4.5-4.5' },
  ],
  filter: [{ t: 'path', d: 'M21 4H3l7.2 8.5V19l3.6 2v-8.5z' }],
  eye: [
    { t: 'path', d: 'M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7z' },
    { t: 'circle', cx: 12, cy: 12, r: 3 },
  ],
  eyeOff: [
    {
      t: 'path',
      d: 'M17.9 17.9A10.1 10.1 0 0 1 12 19.8C5.8 19.8 2 12.8 2 12.8a18.4 18.4 0 0 1 5.1-5.9m3.8-1.6A9.1 9.1 0 0 1 12 5.2c6.2 0 10 7 10 7a18.5 18.5 0 0 1-2.2 3.2m-6.7-1a3 3 0 1 1-4.2-4.3',
    },
    { t: 'path', d: 'M2 2l20 20' },
  ],
  settings: [
    { t: 'circle', cx: 12, cy: 12, r: 3 },
    {
      t: 'path',
      d: 'M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
    },
  ],
  bell: [
    { t: 'path', d: 'M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17s-2.5-2-2.5-8.5' },
    { t: 'path', d: 'M13.7 21a2 2 0 0 1-3.4 0' },
  ],
  user: [
    { t: 'path', d: 'M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21' },
    { t: 'circle', cx: 12, cy: 7.5, r: 4 },
  ],
  refresh: [
    { t: 'path', d: 'M21.5 4.5v6h-6' },
    { t: 'path', d: 'M2.5 19.5v-6h6' },
    { t: 'path', d: 'M4.6 9a8 8 0 0 1 13.2-3l3.7 4.5' },
    { t: 'path', d: 'M2.5 13.5 6.2 18a8 8 0 0 0 13.2-3' },
  ],
  calendar: [
    { t: 'rect', x: 3, y: 5, w: 18, h: 16, rx: 3 },
    { t: 'path', d: 'M16 3v4' },
    { t: 'path', d: 'M8 3v4' },
    { t: 'path', d: 'M3 10h18' },
  ],
  clock: [
    { t: 'circle', cx: 12, cy: 12, r: 9 },
    { t: 'path', d: 'M12 7v5.2l3.4 2' },
  ],
  lock: [
    { t: 'rect', x: 4, y: 10.5, w: 16, h: 10.5, rx: 3 },
    { t: 'path', d: 'M7.8 10.5V7a4.2 4.2 0 0 1 8.4 0v3.5' },
  ],
  target: [
    { t: 'circle', cx: 12, cy: 12, r: 9 },
    { t: 'circle', cx: 12, cy: 12, r: 5 },
    { t: 'circle', cx: 12, cy: 12, r: 1.4 },
  ],
  sun: [
    { t: 'circle', cx: 12, cy: 12, r: 4.2 },
    { t: 'path', d: 'M12 2v2' },
    { t: 'path', d: 'M12 20v2' },
    { t: 'path', d: 'M4.2 4.2l1.5 1.5' },
    { t: 'path', d: 'M18.3 18.3l1.5 1.5' },
    { t: 'path', d: 'M2 12h2' },
    { t: 'path', d: 'M20 12h2' },
    { t: 'path', d: 'M4.2 19.8l1.5-1.5' },
    { t: 'path', d: 'M18.3 5.7l1.5-1.5' },
  ],
  moon: [{ t: 'path', d: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' }],
  bulb: [
    {
      t: 'path',
      d: 'M9 17c-.2-1-.7-1.8-1.5-2.6A5.8 5.8 0 0 1 6 10.2a6 6 0 0 1 12 0c0 1.6-.6 3.2-1.5 4.2-.8.8-1.3 1.6-1.5 2.6',
    },
    { t: 'path', d: 'M9.5 20.5h5' },
    { t: 'path', d: 'M10.5 17h3' },
  ],
  barChart: [
    { t: 'path', d: 'M3.5 3.5v15a2 2 0 0 0 2 2h15' },
    { t: 'path', d: 'M7.5 16.5v-4.5' },
    { t: 'path', d: 'M12 16.5V8' },
    { t: 'path', d: 'M16.5 16.5v-2.5' },
  ],
  rupee: [
    { t: 'path', d: 'M6 3.5h12' },
    { t: 'path', d: 'M6 8.5h12' },
    { t: 'path', d: 'M6 13.5l8.5 7' },
    { t: 'path', d: 'M6 13.5h3.2' },
    { t: 'path', d: 'M9.2 13.5c6.4 0 6.4-10 0-10' },
  ],

  // ------------------------------------------------------------------ feedback
  alertCircle: [
    { t: 'circle', cx: 12, cy: 12, r: 9 },
    { t: 'path', d: 'M12 7.5v5' },
    { t: 'path', d: 'M12 16.5h.01' },
  ],
  alertTriangle: [
    {
      t: 'path',
      d: 'M10.3 4 2.8 17.3a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z',
    },
    { t: 'path', d: 'M12 9.5v4' },
    { t: 'path', d: 'M12 17.5h.01' },
  ],
  info: [
    { t: 'circle', cx: 12, cy: 12, r: 9 },
    { t: 'path', d: 'M12 16.5v-5' },
    { t: 'path', d: 'M12 7.5h.01' },
  ],
  checkCircle: [
    { t: 'path', d: 'M21 11.1V12a9 9 0 1 1-5.3-8.2' },
    { t: 'path', d: 'M21.5 4.5 12 14l-2.7-2.7' },
  ],
  inbox: [
    { t: 'path', d: 'M21.5 12.5h-5l-1.8 3H9.3l-1.8-3h-5' },
    {
      t: 'path',
      d: 'M6 5.6 2.5 12.5V18a2.5 2.5 0 0 0 2.5 2.5h14a2.5 2.5 0 0 0 2.5-2.5v-5.5L18 5.6A2 2 0 0 0 16.2 4.5H7.8A2 2 0 0 0 6 5.6z',
    },
  ],
  wifiOff: [
    { t: 'path', d: 'M2 2l20 20' },
    { t: 'path', d: 'M16.7 11.4A10.4 10.4 0 0 1 19 12.9' },
    { t: 'path', d: 'M5 12.9a10.4 10.4 0 0 1 5.2-2.4' },
    { t: 'path', d: 'M10.7 5.7A15.5 15.5 0 0 1 22 9.4' },
    { t: 'path', d: 'M2 9.4a15.4 15.4 0 0 1 4.1-2.7' },
    { t: 'path', d: 'M8.6 16.2a5.5 5.5 0 0 1 6.8 0' },
    { t: 'path', d: 'M12 20h.01' },
  ],

  // ------------------------------------------------------------------- finance
  wallet: [
    { t: 'path', d: 'M20.5 12V7.5H5.5A2.25 2.25 0 0 1 5.5 3h13v4.5' },
    { t: 'path', d: 'M3.25 5.25V18a3 3 0 0 0 3 3H21v-5.25' },
    { t: 'path', d: 'M18 11.75a2.25 2.25 0 0 0 0 4.5h3.5v-4.5z' },
  ],
  bank: [
    { t: 'path', d: 'M3 21.5h18' },
    { t: 'path', d: 'M12 2.5 3 7.5h18z' },
    { t: 'path', d: 'M6 11v7' },
    { t: 'path', d: 'M10 11v7' },
    { t: 'path', d: 'M14 11v7' },
    { t: 'path', d: 'M18 11v7' },
  ],
  card: [
    { t: 'rect', x: 2, y: 4.5, w: 20, h: 15, rx: 3 },
    { t: 'path', d: 'M2 10h20' },
    { t: 'path', d: 'M6 15.2h4' },
  ],
  cash: [
    { t: 'rect', x: 2, y: 6, w: 20, h: 12, rx: 3 },
    { t: 'circle', cx: 12, cy: 12, r: 2.6 },
    { t: 'path', d: 'M6 12h.01' },
    { t: 'path', d: 'M18 12h.01' },
  ],
  upi: [
    { t: 'rect', x: 6, y: 2, w: 12, h: 20, rx: 3 },
    { t: 'path', d: 'M10 5.8h4' },
    { t: 'path', d: 'M12 18.4h.01' },
  ],
  smartphone: [
    { t: 'rect', x: 6, y: 2, w: 12, h: 20, rx: 3 },
    { t: 'path', d: 'M12 18.4h.01' },
  ],
  repeat: [
    { t: 'path', d: 'M17 2.5 21 6l-4 3.5' },
    { t: 'path', d: 'M3 11V9a3 3 0 0 1 3-3h15' },
    { t: 'path', d: 'M7 21.5 3 18l4-3.5' },
    { t: 'path', d: 'M21 13v2a3 3 0 0 1-3 3H3' },
  ],
  trendingUp: [
    { t: 'path', d: 'M22 6.5 14 14.5l-4-4L2 18.5' },
    { t: 'path', d: 'M16 6.5h6v6' },
  ],
  trendingDown: [
    { t: 'path', d: 'M22 17.5 14 9.5l-4 4L2 5.5' },
    { t: 'path', d: 'M16 17.5h6v-6' },
  ],

  // ---------------------------------------------------------------- categories
  grocery: [
    { t: 'circle', cx: 9.5, cy: 20.5, r: 1.2 },
    { t: 'circle', cx: 18, cy: 20.5, r: 1.2 },
    { t: 'path', d: 'M2 3h2.6l2.4 11.3a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21.5 7H6' },
  ],
  food: [
    { t: 'path', d: 'M4 2.5v6a2.5 2.5 0 0 0 2.5 2.5h1A2.5 2.5 0 0 0 10 8.5v-6' },
    { t: 'path', d: 'M7 11v10.5' },
    { t: 'path', d: 'M19.5 21.5V2.5a4.5 4.5 0 0 0-4 4.5v5a1.5 1.5 0 0 0 1.5 1.5h2.5' },
  ],
  fuel: [
    { t: 'path', d: 'M3.5 21.5h11' },
    { t: 'path', d: 'M4.5 9.5h9' },
    { t: 'path', d: 'M13.5 21.5V4.5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v17' },
    { t: 'path', d: 'M13.5 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.9a2 2 0 0 0-.6-1.4L18 6' },
  ],
  shopping: [
    { t: 'path', d: 'M6.5 2.5 4 6.5V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6.5l-2.5-4z' },
    { t: 'path', d: 'M4 6.5h16' },
    { t: 'path', d: 'M15.5 10.5a3.5 3.5 0 0 1-7 0' },
  ],
  rent: [
    { t: 'path', d: 'M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { t: 'path', d: 'M9 16.5h6' },
  ],
  bills: [{ t: 'path', d: 'M13 2.5 4 13.5h7l-1 8 9-11h-7z' }],
  transport: [
    {
      t: 'path',
      d: 'M19.5 16.5H21a1 1 0 0 0 1-1v-2.6a2 2 0 0 0-1.5-1.9l-3.8-.9-2-2.2a2.5 2.5 0 0 0-1.9-.9H5.6a1.5 1.5 0 0 0-1.4.9L3 10.5a3.5 3.5 0 0 0-1 2.4v2.6a1 1 0 0 0 1 1h1.5',
    },
    { t: 'circle', cx: 7, cy: 17, r: 2 },
    { t: 'circle', cx: 17, cy: 17, r: 2 },
    { t: 'path', d: 'M9 16.5h6' },
  ],
  health: [
    {
      t: 'path',
      d: 'M19 13.5c1.5-1.5 3-3.2 3-5.5a5.2 5.2 0 0 0-5.2-5.2c-1.8 0-3 .5-4.8 2-1.8-1.5-3-2-4.8-2A5.2 5.2 0 0 0 2 8c0 2.3 1.5 4 3 5.5l7 7z',
    },
    { t: 'path', d: 'M3.4 12.5h5.1l.6-1.2 2 4.4 2-6.6 1.5 3.4h5.4' },
  ],
  entertainment: [
    { t: 'rect', x: 2.5, y: 3, w: 19, h: 18, rx: 3 },
    { t: 'path', d: 'M7.5 3v18' },
    { t: 'path', d: 'M16.5 3v18' },
    { t: 'path', d: 'M2.5 12h19' },
    { t: 'path', d: 'M2.5 7.5h5' },
    { t: 'path', d: 'M2.5 16.5h5' },
    { t: 'path', d: 'M16.5 7.5h5' },
    { t: 'path', d: 'M16.5 16.5h5' },
  ],
  education: [
    { t: 'path', d: 'M2.5 3.5h5.5a3.5 3.5 0 0 1 3.5 3.5v13.5a2.6 2.6 0 0 0-2.6-2.6H2.5z' },
    { t: 'path', d: 'M21.5 3.5H16a3.5 3.5 0 0 0-3.5 3.5v13.5a2.6 2.6 0 0 1 2.6-2.6h6.4z' },
  ],
  investment: [
    { t: 'path', d: 'M4 20V10' },
    { t: 'path', d: 'M10 20V4' },
    { t: 'path', d: 'M16 20v-7' },
    { t: 'path', d: 'M2 20h20' },
  ],
  circle: [{ t: 'circle', cx: 12, cy: 12, r: 8.5 }],
} as const satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof iconRegistry;
