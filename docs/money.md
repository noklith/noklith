# Exact monetary boundaries

`apps/api/src/domain/money.ts` is an internal domain module. It is not a funds endpoint and does not enable testnet transfers, exchange, credit or a monetary mutation on the fixture server.

All JSON money inputs are canonical positive integer **strings**. USD amounts use cents and are bounded by PostgreSQL signed BIGINT; EVM token quantities use unsigned 256-bit units. JSON numbers, whitespace, leading zeros, signs, decimal notation, exponents and malformed values are rejected before conversion. Arithmetic uses BigInt, including values beyond JavaScript's safe Number range.

The single top-up boundary is 50,000 cents, with an optional lower configured cap. Daily/monthly/velocity enforcement still requires transactional reservations; this module does not claim to implement those checks.

For a future explicitly configured stablecoin route, conversion is exact at one denomination unit to 100 ledger cents. With six token decimals, one cent is 10,000 base units. Fractional cents are rejected rather than truncated or rounded. This is a working accounting policy, not a claim that a test token is redeemable for USD or has a verified market price. It must not be used for ETH pricing, swap quotes, token authenticity or chain verification. Token identity, network, recipient and actual verified movement remain separate prerequisites.

Tests cover $499.99 / $500.00 / $500.01, positive minimum precision, invalid JSON values, reduced caps, fractional cents, integer bounds and exact round trips beyond Number precision. These are pure domain checks, separate from API/chain integration.
