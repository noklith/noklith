# API fixture and wallet authentication foundation

The API is a TypeScript/Fastify service with PostgreSQL migrations. It implements an **explicit screen fixture API**: isolated sessions, a demonstration card, a persistent history, creation of an empty card, and user freeze/unfreeze. It also supports separately configured [SIWE wallet authentication](auth.md) and [RPC account inspection](rpc.md). Wallet identities and fixture card ownership remain isolated. Receipt/transfer verification, exchange, real top-ups, card payments and issuer webhooks are not implemented.

`packages/api-contracts/src/index.ts` is the shared wire definition and contains the JSON Schemas used by Fastify. The iOS client uses the same snake_case fields. Responses use integer **strings** for USD cents. `network_mode` and `issuer_mode` are independent fields.

## Run on Windows

Node.js 24 is required. Use `npm.cmd` in PowerShell when script execution policy blocks `npm.ps1`. Dependencies are exactly pinned in `apps/api/package.json` and `package-lock.json`. No global package installation is required.

From the repository root:

```powershell
Set-Location apps/api
npm.cmd ci --ignore-scripts --cache .npm-cache
npm.cmd run check
npm.cmd test
```

Most tests run without a database server. They execute the actual PostgreSQL migration and API queries using the PGlite PostgreSQL WASM engine, including a disk-backed close/reopen check. PGlite is a development/test dependency only. Two additional tests require `TEST_POSTGRES_URL` targeting an isolated loopback database named `crypto_card_ci_test`; they explicitly skip when it is absent. They verify multiple real PostgreSQL connections for nonce consumption, shared request limits and concurrent cleanup/session creation. The manual `API checks` workflow supplies that disposable database and runs every test.

### Local fixture HTTP server without Docker

For this Windows workspace, a separate explicit development command runs the actual Fastify HTTP API with persistent PostgreSQL WASM storage:

```powershell
# In apps/api, after npm ci:
npm.cmd run dev:fixture
```

It binds only to `http://127.0.0.1:3000`, applies migrations, and stores its data in the ignored `apps/api/.local/fixture-db` directory. To use a different port, set `$env:FIXTURE_PORT = '3001'` before launching. Press Ctrl+C to close the HTTP listener and database. Run only one instance against this data directory. This command deliberately enables screen fixture sessions and reads no `.env`; it never turns ordinary `testnet` mode into a mock login. Use the PowerShell requests below to interact with it.

`npm.cmd run smoke:fixture` starts the same server on an ephemeral loopback port, calls it with real HTTP requests, and closes the listener/database in `finally`. It uses the same ignored development database, so stop an existing `dev:fixture` instance before running smoke. The smoke test creates synthetic records and revokes its session. It prints no access token.

`npm.cmd start` remains the ordinary entry point with `pg.Pool` and `DATABASE_URL`; it never loads PGlite. The local development command is not a hosted PostgreSQL service and does not verify testnet or wallet integration.

### PostgreSQL service

To run against a PostgreSQL service, install/start Docker Desktop separately or provide a PostgreSQL database. Docker and `psql` were not available in the implementation environment; the Compose process below has not yet been executed there.

```powershell
# In apps/api, with Docker available:
docker compose up -d
Copy-Item .env.example .env
npm.cmd run migrate
npm.cmd start
```

Compose publishes PostgreSQL only on `127.0.0.1:5432` and stores its data in a named volume. Its password is an intentionally public local development example. Never reuse it for hosted infrastructure. Migrations use an advisory transaction lock and stored SHA-256 checksums; changing an already-applied file is rejected. Run migrations explicitly before starting the API. Migration files in this initial runner must contain plain SQL statements, without embedded semicolons or function bodies.

The default `.env.example` uses `NETWORK_MODE=testnet`. In this mode `/health` and `/v1/config` work, but wallet authentication and top-up capabilities are explicitly `false`. No network has been selected: `networks` is empty. `/ready` returns 503 until database migrations are accessible. No fake wallet login is exposed.

For local fixture interaction through `npm.cmd start`, set `NETWORK_MODE=fixture` in `.env`, then restart the API. Fixture mode refuses to start with a non-loopback `HOST`; it is not a hosted authentication mechanism. The production entry point always uses `pg.Pool` and a real PostgreSQL connection, including when serving fixtures. The separate `dev:fixture` command above needs neither `.env` nor Docker.

```powershell
$session = Invoke-RestMethod http://127.0.0.1:3000/v1/fixture/sessions `
  -Method Post -ContentType application/json -Body '{"profile":"standard"}'
$headers = @{ Authorization = "Bearer $($session.access_token)" }
$card = Invoke-RestMethod http://127.0.0.1:3000/v1/card -Headers $headers
$headers['Idempotency-Key'] = [guid]::NewGuid().ToString()
Invoke-RestMethod "http://127.0.0.1:3000/v1/cards/$($card.card.id)/freeze" `
  -Method Post -Headers $headers -ContentType application/json -Body '{}'
```

Use only local test data. Neither this API nor the app needs private keys. Keep `.env` and access tokens out of source control. TLS configuration, deployment, pinning, and certificate rotation remain dependent on the selected hosted environment.

## Routes

All JSON responses have `Cache-Control: no-store`. Errors share `{ "error": { "code": "…", "message": "…", "request_id": "…" } }`. Unexpected server errors use a generic public message. Authenticated fixture routes use `Authorization: Bearer <access_token>`.

| Method and path | Request | Result |
|---|---|---|
| `GET /health` | None | `{ "status": "ok" }`; process liveness |
| `GET /ready` | None | `{ "status": "ready" }` or 503 if migration table is unavailable |
| `GET /v1/config` | None | Mode, capability flags, limits and empty network configuration |
| `POST /v1/fixture/sessions` | `{ "profile": "standard" }`, `empty`, or `risk` | Expiring fixture bearer and synthetic user; route absent in ordinary mode |
| `POST /v1/auth/challenge` | `address`, `chain_id` | SIWE message; route exists only with explicit testnet auth configuration |
| `POST /v1/auth/verify` | `challenge_id`, exact `message`, `signature` | Wallet bearer and identity; separate from fixture sessions |
| `GET /v1/me` | Bearer | Fixture identity in fixture mode; SIWE identity in configured testnet mode |
| `POST /v1/auth/logout` | Bearer and `{}` | 204; repeated revocation is harmless |
| `GET /v1/card` | Bearer | `{ "card": … }`, or `{ "card": null }` before issuance |
| `POST /v1/cards` | Bearer, `Idempotency-Key`, `{}` | Create or return the user's single demonstration card |
| `POST /v1/cards/:id/freeze` | Bearer, `Idempotency-Key`, `{}` | `{ "card": … }` with user freeze |
| `POST /v1/cards/:id/unfreeze` | Bearer, `Idempotency-Key`, `{}` | `{ "card": … }` after removing a user freeze |
| `GET /v1/history` | Bearer; optional `limit=1..50`, `cursor` | `{ "items": […], "next_cursor": … }`; cursor is a string or null |

Example card response:

```json
{
  "card": {
    "id": "b4e124f0-bf7a-42b9-996f-09a8f7e3249b",
    "status": "active",
    "currency": "USD",
    "last_four": "0428",
    "available_cents": "22310",
    "held_cents": "850",
    "issuer_mode": "demo"
  }
}
```

The standard profile seeds $250.00, a $18.40 authorization followed by capture, and a pending $8.50 authorization. Available funds are $223.10; $8.50 remains held. The four ledger events are separate history entries, so clients must not count both an authorization and its capture as two purchases. Each fixture history item has `demonstration: true`, `network: null`, and `transaction_hash: null`. These records never claim on-chain settlement. The `empty` profile has no card/history; creating a card gives zero balances. The `risk` profile starts blocked.

History is ordered by timestamp and UUID descending. Cursors are opaque to clients and validated within the authenticated user's history. Page size defaults to 20. Pull REST again after foregrounding or a lost connection; WebSocket events are not implemented in this milestone.

## Persistence and safety boundaries

Fixture login creates a new isolated synthetic account on each request. It is a credential issuance endpoint rather than a wallet-signature flow. Bearers contain 32 random bytes, expire after one hour, and are stored only as SHA-256 hashes in the database. Logging redacts authorization and cookie headers. Expired and revoked sessions cannot access fixture data. Ordinary `testnet` routes reject all such sessions even if pointed at the same database.

Card creation and state changes require `Idempotency-Key` (8–128 ASCII letters, digits, `_` or `-`). Keys are scoped to a user, stored transactionally with the response, and bound to the request operation/card. Repeating a successful request returns its original response; reusing the key for a different operation returns 409. A repeated old response is a historical result, so refresh `GET /v1/card` for current state. Login issues a fresh session on each request; logout is naturally idempotent.

User-scoped row locks serialize mutations in PostgreSQL. A unique database constraint enforces one card per user. A request for another user's card returns 404. Only `active` and `frozen_by_user` are reachable through freeze controls; risk-blocked, closed, replaced, and provisioning cards cannot be activated by these routes. State transitions and idempotency responses commit together. Changing state never changes balances.

Available/held balances are derived from ledger deltas, not a mutable `balance` field. Each ledger source is unique per card, and SQL constraints enforce the accounting effect of each event. The fixture API only seeds entries and exposes no monetary mutation endpoint. There is no capture/refund simulator API yet, and no claim that risk checks or top-up limits are enforced for unsupported operations.

Published limits are $500 per top-up, $1,000 daily spending, and $5,000 each for monthly spending/top-ups, with UTC calendar periods. These are configuration for the forthcoming operation service. They do not enable transfers. Token decimals, conversion rounding, reservation rules, velocity limits, confirmations, and reorg policies will be implemented with the selected testnet adapter. No fractional-number money arithmetic is performed in this milestone.

## Verification

The `API checks` workflow (`.github/workflows/api-checks.yml`) runs on every push and pull request to `main`: type checking, the full test suite on PGlite and on a real PostgreSQL 18.3 service, the loopback smoke scenario, `npm audit` gates and a gitleaks scan of the whole history. Tests use ephemeral keys and RPC doubles; no real wallet, RPC provider or card issuer is contacted.

## Earlier verification recorded on 2026-10-07

`npm.cmd run check` passed with TypeScript 7.0.2. `npm.cmd test` passed all 13 tests (3 API, 7 standalone authentication, 3 monetary boundaries). API assertions include:

- Invalid modes, live issuer, malformed ports, and publicly bound fixture configuration are rejected.
- Ordinary mode advertises unavailable wallet/transfer features, exposes no fixture login, and rejects synthetic access.
- The real migration runs twice safely, then fixture state survives database close/reopen.
- Foreign-card mutation and foreign-history cursor use fail; session tokens are hashed, logout revokes access, and expiry is enforced.
- Six parallel identical freeze requests produce one state event; changed-payload key reuse conflicts, and replay survives restart.
- User unfreeze succeeds while risk unfreeze/freeze fail. Balances stay distinct from holds.
- History pagination has no duplicates; invalid limits and unknown request fields are rejected; empty-card creation starts at zero.

Dependency installation reported 0 known vulnerabilities in 81 audited packages at installation time. [Authentication tests](auth.md) additionally check real EOA signatures using ephemeral test keys, nonce replay, domain/URI/chain/time binding, rollback, isolated sessions and persisted revocation. [Monetary tests](money.md) check exact integer conversion, fractional-cent rejection, single top-up boundaries and overflow. The additive authentication migration leaves existing fixture routes and identities separate.

A production-hosted PostgreSQL run, native client/server integration, external-wallet/RPC authentication, transaction verification, atomic monthly/velocity limits, webhook deduplication, top-up recovery, and device security checks remain unverified or unimplemented. The later CI concurrency checks above cover authentication and its cleanup/limits, not the remaining financial workflows.

Additional Windows HTTP evidence: `npm.cmd run smoke:fixture` exited 0 on 2026-10-07. It started a real loopback listener with the persisted PGlite development database and checked health/readiness, configuration, creation of a fixture session, card balances, four history events, freeze, unfreeze, logout, and rejection of the revoked bearer. It closed the listener and database in `finally`; no server was left running. `npm.cmd run check` also passed after adding the local entry point. This HTTP check uses the same migrated fixture data/service implementation as the app API, without asserting real wallet or hosted-database integration.

## Primary implementation references

- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) — request/response JSON Schemas; this API disables coercion and property removal so malformed bodies are rejected.
- [node-postgres transactions](https://node-postgres.com/features/transactions) — a transaction uses one checked-out client through commit/rollback.
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html) — row and advisory locks used by mutations/migrations.
- [PGlite API](https://pglite.dev/docs/api) — embedded SQL and transaction execution for local verification.
- [Node.js TypeScript support](https://nodejs.org/api/typescript.html) — erasable TypeScript runs on Node 24; static checking is a separate `tsc --noEmit` step.

Library versions were checked through the npm registry and pinned, with transitive versions recorded in the lockfile. The API package remains independent of a repository-level JavaScript workspace.
