# Personal deposit addresses

Each user with a card gets their own address, the same on every EVM network the server accepts. They send a
supported stablecoin to it from any wallet or exchange; the server notices the transfer and credits the card. Paying from a connected wallet
(`/v1/top-ups`) stays available.

```
user ──USDC──► 0x… personal address ──(watcher: Transfer logs, confirmed blocks)──► top-up ──► card credit
```

## How it works

- **Addresses** come from an account-level extended **public** key (`DEPOSIT_XPUB`, the xpub of
  `m/44'/60'/0'`): user number *i* gets `<xpub>/0/i`, which is the same address a standard wallet shows for
  `m/44'/60'/0'/0/i` from the seed. The server stores the xpub only. It can see deposits, never move them.
- **Watcher** (in the API process, every 15 s): for each network and token it reads `Transfer` logs to the
  issued addresses, only in blocks that already have the network's required confirmations, 2,000 blocks per
  step. The scan position is kept per network and token (`deposit_scan_cursors`).
- **Crediting**: every transfer becomes a top-up (`source = 'deposit'`) that is already `funding_pending`
  and is recorded in `chain_transfers` once, so a rescan cannot credit twice. The usual card credit, retries,
  history and review apply. The amount is the token amount in whole cents (USDC and Polygon USDT have 6
  decimals, BNB Smart Chain USDT 18; fractions below a cent stay unassigned).
- **Not credited automatically**: a transfer above the single top-up limit or the hourly/daily counts, below
  the fees, beyond the issuer's prefunded balance, or for a blocked/closed card is recorded with
  `needs_review_at` and logged (`funding_needs_review`). Dust below one cent and other tokens are ignored.
- `GET /v1/deposit-address` returns the caller's address (created on first request, card required);
  `/v1/config` has `deposits_enabled`.

## Setup

1. Create the seed **off the server** (for real funds: a hardware wallet or an offline machine) and take the
   xpub of `m/44'/60'/0'`. For the testnet, a test seed was generated locally into
   `apps/api/.local/deposit-testnet-seed.txt` (git-ignored) with its xpub in `deposit-testnet-xpub.txt`.
2. Server: add `DEPOSIT_XPUB=<xpub>` to `/srv/crypto-card/shared/.env` (top-ups must be configured) and deploy.

## Moving the money (operator)

Deposited coins stay on the personal addresses until the operator moves them with the seed, for example to the
issuer's balance. IZIPAY tops up its balance only in USDT (Tron, BNB Smart Chain, Ethereum, Polygon; $11
minimum, no fee, about a minute, seen 2026-10-31), so refills meant for IZIPAY are taken as USDT on Polygon or
BNB Smart Chain and moved there directly. Sweeping is not automated on the server on purpose: the server never
has the keys.

`apps/api/src/dev/sweep-deposits.ts <destination> --chain 84532|80002|97 [--send]` lists or moves the balances
(test networks only). Each transfer out of a deposit address needs gas there; with `--send` the tool tops the
address up first from the gas wallet, the first address of the seed's second account (`m/44'/60'/1'/0/0`),
which receives no deposits. Keep a little of the network's coin on that one address.

## Test networks

`TOP_UP_ASSETS=84532:USDC,80002:USDC,97:USDT` (with `AUTH_CHAIN_IDS=84532,80002,97` and an RPC URL for each)
accepts Base Sepolia USDC, Polygon Amoy USDC and BNB Smart Chain Testnet USDT at once. Amoy has no official test
USDT, so Circle's test USDC stands in for it there; the BNB Chain test USDT has 18 decimals like the real one.
Test coins: Circle's faucet (USDC on Base Sepolia and Amoy) and the BNB Chain testnet faucet (tBNB, USDT).
