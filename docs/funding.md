# Testnet funding, cards and limits

Test network: **Base Sepolia (84532)**, asset **USDC test token by Circle** `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals, [Circle address list](https://developers.circle.com/stablecoins/usdc-contract-addresses)). No swap: USDC is credited 1:1 in cents. ETH and a second network remain scope questions.

## Card ownership

A verified SIWE wallet identity maps to its own `app_users` row (`authentication = 'siwe'`). A different address is a different owner with a different card. Fixture users can never hold a wallet identity. Another owner's card or top-up ID returns 404.

Cards are issued through `CardIssuerAdapter`, with two implementations:

- `DemoIssuer` (`ISSUER_MODE=demo`, the default): no card network. Test details use the non-network `9999` prefix and cannot pay anywhere.
- `IzipayIssuer` (`ISSUER_MODE=izipay`): virtual Visa cards from IZIPAY Business. A live key additionally needs `IZIPAY_ALLOW_LIVE=true`, and real networks (`NETWORK_MODE=mainnet`) are refused unless the issuer is IZIPAY with a live key.

Details (`POST /v1/cards/:id/credentials`) are fetched on demand, live 60 s, are limited to 10 reveals per card per hour and are never stored. Blocked, closed or replaced cards reveal nothing.

What IZIPAY does not offer, the app does not pretend to do. Pause and resume go to IZIPAY first (`POST /cards/{id}/freeze` and `/unfreeze`, repeat-safe) and only then change the card here; if IZIPAY itself locked the card, resuming returns `409 card_locked_by_issuer` and the user must contact IZIPAY support. The post-refill risk pause still skips IZIPAY cards. Observed 2026-10-20: the IZIPAY sandbox confirms freeze and unfreeze but neither records `is_frozen` nor declines a sandbox purchase on a frozen card, so the effect at IZIPAY is verified only by its answer until it is checked with a live card. Purchases are made and authorized at IZIPAY, so our spend limits and purchase rules apply to DemoIssuer cards only; for IZIPAY cards the issuer's balance is read back and differences are recorded as purchases or refunds.

## Top-up flow

| Step | Endpoint | Status |
|---|---|---|
| Terms and reservation | `POST /v1/top-ups` `{chain_id, asset, amount_cents}` + `Idempotency-Key` | `quoted` (10 min) |
| Accept terms, get exact transfer | `POST /v1/top-ups/:id/accept` | `awaiting_signature` |
| Wallet broadcasts; app sends hash | `POST /v1/top-ups/:id/transaction` | `submitted` |
| Receipt found, below threshold | worker or `POST /v1/top-ups/:id/check` | `confirming` |
| Transfer verified, issuer credit pending | — | `funding_pending` |
| Ledger credited | — | `credited` |
| Ends | `POST /v1/top-ups/:id/cancel` (before hash only), expiry, verification failure | `cancelled`, `expired`, `failed` + `failure_reason` |

`accept` returns `{to: token, data: transfer(recipient, units), value: 0x0}`. The wallet signs and sends it; the app never sees a private key.

Verification (`ChainAdapter`, bounded JSON-RPC): actual chain ID, receipt status, an ERC-20 `Transfer` log from the configured token contract with `from = signed-in wallet`, `to = configured recipient`, `value = token_units` exactly, and `TOP_UP_CONFIRMATIONS` blocks (default 5). The client hash is only a lookup key. Each `(chain, hash, log index)` is credited once (`chain_transfers` primary key); one hash can be linked to only one active intent.

Failure reasons: `transaction_reverted`, `no_matching_transfer` (wrong recipient/token/sender or someone else's hash), `amount_mismatch`, `transaction_not_found` (30 min after submission or quote expiry), `transfer_already_used`, `quote_expired`, `submit_deadline_passed`, `user_cancelled`.

**Separate stages.** A verified transfer moves to `funding_pending`; the issuer credit is retried with backoff (10 s doubling, max 10 min) and is idempotent per intent. After 24 failed attempts, or if the issuer reports more on the card than was requested, automatic retries stop: `needs_review_at` is set and the operator is alerted (`funding_needs_review` in the API log). The status stays `funding_pending`; after checking the load at the issuer the operator clears `needs_review_at` (and `funding_attempts`) to resume, so a load is never re-sent after the issuer's idempotency window. Retrying never asks for a new transfer or re-verifies the chain. All progress is in PostgreSQL, so the in-process worker resumes after a restart.

**Reorganizations.** Until the threshold, every check re-reads the receipt: a vanished receipt returns the intent to `submitted`. After crediting, no automatic reversal; a deeper reorg would be corrected with a compensating ledger entry by an operator (not automated in the demo).

**Late wallet broadcast.** A hash is accepted for 60 min after the quote expires (stablecoin 1:1, no price risk). A transfer sent after cancelling or after that window is not credited automatically and needs manual handling (testnet funds only).

## Limits (UTC calendar periods)

Single top-up ≤ 500.00 USD; monthly top-ups ≤ 5,000.00 (active and credited intents count by creation time; failed/cancelled/expired release); daily spend ≤ 1,000.00 and monthly spend ≤ 5,000.00 (authorizations by their time, minus reversals of those authorizations; refunds do not restore allowance). Zero, negative, fractional or non-canonical amounts are rejected. Checks run under the card row lock, so concurrent requests cannot both pass (verified with six PostgreSQL connections in CI).

Rounding: USDC units → cents is exact (`units % 10^4 == 0` is required); nothing is rounded silently.

## Test purchases (DemoIssuer)

Card events arrive as signed notifications at `POST /v1/issuer/demo/notifications`: header `x-demo-issuer-timestamp` (ms) and `x-demo-issuer-signature` = HMAC-SHA256(`DEMO_ISSUER_WEBHOOK_SECRET`, `"<timestamp>.<raw body>"`), ±5 min. Each event ID is stored once (`issuer_events`: verified → processed / declined / failed); a repeat returns the stored result with `duplicate: true` and changes nothing.

`POST /v1/demo/card-events` is the restricted generator: it signs an event for the caller's own card (60 per hour) and sends it through the same path. Nothing here is a Visa payment.

| Event | Rule | Ledger |
|---|---|---|
| `authorization` | Declined (no entry) when frozen (`card_frozen`), blocked/closed (`card_blocked`), insufficient available balance or a spend limit | available −x, held +x |
| `capture` | Full amount of an unsettled authorization; allowed after a freeze (merchant already holds approval) | held −x |
| `reversal` | Full amount of an unsettled authorization | available +x, held −x |
| `refund` | Only after capture; total refunds ≤ captured amount | available +x |

History shows each entry; authorizations carry `current_status` (`held`, `completed`, `reversed`) so a hold, a final charge and a release are distinct.

## Events

`GET /v1/events?after=<seq>` returns ordered change signals (`card`, `history`, `top_up`) per user. REST stays the source of truth; a client that missed signals refetches from its last sequence.

## Configuration

See `apps/api/.env.example`: `TOP_UP_ENABLED`, `BASE_SEPOLIA_USDC_ADDRESS`, `TOP_UP_RECIPIENT_ADDRESS`, `TOP_UP_CONFIRMATIONS`, plus wallet authentication and `BASE_SEPOLIA_RPC_URL`.
