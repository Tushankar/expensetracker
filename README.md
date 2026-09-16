# Paisa

An India-first personal expense tracker. This repository currently contains **Step 1: the UI
foundation** — the design system, navigation shell and a Home screen built on static data.
There is no backend, no auth and no persistence yet.

## Running it

```bash
npm install
npm start          # then press i / a, or scan the QR code
```

`npm run typecheck` and `npm run lint` both pass clean; keep them that way.

## Stack

| Concern    | Choice                                                          |
| ---------- | --------------------------------------------------------------- |
| Runtime    | Expo SDK 57 · React Native 0.86 · React 19.2 · New Architecture  |
| Language   | TypeScript, `strict` + `noUncheckedIndexedAccess`                |
| Navigation | React Navigation 7 (native stack + bottom tabs, custom tab bar)  |
| State      | Zustand                                                          |
| Styling    | Token-driven `StyleSheet`, dark-only, three accents               |
| Charts     | Hand-built on `react-native-svg` — no charting dependency         |
| Animation  | Reanimated 4 + Gesture Handler                                   |
| Icons      | Hand-authored SVG paths on `react-native-svg`                    |
| Type       | Inter, loaded at runtime via `expo-font`                         |

Two deliberate deviations from the obvious defaults:

- **React Navigation, not Expo Router.** In SDK 57 Expo Router dropped React Navigation for
  `standard-navigation` and blocks direct `@react-navigation/*` imports. The router scaffold was
  removed so the app can use React Navigation directly and own its tab bar.
- **No `@expo/vector-icons`.** It is deprecated in SDK 57. Icons are drawn from a local registry of
  24×24 stroke paths, which also means one consistent stroke weight and no icon font to load.

## Layout

```
src/
  theme/        Tokens (colour, type, spacing, radius, shadow, motion) + ThemeProvider
  components/
    ui/         Design-system primitives — the only things screens should compose from
    charts/     Sparkline, bars, donut, progress ring (react-native-svg)
    icons/      Icon path registry (data only)
    home/       Home-specific composites
    activity/   Activity-specific composites
  navigation/   Stack + tabs, custom TabBar, React Navigation theme bridge
  screens/      One file per screen; sheets/ for modal surfaces
  store/        Zustand stores (theme preference, transient UI)
  data/         Static sample data — the seam where the API will land
  services/     Outbound integrations (currently just merchant logos)
  utils/        Currency, dates, haptics
  types/        Domain models
```

## Conventions that matter

**Money is integer paise, never float rupees.** `Paise` is a branded-by-convention number type;
format at the edge with `formatINR` / `formatCompactINR`. Rupee grouping is Indian (`12,34,567`)
and implemented by hand rather than through `Intl`, whose availability varies across Hermes builds.

**Everything visual comes from `useTheme()`.** No hard-coded colours, sizes or spacing in a
component.

**The app is dark-only, with three accents**: Violet (default), Emerald and Crimson, switchable from
Settings. An accent is not just a brand colour — it tints the whole neutral ramp, so a violet build
has violet-cast greys and an emerald build has green-cast greys. That tint is most of what makes
each one feel designed rather than recoloured. Components must never branch on `theme.accent`; read
tokens and the accent takes care of itself.

**Every accent needs two brand values.** `brand` is dark enough to carry white text; `brandText` is
light enough to be legible *as* text on a card. Emerald is the reason `textOnAccent` is per-accent:
mint is far too light for white text, so it takes near-black instead.

**Green and red mean direction, in every accent.** Green is money in, red is money out, and neither
is ever used decoratively — a green chip that does not mean income is a bug. The category hues are
shared across accents for the same reason: a chart should read the same whichever brand is active.

**The balance card is its own colour context.** It is a deeper slab of the accent, so anything
rendered inside it reads from the `hero*` tokens (`heroTile`, `heroText`, `heroPositive`, …) rather
than from `surface` or `textPrimary`.

**Merchant logos come from LogoKit**, with a monogram fallback. `MerchantAvatar` fetches
`img.logokit.com/{domain}`; anything without a domain in `src/data/merchants.ts` (an auto rickshaw,
a salary credit), anything that fails to resolve, and anything loaded offline falls back to a
deterministic initial and tint derived from the name. A row is never empty.

Two things about that endpoint cost an hour each, so they are worth knowing:

- **Headers are native-only.** The CDN returns no `Access-Control-Allow-Origin`. Attaching any
  header on web promotes the load from a plain `<img>` fetch to a CORS request, which the browser
  blocks — every logo silently becomes a monogram. On iOS and Android the opposite is true: without
  an `Accept: image/*` header Cloudflare answers with a 403 challenge page instead of a PNG.
- **The token is read at bundler start.** `EXPO_PUBLIC_*` values are inlined by Metro when the dev
  server boots, so a server started before `.env` existed serves a bundle with no token and every
  logo falls back to a monogram. Restart `npm start` after touching `.env`, and add `--clear` after
  touching `app.json`, whose config is cached separately.

The token in `app.json` is a *publishable* key, meant to ship inside clients. A LogoKit secret key
(`sk_…`, which the Brand Data API at `api.logokit.com/brands/*` requires — the publishable key gets
a 401 there) must never go in the app; that belongs behind the backend when one exists.

**Flex children that hold text need `minWidth: 0`.** Without it they refuse to shrink below their
content width and push the whole column wider than the screen. This bites on web especially.

**Text goes through `<Text>` from `components/ui`.** It applies Inter, the shared type scale and a
per-variant Dynamic Type cap. Raw `<Text>` from `react-native` gets none of those.

**Icons are decorative by default.** `<Icon>` is hidden from screen readers unless you pass
`accessibilityLabel`, which is correct for the common case of an icon beside a visible label.

**Touch targets are at least 48dp.** Smaller controls extend their area with `hitSlop` rather than
growing visually.

## Accessibility

- Measured against `surface`: `textSecondary` 7.2:1, `textTertiary` 4.8:1, `brandText` 6.4:1, and
  white on `brand` 4.8:1 — all clear WCAG AA. Re-check before lightening a fill or darkening a text
  token.
- Each quick-action tile declares whether its glyph is dark or light, because the fills are fixed
  hues rather than surfaces: amber takes a dark glyph, the rest take white.
- Every animation honours the OS "reduce motion" setting.
- Screens are safe-area aware top and bottom, including Android edge-to-edge.
- Body and label text never drops below 12pt. Two exceptions are deliberate and documented in place:
  the quick-action labels (11pt, so four fit a phone width on one line) and the figure inside the
  spending ring (11/9pt, a graphic label that repeats at full size in the card beside it).

## Seeing the system

Settings → **Design system** renders every primitive and every loading / empty / error state on one
screen. Settings → **Accent** switches the whole app between Violet, Emerald and Crimson; check a
change in more than one before calling it done.

## What is deliberately missing

No backend, no MongoDB, no auth, no AI, and no persistence. The add-transaction sheet has real form
state and validation but its submit closes the sheet without writing anything; the write slots into
`handleSubmit` in `src/screens/sheets/AddTransactionSheet.tsx`.

`src/data/mock.ts` is the only source of data. When the API arrives, replace that module's exports
with hooks and no screen should need restructuring.

The sample month is tuned so the figures on Home are internally consistent: the transactions add up
to ₹85,227 spent against ₹1,57,000 earned, the category split is Food 20 / Rent 22 / Transport 12 /
Shopping 10 / Bills 8 / Others 28, and the savings ring and the tip line both quote the same 46%.
Change a transaction and those move together. Two series are shape-only and say so in place: the
trend line behind the balance, and the thumbnail bars on the income and spent tiles.

The period chips above the spending cards, and the month pill on Activity, select but do not
re-query — only the current month exists in the sample data. The Activity filters (All / Income /
Expenses / Subscriptions) are real and do filter the list.

## Known rough edge

`react-hooks/immutability` is disabled in `eslint.config.js`. The React Compiler's immutability rule
reads Reanimated's `sharedValue.value = withTiming(...)` — the library's documented API — as an
illegal mutation ([facebook/react#29640](https://github.com/facebook/react/issues/29640)). It is off
project-wide because shared values are used throughout the design system.
