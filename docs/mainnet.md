# Going live on Base (real USDC)

The owner approved real funds on Base on 2026-10-21. The code is ready; the switch waits for the items below.
Until then the server stays on Base Sepolia.

## Before the switch

1. **Deposit key**: a new seed created on a hardware wallet (Ledger or Trezor), never the testnet seed. Take the
   xpub of `m/44'/60'/0'` for `DEPOSIT_XPUB`. The seed stays offline with the operator.
2. **IZIPAY live key** (`izpk_live_…`) and signing secret. The server refuses `NETWORK_MODE=mainnet` without them.
3. **Destination** for collected USDC (treasury wallet or the IZIPAY prefunding address) and a little ETH on Base
   for the network fee of each transfer out of a deposit address.
4. **RPC provider** for Base with a reliable `eth_getLogs` (a paid plan from a provider such as Alchemy or
   QuickNode). The public endpoint is rate limited and may miss scans.

## Server settings (`/srv/crypto-card/shared/.env`)

```
NETWORK_MODE=mainnet
MAINNET_ENABLED=true
AUTH_CHAIN_IDS=8453
BASE_RPC_URL=https://…            # provider URL, kept only on the server
TOP_UP_ENABLED=true
TOP_UP_ASSETS=8453:USDC           # contract fixed in apps/api/src/chain/networks.ts (Circle USDC)
TOP_UP_RECIPIENT_ADDRESS=0x…      # for refills paid from a connected wallet
DEPOSIT_XPUB=xpub…                # from the hardware wallet
ISSUER_MODE=izipay
IZIPAY_API_KEY=izpk_live_…
```

Base needs 20 confirmations by default (about 40 s; `TOP_UP_CONFIRMATIONS` overrides it). The iOS build needs
`WALLET_CHAIN_IDS=8453` in Codemagic. Back up the `.env` and the database before the switch (deploy does the
database backup itself).

## First hours

- Refill 1–5 USD by deposit address and by connected wallet; check the card credit and the history.
- Watch the API log for `funding_needs_review` (deposits above limits, issuer capacity) and deposit watcher errors.
- Move the first deposits out with the hardware wallet before raising limits. `apps/api/src/dev/sweep-deposits.ts`
  is testnet-only (it reads a seed file); a hardware-wallet sweep is a separate step.
