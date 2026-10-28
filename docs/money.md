# Money

`apps/api/src/domain/money.ts` holds the money rules shared by top-ups, deposits and card events.

All JSON money values are canonical positive integer **strings**. USD amounts are cents, bounded by PostgreSQL
signed BIGINT; EVM token amounts are unsigned 256-bit base units. JSON numbers, whitespace, leading zeros, signs,
decimals, exponents and malformed values are rejected before conversion. Arithmetic uses BigInt.

A single top-up is at most 50,000 cents (a lower cap can be configured). Daily, monthly and hourly limits are
enforced with reservations in `limits.ts`.

Stablecoins convert at one token to 100 cents: with six decimals (USDC) one cent is 10,000 base units. A quoted
top-up rejects fractional cents. A deposit to a personal address is credited in whole cents; anything below a
cent stays unassigned. This is an accounting rule for stablecoins only, not a price feed.

Tests cover $499.99 / $500.00 / $500.01, minimum precision, invalid JSON values, reduced caps, fractional cents,
integer bounds and exact round trips beyond Number precision.
