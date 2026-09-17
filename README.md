# Paisa

An India-first personal expense tracker: a React Native app and the Node API behind it.

**Step 1** built the design system and the navigation shell on static data.
**Step 2** replaced all of it with a real backend: accounts, categories,
transactions and transfers, JWT auth with refresh, and a mobile data layer that
handles loading, errors, empty states and lost connections.
**Step 3** turned it into a daily dashboard: budgets, recurring transactions, a
notification system, a calendar view, and week / month / custom date periods
throughout.
**Step 4 — this** — added the analytics layer and a financial assistant on Groq:
an Insights tab, a monthly summary and insight cards, a chat you can ask about
your own money, and category suggestions on the entry sheet.

Receipt scanning is deliberately not here yet.

The assistant does not calculate anything. Every figure it states is produced by
MongoDB aggregation first, and a reply containing a number the server did not
compute is rejected before it reaches the app. [The assistant](#the-assistant)
explains how that is enforced.

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
| `npm run verify` | 48 unit checks + 15 API-client behaviour tests. No server needed. |
| `npm run verify:e2e` | 54 checks of the mobile data layer against a running API. |
| `npm run server:test` | 168 integration tests of the API against the real database. |

All five pass — 285 checks. The last two need `npm run server` in another
terminal.

What the suites are for, in order: `verify` covers the pure logic that is easy to get
quietly wrong and impossible to eyeball in a simulator — Indian digit grouping, what
each keypad press does to the amount, where a week or a custom range's boundaries
fall — plus the client's token handling against a fake server. `verify:e2e` calls the
same `transactionApi.create` and `budgetApi.summary` the screens call, against the
real API, so a field renamed on one side and not the other fails there rather than on
a device. `server:test` covers the API on its own, including that one user cannot read
or spend from another's account. `test:step` covers the parts most likely to be
subtly wrong: that "monthly on the 31st" survives February, that a rule resumed after
three months does not write three backdated charges, that an 11pm expense on the last
of the month counts against *that* month's budget, and that crossing a cap alerts you
exactly once. `test:ai` covers the analytics aggregations and every guard around the
assistant — that a model which states a figure the data does not contain is retried
once and then discarded, that an advice question never reaches a model at all, and
that asking for a category suggestion writes nothing.

The grounding tests run entirely in-process, with no Groq and no database. That is
deliberate: the point of the guard is that it behaves identically whether the model is
brilliant, broken or absent, so feeding it a live model would test the wrong thing.

What none of them cover: React rendering. Layout, gestures and animation still need a
device.

## Stack

| Concern | App | API |
| --- | --- | --- |
| Runtime | Expo SDK 57 · RN 0.86 · React 19.2 | Node 20+ · Express 5 |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | same |
| Data | TanStack Query 5 | MongoDB · Mongoose 8 |
| Dates | Device-local arithmetic | Luxon, in the user's stored zone |
| State | Zustand | — |
| Auth | expo-secure-store | JWT access + rotating refresh, bcrypt |
| Validation | — | Zod at every edge |
| Navigation | React Navigation 7, custom tab bar | — |
| Styling | Token-driven `StyleSheet`, dark-only, three accents | — |
| Charts | Hand-built on `react-native-svg` | — |
| Icons | Hand-authored SVG paths, ~95 glyphs | — |
| Scheduler | — | In-process interval, idempotent by occurrence count |
| Assistant | — | Groq (`openai/gpt-oss-120b`), server-side only |

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
    dashboard/  Period selector, budget snapshot, upcoming strip
    budgets/    Budget progress row
    insights/   Stat grid, summary card, insight cards, chat bubbles
    transactions/ Row, day-grouped list, calendar view
    activity/   Activity composites
    data/       QueryState — the shared loading / error / empty boundary
  navigation/   Stack + tabs, custom TabBar
  screens/      One file per screen; sheets/ for modal surfaces
  store/        Auth (persisted to the keychain), UI, accent
  utils/        Currency, dates, periods, breakdown, haptics
scripts/        Checks that run under Node, and stubs for the native modules
server/         The API. Has its own README.
```

## The dashboard

Reading order is the whole design: who you are, what you have, what you kept, what
you promised yourself, where it went, what is coming, what just happened. Each
block answers exactly one question, in the order someone opening a finance app
actually asks them — and anything that would answer a second question belongs on
the screen that owns it. That is why Home shows three budgets and not twelve, five
transactions and not fifty.

**Periods**: This Week, This Month, Last Month and a custom range, with 3/6/12
month presets inside the range sheet. Every figure re-queries; nothing is
re-filtered client-side, because a "last month" view assembled from whichever
transactions happened to be loaded would be a picture of the scroll position.

**Budgets stay monthly even when the dashboard is showing a week.** A cap is a
monthly promise, and prorating it to "₹1,615 so far this week" is arithmetic
nobody asked for and nobody trusts. The month is named on the card rather than
implied.

## Budgets

An optional overall cap plus one per category, each showing the amount used, the
amount remaining, the percentage, and a state: on track, getting close, over.

The bar is coloured by **state, not by category** — tinting Food's bar with Food's
green would make "110% of your food budget" look reassuring. It also never
overflows its track: going over is said in words and in colour, not by a fill that
runs off the end of the card. `remaining` is floored at zero and `overBy` carries
the rest, so no screen has to decide what a negative "remaining" means.

## Recurring

Weekly, monthly, yearly, or any custom unit-and-interval. Each rule can record its
transaction automatically or just remind you — a fixed EMI is automatic, a
variable electricity bill is a reminder.

Pause keeps a rule's place in the schedule but not its clock: resuming skips to
the next occurrence rather than writing the ones it missed. Creating a rule with a
past start date does the opposite — it catches up exactly one occurrence, so
"Netflix, from the 5th" added on the 16th records this month and not the eight
before it. The form says which will happen before you save it.

## Notifications

Four kinds — budget close, budget over, charge coming up, charge recorded — with
an in-app list, an unread badge, and per-kind switches in Settings.

The anti-spam mechanism is a unique index, not a convention: every alert carries a
key naming the exact thing and period it is about, so the hundredth expense of
September cannot re-announce what the first one already said. Push is a seam —
tokens are stored, triggers and de-duplication all run, and turning it on is one
call inside `deliver()` on the server.

## Calendar

A toggle on Activity, because it is a second way into the same transactions rather
than a separate feature. Days are tinted by what they cost, scaled against the
busiest day of the visible month so a ₹2,000 month and a ₹90,000 month both read.
Selecting a day shows its count, its total and its transactions.

## Insights

A fourth tab, sitting between Activity and Budgets. Four stat tiles — spent, earned,
kept, savings rate — then the assistant's read on the period, then the working
underneath it: the category donut, spending by week, the categories that moved most
against the previous period, the largest single expenses, and a six-month trend.

Three details that are easy to get wrong:

**The daily average divides by the days that have elapsed, not the days in the
period.** Dividing a half-finished September by 30 understates it by half and makes
every projection that follows wrong. The projection disappears entirely once the
period is over, because extrapolating a finished month is not a forecast, it is a
mistake.

**Deltas only appear when there is something to compare against.** "Up 100% on last
month" from an empty month is noise dressed as a finding, so the tiles show a change
only when the previous window had activity.

**The donut's "Others" band is the remainder from the period total, not the sum of the
tail.** The overview endpoint returns only the top categories; a chart whose slices add
to 100% of a number that is not the total is the most convincing way to be wrong.
`toBreakdown` takes the difference from the real total, so whatever the server left out
still shows up. Both Home and Insights use it, and it is unit-tested.

Settings moved off the tab bar to make room, and is reached from the avatar on Home.
Five tabs plus the add button would have narrowed the four screens people open daily
to serve one they open weekly.

## The assistant

**React Native → Node → Groq.** The key lives in the server's environment and is read
in exactly one file. It is never sent to the app: `EXPO_PUBLIC_*` values are inlined
into the JavaScript bundle, and a bundle is a zip anyone can open.

### The model never calculates

Ask a model to summarise "₹28,450 this month, ₹24,100 last month" and it will very
often reply "…an increase of ₹4,350". The arithmetic happens to be right, and that is
exactly the problem: nothing checked it, nothing will, and the next one will be wrong
in a way nobody notices.

So the pipeline is built the other way round:

1. **`analytics.service.ts` computes everything**, including every derived figure —
   deltas, shares, averages, projections — in a single `$facet` aggregation. It is the
   only place in the system where a financial number is produced.
2. **`buildFactSheet` renders those figures as pre-formatted strings.** The model never
   sees a raw integer, so it has nothing to add up.
3. **The system prompt forbids calculation**, repeatedly and in those words.
4. **`checkGrounding` rejects the reply if it contains any figure not present verbatim
   in the fact sheet.** Comparison is on the digits alone, so spacing and separators do
   not matter. Small bare numbers are allowed through as counts — refusing "your top 3
   categories" would make the assistant unusable without making it safer.
5. **One retry, naming the offending figures.** If it invents again, the reply is
   discarded and the server's own deterministic wording is sent instead.

That fallback is labelled **Computed** in the app rather than hidden. The figures are
identical either way, and quietly passing off a fallback as the assistant is the kind
of small dishonesty that costs trust in every other number on the screen.

### Questions are retrieved, not guessed

`POST /ai/ask` resolves an intent first — `category_spend`, `savings`,
`largest_expenses`, `comparison`, `budget_status` and so on — and that classification
never involves a number. The server then queries MongoDB itself for exactly what the
question needs and hands the model the result, with the only instruction being to
phrase it. The reply comes back with the retrieved figures attached, and the chat shows
them under the answer: the category matched, the total read, the transactions counted.
An answer you can check beats an answer you have to trust.

Intent resolution asks the model but falls back to keyword matching, which is why a
Groq outage degrades the wording rather than taking the feature down.

### The safety rules, and where each one lives

| Rule | Enforced by |
| --- | --- |
| Never invent a transaction or a figure | `checkGrounding`, then the deterministic fallback |
| Never claim a transaction exists | Retrieval returns real rows or none; the model is given no room to add any |
| Never modify data without confirmation | No AI route writes. Categorisation returns a proposal the user taps to accept |
| Never make investment recommendations | Advice questions are matched and declined server-side, never sent to a model; generated text is scanned for advice phrasing as well |
| Never present an assumption as fact | Projections are labelled estimates in the prompt and on screen |
| Say when the data is thin | Fewer than five expenses sets `limitedData`, and the card says so |

### Costs and limits

Twenty AI requests per minute per **user** — keyed on the authenticated id, not the IP,
because the thing worth limiting is one account asking a hundred questions a minute,
not a household sharing a connection.

Groq meters tokens per minute, and a busy Insights screen can walk into that: a summary,
its insight cards and a question in quick succession. Rather than give up on the first
429 the client retries once after the delay Groq itself suggests, then falls back to the
smaller model, which has its own budget, and only then to computed text. Quality
degrades one notch at a time.

The summary query holds its result for five minutes and does not refetch on mount —
every refetch is a Groq call, and re-narrating the same figures because someone switched
tabs is a cost with no benefit. The figures underneath come from the analytics query,
which refreshes normally.

Without `GROQ_API_KEY` the whole feature still works: every endpoint answers with the
server's own wording, and `/ai/status` tells the app so it can explain rather than fail.

### Category suggestions

The entry sheet asks once, when the merchant field is finished with — on blur, not on
change, because a request per keystroke is eleven calls to type "Indian Oil" and the
answer is only useful once the name is whole. Common Indian brands are matched locally
and never leave the device.

What comes back is a proposal: the category, a confidence, and the reason. Nothing is
filed until "Use" is tapped. An assistant that categorised on its own would put its
mistakes into a chart six weeks later with no way to trace them.

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
