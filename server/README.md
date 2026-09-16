# Paisa API

The backend for the Paisa expense tracker: authentication, accounts, categories and
transactions. Node + Express 5 + TypeScript + Mongoose, everything under `/api/v1`.

## Running it

```bash
cd server
npm install
cp .env.example .env     # then fill in MONGODB_URI and the two JWT secrets
npm run dev              # http://localhost:4000/api/v1

npm run seed             # optional: a demo user with a month of transactions
npm run test:api         # core integration tests, against the running server
npm run test:step        # budgets, recurring, notifications, time zones
```

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

**Login is constant-time-ish about unknown emails.** A missing user still pays for a
bcrypt comparison before the same "Email or password is incorrect" comes back;
otherwise the endpoint reports which of a million addresses are registered purely by
how fast it says no.

## Layout

```
src/
  config/      env (zod-validated at boot), logger (pino), db (+ transaction support)
  lib/         ApiError, the response envelope, tokens, passwords, sessions, paging
  middleware/  auth, validate, rate limits, request id + logging, error handler
  lib/time     Timezone and recurrence arithmetic (Luxon)
  modules/     auth · users · accounts · categories · transactions
               budgets · recurring (+ scheduler) · notifications
               (each: model, schemas, service, routes — controllers where they earn it)
  routes/      v1 router
  seed/        the Indian default category tree, and per-user seeding
  scripts/     seed (demo data), apitest + steptest (integration tests)
```

Services never touch `req`/`res`; routes never touch Mongoose. That split is what lets
`apitest.ts` exercise the real behaviour over HTTP without any mocking.
