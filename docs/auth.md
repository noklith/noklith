# Opt-in wallet authentication

`apps/api/src/auth/service.ts` implements an **EOA-only** SIWE service. HTTP sign-in is available only when the operator explicitly enables wallet authentication in testnet mode and supplies a canonical HTTPS origin, sign-in URI, chain allowlist and trusted account inspector. It is off by default. It runs on https://noklith.com: the website signs in through WalletConnect (MetaMask on a phone, browser extensions) and the iOS app through Reown AppKit.

The verifier uses pinned **viem 2.57.3** (MIT), recorded with transitive integrity hashes in `apps/api/package-lock.json`. Installation scripts were disabled. Package source was inspected for the SIWE message builder and EOA signature verifier; cryptography is not implemented locally. Primary references: [ERC-4361](https://eips.ethereum.org/EIPS/eip-4361), [viem message creation](https://viem.sh/docs/siwe/utilities/createSiweMessage), and [viem EOA verification](https://viem.sh/docs/utilities/verifyMessage).

## Implemented behavior

- Explicit canonical HTTPS origin, same-origin URI and chain allowlist are required. There is no default network. Only chains from the fixed list in `chain/networks.ts` can be configured: test networks with `NETWORK_MODE=testnet`, real networks (Base, Polygon, BNB Smart Chain) only with `NETWORK_MODE=mainnet`. The tests use synthetic chain metadata and make no RPC requests.
- Server-issued challenges bind a checksum address, chain, origin, URI, fixed statement, version, 256-bit random nonce, request ID, issue time and five-minute expiry. The service accepts only its exact original message; the same message must also reconstruct identically under the current server configuration. Extra lines and changed fields are rejected.
- A 65-byte EIP-191 EOA signature is checked against the challenge address. Compact, contract-wallet and counterfactual signature formats are not supported. An invalid signature does not consume the nonce or call the account inspector.
- A required injected account inspector must return the actual RPC chain ID and account code. Missing data, a chain mismatch and an unavailable RPC fail closed. Non-empty code is explicitly unsupported, including delegated-code accounts. The [RPC adapter](rpc.md) uses explicitly configured chain endpoints with bounded requests. There is no permissive default inspector.
- After verification, a conditional database update consumes the nonce exactly once. Identity lookup/creation and session insertion occur in the same transaction; a failed insert rolls back consumption. Expiry is checked again after signature/account inspection, including at the exact expiry instant.
- Sessions last one hour, bind address/chain/audience, store only a SHA-256 token hash, and can be revoked. Identity normalization is case-insensitive while responses use checksum addresses. Repeated login uses the same identity. Signatures and private keys are not stored.

Migration `002_siwe_auth.sql` is additive. `wallet_identities`, `siwe_challenges` and `siwe_sessions` are separate from synthetic fixture identities and tokens. A wallet token cannot authenticate to the fixture API, and a fixture token cannot authenticate to this service. A signed-in wallet owns at most one card, issued on request; fixture ledgers are never assigned to a wallet.

## HTTP contract and request limits

- `POST /v1/auth/challenge` accepts `address` and integer `chain_id`; returns `id`, the exact `message` to sign and `expires_at`.
- `POST /v1/auth/verify` accepts `challenge_id`, `message` and a 65-byte hexadecimal `signature`; returns an expiring bearer token and wallet identity.
- `GET /v1/me` authenticates only the session type configured for that application. `POST /v1/auth/logout` with `{}` revokes only that mode's session and returns 204.
- `/v1/config` advertises `wallet_auth_enabled: true` and public origin/URI/chain metadata only when that application has an explicitly constructed verifier. RPC endpoints and credentials are omitted. After sign-in the wallet's card, history, top-ups and deposit address are available.

Migration `003_auth_rate_limits.sql` adds shared, persistent fixed-minute buckets. Challenge requests permit 10 per source IP and 3 per address; verification permits 20 per IP and 5 per challenge. IPv4 clients are counted per address, IPv6 clients per /64, and each IPv6 /48 additionally gets 30 challenges and 60 verifications per minute. A request with a malformed address or challenge ID is refused with 400 before any bucket is touched. Buckets are checked network → client → subject → shared ceiling and stop at the first refusal, so a refused request never counts against the 3000-request shared minute ceiling; one client or network cannot use it up for everyone. Verification limits run before signature work. Per-client buckets are capped at 65536 rows with saturated counters; when that table is full, new clients are limited by the shared ceiling alone instead of being locked out. A distributed flood is stopped earlier by a Cloudflare rate-limiting rule on `/v1/auth/*` (20 requests per 10 s per IP). Buckets store scoped SHA-256 digests rather than raw IPs/addresses. These hashes are not claimed to anonymize small identifier spaces.

Proxy headers are trusted only from the single address or CIDR block in `TRUSTED_PROXY` (on the server: the local Caddy, which sets `X-Forwarded-For` to the client IP it took from Cloudflare's `CF-Connecting-IP`). Without it, rate limits use the socket peer address. Rate checks run before request-schema validation, after JSON parsing within an 8192-byte body limit. Malformed JSON rejected by the parser is outside these route buckets; deployment-level request controls remain necessary.

A PostgreSQL transaction advisory lock serializes bucket allocation, maintenance and the short session-creation commit across workers. Account inspection remains outside that lock. The session commit shares the maintenance lock so expiry cleanup cannot delete a challenge while a new session is being inserted. Rate-window and commit timestamps are read after acquiring the lock. Once per minute, an incoming authentication request removes expired sessions followed by expired challenges that no session references. Expired buckets are removed on each authentication request. Active sessions retain their challenge even after its five-minute sign-in window; revoked sessions remain stored until their expiry. Maintenance is lazy, so an idle deployment retains expired records until the next authentication request. Wallet identities are not automatically deleted.

When wallet authentication is configured, `/ready` also requires the `auth_maintenance` sentinel row created by migration 003. A missing table or row returns 503.

## Verification scope

`test/auth.test.ts` uses freshly generated ephemeral keys only in test memory. It tests real signing and recovery, message substitutions, another signer, malformed signatures, nonce uniqueness, six concurrent verification attempts, time boundaries, RPC/code policy failures, transactional rollback, session isolation, revocation, and reopening a persisted database. No user secret is requested or embedded.

`test/auth-http.test.ts` covers the HTTP contract, real test signatures, token revocation and cross-mode isolation, unavailable wallet card operations, schema rejection, unsupported code-bearing accounts, concurrent rate limits shared by app instances, untrusted proxy headers, global and storage caps, expiration cleanup and readiness. It also checks `/v1/me` over a temporary loopback TCP listener before and after logout. Its account inspector is a test double. `test/auth-rate-limit.test.ts` checks a queued request crossing a minute boundary without a database engine.

`test/postgres.test.ts` covers contention across real PostgreSQL connections: six concurrent connections, limits shared by two pools, and cleanup waiting for an in-flight verification. It runs in CI with `TEST_POSTGRES_URL`.

On iOS, `WalletAuthentication.swift`, `WalletSignInStore.swift` and `WalletHTTPAPI.swift` hold the client message policy, review/sign separation, account/topic/chain guards, late-token revocation, Keychain storage and an HTTPS transport that refuses redirects. `ReownWalletConnector.swift` connects them to Reown AppKit when the build carries a Reown project ID.

## Known gaps

- Smart-contract wallets (accounts with code) cannot sign in.
- Trust Wallet supports neither Base Sepolia nor Ethereum Sepolia, so it cannot connect while the service runs on test networks.
