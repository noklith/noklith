/** Internal monetary boundaries; no transfer or exchange is enabled by this module. */
export const MAX_SINGLE_TOP_UP_CENTS = 50_000n;
export const MAX_SIGNED_DATABASE_INTEGER = (1n << 63n) - 1n;
export const MAX_EVM_TOKEN_UNITS = (1n << 256n) - 1n;

export class AmountError extends Error {
  readonly code: 'invalid_amount' | 'amount_out_of_range' | 'precision_loss';
  constructor(code: AmountError['code'], message: string) {
    super(message);
    this.name = 'AmountError';
    this.code = code;
  }
}

function positiveIntegerString(value: unknown, maximum: bigint, maxDigits: number): bigint {
  if (typeof value !== 'string' || value.length > maxDigits || !/^[1-9][0-9]*$/.test(value)) {
    throw new AmountError('invalid_amount', 'Use a positive canonical integer string.');
  }
  const parsed = BigInt(value);
  if (parsed > maximum) throw new AmountError('amount_out_of_range', 'Amount exceeds the supported integer range.');
  return parsed;
}

/** JSON numbers, whitespace, signs, leading zeroes and decimal/exponent notation are rejected. */
export function parsePositiveCents(value: unknown): bigint {
  return positiveIntegerString(value, MAX_SIGNED_DATABASE_INTEGER, 19);
}

export function parsePositiveTokenUnits(value: unknown): bigint {
  return positiveIntegerString(value, MAX_EVM_TOKEN_UNITS, 78);
}

/** This only checks the single-operation amount. Monthly/velocity limits require a DB reservation. */
export function validateSingleTopUpCents(value: unknown, configuredMaximum = MAX_SINGLE_TOP_UP_CENTS): bigint {
  if (configuredMaximum <= 0n || configuredMaximum > MAX_SINGLE_TOP_UP_CENTS) {
    throw new AmountError('amount_out_of_range', 'Configured limit must be positive and no greater than the product limit.');
  }
  const cents = parsePositiveCents(value);
  if (cents > configuredMaximum) throw new AmountError('amount_out_of_range', 'Amount exceeds the single top-up limit.');
  return cents;
}

function unitsPerCent(decimals: number): bigint {
  // The first stablecoin route expects six decimals; neither price nor token identity is inferred here.
  if (!Number.isInteger(decimals) || decimals < 2 || decimals > 36) {
    throw new AmountError('invalid_amount', 'Stablecoin decimals must be an integer from 2 to 36.');
  }
  return 10n ** BigInt(decimals - 2);
}

/** Exact 1:1 denomination conversion for an explicitly configured stablecoin accounting route.
 * Never use as an ETH exchange quote, token authenticity check or claim about a market price.
 */
export function stablecoinUnitsToCents(value: unknown, decimals: number): bigint {
  const amount = parsePositiveTokenUnits(value);
  const scale = unitsPerCent(decimals);
  if (amount % scale !== 0n) throw new AmountError('precision_loss', 'Fractional cents are unsupported; no amount is silently rounded.');
  const cents = amount / scale;
  if (cents === 0n || cents > MAX_SIGNED_DATABASE_INTEGER) {
    throw new AmountError('amount_out_of_range', 'Converted amount is outside the supported cent range.');
  }
  return cents;
}

export function centsToStablecoinUnits(value: unknown, decimals: number): bigint {
  const amount = parsePositiveCents(value) * unitsPerCent(decimals);
  if (amount > MAX_EVM_TOKEN_UNITS) throw new AmountError('amount_out_of_range', 'Converted amount exceeds the token integer range.');
  return amount;
}
