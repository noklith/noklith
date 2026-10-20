import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, erc20Abi } from 'viem';
import type { Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type {
  AuthChallengeResponse, CardResponse, HistoryResponse, LimitsResponse, TopUp, TopUpAcceptResponse, WalletSessionResponse,
} from '../../../packages/api-contracts/src/index.ts';
import { buildApp } from '../src/app.ts';
import type { AuthConfiguration } from '../src/auth/service.ts';
import { createEvmChainAdapter, evaluateReceipt } from '../src/chain/adapter.ts';
import type { ChainAdapter, ReceiptLog, ReceiptShape } from '../src/chain/adapter.ts';
import { readFundingConfig } from '../src/config.ts';
import type { Database } from '../src/database.ts';
import { DEFAULT_FUNDING_TIMING, FundingService } from '../src/funding/service.ts';
import { DemoIssuer } from '../src/issuer/issuer.ts';
import type { CardIssuerAdapter } from '../src/issuer/issuer.ts';
import { IzipayClient } from '../src/issuer/izipay.ts';
import { IzipayIssuer } from '../src/issuer/izipay-issuer.ts';
import { LimitsService } from '../src/limits.ts';
const roomyLimits = () => new LimitsService(undefined, { topUpsPerHour: 100, topUpsPerDay: 100, purchasesPerHour: 100, purchasesPerDay: 100 });
import { migrate } from '../src/migrate.ts';
import { testDatabase } from './database.ts';

// The chain is a deterministic double that serves genuine ERC-20 receipt logs to the production
// receipt evaluator. No RPC provider, faucet or real wallet is contacted.
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const authConfig: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };
const funding = {
  recipient: RECIPIENT, ...DEFAULT_FUNDING_TIMING,
  networks: [{ chainId: 84532, name: 'Base Sepolia', confirmations: 3, explorerTxURL: 'https://sepolia.basescan.org/tx/',
    assets: [{ symbol: 'USDC', name: 'USDC (Base Sepolia test token)', tokenAddress: TOKEN, decimals: 6 }] }],
};
const hash = () => `0x${randomBytes(32).toString('hex')}` as Hex;

function transferLog(logIndex: number, from: string, to: string, value: bigint, token = TOKEN): ReceiptLog {
  return { address: token.toLowerCase(), logIndex, removed: false, data: encodeAbiParameters([{ type: 'uint256' }], [value]),
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: from as Hex, to: to as Hex } }) as Hex[] };
}
function receipt(transactionHash: string, blockNumber: bigint, logs: ReceiptLog[], status: 'success' | 'reverted' = 'success'): ReceiptShape {
  return { status, blockNumber, blockHash: `0x${'ab'.repeat(32)}`, transactionHash, logs };
}

class FakeChain implements ChainAdapter {
  chainIds = [84532];
  latest = 1_000n;
  down = false;
  calls = 0;
  receipts = new Map<string, ReceiptShape>();
  async checkTransfer(expected: Parameters<ChainAdapter['checkTransfer']>[0], required: number) {
    this.calls++;
    if (this.down) throw new Error('provider unavailable');
    return evaluateReceipt(this.receipts.get(expected.transactionHash) ?? null, this.latest, expected, required);
  }
}

async function setup(options: { failFunding?: () => boolean; db?: Database; issuer?: CardIssuerAdapter; serviceFeeBps?: number;
  onAlert?: (message: string) => void } = {}) {
  let now = new Date('2026-10-09T12:00:00.000Z');
  const clock = () => now;
  const db = options.db ?? testDatabase();
  const chain = new FakeChain();
  const issuer = options.issuer ?? new DemoIssuer({ fundingFailure: () => options.failFunding?.() ?? false });
  const limits = roomyLimits();
  const service = new FundingService({ db, chain, issuer, limits, config: { ...funding, serviceFeeBps: options.serviceFeeBps }, now: clock,
    onAlert: options.onAlert });
  const app = buildApp({ db, networkMode: 'testnet', issuer, limits, funding: service, now: clock,
    auth: { configuration: authConfig, dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }), now: clock } } });
  await migrate(db);
  const signIn = async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
    const verified = (await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: {
      challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) } })).json<WalletSessionResponse>();
    const auth = { authorization: `Bearer ${verified.access_token}` };
    let n = 0;
    const post = (url: string, payload: object = {}) => app.inject({ method: 'POST', url, payload, headers: { ...auth, 'idempotency-key': `key-${url.replaceAll('/', '-')}-${n++}` } });
    const created = await post('/v1/cards');
    assert.equal(created.statusCode, 200, created.body);
    return { address: account.address, auth, post, card: created.json<CardResponse>().card! };
  };
  return { db, app, chain, service, signIn, issuer, limits, clock, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

test('Base Sepolia USDC top-up: quote, signature request, hash, confirmations, single credit and history', async t => {
  const { db, app, chain, service, signIn, advance } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const config = (await app.inject('/v1/config')).json();
  assert.equal(config.top_up_enabled, true);
  assert.deepEqual(config.networks[0].assets[0], { symbol: 'USDC', name: 'USDC (Base Sepolia test token)', token_address: TOKEN, decimals: 6 });
  assert.equal(config.networks[0].recipient_address, RECIPIENT);

  const user = await signIn();
  const quoted = await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '2550' });
  assert.equal(quoted.statusCode, 200, quoted.body);
  const topUp = quoted.json<{ top_up: TopUp }>().top_up;
  assert.equal(topUp.status, 'quoted');
  assert.equal(topUp.token_units, '25500000');
  assert.equal(topUp.card_amount_cents, '2550');
  assert.equal(topUp.service_fee_cents, '0');
  assert.equal(topUp.simulated, false);
  assert.equal(topUp.sender_address, user.address);

  const accepted = (await user.post(`/v1/top-ups/${topUp.id}/accept`)).json<TopUpAcceptResponse>();
  assert.equal(accepted.top_up.status, 'awaiting_signature');
  assert.equal(accepted.transaction.to, TOKEN);
  assert.equal(accepted.transaction.from, user.address);
  const call = decodeFunctionData({ abi: erc20Abi, data: accepted.transaction.data as Hex });
  assert.equal(call.functionName, 'transfer');
  assert.deepEqual(call.args, [RECIPIENT, 25_500_000n]);

  const tx = hash();
  const submitted = await user.post(`/v1/top-ups/${topUp.id}/transaction`, { transaction_hash: tx });
  assert.equal(submitted.json<{ top_up: TopUp }>().top_up.status, 'submitted');
  // A retry with the same hash is safe; the hash alone credits nothing.
  assert.equal((await user.post(`/v1/top-ups/${topUp.id}/transaction`, { transaction_hash: tx })).statusCode, 200);
  assert.equal((await user.post(`/v1/top-ups/${topUp.id}/check`)).json<{ top_up: TopUp }>().top_up.status, 'submitted');

  chain.receipts.set(tx, receipt(tx, 999n, [transferLog(7, user.address, RECIPIENT, 25_500_000n)]));
  advance(15_000);
  const confirming = (await user.post(`/v1/top-ups/${topUp.id}/check`)).json<{ top_up: TopUp }>().top_up;
  assert.equal(confirming.status, 'confirming');
  assert.equal(confirming.confirmations, 2);
  assert.equal((await app.inject({ url: '/v1/card', headers: user.auth })).json<CardResponse>().card?.available_cents, '0');

  chain.latest = 1_001n;
  advance(8_000);
  await service.processDue();
  const credited = (await app.inject({ url: `/v1/top-ups/${topUp.id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up;
  assert.equal(credited.status, 'credited');
  assert.equal(credited.explorer_url, `https://sepolia.basescan.org/tx/${tx}`);
  // Repeated processing, checks and a concurrent worker step cannot credit twice.
  await Promise.all([service.process(topUp.id), service.process(topUp.id), service.processDue()]);
  assert.equal((await app.inject({ url: '/v1/card', headers: user.auth })).json<CardResponse>().card?.available_cents, '2550');
  const history = (await app.inject({ url: '/v1/history', headers: user.auth })).json<HistoryResponse>();
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0]!.kind, 'top_up');
  assert.equal(history.items[0]!.transaction_hash, tx);
  assert.equal(history.items[0]!.network, 'eip155:84532');
  assert.equal((await db.query('SELECT * FROM chain_transfers')).rows.length, 1);
  const usage = (await app.inject({ url: '/v1/limits', headers: user.auth })).json<LimitsResponse>().usage;
  assert.equal(usage.monthly_top_up_cents, '2550');

  // The same hash cannot be reused by another intent, even after the first one is credited.
  const again = (await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '2550' })).json<{ top_up: TopUp }>().top_up;
  await user.post(`/v1/top-ups/${again.id}/accept`);
  const reused = await user.post(`/v1/top-ups/${again.id}/transaction`, { transaction_hash: tx });
  assert.equal(reused.statusCode, 409);
  assert.equal(reused.json().error.code, 'transaction_already_used');
});

test('amount validation and limits: zero, negative, fractions, 499.99/500/500.01 and monthly reservations', async t => {
  const { db, app, signIn, advance } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn();
  for (const amount of ['0', '-100', '1.5', '01', '1e3', '']) {
    const response = await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: amount });
    assert.equal(response.statusCode, 400, `${amount}: ${response.body}`);
  }
  assert.equal((await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: 2550 })).statusCode, 400);
  assert.equal((await user.post('/v1/top-ups', { chain_id: 84532, asset: 'ETH', amount_cents: '100' })).json().error.code, 'unsupported_asset');
  assert.equal((await user.post('/v1/top-ups', { chain_id: 11155111, asset: 'USDC', amount_cents: '100' })).json().error.code, 'unsupported_asset');
  assert.equal((await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '49999' })).statusCode, 200);
  assert.equal((await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '50000' })).statusCode, 200);
  const over = await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '50001' });
  assert.equal(over.statusCode, 422);
  assert.equal(over.json().error.code, 'limit_single_top_up');
  // 499.99 + 500 reserved; 8 more × 500 reach 4,999.99; one more cent fits, two do not.
  for (let i = 0; i < 8; i++) assert.equal((await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '50000' })).statusCode, 200);
  assert.equal((await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '2' })).json().error.code, 'limit_monthly_top_up');
  // Unsigned quotes expire and release their reservation.
  advance(DEFAULT_FUNDING_TIMING.quoteTtlMs + 1);
  const list = (await app.inject({ url: '/v1/top-ups', headers: user.auth })).json<{ items: TopUp[] }>().items;
  assert.ok(list.every(item => item.status === 'expired' && item.failure_reason === 'quote_expired'));
  assert.equal((await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '50000' })).statusCode, 200);
});

test('wrong recipient, token, sender, amount, reverted or missing transactions never credit', async t => {
  const { db, app, chain, service, signIn, advance } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn();
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  const start = async () => {
    const id = (await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '1000' })).json<{ top_up: TopUp }>().top_up.id;
    await user.post(`/v1/top-ups/${id}/accept`);
    const tx = hash();
    assert.equal((await user.post(`/v1/top-ups/${id}/transaction`, { transaction_hash: tx })).statusCode, 200);
    return { id, tx };
  };
  const cases: [string, (tx: string) => ReceiptShape | undefined][] = [
    ['no_matching_transfer', tx => receipt(tx, 900n, [transferLog(0, user.address, stranger, 10_000_000n)])],
    ['no_matching_transfer', tx => receipt(tx, 900n, [transferLog(0, user.address, RECIPIENT, 10_000_000n, stranger)])],
    ['no_matching_transfer', tx => receipt(tx, 900n, [transferLog(0, stranger, RECIPIENT, 10_000_000n)])], // Someone else's hash.
    ['amount_mismatch', tx => receipt(tx, 900n, [transferLog(0, user.address, RECIPIENT, 9_999_999n)])],
    ['transaction_reverted', tx => receipt(tx, 900n, [], 'reverted')],
  ];
  for (const [reason, build] of cases) {
    const { id, tx } = await start();
    chain.receipts.set(tx, build(tx)!);
    await service.process(id);
    const result = (await app.inject({ url: `/v1/top-ups/${id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up;
    assert.equal(result.status, 'failed', reason);
    assert.equal(result.failure_reason, reason);
  }
  const missing = await start();
  await service.process(missing.id);
  advance(DEFAULT_FUNDING_TIMING.quoteTtlMs + DEFAULT_FUNDING_TIMING.notFoundTimeoutMs + 1);
  await service.processDue();
  assert.equal((await app.inject({ url: `/v1/top-ups/${missing.id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up.failure_reason, 'transaction_not_found');
  assert.equal((await app.inject({ url: '/v1/card', headers: user.auth })).json<CardResponse>().card?.available_cents, '0');
  assert.equal((await db.query('SELECT * FROM ledger_entries')).rows.length, 0);
  // Released by failure: the monthly reservation is empty again.
  assert.equal((await app.inject({ url: '/v1/limits', headers: user.auth })).json<LimitsResponse>().usage.monthly_top_up_cents, '0');
});

test('one hash with two transfers credits each log once; reorganized receipts return to waiting; RPC outages only delay', async t => {
  const { db, app, chain, service, signIn, advance } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn();
  const id = (await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '500' })).json<{ top_up: TopUp }>().top_up.id;
  await user.post(`/v1/top-ups/${id}/accept`);
  const tx = hash();
  await user.post(`/v1/top-ups/${id}/transaction`, { transaction_hash: tx });
  chain.down = true;
  await service.process(id);
  assert.equal((await app.inject({ url: `/v1/top-ups/${id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up.status, 'submitted');
  chain.down = false;
  chain.receipts.set(tx, receipt(tx, 1_000n, [transferLog(3, user.address, RECIPIENT, 5_000_000n), transferLog(4, user.address, RECIPIENT, 5_000_000n)]));
  advance(30_000);
  await service.process(id);
  assert.equal((await app.inject({ url: `/v1/top-ups/${id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up.status, 'confirming');
  chain.receipts.delete(tx); // Block reorganized away before enough confirmations.
  advance(10_000);
  await service.process(id);
  assert.equal((await app.inject({ url: `/v1/top-ups/${id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up.status, 'submitted');
  chain.receipts.set(tx, receipt(tx, 1_005n, [transferLog(3, user.address, RECIPIENT, 5_000_000n), transferLog(4, user.address, RECIPIENT, 5_000_000n)]));
  chain.latest = 1_010n;
  advance(20_000);
  await service.process(id);
  const rows = (await db.query<{ log_index: number }>('SELECT log_index FROM chain_transfers')).rows;
  assert.deepEqual(rows.map(row => Number(row.log_index)), [3]);
  assert.equal((await app.inject({ url: '/v1/card', headers: user.auth })).json<CardResponse>().card?.available_cents, '500');
});

test('an issuer load that keeps failing stops retrying after 24 attempts and waits for the operator', async t => {
  const alerts: string[] = [];
  let issuerCalls = 0;
  let issuerDown = true;
  const failing = new DemoIssuer({ fundingFailure: () => { issuerCalls++; return issuerDown; } });
  const s = await setup({ issuer: failing, onAlert: message => alerts.push(message) });
  t.after(async () => { await s.app.close(); await s.db.close(); });
  const user = await s.signIn();
  const id = (await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '700' })).json<{ top_up: TopUp }>().top_up.id;
  await user.post(`/v1/top-ups/${id}/accept`);
  const tx = hash();
  await user.post(`/v1/top-ups/${id}/transaction`, { transaction_hash: tx });
  s.chain.receipts.set(tx, receipt(tx, 990n, [transferLog(0, user.address, RECIPIENT, 7_000_000n)]));
  for (let i = 0; i < 30; i++) { await s.service.process(id); s.advance(10 * 60_000); }
  assert.equal(issuerCalls, 24);
  const row = (await s.db.query<{ status: string; funding_attempts: number; needs_review_at: unknown }>(
    'SELECT status, funding_attempts, needs_review_at FROM top_up_intents')).rows[0]!;
  assert.deepEqual([row.status, row.funding_attempts, row.needs_review_at !== null], ['funding_pending', 24, true]);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0]!, /after 24 attempts/);
  // Days later neither the worker nor a direct check calls the issuer again (sessions have expired by now,
  // so the state is read from the database).
  const credits = async () => (await s.db.query("SELECT id FROM ledger_entries WHERE kind = 'top_up'")).rows.length;
  s.advance(3 * 24 * 60 * 60_000);
  await s.service.processDue();
  await s.service.process(id);
  assert.equal(issuerCalls, 24);
  assert.equal(await credits(), 0);
  // The operator clears the mark after checking the issuer; the load then completes once.
  await s.db.query('UPDATE top_up_intents SET needs_review_at = NULL, funding_attempts = 0');
  issuerDown = false;
  await s.service.processDue();
  await s.service.processDue();
  assert.equal(await credits(), 1);
  assert.equal((await s.db.query<{ status: string }>('SELECT status FROM top_up_intents')).rows[0]?.status, 'credited');
});

test('an issuer answer larger than the requested load is never credited or retried', async t => {
  class Overpaying extends DemoIssuer {
    calls = 0;
    override async fund(input: Parameters<DemoIssuer['fund']>[0]) {
      this.calls++;
      const result = await super.fund(input);
      return { ...result, creditedCents: input.amountCents + 1n };
    }
  }
  const issuer = new Overpaying();
  const alerts: string[] = [];
  const s = await setup({ issuer, onAlert: message => alerts.push(message) });
  t.after(async () => { await s.app.close(); await s.db.close(); });
  const user = await s.signIn();
  const id = (await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '700' })).json<{ top_up: TopUp }>().top_up.id;
  await user.post(`/v1/top-ups/${id}/accept`);
  const tx = hash();
  await user.post(`/v1/top-ups/${id}/transaction`, { transaction_hash: tx });
  s.chain.receipts.set(tx, receipt(tx, 990n, [transferLog(0, user.address, RECIPIENT, 7_000_000n)]));
  await s.service.process(id);
  s.advance(30 * 60_000);
  await s.service.processDue();
  assert.equal(issuer.calls, 1);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0]!, /unexpected card credit of 701 cents for 700 requested/);
  assert.equal((await s.db.query('SELECT id FROM ledger_entries WHERE kind = $1', ['top_up'])).rows.length, 0);
  assert.equal((await s.app.inject({ url: `/v1/top-ups/${id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up.status, 'funding_pending');
});

test('a failed issuer credit stays pending, retries the credit only, and survives a restart', async t => {
  let issuerDown = true;
  const first = await setup({ failFunding: () => issuerDown });
  t.after(async () => { await first.app.close(); await first.db.close(); });
  const user = await first.signIn();
  const id = (await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '700' })).json<{ top_up: TopUp }>().top_up.id;
  await user.post(`/v1/top-ups/${id}/accept`);
  const tx = hash();
  await user.post(`/v1/top-ups/${id}/transaction`, { transaction_hash: tx });
  first.chain.receipts.set(tx, receipt(tx, 990n, [transferLog(0, user.address, RECIPIENT, 7_000_000n)]));
  await first.service.process(id);
  let state = (await first.app.inject({ url: `/v1/top-ups/${id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up;
  assert.equal(state.status, 'funding_pending');
  const chainCalls = first.chain.calls;
  // A "retry" from the client keeps the same transfer: no new hash is requested or accepted.
  assert.equal((await user.post(`/v1/top-ups/${id}/transaction`, { transaction_hash: hash() })).statusCode, 409);
  first.advance(10 * 60_000);
  await first.service.processDue();
  assert.equal(first.chain.calls, chainCalls, 'credit retries do not re-verify or re-request the transfer');
  assert.equal((await first.db.query<{ funding_attempts: number }>('SELECT funding_attempts FROM top_up_intents')).rows[0]?.funding_attempts, 2);

  // Restart: a new service instance over the same database finishes the pending credit.
  issuerDown = false;
  const restarted = new FundingService({ db: first.db, chain: first.chain, issuer: new DemoIssuer(), limits: roomyLimits(), config: funding,
    now: () => new Date('2026-10-09T13:00:00.000Z') });
  await restarted.processDue();
  await restarted.processDue();
  state = (await first.app.inject({ url: `/v1/top-ups/${id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up;
  assert.equal(state.status, 'credited');
  assert.equal((await first.app.inject({ url: '/v1/card', headers: user.auth })).json<CardResponse>().card?.available_cents, '700');
  assert.equal((await first.db.query("SELECT * FROM ledger_entries WHERE kind = 'top_up'")).rows.length, 1);
});

test('top-ups are private to their wallet, cancellable only before submission, and blocked cards cannot be funded', async t => {
  const { db, app, signIn } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const alice = await signIn();
  const bob = await signIn();
  const id = (await alice.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '100' })).json<{ top_up: TopUp }>().top_up.id;
  assert.equal((await app.inject({ url: `/v1/top-ups/${id}`, headers: bob.auth })).statusCode, 404);
  for (const action of ['accept', 'cancel', 'check']) assert.equal((await bob.post(`/v1/top-ups/${id}/${action}`)).statusCode, 404);
  assert.equal((await bob.post(`/v1/top-ups/${id}/transaction`, { transaction_hash: hash() })).statusCode, 404);
  assert.equal((await alice.post(`/v1/top-ups/${id}/cancel`)).json<{ top_up: TopUp }>().top_up.status, 'cancelled');
  assert.equal((await alice.post(`/v1/top-ups/${id}/accept`)).statusCode, 409);
  await db.query("UPDATE cards SET status = 'blocked_by_risk' WHERE id = $1", [alice.card.id]);
  assert.equal((await alice.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '100' })).json().error.code, 'card_state_conflict');
  assert.equal((await app.inject({ url: '/v1/top-ups' })).statusCode, 401);
});

test('funding configuration is explicit and the EVM adapter reads receipts through the bounded transport', async () => {
  const auth = { configuration: authConfig, endpoints: [{ chainId: 84532, url: 'https://rpc.example/key' }] };
  assert.equal(readFundingConfig({}, auth), undefined);
  assert.throws(() => readFundingConfig({ TOP_UP_ENABLED: 'true' }, undefined), /wallet authentication/);
  assert.throws(() => readFundingConfig({ TOP_UP_ENABLED: 'true', BASE_SEPOLIA_USDC_ADDRESS: TOKEN }, auth), /RECIPIENT/);
  assert.throws(() => readFundingConfig({ TOP_UP_ENABLED: 'true', TOP_UP_RECIPIENT_ADDRESS: RECIPIENT }, auth), /TOKEN_ADDRESS/);
  assert.throws(() => readFundingConfig({ TOP_UP_ENABLED: 'true', TOP_UP_RECIPIENT_ADDRESS: `0x${'0'.repeat(40)}`, BASE_SEPOLIA_USDC_ADDRESS: TOKEN }, auth));
  assert.throws(() => readFundingConfig({ TOP_UP_ENABLED: 'yes' }, auth));
  const parsed = readFundingConfig({ TOP_UP_ENABLED: 'true', TOP_UP_RECIPIENT_ADDRESS: RECIPIENT, BASE_SEPOLIA_USDC_ADDRESS: TOKEN }, auth);
  assert.equal(parsed?.networks[0]?.confirmations, 5);

  const tx = hash();
  const sender = privateKeyToAccount(generatePrivateKey()).address;
  const log = transferLog(2, sender, RECIPIENT, 1_000_000n);
  const responses: Record<string, unknown> = {
    eth_chainId: '0x14a34',
    eth_blockNumber: '0x64',
    eth_getTransactionReceipt: { transactionHash: tx, blockHash: `0x${'cd'.repeat(32)}`, blockNumber: '0x60', status: '0x1',
      logs: [{ address: TOKEN, topics: log.topics, data: log.data, logIndex: '0x2', removed: false }] },
  };
  const fetchDouble: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: responses[body.method] }), { headers: { 'content-type': 'application/json' } });
  };
  const adapter = createEvmChainAdapter([{ chainId: 84532, url: 'https://rpc.example/key' }], { fetch: fetchDouble });
  const expected = { chainId: 84532, transactionHash: tx, token: TOKEN, from: sender, to: RECIPIENT, units: 1_000_000n };
  assert.deepEqual(await adapter.checkTransfer(expected, 5), { state: 'confirmed', confirmations: 5,
    transfer: { logIndex: 2, blockNumber: 96n, from: sender, to: RECIPIENT, token: TOKEN, units: 1_000_000n } });
  assert.deepEqual(await adapter.checkTransfer(expected, 6), { state: 'pending', confirmations: 5 });
  responses.eth_getTransactionReceipt = null;
  assert.deepEqual(await adapter.checkTransfer(expected, 1), { state: 'not_found' });
  responses.eth_chainId = '0x1';
  await assert.rejects(adapter.checkTransfer(expected, 1), { code: 'chain_mismatch' });
});

test('wallet balances: RPC values for gas and USDC, and an explicit "unavailable" when the provider fails', async t => {
  const { db, app, chain, signIn, advance } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn();
  // FakeChain has no balance reader: the API reports unavailable instead of inventing zero.
  const missing = (await app.inject({ url: '/v1/wallet/balances', headers: user.auth })).json();
  assert.deepEqual(missing.networks[0], { chain_id: 84532, available: false, native_symbol: 'ETH', native_units: null, assets: [{ symbol: 'USDC', decimals: 6, units: null }] });
  assert.equal(missing.address, user.address);
  let reads = 0;
  (chain as FakeChain & { balances?: ChainAdapter['balances'] }).balances = async () => { reads++; return { nativeUnits: 10n ** 15n, tokens: [{ token: TOKEN, units: 12_340_000n }] }; };
  // Answers are cached for 15 seconds per address, so polling cannot flood the RPC provider.
  assert.equal((await app.inject({ url: '/v1/wallet/balances', headers: user.auth })).json().networks[0].available, false);
  assert.equal(reads, 0);
  advance(15_000);
  const present = (await app.inject({ url: '/v1/wallet/balances', headers: user.auth })).json();
  assert.deepEqual(present.networks[0].assets, [{ symbol: 'USDC', decimals: 6, units: '12340000' }]);
  assert.equal(present.networks[0].native_units, '1000000000000000');
  await app.inject({ url: '/v1/wallet/balances', headers: user.auth });
  assert.equal(reads, 1);

  const fetchDouble: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const result = { eth_chainId: '0x14a34', eth_getBalance: '0x2386f26fc10000',
      eth_call: `0x${(5_000_000n).toString(16).padStart(64, '0')}` }[body.method as string];
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { headers: { 'content-type': 'application/json' } });
  };
  const adapter = createEvmChainAdapter([{ chainId: 84532, url: 'https://rpc.example/key' }], { fetch: fetchDouble });
  assert.deepEqual(await adapter.balances!(84532, user.address, [TOKEN]), { nativeUnits: 10_000_000_000_000_000n, tokens: [{ token: TOKEN, units: 5_000_000n }] });
});

/** IZIPAY stand-in: issues cards and loads them from the balance with 3% + $1.70, idempotent per key. */
function fakeIzipay() {
  const topUps = new Map<string, { topup_id: string; card_id: string; amount: string }>();
  const paid: string[] = [];
  let available = true;
  let balanceCents = 15_000;
  let cardCents = 0;
  let cardReadable = true;
  let cardReads = 0;
  let topUpCalls = 0;
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(status < 300 ? { success: true, data } : { success: false, error: data }), { status });
  const http = (async (input: URL, init: RequestInit) => {
    const url = new URL(input);
    if (url.pathname === '/api/v1/cards') return reply(200, { cards: [], total_pages: 1 });
    if (url.pathname === '/api/v1/balance') return new Response(`{"success":true,"data":{"account_balance":{"balance_usd":${(balanceCents / 100).toFixed(2)},"sandbox":true}}}`);
    if (url.pathname === '/api/v1/cards/issue') return reply(201, { card_id: 'card_1', issue_status: 'issued', card: { last4: '0646' } });
    if (init.method === 'GET' && url.pathname === '/api/v1/cards/card_1') {
      cardReads++;
      if (!cardReadable) return reply(503, { code: 'SERVICE_UNAVAILABLE' });
      return new Response(`{"success":true,"data":{"card_id":"card_1","issue_status":"issued","card":{"last4":"0646","balance":${(cardCents / 100).toFixed(2)}}}}`);
    }
    const match = url.pathname.match(/^\/api\/v1\/cards\/([^/]+)\/topup$/);
    if (init.method === 'POST' && match) {
      topUpCalls++;
      if (!available) return reply(402, { code: 'INSUFFICIENT_BALANCE' });
      const key = String((init.headers as Record<string, string>)['x-idempotency-key']);
      const body = JSON.parse(String(init.body), (_k, v, c?: { source?: string }) => (typeof v === 'number' ? c?.source : v));
      if (!topUps.has(key)) {
        topUps.set(key, { topup_id: `ctopup_${topUps.size + 1}`, card_id: match[1]!, amount: body.amount }); paid.push(body.amount);
        balanceCents -= Math.round(Number(body.amount) * 100);
        const paidCents = Math.round(Number(body.amount) * 100);
        cardCents += paidCents - Math.ceil(paidCents * 3 / 100) - 170;
      }
      const item = topUps.get(key)!;
      const cents = Math.round(Number(item.amount) * 100); // Test arithmetic only; the API under test never uses floats.
      const onCard = cents - Math.ceil(cents * 3 / 100) - 170;
      return new Response(`{"success":true,"data":{"topup_id":"${item.topup_id}","card_id":"${item.card_id}","status":"credited","amount":${item.amount},"amount_on_card":${(onCard / 100).toFixed(2)}}}`);
    }
    return reply(404, { code: 'NOT_FOUND' });
  }) as typeof fetch;
  const issuer = new IzipayIssuer({ client: new IzipayClient({ apiKey: 'izpk_test_fake', fetch: http }), cardholderEmailDomain: 'cards.example.test' });
  return { issuer, paid, setAvailable: (value: boolean) => { available = value; }, setBalance: (cents: number) => { balanceCents = cents; },
    setCardBalance: (cents: number) => { cardCents = cents; }, topUpCalls: () => topUpCalls,
    setCardReadable: (value: boolean) => { cardReadable = value; }, cardReads: () => cardReads };
}

test('IZIPAY top-up: verified transfer loads the card from the balance minus our fee and credits what reached the card', async t => {
  const fake = fakeIzipay();
  const { db, app, chain, service, signIn, advance } = await setup({ issuer: fake.issuer, serviceFeeBps: 100 });
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn();
  assert.equal(user.card.issuer_mode, 'izipay');
  // Too small to cover the fees: refused before anything is paid.
  assert.equal((await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '150' })).json().error.code, 'amount_below_fees');

  const topUp = (await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '10000' })).json<{ top_up: TopUp }>().top_up;
  // $100 paid: our 1% = $1.00, $99.00 to IZIPAY, expected on card 99.00 - 2.97 - 1.70 = 94.33.
  assert.deepEqual([topUp.token_units, topUp.service_fee_cents, topUp.card_amount_cents], ['100000000', '100', '9433']);
  // The $150.00 balance minus this open $99.00 leaves $51.00: a larger quote is refused before the user pays.
  const over = await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '6000' });
  assert.deepEqual([over.statusCode, over.json().error.code, over.json().error.message], [409, 'top_up_capacity', 'Top-ups up to $51.00 are available right now.']);
  assert.equal((await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '5000' })).statusCode, 200);
  await user.post(`/v1/top-ups/${topUp.id}/accept`);
  const tx = hash();
  await user.post(`/v1/top-ups/${topUp.id}/transaction`, { transaction_hash: tx });
  chain.receipts.set(tx, receipt(tx, 990n, [transferLog(0, user.address, RECIPIENT, 100_000_000n)]));

  fake.setAvailable(false); // IZIPAY refuses for a while: the confirmed payment waits, it never fails.
  advance(15_000);
  await service.processDue();
  assert.equal((await app.inject({ url: `/v1/top-ups/${topUp.id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up.status, 'funding_pending');

  fake.setAvailable(true);
  advance(60_000);
  const before = fake.topUpCalls();
  // A worker tick and a client check at the same moment: only one of them may call the issuer.
  await Promise.all([service.process(topUp.id), service.processDue(), service.process(topUp.id)]);
  assert.equal(fake.topUpCalls() - before, 1);
  const credited = (await app.inject({ url: `/v1/top-ups/${topUp.id}`, headers: user.auth })).json<{ top_up: TopUp }>().top_up;
  assert.equal(credited.status, 'credited');
  assert.equal(credited.card_amount_cents, '9433');
  assert.deepEqual(fake.paid, ['99.00']);
  assert.equal((await app.inject({ url: '/v1/card', headers: user.auth })).json<CardResponse>().card?.available_cents, '9433');

  // Purchases happen at IZIPAY: its lower card balance becomes completed card purchases, a higher one a refund.
  fake.setCardBalance(9433 - 2500);
  advance(31_000);
  assert.equal((await app.inject({ url: '/v1/card', headers: user.auth })).json<CardResponse>().card?.available_cents, '6933');
  fake.setCardBalance(6933 + 300);
  assert.equal((await app.inject({ url: '/v1/card', headers: user.auth })).json<CardResponse>().card?.available_cents, '6933', 'throttled');
  advance(31_000);
  assert.equal((await app.inject({ url: '/v1/card', headers: user.auth })).json<CardResponse>().card?.available_cents, '7233');
  advance(31_000);
  await app.inject({ url: '/v1/card', headers: user.auth }); // Unchanged balance: nothing new.
  const items = (await app.inject({ url: '/v1/history', headers: user.auth })).json<HistoryResponse>().items;
  assert.deepEqual(items.map(i => [i.kind, i.title, i.amount_cents, i.current_status]).slice(0, 3).sort(),
    [['authorization', 'Card purchases', '2500', 'completed'], ['capture', 'Card purchases', '2500', 'completed'], ['refund', 'Card refund', '300', 'credited']]);
  assert.equal(items.length, 4);
});

test('IZIPAY balance sync: an unreachable issuer, a refill in flight and two API processes never change the balance wrongly', async t => {
  const fake = fakeIzipay();
  const s = await setup({ issuer: fake.issuer });
  const second = buildApp({ db: s.db, networkMode: 'testnet', issuer: s.issuer, limits: s.limits, now: s.clock,
    auth: { configuration: authConfig, dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }), now: s.clock } } });
  t.after(async () => { await s.app.close(); await second.close(); await s.db.close(); });
  const user = await s.signIn();
  const balance = async (app = s.app) => (await app.inject({ url: '/v1/card', headers: user.auth })).json<CardResponse>().card?.available_cents;
  const entries = async () => Number((await s.db.query<{ count: string }>('SELECT count(*) AS count FROM ledger_entries')).rows[0]!.count);
  assert.equal(await balance(), '0');

  // The issuer cannot be read: nothing is recorded, and the next read after the pause tries again.
  fake.setCardBalance(500);
  fake.setCardReadable(false);
  s.advance(31_000);
  assert.equal(await balance(), '0');
  assert.equal(await entries(), 0);
  fake.setCardReadable(true);
  s.advance(31_000);
  assert.equal(await balance(), '500');
  assert.equal(await entries(), 1);

  // While a refill is on its way the issuer balance is not compared, so the refill is not mistaken for a refund.
  const id = (await user.post('/v1/top-ups', { chain_id: 84532, asset: 'USDC', amount_cents: '700' })).json<{ top_up: TopUp }>().top_up.id;
  await user.post(`/v1/top-ups/${id}/accept`);
  await user.post(`/v1/top-ups/${id}/transaction`, { transaction_hash: hash() });
  fake.setCardBalance(900);
  const reads = fake.cardReads();
  s.advance(31_000);
  assert.equal(await balance(), '500');
  assert.equal(fake.cardReads(), reads, 'the issuer is not even asked while a refill is pending');
  await s.db.query("UPDATE top_up_intents SET status = 'expired', next_check_at = NULL");

  // Two API processes reading at once record the difference exactly once.
  s.advance(31_000);
  const [first, other] = await Promise.all([balance(), balance(second)]);
  assert.deepEqual([first, other].sort(), ['900', '900']);
  assert.equal(await entries(), 2);
  assert.equal(await balance(), '900');
});

test('an 18-decimal stablecoin (USDT on BNB Smart Chain) quotes and verifies exact units', async t => {
  const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955';
  let now = new Date('2026-10-09T12:00:00.000Z');
  const clock = () => now;
  const db = testDatabase();
  const chain = new FakeChain(); chain.chainIds = [56];
  const issuer = new DemoIssuer();
  const limits = roomyLimits();
  const service = new FundingService({ db, chain, issuer, limits, now: clock, config: { recipient: RECIPIENT, ...DEFAULT_FUNDING_TIMING,
    networks: [{ chainId: 56, name: 'BNB Smart Chain', confirmations: 3, explorerTxURL: 'https://bscscan.com/tx/', nativeSymbol: 'BNB', mainnet: true,
      assets: [{ symbol: 'USDT', name: 'Tether USD (BNB Smart Chain)', tokenAddress: BSC_USDT, decimals: 18 }] }] } });
  const app = buildApp({ db, networkMode: 'mainnet', issuer, limits, funding: service, now: clock,
    auth: { configuration: { ...authConfig, allowedChainIds: [56] }, dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }), now: clock } } });
  t.after(async () => { await app.close(); await db.close(); });
  await migrate(db);
  const account = privateKeyToAccount(generatePrivateKey());
  const challenge = (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 56 } })).json<AuthChallengeResponse>();
  const session = (await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: {
    challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) } })).json<WalletSessionResponse>();
  const auth = { authorization: `Bearer ${session.access_token}` };
  assert.equal((await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: { ...auth, 'idempotency-key': 'create-card-bsc-1' } })).statusCode, 200);
  const config = (await app.inject('/v1/config')).json();
  assert.equal(config.network_mode, 'mainnet');
  const topUp = (await app.inject({ method: 'POST', url: '/v1/top-ups', payload: { chain_id: 56, asset: 'USDT', amount_cents: '2550' },
    headers: { ...auth, 'idempotency-key': 'quote-bsc-usdt-1' } })).json<{ top_up: TopUp }>().top_up;
  assert.equal(topUp.token_units, '25500000000000000000');
  assert.equal(topUp.network_fee_note, 'The network fee is paid in BNB by your wallet and is shown there before you approve.');
  await app.inject({ method: 'POST', url: `/v1/top-ups/${topUp.id}/accept`, payload: {}, headers: auth });
  const tx = hash();
  await app.inject({ method: 'POST', url: `/v1/top-ups/${topUp.id}/transaction`, payload: { transaction_hash: tx }, headers: auth });
  chain.receipts.set(tx, receipt(tx, 997n, [transferLog(0, account.address, RECIPIENT, 25_500_000_000_000_000_000n, BSC_USDT)]));
  now = new Date(now.getTime() + 15_000);
  await service.processDue();
  assert.equal((await app.inject({ url: `/v1/top-ups/${topUp.id}`, headers: auth })).json<{ top_up: TopUp }>().top_up.status, 'credited');
  assert.equal((await app.inject({ url: '/v1/card', headers: auth })).json<CardResponse>().card?.available_cents, '2550');
});
