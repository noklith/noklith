import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import type { Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type {
  AuthChallengeResponse, CardEventResult, CardResponse, HistoryResponse, LimitsResponse, TopUp, WalletSessionResponse,
} from '../../../packages/api-contracts/src/index.ts';
import { buildApp } from '../src/app.ts';
import type { AuthConfiguration } from '../src/auth/service.ts';
import type { ChainAdapter, ExpectedTransfer } from '../src/chain/adapter.ts';
import { readRiskConfig } from '../src/config.ts';
import { DEFAULT_FUNDING_TIMING, FundingService } from '../src/funding/service.ts';
import { DemoIssuer } from '../src/issuer/issuer.ts';
import { DEFAULT_VELOCITY, LimitsService } from '../src/limits.ts';
import { migrate } from '../src/migrate.ts';
import { DEFAULT_RISK_RULES, RiskService } from '../src/risk.ts';
import { testDatabase } from './database.ts';

// Chain double: every submitted hash is a confirmed transfer matching its intent. These tests are
// about velocity and rules after verification, which the funding tests cover separately.
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const confirmedChain: ChainAdapter = {
  chainIds: [84532],
  async checkTransfer(expected: ExpectedTransfer) {
    return { state: 'confirmed', confirmations: 5,
      transfer: { logIndex: 0, blockNumber: 1n, from: expected.from, to: expected.to, token: expected.token, units: expected.units } };
  },
};
const authConfig: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };

async function setup(velocity = DEFAULT_VELOCITY) {
  let now = new Date('2026-10-09T12:00:00.000Z');
  const clock = () => now;
  const db = testDatabase();
  const limits = new LimitsService(undefined, velocity);
  const risk = new RiskService(limits);
  const issuer = new DemoIssuer();
  const funding = new FundingService({ db, chain: confirmedChain, issuer, limits, risk, now: clock,
    config: { recipient: RECIPIENT, ...DEFAULT_FUNDING_TIMING, networks: [{ chainId: 84532, name: 'Base Sepolia', confirmations: 3,
      explorerTxURL: 'https://sepolia.basescan.org/tx/', assets: [{ symbol: 'USDC', name: 'USDC', tokenAddress: TOKEN, decimals: 6 }] }] } });
  const app = buildApp({ db, networkMode: 'testnet', issuer, limits, risk, funding, now: clock,
    auth: { configuration: authConfig, dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }), now: clock } } });
  await migrate(db);
  const account = privateKeyToAccount(generatePrivateKey());
  const auth = { authorization: '' };
  /** Sessions last one hour: tests that move the clock sign in again with the same wallet. */
  const renew = async () => {
    const challenge = (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
    const session = (await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: {
      challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) } })).json<WalletSessionResponse>();
    auth.authorization = `Bearer ${session.access_token}`;
  };
  await renew();
  let n = 0;
  const post = (url: string, payload: object = {}) => app.inject({ method: 'POST', url, payload, headers: { ...auth, 'idempotency-key': `key-${n++}-abcdef` } });
  const card = (await post('/v1/cards')).json<CardResponse>().card!;
  const quote = (cents: string) => post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: cents });
  /** Full path: quote → accept → hash → verification → credit (and rules). */
  const topUp = async (cents: string) => {
    const quoted = await quote(cents);
    assert.equal(quoted.statusCode, 200, quoted.body);
    const id = quoted.json<{ top_up: TopUp }>().top_up.id;
    await post(`/v1/top-ups/${id}/accept`);
    await post(`/v1/top-ups/${id}/transaction`, { transaction_hash: `0x${randomBytes(32).toString('hex')}` as Hex });
    await funding.process(id);
    const state = (await app.inject({ url: `/v1/top-ups/${id}`, headers: auth })).json<{ top_up: TopUp }>().top_up;
    assert.equal(state.status, 'credited');
    return id;
  };
  const purchase = async (cents: string) => {
    const response = await post('/v1/demo/card-events', { type: 'authorization', amount_cents: cents, merchant: 'Store' });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<CardEventResult>();
  };
  const status = async () => (await app.inject({ url: '/v1/card', headers: auth })).json<CardResponse>().card!.status;
  const history = async () => (await app.inject({ url: '/v1/history', headers: auth })).json<HistoryResponse>().items;
  return { db, app, auth, post, card, quote, topUp, purchase, status, history,
    advance: async (ms: number) => { now = new Date(now.getTime() + ms); await renew(); } };
}

test('top-up velocity: 5 per rolling hour and 10 per 24 h; cancelled and unsigned-expired quotes do not count', async t => {
  const s = await setup();
  t.after(async () => { await s.app.close(); await s.db.close(); });
  const cancelled = (await s.quote('100')).json<{ top_up: TopUp }>().top_up.id;
  await s.post(`/v1/top-ups/${cancelled}/cancel`);
  for (let i = 0; i < 5; i++) assert.equal((await s.quote('100')).statusCode, 200);
  const sixth = await s.quote('100');
  assert.equal(sixth.statusCode, 429);
  assert.equal(sixth.json().error.code, 'limit_top_ups_per_hour');
  // The five unsigned quotes expire after 10 minutes and stop counting; the hour cap then applies to new ones only.
  await s.advance(DEFAULT_FUNDING_TIMING.quoteTtlMs + 1);
  await s.app.inject({ url: '/v1/top-ups', headers: s.auth });
  for (let i = 0; i < 5; i++) await s.topUp('100');
  assert.equal((await s.quote('100')).json().error.code, 'limit_top_ups_per_hour');
  await s.advance(61 * 60_000);
  for (let i = 0; i < 5; i++) await s.topUp('100');
  assert.equal((await s.quote('100')).json().error.code, 'limit_top_ups_per_hour');
  await s.advance(61 * 60_000); // Hour window clear, still ten within 24 hours.
  assert.equal((await s.quote('100')).json().error.code, 'limit_top_ups_per_day');
  const limits = (await s.app.inject({ url: '/v1/limits', headers: s.auth })).json<LimitsResponse>();
  assert.equal(limits.usage.top_ups_last_day, 10);
  assert.equal(limits.limits.top_ups_per_hour, 5);
  assert.equal(limits.spend_limits_enforced, true);
});

test('purchase velocity: 10 approved per hour; declines do not count and change nothing', async t => {
  const s = await setup();
  t.after(async () => { await s.app.close(); await s.db.close(); });
  await s.topUp('20000');
  await s.advance(31 * 60_000); // Outside the drain-after-top-up window.
  assert.equal((await s.purchase('999999')).reason, 'insufficient_funds');
  for (let i = 0; i < 10; i++) assert.equal((await s.purchase('100')).decision, 'approved');
  const eleventh = await s.purchase('100');
  assert.deepEqual([eleventh.decision, eleventh.reason, eleventh.ledger_entry_id], ['declined', 'limit_purchases_per_hour', null]);
  assert.equal((await s.app.inject({ url: '/v1/card', headers: s.auth })).json<CardResponse>().card?.held_cents, '1000');
  await s.advance(61 * 60_000);
  assert.equal((await s.purchase('100')).decision, 'approved');
});

test('rule: three near-maximum top-ups within an hour pause the card; the user can resume it, a risk block cannot be lifted', async t => {
  const s = await setup({ topUpsPerHour: 10, topUpsPerDay: 10, purchasesPerHour: 10, purchasesPerDay: 30 });
  t.after(async () => { await s.app.close(); await s.db.close(); });
  await s.topUp('45000');
  await s.topUp('44999'); // Below 90% of the 500 USD limit: does not count toward the series.
  await s.topUp('50000');
  assert.equal(await s.status(), 'active');
  await s.topUp('45000');
  assert.equal(await s.status(), 'frozen_by_risk_rule');
  const paused = (await s.history()).find(item => item.kind === 'card_status');
  assert.ok(paused);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.amount_cents, '0');
  assert.match(paused.title, /several maximum top-ups/);
  // Funds were credited; new purchases are declined while paused; top-ups and details still work.
  assert.equal((await s.app.inject({ url: '/v1/card', headers: s.auth })).json<CardResponse>().card?.available_cents, '184999');
  assert.equal((await s.purchase('100')).reason, 'card_paused_by_rule');
  assert.equal((await s.post(`/v1/cards/${s.card.id}/credentials`)).statusCode, 200);
  assert.equal((await s.post(`/v1/cards/${s.card.id}/freeze`)).json<CardResponse>().card?.status, 'frozen_by_risk_rule');
  assert.equal((await s.post(`/v1/cards/${s.card.id}/unfreeze`)).json<CardResponse>().card?.status, 'active');
  assert.ok((await s.history()).some(item => item.kind === 'card_status' && item.status === 'resumed'));
  await s.advance(31 * 60_000);
  assert.equal((await s.purchase('100')).decision, 'approved');
  await s.db.query("UPDATE cards SET status = 'blocked_by_risk' WHERE id = $1", [s.card.id]);
  assert.equal((await s.post(`/v1/cards/${s.card.id}/unfreeze`)).statusCode, 409);
});

test('rule: spending almost the whole balance right after a top-up is declined and pauses the card', async t => {
  const s = await setup();
  t.after(async () => { await s.app.close(); await s.db.close(); });
  await s.topUp('20000');
  assert.equal((await s.purchase('8000')).decision, 'approved'); // 40 % of the balance: allowed.
  const drained = await s.purchase('11500'); // 115 of the remaining 120 USD (96 %), minutes after a top-up.
  assert.deepEqual([drained.decision, drained.reason, drained.ledger_entry_id], ['declined', 'rule_drain_after_top_up', null]);
  assert.equal(await s.status(), 'frozen_by_risk_rule');
  const items = await s.history();
  assert.equal(items.filter(item => item.kind === 'authorization').length, 1);
  assert.match(items.find(item => item.kind === 'card_status')!.title, /whole balance/);
  await s.post(`/v1/cards/${s.card.id}/unfreeze`);
  await s.advance(31 * 60_000);
  assert.equal((await s.purchase('11500')).decision, 'approved');
  // Small balances never trigger the rule.
  const small = await setup();
  t.after(async () => { await small.app.close(); await small.db.close(); });
  await small.topUp('4000');
  assert.equal((await small.purchase('4000')).decision, 'approved');
});

test('risk and velocity configuration: defaults, overrides and rejection of unsafe values', () => {
  const defaults = readRiskConfig({});
  assert.deepEqual(defaults.velocity, DEFAULT_VELOCITY);
  assert.deepEqual(defaults.risk, DEFAULT_RISK_RULES);
  const custom = readRiskConfig({ TOP_UPS_PER_HOUR: '3', RISK_DRAIN_ENABLED: 'false', RISK_TOP_UP_SERIES_COUNT: '4', RISK_DRAIN_MIN_AVAILABLE_CENTS: '0' });
  assert.equal(custom.velocity.topUpsPerHour, 3);
  assert.equal(custom.risk.drainAfterTopUp.enabled, false);
  assert.equal(custom.risk.maxTopUpSeries.count, 4);
  assert.equal(custom.risk.drainAfterTopUp.minAvailableCents, 0n);
  for (const env of [{ TOP_UPS_PER_HOUR: '0' }, { TOP_UPS_PER_HOUR: '-1' }, { PURCHASES_PER_DAY: '1.5' }, { RISK_DRAIN_ENABLED: 'yes' },
    { RISK_DRAIN_MIN_PERCENT: '101' }, { RISK_TOP_UP_SERIES_COUNT: '1' }]) assert.throws(() => readRiskConfig(env), JSON.stringify(env));
  assert.throws(() => new LimitsService(undefined, { topUpsPerHour: 20, topUpsPerDay: 10, purchasesPerHour: 1, purchasesPerDay: 1 }));
});
