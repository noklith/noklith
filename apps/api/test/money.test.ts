import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AmountError, MAX_EVM_TOKEN_UNITS, MAX_SIGNED_DATABASE_INTEGER,
  centsToStablecoinUnits, parsePositiveCents, parsePositiveTokenUnits,
  stablecoinUnitsToCents, validateSingleTopUpCents,
} from '../src/domain/money.ts';

test('USD boundaries accept 499.99 and 500.00, reject 500.01 and malformed JSON money', () => {
  assert.equal(validateSingleTopUpCents('49999'), 49_999n);
  assert.equal(validateSingleTopUpCents('50000'), 50_000n);
  assert.equal(validateSingleTopUpCents('1'), 1n);
  assert.throws(() => validateSingleTopUpCents('50001'), { code: 'amount_out_of_range' });
  for (const value of ['0', '-1', '+1', '01', '1.0', '5e4', ' 1', '1 ', '', '١', 1, 1.5, NaN, Infinity, null, undefined, {}, []]) {
    assert.throws(() => parsePositiveCents(value), AmountError);
  }
  assert.equal(validateSingleTopUpCents('100', 100n), 100n);
  assert.throws(() => validateSingleTopUpCents('101', 100n), AmountError);
  assert.throws(() => validateSingleTopUpCents('1', 0n), AmountError);
  assert.throws(() => validateSingleTopUpCents('50001', 60_000n), AmountError);
});

test('six-decimal stablecoin units convert exactly; fractional cents are rejected instead of rounded', () => {
  assert.equal(centsToStablecoinUnits('49999', 6), 499_990_000n);
  assert.equal(stablecoinUnitsToCents('499990000', 6), 49_999n);
  assert.equal(stablecoinUnitsToCents('500000000', 6), 50_000n);
  for (const value of ['1', '9999', '10001', '499999999']) {
    assert.throws(() => stablecoinUnitsToCents(value, 6), { code: 'precision_loss' });
  }
  for (const decimals of [2, 6, 18, 36]) {
    for (const cents of ['1', '49999', '50000', '9007199254740993']) {
      assert.equal(stablecoinUnitsToCents(centsToStablecoinUnits(cents, decimals).toString(), decimals), BigInt(cents));
    }
  }
  for (const decimals of [-1, 1, 2.5, 37, NaN, Infinity]) {
    assert.throws(() => centsToStablecoinUnits('1', decimals), AmountError);
  }
});

test('database and EVM integer overflow are rejected, with no binary floating-point loss', () => {
  assert.equal(parsePositiveCents(MAX_SIGNED_DATABASE_INTEGER.toString()), MAX_SIGNED_DATABASE_INTEGER);
  assert.throws(() => parsePositiveCents((MAX_SIGNED_DATABASE_INTEGER + 1n).toString()), AmountError);
  assert.equal(parsePositiveTokenUnits(MAX_EVM_TOKEN_UNITS.toString()), MAX_EVM_TOKEN_UNITS);
  assert.throws(() => parsePositiveTokenUnits((MAX_EVM_TOKEN_UNITS + 1n).toString()), AmountError);
  assert.throws(() => parsePositiveTokenUnits('9'.repeat(100_000)), AmountError);
  assert.throws(() => stablecoinUnitsToCents(MAX_EVM_TOKEN_UNITS.toString(), 2), AmountError);
});
