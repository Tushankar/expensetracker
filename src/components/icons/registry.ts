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

  // ----------------------------------------------------- category sub-glyphs
  // The default category tree is two levels deep — Food › Swiggy, Transport ›
  // Rapido — and a picker where every row under a heading shares one glyph is a
  // picker people scan by reading. These exist so the second level is scannable
  // by shape.
  coffee: [
    { t: 'path', d: 'M4 9.5h13v6a4.5 4.5 0 0 1-4.5 4.5h-4A4.5 4.5 0 0 1 4 15.5z' },
    { t: 'path', d: 'M17 11h1.5a2.75 2.75 0 0 1 0 5.5H17' },
    { t: 'path', d: 'M8 3v3' },
    { t: 'path', d: 'M12 3v3' },
  ],
  cake: [
    { t: 'path', d: 'M3.5 21.5h17' },
    { t: 'path', d: 'M5 21.5v-6a2.5 2.5 0 0 1 2.5-2.5h9a2.5 2.5 0 0 1 2.5 2.5v6' },
    { t: 'path', d: 'M5 17h14' },
    { t: 'path', d: 'M12 13v-3.5' },
    { t: 'path', d: 'M12 6.5h.01' },
  ],
  leaf: [
    { t: 'path', d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z' },
    { t: 'path', d: 'M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12' },
  ],
  milk: [
    { t: 'path', d: 'M8 2.5h8' },
    {
      t: 'path',
      d: 'M9 2.5v3.3a2 2 0 0 1-.4 1.2L7.4 8.6a2 2 0 0 0-.4 1.2v9.7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9.8a2 2 0 0 0-.4-1.2l-1.2-1.6a2 2 0 0 1-.4-1.2V2.5',
    },
    { t: 'path', d: 'M7 13.5h10' },
  ],
  meat: [
    {
      t: 'path',
      d: 'M15.5 15.4c-2.1.7-4.3.3-5.7-1.1-2.3-2.3-1.8-6.5 1.2-9.4 2.9-2.9 7.1-3.5 9.4-1.2 1.4 1.4 1.7 3.6 1.1 5.7-1.4-.4-2.9 0-4 1.1s-1.5 2.6-1.1 4z',
    },
    {
      t: 'path',
      d: 'M11.3 15.6l-2.2 2.2a2.5 2.5 0 1 1-4.6 1.7 2.5 2.5 0 0 1-1.4-4.2 2.5 2.5 0 0 1 3.1-.3l2.2-2.2',
    },
  ],
  beer: [
    { t: 'path', d: 'M6.5 8.5h9v11a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2z' },
    { t: 'path', d: 'M15.5 11h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2' },
    { t: 'path', d: 'M6.5 8.5V6a2.5 2.5 0 0 1 3.4-2.3A2.6 2.6 0 0 1 15.5 5v3.5' },
    { t: 'path', d: 'M9.8 12.5v5' },
    { t: 'path', d: 'M12.2 12.5v5' },
  ],
  glass: [
    { t: 'path', d: 'M7 2.5h10l-1.1 8.7a3.9 3.9 0 0 1-7.8 0z' },
    { t: 'path', d: 'M12 15v6' },
    { t: 'path', d: 'M8.5 21.5h7' },
  ],
  cigarette: [
    { t: 'rect', x: 2, y: 13.5, w: 15, h: 5, rx: 1.5 },
    { t: 'path', d: 'M12.5 13.5v5' },
    { t: 'path', d: 'M19.5 13.5h2.5v5h-2.5z' },
    { t: 'path', d: 'M17.5 4.5c1.6 1.2 1.6 3.3 0 4.5' },
    { t: 'path', d: 'M21 3.5c1.6 1.6 1.6 4.4 0 6' },
  ],

  bus: [
    { t: 'rect', x: 3, y: 3, w: 18, h: 14, rx: 2.5 },
    { t: 'path', d: 'M3 10h18' },
    { t: 'circle', cx: 7.5, cy: 13.8, r: 1 },
    { t: 'circle', cx: 16.5, cy: 13.8, r: 1 },
    { t: 'path', d: 'M6 17v3' },
    { t: 'path', d: 'M18 17v3' },
  ],
  train: [
    { t: 'rect', x: 4, y: 2.5, w: 16, h: 15, rx: 3 },
    { t: 'path', d: 'M4 10h16' },
    { t: 'circle', cx: 8.5, cy: 13.8, r: 1 },
    { t: 'circle', cx: 15.5, cy: 13.8, r: 1 },
    { t: 'path', d: 'M8.5 17.5 5.5 21.5' },
    { t: 'path', d: 'M15.5 17.5l3 4' },
  ],
  bike: [
    { t: 'circle', cx: 5.5, cy: 17.5, r: 3.5 },
    { t: 'circle', cx: 18.5, cy: 17.5, r: 3.5 },
    { t: 'circle', cx: 15, cy: 5, r: 1 },
    { t: 'path', d: 'M12 17.5V14L9 11l4-3 2 3h2' },
  ],
  mapPin: [
    { t: 'path', d: 'M20 10.5c0 6-8 11.5-8 11.5s-8-5.5-8-11.5a8 8 0 0 1 16 0z' },
    { t: 'circle', cx: 12, cy: 10.5, r: 3 },
  ],
  plane: [
    {
      t: 'path',
      d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L8 11l-2 2-2.5-.3c-.4 0-.7.1-.9.4l-.2.3c-.3.4-.2 1 .2 1.3L6 17l2.3 2.5c.3.4.9.5 1.3.2l.3-.2c.3-.2.4-.5.4-.9L10 16l2-2 2.5 4.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z',
    },
  ],
  bed: [
    { t: 'path', d: 'M2.5 4v16' },
    { t: 'path', d: 'M2.5 8.5h16a3 3 0 0 1 3 3v8.5' },
    { t: 'path', d: 'M2.5 16.5h19' },
    { t: 'circle', cx: 7.5, cy: 12, r: 2 },
  ],
  globe: [
    { t: 'circle', cx: 12, cy: 12, r: 9 },
    { t: 'path', d: 'M3 12h18' },
    { t: 'path', d: 'M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z' },
  ],
  umbrella: [
    { t: 'path', d: 'M12 2.5v1.5' },
    { t: 'path', d: 'M2.5 13a9.5 9.5 0 0 1 19 0z' },
    { t: 'path', d: 'M12 13v5.5a2.75 2.75 0 0 0 5.5 0' },
  ],

  droplet: [{ t: 'path', d: 'M12 2.7 6.9 8.3a7.2 7.2 0 1 0 10.2 0z' }],
  flame: [
    {
      t: 'path',
      d: 'M12 2.5c2.5 3 5.5 5.5 5.5 9.5a5.5 5.5 0 0 1-11 0c0-1.7.6-3 1.6-4.2.4 1 1.1 1.8 2 2.2C10.5 7.5 10.8 4.8 12 2.5z',
    },
  ],
  wifi: [
    { t: 'path', d: 'M5 12.9a10.4 10.4 0 0 1 14 0' },
    { t: 'path', d: 'M2 9.4a15.5 15.5 0 0 1 20 0' },
    { t: 'path', d: 'M8.6 16.2a5.5 5.5 0 0 1 6.8 0' },
    { t: 'path', d: 'M12 20h.01' },
  ],
  tv: [
    { t: 'rect', x: 2, y: 7, w: 20, h: 13, rx: 2.5 },
    { t: 'path', d: 'M7.5 3.5 12 7l4.5-3.5' },
  ],
  wrench: [
    {
      t: 'path',
      d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-8 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-8z',
    },
  ],

  shirt: [
    {
      t: 'path',
      d: 'M20.4 3.5 16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.6 3.5a1 1 0 0 0 1 .8H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.1a1 1 0 0 0 1-.8l.6-3.5a2 2 0 0 0-1.3-2.2z',
    },
  ],
  laptop: [
    { t: 'rect', x: 3.5, y: 4.5, w: 17, h: 11, rx: 2 },
    { t: 'path', d: 'M1.5 19.5h21' },
  ],
  package: [
    { t: 'path', d: 'M7.5 4.3 16.5 9.4' },
    {
      t: 'path',
      d: 'M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    },
    { t: 'path', d: 'M3.3 7 12 12l8.7-5' },
    { t: 'path', d: 'M12 22V12' },
  ],
  gift: [
    { t: 'rect', x: 3, y: 8, w: 18, h: 4, rx: 1 },
    { t: 'path', d: 'M12 8v13' },
    { t: 'path', d: 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7' },
    { t: 'path', d: 'M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 5.5 12 8' },
    { t: 'path', d: 'M16.5 8a2.5 2.5 0 0 0 0-5C14 3 12 5.5 12 8' },
  ],
  ticket: [
    {
      t: 'path',
      d: 'M2 9.5V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5z',
    },
    { t: 'path', d: 'M13 5v2' },
    { t: 'path', d: 'M13 11v2' },
    { t: 'path', d: 'M13 17v2' },
  ],
  music: [
    { t: 'path', d: 'M9 18V5l12-2v13' },
    { t: 'circle', cx: 6, cy: 18, r: 3 },
    { t: 'circle', cx: 18, cy: 16, r: 3 },
  ],
  gamepad: [
    { t: 'path', d: 'M6 11h4' },
    { t: 'path', d: 'M8 9v4' },
    { t: 'path', d: 'M15 12h.01' },
    { t: 'path', d: 'M18 10h.01' },
    {
      t: 'path',
      d: 'M17.3 5H6.7a4 4 0 0 0-4 3.6C2.6 9.4 2 14.5 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.4-1.4a2 2 0 0 1 1.4-.6h4.4a2 2 0 0 1 1.4.6L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.5-.6-6.6-.7-7.3A4 4 0 0 0 17.3 5z',
    },
  ],

  pill: [
    { t: 'path', d: 'M10.5 20.5a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a5.5 5.5 0 0 1 7.8 7.8z' },
    { t: 'path', d: 'M7.1 7.1l9.8 9.8' },
  ],
  flask: [
    { t: 'path', d: 'M9.5 2.5h5' },
    {
      t: 'path',
      d: 'M10.5 2.5v6.2a2 2 0 0 1-.3 1.1l-5.4 8.6a2 2 0 0 0 1.7 3.1h11a2 2 0 0 0 1.7-3.1l-5.4-8.6a2 2 0 0 1-.3-1.1V2.5',
    },
    { t: 'path', d: 'M7.2 15.5h9.6' },
  ],
  dumbbell: [
    { t: 'path', d: 'M3.5 9v6' },
    { t: 'path', d: 'M6.5 6.5v11' },
    { t: 'path', d: 'M17.5 6.5v11' },
    { t: 'path', d: 'M20.5 9v6' },
    { t: 'path', d: 'M6.5 12h11' },
  ],
  heart: [
    {
      t: 'path',
      d: 'M19 13.5c1.5-1.5 3-3.2 3-5.5a5.2 5.2 0 0 0-5.2-5.2c-1.8 0-3 .5-4.8 2-1.8-1.5-3-2-4.8-2A5.2 5.2 0 0 0 2 8c0 2.3 1.5 4 3 5.5l7 7z',
    },
  ],
  users: [
    { t: 'path', d: 'M16.5 21v-1.8a4.2 4.2 0 0 0-4.2-4.2H5.7a4.2 4.2 0 0 0-4.2 4.2V21' },
    { t: 'circle', cx: 9, cy: 7, r: 4 },
    { t: 'path', d: 'M22.5 21v-1.8a4.2 4.2 0 0 0-3.2-4.1' },
    { t: 'path', d: 'M16 3.2a4 4 0 0 1 0 7.6' },
  ],
  book: [
    { t: 'path', d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' },
    { t: 'path', d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  ],
  briefcase: [
    { t: 'rect', x: 2, y: 7, w: 20, h: 14, rx: 2 },
    { t: 'path', d: 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' },
  ],
  // ------------------------------------------------------------- step 5: entry
  camera: [
    { t: 'path', d: 'M3 8.5A2 2 0 0 1 5 6.5h2.2l1.3-2h7l1.3 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { t: 'circle', cx: 12, cy: 13, r: 3.4 },
  ],
  image: [
    { t: 'rect', x: 3, y: 4.5, w: 18, h: 15, rx: 2.5 },
    { t: 'circle', cx: 8.6, cy: 10, r: 1.6 },
    { t: 'path', d: 'M3.6 17.5 9 12.6l3.2 2.9 3.4-3.6 4.8 5' },
  ],
  keyboard: [
    { t: 'rect', x: 2.5, y: 6, w: 19, h: 12, rx: 2.5 },
    { t: 'path', d: 'M6.5 10h.01' },
    { t: 'path', d: 'M10 10h.01' },
    { t: 'path', d: 'M13.5 10h.01' },
    { t: 'path', d: 'M17 10h.01' },
    { t: 'path', d: 'M8 14h8' },
  ],
  trash: [
    { t: 'path', d: 'M4 7h16' },
    { t: 'path', d: 'M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7' },
    { t: 'path', d: 'M6 7l.9 12.1A2 2 0 0 0 8.9 21h6.2a2 2 0 0 0 2-1.9L18 7' },
    { t: 'path', d: 'M10.5 11v6' },
    { t: 'path', d: 'M13.5 11v6' },
  ],
  pencil: [
    { t: 'path', d: 'M4 20h4.2L20 8.2a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8z' },
    { t: 'path', d: 'M14.5 5.5 18.5 9.5' },
  ],
  scan: [
    { t: 'path', d: 'M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8' },
    { t: 'path', d: 'M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8' },
    { t: 'path', d: 'M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16' },
    { t: 'path', d: 'M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16' },
    { t: 'path', d: 'M3.5 12h17' },
  ],

  piggyBank: [
    {
      t: 'path',
      d: 'M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z',
    },
    { t: 'path', d: 'M2 9v1a2 2 0 0 0 2 2h1' },
    { t: 'path', d: 'M16 11h.01' },
  ],
} as const satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof iconRegistry;

/**
 * Resolves an icon name that came from outside the bundle.
 *
 * Category icons are stored on the server, so a category created by a newer
 * client — or a typo in a seed file — can name a glyph this build does not have.
 * Falling back to a neutral dot keeps a picker row rendering; indexing the
 * registry directly would hand `undefined` to `.map` and take the screen down.
 */
export function toIconName(value: string | null | undefined): IconName {
  return value && value in iconRegistry ? (value as IconName) : 'circle';
}
