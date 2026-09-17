# Paisa API

The backend for the Paisa expense tracker: authentication, accounts, categories,
transactions, budgets, recurring rules, analytics, the AI assistant, quick-text
entry, merchant memory and receipts. Node + Express 5 + TypeScript + Mongoose,
everything under `/api/v1`.

Every financial number in the product is produced here. The assistant is given those
numbers already worked out and is only allowed to phrase them — see
[The assistant](#the-assistant).

## Running it

```bash
cd server
npm install
cp .env.example .env     # then fill in MONGODB_URI and the two JWT secrets
npm run dev              # http://localhost:4000/api/v1

npm run seed             # optional: a demo user with a month of transactions
npm run test:api         # core integration tests, against the running server
npm run test:step        # budgets, recurring, notifications, time zones
npm run test:ai          # analytics, grounding, the guards around the assistant
npm run test:step5       # the quick-text parser, merchant memory, receipts
npm run test:step6       # isolation, API shape, export, account deletion
```

`GROQ_API_KEY` is optional. Without it every AI endpoint still answers, using the
deterministic wording the analytics service produces, and `/ai/status` reports
`available: false` so the app can explain rather than fail. The quick-text parser
does not need it at all — amounts, dates and payment methods are read by rule.

`CLOUDINARY_*` is optional too, and all three or none. Without them
`/receipts/status` reports `storage: false`, the app hides the camera button, and
nothing else changes.

Generate the secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The app bootstraps everything else. Registering creates the user, copies the Indian
default category tree onto them and gives them two accounts to start from, all in one
transaction.

## Endpoints

| Method | Path | |
| --- | --- | --- |
| `GET` | `/health` | Status and database connectivity. |
| `POST` | `/auth/register` | Creates the user, seeds their data, returns a token pair. |
| `POST` | `/auth/login` | |
| `POST` | `/auth/refresh` | Rotates the pair. The old refresh token is spent. |
| `POST` | `/auth/logout` | Revokes one session. |
| `GET` | `/auth/me` | |
| `GET`/`PATCH` | `/users/me` | Name and currency. |
| `POST` | `/users/me/password` | Ends every session, including the caller's. |
| `GET`/`POST` | `/accounts` | `?includeArchived=true` to see archived ones. |
| `GET`/`PATCH`/`DELETE` | `/accounts/:id` | |
| `GET`/`POST` | `/categories` | `?type=expense\|income` |
| `PATCH`/`DELETE` | `/categories/:id` | Built-in categories are read-only. |
| `GET`/`POST` | `/transactions` | Filters below. |
| `GET` | `/transactions/summary` | `?from&to` — totals and the category split. |
| `GET` | `/transactions/daily` | `?from&to` — spend per local day, for the calendar. |
| `GET`/`PATCH`/`DELETE` | `/transactions/:id` | |
| `GET` | `/budgets` | `?month=YYYY-MM` — caps *and* progress in one response. |
| `POST` | `/budgets` | Overall or per category. |
| `PATCH`/`DELETE` | `/budgets/:id` | |
| `GET`/`POST` | `/recurring` | `?includeInactive=true` for finished rules. |
| `GET` | `/recurring/upcoming` | `?withinDays&limit` — the strip on Home. |
| `POST` | `/recurring/run` | Forces a scheduler pass. Safe at any time. |
| `GET`/`PATCH`/`DELETE` | `/recurring/:id` | |
| `POST` | `/recurring/:id/pause` | `{ paused }` |
| `GET` | `/notifications` | `?page&limit&unreadOnly` |
| `GET` | `/notifications/unread-count` | Just the badge. |
| `POST` | `/notifications/:id/read`, `/read-all` | |
| `POST`/`DELETE` | `/notifications/device` | Push token registration. |
| `GET` | `/analytics/overview` | `?from&to&previousFrom&previousTo&label` — every figure the Insights tab shows, in one aggregation. |
| `GET` | `/analytics/trend` | `?months=2..24` — a zero-filled monthly series. |
| `GET` | `/ai/status` | Whether a model is configured. |
| `GET` | `/ai/summary` | `?from&to…` — the summary card and the insight cards, from one overview. |
| `POST` | `/ai/ask` | `{ question, from, to, … }` — retrieval, then narration. |
| `GET`/`DELETE` | `/ai/chat` | The transcript. 30-day TTL. |
| `POST` | `/ai/categorise` | `{ merchant, description?, amount?, type? }` — a proposal. Writes nothing. |
| `POST` | `/ai/parse` | `{ text }` — "Petrol 1200" to a proposed transaction. Writes nothing. |
| `GET` | `/merchants` | `?q&limit` — names this user has used, most-used first. |
| `GET` | `/merchants/recall` | `?merchant` — what they usually file it under. No model. |
| `DELETE` | `/merchants` | `{ merchant }` — forgets one. |
| `GET` | `/receipts/status` | Whether storage and reading are configured. |
| `POST` | `/receipts/signature` | A signed permission to upload one image. |
| `GET`/`POST` | `/receipts` | List, or record an upload after verifying its signature. |
| `GET`/`DELETE` | `/receipts/:id` | Delete removes the row and the stored image. |
| `POST` | `/receipts/:id/extract` | Reads the image. Applies nothing. |
| `POST` | `/receipts/:id/attach` | `{ transactionId }` — or `null` to unlink. |
| `GET` | `/transactions/export` | `?from&to` — the ledger as CSV, in the usual envelope. |
| `DELETE` | `/users/me` | `{ password, confirm: "DELETE" }` — deletes everything. Final. |

List filters: `page`, `limit` (max 100), `type`, `accountId`, `categoryId`,
`paymentMethod`, `q`, `from`, `to`, `minAmount`, `maxAmount`, `sort`
(`-date`, `date`, `-amount`, `amount`, `-createdAt`, `createdAt`).

## Responses

One envelope, for everything:

```jsonc
{ "success": true,  "data": { … }, "meta": { … } }   // meta only on paginated reads
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "issues": [ … ] } }
```

`code` is what a client branches on — the message is written for a person and is free
to change. `issues` carries `{ field, message }` pairs so a form can put the message
under the right input rather than in a banner at the top.

Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `INTERNAL`.

## Dates and time zones

Every boundary the server computes for itself — which month a budget covers, when
a recurring rule fires, which day a transaction is bucketed into — is a *local*
boundary, and local means the zone on the user's record (`user.timezone`, default
`Asia/Kolkata`), not the server's.

This is not a rounding error. A transaction entered at 11pm IST on the 30th lands
in the following month under UTC, which moves it out of the budget it was meant to
count against and into one that has not started yet. The user sees a budget that
does not add up and nothing on screen to explain why.

`lib/time.ts` owns all of it, on Luxon rather than hand-rolled `Intl` arithmetic.
India has no DST, so nothing here would visibly break today — but "our users do
not have DST" is an assumption that becomes false the first time someone travels,
and offset maths is the classic place to be quietly wrong for years. The daily
aggregation groups with Mongo's own `$dateToString` `timezone` option, so a month
of transactions never crosses the wire just to be counted.

The mobile app computes its period boundaries from the *device*, and syncs the
device zone onto the account at launch, so the two always agree about what day it
is.

## Budgets

A budget is a standing rule, not a row per month. Materialising one document per
category per month would mean a write every month for every user just to keep the
same numbers, and a gap in the data for anyone who did not open the app. The cap
is stored once and the spend against it is aggregated from the transactions on
read — which also means editing a budget corrects history rather than only
applying going forward, which is what someone who just fixed a typo expects.

`GET /budgets` returns caps and progress together. Two aggregations and one
category read regardless of how many budgets exist: the spend is grouped by
category in the database rather than queried per budget, which would be a round
trip per row on a screen that shows a dozen.

Transfers cannot consume a budget, by construction — the aggregation's `$match` is
`type: 'expense'`, so an ATM withdrawal is invisible to it.

`remaining` is floored at zero and `overBy` carries the other half, so a client
never has to decide what a negative "remaining" means.

## Recurring transactions

The schedule is a unit plus an interval, not a named frequency: "monthly",
"weekly" and "yearly" are `{month,1}`, `{week,1}` and `{year,1}`, so "every 3
months" costs nothing extra instead of a fifth enum value with its own branch
everywhere.

Occurrences are **counted, never accumulated**. `nextRunAt` is always recomputed
as `startDate + unit × interval × occurrencesCreated`, so a rule anchored on the
31st keeps the 31st in every long month instead of collapsing to the 28th the
first time February clamps it. Stepping one interval at a time gets that wrong,
permanently, on the first short month.

Two different first-run policies, because creating and resuming are different
intentions:

- **Creating or re-scheduling catches up once.** Adding "Netflix, monthly, from
  the 5th" on the 16th records this month's charge — and only this month's. The
  eight occurrences between January and September are skipped, because someone
  adding a rule wants a rule, not nine backdated debits that rewrite closed months
  and wreck the balance.
- **Resuming skips to the future.** A gym membership paused for three months must
  not charge on the way back in.

The scheduler is one in-process interval, not a cron service, because correctness
does not depend on the cadence: every pass asks the database what is due, and the
occurrence counter makes a repeat a no-op. Running late writes the same
transactions a moment later; running twice writes them once. It does assume a
single process — two instances would both pick up the same rule, and the fix at
that point is a lock collection, not a shorter interval.

## Notifications

Four kinds: budget nearing its limit, budget exceeded, a recurring charge coming
up, a recurring charge recorded.

The important field is `dedupeKey`. Every alert is *about* a specific thing in a
specific period — this budget, this month; this rule, this occurrence — and the
key names exactly that. A unique index on it makes "do not spam the user" a
property of the database rather than a discipline the calling code has to
remember: the budget check runs after **every** transaction write, and all but the
first insert for a given month simply fail the index and are ignored. That also
survives restarts, concurrent writes and two devices saving at once, none of which
an in-memory "already sent" set would.

Crossing from warning into exceeded *does* produce a second alert, because the two
keys differ — which is right, they are different pieces of news.

Per-user preferences are checked before an alert is written, so switching one off
stops it at the source rather than hiding it in the client. Push itself is a seam:
`deliver()` in `notification.service.ts` logs and returns, device tokens are
already stored on the user, and turning it on is one call to Expo's push service
from inside that function with no other file changing.

## Things worth knowing

**Money is an integer number of paise, everywhere.** Never a float of rupees. The
mobile client uses the same unit end to end, so nothing converts in the middle.
Amounts are always positive; `type` carries the direction, because a signed amount
means every aggregation has to remember this collection's sign convention and one of
them eventually forgets.

**A transfer is not income and not an expense.** `HDFC → Cash ₹10,000` debits one
account, credits the other, and contributes to neither total. Three things enforce
that rather than one: a transfer has no `categoryId` at all (the write schema forbids
it), `/summary` splits by `type` in the aggregation so transfers land in
`transferred` rather than `income` or `expense`, and the balance arithmetic lives in
one function (`balanceEffects`) that both the create and the edit path go through.

**Identity comes from the access token and nothing else.** No handler reads a user id
from a body, a query or a header. `validate()` strips unknown keys, so a client that
sends `userId` gets it dropped before any service sees it; every service function
takes the user id as its first argument and scopes its query by it. A missing row and
another user's row both answer 404, so the endpoints cannot be used to probe for ids.
`server/src/scripts/apitest.ts` asserts all of this.

**Balances move inside a Mongo transaction.** A crash between "insert the expense" and
"debit the account" would leave a ledger that does not add up, and that is not a state
the app can repair. `withTransaction` detects replica-set support at boot; on a
standalone `mongod` — no sessions — it degrades to unsessioned writes and says so in
the startup log.

**Refresh tokens rotate, and reuse revokes everything.** Each one is stored as a
SHA-256 digest with a TTL index, never in the clear. Presenting a token that has
already been spent is the signature of a stolen token, so the response is to kill
every session the user has rather than guess which side was the attacker. This is
also why the mobile client refreshes through a single shared promise — four parallel
refreshes would look exactly like theft.

**Deleting an account or category archives it when anything references it.** Removing
one outright would orphan months of transactions and silently change totals for
periods that are already closed. The `DELETE` response says which happened
(`{ deleted, archived }`) so the client can word the toast correctly.

**Analytics is one `$facet`, not five queries.** Totals, the category split, the
largest expenses, the daily buckets and the weekly buckets all come out of a single
pass over the same matched set. Day and week keys are produced with `$dateToString` in
the account holder's own zone, so a late-night expense lands on the day they had it.

**The daily average divides by days elapsed, not days in the period.** Dividing a
half-finished September by 30 understates it by half and makes the projection that
follows wrong. `projectedTotal` is null once the period is over, because extrapolating
a finished month is not a forecast.

**Login is constant-time-ish about unknown emails.** A missing user still pays for a
bcrypt comparison before the same "Email or password is incorrect" comes back;
otherwise the endpoint reports which of a million addresses are registered purely by
how fast it says no.

## The assistant

### The one rule

**No number reaches a user unless this server computed it.**

`analytics.service.ts` is the only place a financial figure is produced, and it
computes every derived one too — deltas, shares, averages, projections — so the model
never has a reason to reach for a calculator. `ai.prompts.ts` renders those figures as
pre-formatted strings; the model never sees a raw integer.

Then `ai.guard.ts` checks the result. `checkGrounding` extracts every rupee amount,
percentage and number from the reply and rejects any that does not appear in the fact
sheet, comparing on the digits alone so spacing and separators do not matter. Numbers
at or below 31 with no currency or percent marker pass as counts — refusing "your top
3 categories" would make the assistant unusable without making it safer.

A rejected reply is regenerated once, with the offending figures named in the retry.
If it invents again, the reply is discarded and the caller's deterministic text is
returned with `fromModel: false`. The app labels that **Computed**.

Ask a model to summarise "₹28,450 this month, ₹24,100 last month" and it will very
often volunteer "…an increase of ₹4,350". The arithmetic is usually right, which is
precisely the danger: nothing checked it, and the one that is wrong looks identical.

### Retrieval before generation

`POST /ai/ask` never hands a question to a model and hopes. It resolves an intent
first — `total_spend`, `category_spend`, `savings`, `income`, `largest_expenses`,
`top_category`, `comparison`, `budget_status`, `today`, `advice`, `general` — with the
model classifying and a keyword matcher as the fallback. **That classification never
involves a number.**

The server then queries MongoDB for exactly what the intent needs and passes only the
result to the model, whose entire job is to phrase it. The retrieved figures come back
in `answer.context` so the app can show its working.

Advice questions are answered without any model call at all: they are matched and
declined here, because a model told not to give financial advice usually complies, and
"usually" is not a standard to hold financial advice to.

`getCategoriesSpend` exists because of a real bug. A question about a *group* ("food")
was being answered by summing that group's categories out of the overview's top-N
list, which is truncated — anything past the cut-off silently vanished and the answer
came back low. Group questions now aggregate over every category in the group.

### Safety, and where each rule lives

| Rule | Enforced by |
| --- | --- |
| Never invent a transaction or a figure | `checkGrounding` + the deterministic fallback |
| Never claim a transaction exists | Retrieval returns real rows or none |
| Never modify data without confirmation | No AI route writes anything |
| Never give investment advice | `ADVICE_QUESTION` declines server-side; `containsInvestmentAdvice` scans generated text too |
| Never present an assumption as fact | Projections are labelled estimates in the prompt |
| Say when the data is thin | `isLimitedData` — fewer than five expenses |

### The key, and the budget

`groq.client.ts` is the only file that reads `GROQ_API_KEY`. Nothing else in the
system can reach Groq, and the key never leaves the server.

Rate limiting is per authenticated user, not per IP — the thing worth limiting is one
account asking a hundred questions a minute, not a household sharing a connection.
`ipKeyGenerator` handles the unauthenticated fallback, so a caller cannot mint keys
out of an IPv6 range.

Groq meters tokens per minute. A 429 is retried once after the delay Groq itself
suggests, then attempted on the smaller model, which has its own budget, and only then
given up on. Quality degrades one notch at a time — best model, smaller model, computed
text — instead of collapsing to canned wording on the first rate limit.

One non-obvious thing about the gpt-oss models: reasoning tokens are drawn from
`max_completion_tokens`. A structured call with a tight budget spends it all on
thinking and returns an empty generation, which Groq then rejects as invalid JSON.
Classification and extraction therefore ask for `reasoning: 'low'` and a budget with
room to spare.

## Fast entry

### The parser never asks a model for a number

`modules/ai/quickEntry.ts` is pure functions with no network and no state. The amount,
the date and the payment method are found by rule; only the *category* is ever
inferred. Same principle as the assistant, and it matters more here — this is the one
endpoint whose output gets saved rather than merely read.

Two details that are easy to get wrong:

**The date and the method are removed before the amount is searched for.** Both contain
digits. "rent 25000 on 1 sep" holds a 1 that is plainly not money, and scanning the raw
string finds two candidates, takes the larger and reports an ambiguity the parser
invented. Ordering the passes is the fix, not a cleverer regex.

**A long digit run is not an amount.** A UPI reference is the most common long number
on a payment screen, and reading `419238712344` as rupees would record a transaction
for eleven lakh.

`/ai/parse` returns a proposal with its own `confidence` and a list of `warnings` in
plain words, plus the substring each field was read from so the app can show its
working. It writes nothing. Everything is confirmed in the app before it becomes a
transaction.

## Merchant memory

`MerchantMemory` holds one row per **(user, merchant, category)**, not one per
merchant. That is what makes a correction work rather than a coin flip: filing Amazon
under Shopping nine times and then once under Electronics records a second opinion that
has to earn its place, instead of erasing the nine. Recall takes the highest count, ties
broken by recency.

Storing only the winner would make the most recent tap authoritative, and one mistyped
category would poison that merchant forever.

`merchantKey()` collapses `IndianOil`, `INDIAN OIL`, `indian-oil` and
`Indian Oil #44121` onto one key — every separator goes, and digit runs of four or more
are stripped as references while short ones stay, because `7 Eleven` is a name. Without
that collapse the memory accumulates twenty rows of one each and never reaches a
confident answer.

Learning happens **after** a transaction is written, never before, because what someone
saved is the only thing they have actually confirmed. Accepting a suggestion and
correcting one arrive at the same call. Failures are swallowed: refusing to record an
expense because a statistics row would not upsert is not a trade anyone would make.

`suggestCategory` consults **memory → brand table → model**, and returns which in
`source`. The app renders that distinction, because the three do not deserve equal
trust.

## Receipts

### The bytes never pass through here

The app asks for a signed ticket, uploads straight to Cloudinary, and reports what came
back. This server verifies that report against the same secret before storing a thing.

Proxying the image instead would double the transfer, hold a Node process open for the
length of a mobile upload, and make the phone's progress bar a fiction — it would fill
as the phone finished talking to us, not as the image finished arriving.

`lib/cloudinary.ts` is the whole integration: two HTTP calls and a SHA-1. The official
SDK brings a config singleton and a streaming upload API this server deliberately does
not use.

**Signed, not unsigned.** An unsigned upload preset is a public write endpoint on your
account that anyone who opens the app bundle can find, and it cannot constrain where
the file lands. Here the server picks the folder — per user — and the public id, the
signature covers both, and a client that edits either has a signature that no longer
matches.

**`verifyUpload` is not optional.** Without it this is an endpoint that takes an
arbitrary URL from a client and hands it to every other client to render, under the
heading "your receipt". Cloudinary signs its own response over the public id and the
version; recomputing that here is what makes the rest of the payload safe to believe.

### Reading them

`GROQ_VISION_MODEL` — `qwen/qwen3.8-27b` by default, because that is what this account
actually has. Vision is a separate capability from prose and `GET /models` is the
authority, not the documentation.

This is the only place in the system where a model produces a number nothing else can
check. Everywhere else a figure is computed from the database or matched by rule. Here
the ground truth is a photograph, so the safety moves from verification to consent:

- Nothing extracted is written to a transaction. `/receipts/:id/extract` stores the
  reading on the *receipt*, beside the expense rather than merged into it.
- The model returns the printed line it read the total from, so a person can check the
  figure against the paper rather than trust it.
- Illegible fields come back `null`. The prompt says so three times, and a total that
  is zero, negative or above a crore is rejected as a misread.
- Downgrading to the small model on a rate limit is disabled, because it cannot see —
  it would return a confident description of an image it never received.

Keeping the extraction beside the transaction rather than inside it also preserves the
interesting case: a split bill, a tip added later or a partial refund produces an honest
mismatch between what the receipt said and what was recorded, and flattening the two
would destroy the evidence exactly when it starts to matter.

## Export and deletion

`GET /transactions/export` returns a CSV inside the normal envelope rather than as a
file download. Every other endpoint answers the same shape, the app has to write the
file locally before it can be shared anyway, and a one-off content type would be a
special case in the client for no gain. The window is required and capped at five
years — an export with an implied range is how someone ends up with a file covering
this month when they wanted the year, and finds out after they have closed the
account.

`DELETE /users/me` is the only call in the API that cannot be undone, so it takes the
password and a typed `confirm: "DELETE"`. Both are checked here rather than only in
the app: a destructive endpoint that fires on a single malformed request is a
destructive endpoint waiting to fire on one.

It deletes rather than flags. Images go first and best-effort — Cloudinary being slow
must not leave someone unable to close their account — then every collection, then the
user. The collections are an explicit list rather than a loop over registered models,
because a new module that silently fails to be cleaned up is a privacy bug nothing
would catch; an explicit list at least shows up in a diff. `step6test` creates
something in each one and then goes looking for it.

Two things that are easy to get wrong and are asserted:

- **The shared category tree survives.** Per-user copies carry a `userId`; the
  defaults carry `null`. A careless `$or` in the delete would empty the tree for
  every account at once.
- **The session dies with the account.** Refresh tokens are deleted too, so the token
  that made the call stops working the moment it succeeds.

## Performance notes

**No `$text` index on transactions.** Search is a case-insensitive substring match,
because people type "swig" and expect Swiggy — which a stemmed, word-boundary text
search does not return. A text index would therefore never be consulted by any query
this app makes while still costing a write on every insert to the largest collection
here. The regex runs inside the `userId` index bound, so it scans one person's
transactions rather than the collection.

**Every index is compound and starts with `userId`**, because every query does. The
list, each filter, the calendar and the analytics facet all narrow to one person
first; an index that did not would have the database sort the whole collection to
answer "my last 25 transactions".

## Layout

```
src/
  config/      env (zod-validated at boot), logger (pino), db (+ transaction support)
  lib/         ApiError, the response envelope, tokens, passwords, sessions, paging
  middleware/  auth, validate, rate limits, request id + logging, error handler
  lib/time     Timezone and recurrence arithmetic (Luxon)
  modules/     auth · users · accounts · categories · transactions
               budgets · recurring (+ scheduler) · notifications
               analytics (aggregation only) · ai (groq client, guard, prompts,
               quick-entry parser) · merchants (memory) · receipts (+ reader)
               (each: model, schemas, service, routes — controllers where they earn it)
  lib/         …and cloudinary: signing, verification, derived URLs
  routes/      v1 router
  seed/        the Indian default category tree, and per-user seeding
  scripts/     seed (demo data), apitest + steptest + aitest + step5test,
               fixtures/ (a rendered receipt, for the reader's tests)
```

Services never touch `req`/`res`; routes never touch Mongoose. That split is what lets
`apitest.ts` exercise the real behaviour over HTTP without any mocking.
