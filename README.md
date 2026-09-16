# Paisa

An India-first personal expense tracker: a React Native app and the Node API behind it.

**Step 1** built the design system and the navigation shell on static data.
**Step 2 — this** — replaced all of it with a real backend: accounts, categories,
transactions and transfers, JWT auth with refresh, and a mobile data layer that
handles loading, errors, empty states and lost connections.

Budgets, analytics, AI and receipt scanning are deliberately not here yet.

## Running it

Two processes. The API first:

```bash
cd server
npm install
cp .env.example .env     # fill in MONGODB_URI and the two JWT secrets
npm run dev              # http://localhost:4000/api/v1
npm run seed             # optional: demo@paisa.app / Password123, with a month of data
```

Then the app, from the repository root:

```bash
npm install
npm start                # then press i / a, or scan the QR code
```

The app finds the API on its own: it reuses the host Expo is already serving the
bundle from, on port 4000. That means a physical device works with no configuration —
`localhost` on a phone is the phone. Override it with `EXPO_PUBLIC_API_URL` in `.env`
for a tunnel or a deployed server, and restart the bundler afterwards (Metro inlines
`EXPO_PUBLIC_*` at start-up). Settings shows the resolved URL in a dev build.

## Checks

| | |
| --- | --- |
| `npm run typecheck` | App and scripts. |
| `npm run lint` | |
| `npm run verify` | 29 unit checks + 15 API-client behaviour tests. No server needed. |
| `npm run verify:e2e` | 29 checks of the mobile data layer against a running API. |
| `npm run server:test` | 58 integration tests of the API against the real database. |

All five pass. The last two need `npm run server` in another terminal.

What the suites are for, in order: `verify` covers the pure logic that is easy to get
quietly wrong and impossible to eyeball in a simulator — Indian digit grouping, what
each keypad press does to the amount, where a period's boundaries fall — plus the
client's token handling against a fake server. `verify:e2e` calls the same
`transactionApi.create` the screens call, against the real API, so a field renamed on
one side and not the other fails there rather than on a device. `server:test` covers
the API on its own, including that one user cannot read or spend from another's
account.

What none of them cover: React rendering. Layout, gestures and animation still need a
device.

## Stack

| Concern | App | API |
| --- | --- | --- |
| Runtime | Expo SDK 57 · RN 0.86 · React 19.2 | Node 20+ · Express 5 |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | same |
| Data | TanStack Query 5 | MongoDB · Mongoose 8 |
| State | Zustand | — |
| Auth | expo-secure-store | JWT access + rotating refresh, bcrypt |
| Validation | — | Zod at every edge |
| Navigation | React Navigation 7, custom tab bar | — |
| Styling | Token-driven `StyleSheet`, dark-only, three accents | — |
| Charts | Hand-built on `react-native-svg` | — |
| Icons | Hand-authored SVG paths, ~95 glyphs | — |

## Layout

```
src/
  api/          Client, endpoints, React Query hooks, wire types
  theme/        Tokens + ThemeProvider
  components/
    ui/         Design-system primitives — the only things screens compose from
    charts/     Donut, ring, bars, sparkline
    icons/      Icon path registry (data only)
    home/       Home composites
    transactions/ Row + day-grouped list
    activity/   Activity composites
    data/       QueryState — the shared loading / error / empty boundary
  navigation/   Stack + tabs, custom TabBar
  screens/      One file per screen; sheets/ for modal surfaces
  store/        Auth (persisted to the keychain), UI, accent
  utils/        Currency, dates, periods, haptics
scripts/        Checks that run under Node, and stubs for the native modules
server/         The API. Has its own README.
```

## How the pieces fit

**Money is an integer number of paise from the database to the screen.** No layer
converts. `formatINR` renders at the edge, with Indian grouping (`12,34,567`) written
by hand rather than through `Intl`, whose availability varies across Hermes builds.

**A transfer between your own accounts is neither income nor spending.** It debits one
account, credits the other, and appears in neither total — on the server, in the
summary, and in the day headings on Activity. The transaction detail screen says so in
words, because it is the one rule people get wrong about their own ledger.

**Nothing on screen is fabricated.** Every figure comes from the server's own
aggregation over the selected period, which is why the period chips re-query instead
of re-filtering: a "6 months" chip that quietly summarised the 25 loaded rows would be
worse than no chip. Step 1's shape-only sparklines are gone for the same reason — they
sat next to real balances and read as if they meant something.

**The API layer is one fetch wrapper and a set of hooks.** `request()` attaches the
token, unwraps the envelope and, on a 401, refreshes once and replays. The refresh is
a single shared promise: an app that opens on Home fires four queries at once, and
four parallel refreshes against a rotating endpoint look exactly like a stolen token —
the server would correctly kill every session. Getting that wrong does not look like a
bug in testing, it looks like the app randomly signing people out, so it has its own
tests.

**A network failure and a server error are different states.** `NetworkError` is not
an `ApiError`; "check your connection" and "try again" are different instructions, and
giving the wrong one sends people to their router for no reason. Queries retry network
failures twice and never retry a 4xx. Mutations never retry at all — a write that
failed may well have succeeded, and booking the same expense twice is worse than an
error message.

**Every screen goes through `QueryState`.** Loading, error and empty are the states
that separate an app that feels finished from one that does not, and they are exactly
the states that get skipped when each screen rolls its own.

## The add-transaction flow

The whole sheet serves one number: how many gestures it takes to record a ₹40 chai.

Open, type, save — three. The keypad is already on screen, and the category, account,
method and date fall back to whatever was used last for that type. Everything else is
one tap away, and the merchant and note stay folded behind a link.

Two deliberate choices there. **The keypad is ours, not the OS's**: the system numeric
keyboard animates in over ~250ms, resizes the sheet, and on Android often covers the
button you are reaching for. **The pickers swap the sheet's body rather than opening a
second sheet**: two stacked native modals is a well-known source of Android flicker and
iOS dismissal bugs, and swapping is faster anyway — no second entry animation, and the
amount stays visible in the header so you never lose track of what you are
categorising.

The sheet is remounted on each open via a counter in the UI store, used as its React
`key`. That is what empties the form without a dozen `setState` calls in an effect —
and because the counter only moves on the way in, the closing animation still plays
over the form you were looking at. The same trick keys the filter, profile and
password sheets.

## Categories

~106 of them, two levels deep, written for India rather than translated into it: Food ›
Swiggy, Transport › Rapido, Home › Mobile Recharge. Brands are first-class because
brands are what appear on a statement, and asking someone to file a Swiggy order under
"Restaurants" is asking them to do the app's job. Fuel splits by what goes in the tank.
Alcohol and tobacco get their own group rather than hiding inside Entertainment.
Financial covers the EMI and SIP side of a household ledger that a Western default set
leaves out.

They are copied per user at registration, not shared as global rows. That costs ~106
small documents a head and buys the thing that matters: you can rename one or archive
a whole group without it affecting anyone else.

Icons and hues are stored as names, resolved on the device by `toIconName` and
`categoryColor` — both of which fall back rather than crash, so a category created by a
newer client renders as a neutral dot instead of taking the screen down.
`verify:e2e` asserts that every seeded name actually resolves today.

## Design conventions

**Everything visual comes from `useTheme()`.** No hard-coded colours, sizes or spacing.

**Dark-only, three accents** — Violet, Emerald, Crimson, switchable in Settings. An
accent is not just a brand colour: it tints the whole neutral ramp, so a violet build
has violet-cast greys. Components must never branch on `theme.accent`; read tokens and
the accent takes care of itself.

**Green and red mean direction, in every accent.** Green is money in, red is money out,
neither is ever decorative. A transfer gets neither, because it is neither. Category
hues are shared across accents so a chart reads the same whichever brand is active.

**Only income is coloured in a list.** Painting every expense red turns a normal month
into a wall of alarm; outgoing amounts stay in primary text and the minus sign does the
work.

**The balance card is its own colour context.** Anything inside it reads from the
`hero*` tokens rather than `surface` or `textPrimary`.

**Text goes through `<Text>` from `components/ui`** — it applies Inter, the shared type
scale and a per-variant Dynamic Type cap. **Icons are decorative by default**, hidden
from screen readers unless given an `accessibilityLabel`. **Touch targets are at least
48dp**, extended with `hitSlop` rather than grown. **Flex children holding text need
`minWidth: 0`**, or they refuse to shrink and push the column past the screen.

Settings → **Design system** renders every primitive and every loading / empty / error
state on one screen, including the keypad and the calendar.

## Accessibility

- Measured against `surface`: `textSecondary` 7.2:1, `textTertiary` 4.8:1, `brandText`
  6.4:1, white on `brand` 4.8:1 — all clear WCAG AA.
- Every animation honours the OS "reduce motion" setting.
- Screens are safe-area aware top and bottom, including Android edge-to-edge.
- Errors are announced: form-level messages sit in `accessibilityLiveRegion`, and
  field-level ones are attached to the input they belong to.
- Body and label text never drops below 12pt, with two documented exceptions (the
  quick-action labels and the figure inside the donut).

## Merchant logos

`MerchantAvatar` fetches `img.logokit.com/{domain}` with a deterministic monogram
fallback, so a row is never empty. Two things about that endpoint cost an hour each:

- **Headers are native-only.** The CDN sends no `Access-Control-Allow-Origin`, so
  attaching any header on web promotes the load to a CORS request the browser blocks.
  On iOS and Android the opposite holds — without `Accept: image/*` Cloudflare answers
  with a 403 challenge page.
- **The token is read at bundler start.** Restart `npm start` after touching `.env`,
  and add `--clear` after touching `app.json`.

The key in `app.json` is a *publishable* key, meant to ship inside clients. A LogoKit
secret key (`sk_…`) belongs behind the API, never in the app.

## Known rough edges

`react-hooks/immutability` is off in `eslint.config.js`. The React Compiler reads
Reanimated's documented `sharedValue.value = withTiming(...)` as an illegal mutation
([facebook/react#29640](https://github.com/facebook/react/issues/29640)), and shared
values are used throughout the design system.

`metro.config.js` blocks `server/` from Metro's crawl, and `tsconfig.json` excludes it
from the app's type-check. The server is a separate package with its own dependencies
and its own config; without those two lines Metro walks `server/node_modules` on every
start and resolves duplicate copies of packages that exist on both sides.

Archived accounts are excluded from the net-worth total on the Accounts screen and from
the pickers, but their transactions still resolve and still appear in history. That is
intentional; it does mean a period summary can include spending from an account the
headline no longer counts.
