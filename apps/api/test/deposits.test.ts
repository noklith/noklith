import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import type { Hex } from 'viem';
import { english, generateMnemonic, generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import type { AuthChallengeResponse, DepositAddressResponse, WalletSessionResponse } from '../../../packages/api-contracts/src/index.ts';
import { buildApp } from '../src/app.ts';
import type { AuthConfiguration } from '../src/auth/service.ts';
import type { ChainAdapter, IncomingTransfer } from '../src/chain/adapter.ts';
import { DepositKeys } from '../src/funding/deposit-keys.ts';
import { DepositService } from '../src/funding/deposits.ts';
import { DEFAULT_FUNDING_TIMING, FundingService } from '../src/funding/service.ts';
import { DemoIssuer } from '../src/issuer/issuer.ts';
import { LimitsService } from '../src/limits.ts';
import { migrate } from '../src/migrate.ts';
import { testDatabase } from './database.ts';

// A deterministic chain double: transfers are listed by block; no RPC provider or wallet is contacted.
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'.toLowerCase();
const authConfig: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };
const network = { chainId: 84532, name: 'Base Sepolia', confirmations: 3, explorerTxURL: 'https://sepolia.basescan.org/tx/',
  assets: [{ symbol: 'USDC', name: 'USDC (Base Sepolia test token)', tokenAddress: TOKEN, decimals: 6 }] };
// BNB Smart Chain Testnet USDT has 18 decimals, as on the real network.
const USDT_BSC = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'.toLowerCase();
const bscTestnet = { chainId: 97, name: 'BNB Smart Chain Testnet', confirmations: 3, explorerTxURL: 'https://testnet.bscscan.com/tx/',
  assets: [{ symbol: 'USDT', name: 'Tether USD (BNB Smart Chain Testnet test token)', tokenAddress: USDT_BSC, decimals: 18 }] };
const TOKENS: Record<number, string> = { 84532: TOKEN, 97: USDT_BSC };
const hash = () => `0x${randomBytes(32).toString('hex')}` as Hex;
const usdc = (dollars: number) => BigInt(Math.round(dollars * 1_000_000));

class ScanChain implements ChainAdapter {
  chainIds = [84532, 97];
  latest = 1_000n;
  /** Transfers on Base Sepolia unless chainId says otherwise. */
  transfers: (IncomingTransfer & { chainId?: number })[] = [];
  async checkTransfer(): Promise<never> { throw new Error('not used'); }
  async latestBlock() { return this.latest; }
  async incomingTransfers(chainId: number, token: string, recipients: readonly string[], fromBlock: bigint, toBlock: bigint) {
    assert.equal(token, TOKENS[chainId]);
    return this.transfers.filter(item => (item.chainId ?? 84532) === chainId && recipients.includes(item.to)
      && item.blockNumber >= fromBlock && item.blockNumber <= toBlock);
  }
}

function accountKey() {
  const mnemonic = generateMnemonic(english);
  return { mnemonic, xpub: mnemonicToAccount(mnemonic, { path: "m/44'/60'/0'" }).getHdKey().publicExtendedKey };
}

async function setup(networks: typeof network[] = [network]) {
  const funding = { recipient: '0x1111111111111111111111111111111111111111', ...DEFAULT_FUNDING_TIMING, networks };
  const db = testDatabase();
  const chain = new ScanChain();
  const issuer = new DemoIssuer();
  const limits = new LimitsService(undefined, { topUpsPerHour: 100, topUpsPerDay: 100, purchasesPerHour: 100, purchasesPerDay: 100 });
  const alerts: string[] = [];
  const service = new FundingService({ db, chain, issuer, limits, config: funding, onAlert: message => alerts.push(message) });
  const { mnemonic, xpub } = accountKey();
  const deposits = new DepositService({ db, chain, funding: service, networks: funding.networks, keys: new DepositKeys(xpub) });
  const app = buildApp({ db, networkMode: 'testnet', issuer, limits, funding: service, deposits,
    auth: { configuration: authConfig, dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }) } } });
  await migrate(db);
  let n = 0;
  const signIn = async (withCard = true) => {
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
    const verified = (await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: {
      challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) } })).json<WalletSessionResponse>();
    const headers = { authorization: `Bearer ${verified.access_token}` };
    if (withCard) {
      const created = await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: { ...headers, 'idempotency-key': `card-create-${n++}-${randomBytes(6).toString('hex')}` } });
      assert.equal(created.statusCode, 200, created.body);
    }
    return { headers };
  };
  const addressOf = async (headers: Record<string, string>) => {
    const response = await app.inject({ url: '/v1/deposit-address', headers });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<DepositAddressResponse>();
  };
  return { db, app, chain, service, deposits, signIn, addressOf, alerts, mnemonic };
}

test('deposit addresses come from the public key only and match the seed wallet addresses', () => {
  const { mnemonic, xpub } = accountKey();
  const keys = new DepositKeys(xpub);
  for (const index of [0, 1, 7]) {
    assert.equal(keys.address(index), mnemonicToAccount(mnemonic, { addressIndex: index }).address.toLowerCase());
  }
  const xprv = mnemonicToAccount(mnemonic, { path: "m/44'/60'/0'" }).getHdKey().privateExtendedKey;
  assert.throws(() => new DepositKeys(xprv), /public key/);
  assert.throws(() => new DepositKeys('xpub-not-a-key'), /not a valid/);
});

test('each user with a card gets one stable personal address; without a card there is none', async t => {
  const { db, app, signIn, addressOf } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const config = (await app.inject('/v1/config')).json();
  assert.equal(config.deposits_enabled, true);
  const first = await signIn(), second = await signIn();
  const a = await addressOf(first.headers), again = await addressOf(first.headers), b = await addressOf(second.headers);
  assert.equal(a.address, again.address);
  assert.notEqual(a.address, b.address);
  assert.match(a.address, /^0x[0-9a-fA-F]{40}$/);
  assert.deepEqual(a.networks.map(item => [item.chain_id, item.assets.map(asset => asset.symbol)]), [[84532, ['USDC']]]);
  const noCard = await signIn(false);
  const refused = await app.inject({ url: '/v1/deposit-address', headers: noCard.headers });
  assert.equal(refused.statusCode, 409);
  assert.equal((await app.inject('/v1/deposit-address')).statusCode, 401);
});

test('a confirmed deposit is credited once to the card; unconfirmed blocks wait; rescans never credit twice', async t => {
  const { db, app, chain, service, deposits, signIn, addressOf } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn();
  const { address } = await addressOf(user.headers);
  const to = address.toLowerCase(), from = '0x2222222222222222222222222222222222222222';
  const tx = hash();
  chain.transfers.push({ transactionHash: tx, logIndex: 4, blockNumber: 1_005n, from, to, units: usdc(25.5) });
  chain.latest = 1_006n; // 2 confirmations, 3 required
  assert.equal(await deposits.scan(), 0);
  chain.latest = 1_007n;
  assert.equal(await deposits.scan(), 1);
  const intent = (await db.query<{ status: string; source: string; amount_cents: string; transaction_hash: string }>(
    'SELECT status, source, amount_cents::text AS amount_cents, transaction_hash FROM top_up_intents')).rows;
  assert.deepEqual(intent, [{ status: 'funding_pending', source: 'deposit', amount_cents: '2550', transaction_hash: tx }]);
  await service.processDue();
  const credited = await db.query<{ status: string }>('SELECT status FROM top_up_intents');
  assert.equal(credited.rows[0]!.status, 'credited');
  const ledger = await db.query<{ amount_cents: string }>(`SELECT amount_cents::text AS amount_cents FROM ledger_entries WHERE kind = 'top_up'`);
  assert.equal(ledger.rows.length, 1);
  // Rewinding the cursor rescans the same block without a second credit.
  await db.query('UPDATE deposit_scan_cursors SET last_block = 1000');
  assert.equal(await deposits.scan(), 0);
  assert.equal((await db.query('SELECT 1 FROM top_up_intents')).rows.length, 1);
  const list = await app.inject({ url: '/v1/top-ups', headers: user.headers });
  assert.equal(list.json().items[0].status, 'credited');
});

test('deposits above the limit wait for the operator; dust below a cent is ignored', async t => {
  const { db, app, chain, service, deposits, signIn, addressOf, alerts } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn();
  const to = (await addressOf(user.headers)).address.toLowerCase(), from = '0x2222222222222222222222222222222222222222';
  chain.transfers.push({ transactionHash: hash(), logIndex: 0, blockNumber: 1_001n, from, to, units: usdc(600) });
  chain.transfers.push({ transactionHash: hash(), logIndex: 0, blockNumber: 1_002n, from, to, units: 9_999n });
  chain.latest = 1_010n;
  assert.equal(await deposits.scan(), 1);
  await service.processDue();
  const rows = (await db.query<{ status: string; needs_review_at: unknown }>('SELECT status, needs_review_at FROM top_up_intents')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.status, 'funding_pending');
  assert.ok(rows[0]!.needs_review_at);
  assert.ok(alerts.some(message => message.includes('waits for the operator')));
  assert.equal((await db.query(`SELECT 1 FROM ledger_entries WHERE kind = 'top_up'`)).rows.length, 0);
});

test('transfers to addresses of other services are not credited', async t => {
  const { db, app, chain, deposits, signIn, addressOf } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn();
  await addressOf(user.headers);
  chain.transfers.push({ transactionHash: hash(), logIndex: 0, blockNumber: 1_001n, from: '0x2222222222222222222222222222222222222222',
    to: '0x3333333333333333333333333333333333333333', units: usdc(10) });
  chain.latest = 1_010n;
  assert.equal(await deposits.scan(), 0);
  assert.equal((await db.query('SELECT 1 FROM top_up_intents')).rows.length, 0);
});

test('one address takes deposits on several networks, including 18-decimal USDT', async t => {
  const { db, app, chain, service, deposits, signIn, addressOf } = await setup([network, bscTestnet]);
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn();
  const shown = await addressOf(user.headers);
  assert.deepEqual(shown.networks.map(item => [item.chain_id, item.assets.map(asset => `${asset.symbol}:${asset.decimals}`)]), [[84532, ['USDC:6']], [97, ['USDT:18']]]);
  const to = shown.address.toLowerCase(), from = '0x2222222222222222222222222222222222222222';
  // $12.345 in USDT: whole cents are credited, the half cent stays unassigned.
  chain.transfers.push({ chainId: 97, transactionHash: hash(), logIndex: 1, blockNumber: 1_002n, from, to, units: 12_345n * 10n ** 15n });
  chain.transfers.push({ transactionHash: hash(), logIndex: 0, blockNumber: 1_003n, from, to, units: usdc(7) });
  chain.latest = 1_010n;
  assert.equal(await deposits.scan(), 2);
  const rows = (await db.query<{ chain_id: number; asset: string; amount_cents: string; token_units: string }>(
    'SELECT chain_id, asset, amount_cents::text AS amount_cents, token_units::text AS token_units FROM top_up_intents ORDER BY chain_id')).rows;
  assert.deepEqual(rows.map(row => [Number(row.chain_id), row.asset, row.amount_cents, row.token_units]),
    [[97, 'USDT', '1234', '12345000000000000000'], [84532, 'USDC', '700', '7000000']]);
  await service.processDue();
  const credited = await db.query<{ amount_cents: string }>(`SELECT amount_cents::text AS amount_cents FROM ledger_entries WHERE kind = 'top_up'`);
  assert.deepEqual(credited.rows.map(row => row.amount_cents).sort(), ['1234', '700']);
});
