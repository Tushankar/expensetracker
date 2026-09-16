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
npm run test:api         # integration tests, against the running server
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
| `GET`/`PATCH`/`DELETE` | `/transactions/:id` | |

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
  modules/     auth · users · accounts · categories · transactions
               (each: model, schemas, service, routes — controllers where they earn it)
  routes/      v1 router
  seed/        the Indian default category tree, and per-user seeding
  scripts/     seed (demo data), apitest (integration tests)
```

Services never touch `req`/`res`; routes never touch Mongoose. That split is what lets
`apitest.ts` exercise the real behaviour over HTTP without any mocking.
