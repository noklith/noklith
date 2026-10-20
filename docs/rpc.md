# Wallet account RPC inspection

`apps/api/src/auth/rpc.ts` implements the required account inspector for SIWE verification. It checks the configured node's actual chain ID and reads the account's bytecode before authentication can succeed. No RPC endpoint is selected by default, and the adapter does not send transactions, read signing keys, or connect a wallet.

The adapter accepts an explicit list of `{ chainId, url }` endpoints. Only Base Sepolia (`84532`) and Ethereum Sepolia (`11155111`) are allowed; an empty list, duplicate chains, mainnets, and malformed configuration fail at construction. This allowlist does not select either network for deployment. Operator configuration and an actual provider remain required.

## Transport and account checks

Every inspection sends three sequential JSON-RPC requests over HTTPS: `eth_chainId`, `eth_blockNumber`, then `eth_getCode(address, blockNumber)`. The chain ID must match the requested configured chain before any account lookup. The block number is recorded once and passed to the code request. Quantities must use compact `0x` hexadecimal encoding; account code must contain complete bytes. These semantics follow the [Ethereum execution API documentation](https://ethereum.org/developers/docs/apis/json-rpc/).

Each request has a fresh ID. Responses must use JSON-RPC 2.0 and echo that exact ID; errors, missing results, malformed envelopes, invalid JSON/UTF-8, or unexpected content types fail closed. A response containing both a result and an error is rejected. See the [JSON-RPC response specification](https://www.jsonrpc.org/specification#response_object).

The adapter returns `{ chainId, code }`, including nonempty code. `AuthService` is responsible for rejecting contract or delegated-code accounts; the adapter never substitutes empty code for an unavailable or unsupported account. See [wallet authentication policy](auth.md).

## Bounds and secret handling

- One deadline covers all three requests and their response bodies: five seconds by default, configurable from 1 to 30,000 milliseconds. The caller's timeout also holds when a transport or stream ignores cancellation.
- Each decoded response is bounded to 128 KiB by default, configurable up to 1 MiB. Both declared Content-Length and streamed byte count are checked. No unlimited `response.json()` call is used.
- HTTP redirects are disabled; redirected or unsuccessful responses are rejected. HTTPS URLs cannot contain URL user information or fragments. Production uses Node's native fetch and normal TLS certificate validation; the adapter provides no insecure TLS option.
- Request credentials are omitted and caching is disabled. There are no retries, fallback nodes or cached account results. Rejected, completed and timed-out bodies receive best-effort cancellation, without waiting for an uncooperative stream's cancellation promise.
- `RpcInspectionError` contains only a fixed message and a safe error code. It excludes provider URLs, response bodies and underlying transport errors, which may contain API keys. Path/query API keys can be used in operator-supplied URLs; store those URLs as deployment secrets and do not print configuration or fetch arguments.

The optional injected `fetch` exists for tests. Production setup must not inject an implementation that bypasses TLS or redirects. Node process-level TLS/network configuration is outside this adapter's control.

## Trust and verification limits

This is a trusted-node read, not a cryptographic proof of chain state or transaction finality. A malicious or misconfigured provider can lie; use a provider controlled or trusted by the deployment owner. The account read is tied to a block number, not a block hash, so this does not establish reorganization-proof state. Changes to account delegation after the read are not tracked by this inspection.

`apps/api/test/rpc.test.ts` runs with in-memory fetch mocks only. It exercises configuration/network isolation, actual-chain mismatch, malformed responses and bytecode, response size limits, a single overall deadline, stalled fetch/body/cancel behavior, response cancellation, redirect/HTTP rejection, and credential redaction. It also verifies that nonempty account code is preserved for the authentication policy.

Run from `apps/api`:

```powershell
node --test test/rpc.test.ts
```

These tests do not contact a provider or prove real TLS/network availability. Live checks against the explicitly selected testnet/provider, a real external wallet signature, and deployment authentication remain separate acceptance work.
