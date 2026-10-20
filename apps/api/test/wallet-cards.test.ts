import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { AuthChallengeResponse, CardResponse, CredentialsResponse, EventsResponse, LimitsResponse, WalletSessionResponse } from '../../../packages/api-contracts/src/index.ts';
import { buildApp } from '../src/app.ts';
import type { AuthConfiguration } from '../src/auth/service.ts';
import { DemoIssuer } from '../src/issuer/issuer.ts';
import { LimitsService, utcPeriods } from '../src/limits.ts';
import { migrate } from '../src/migrate.ts';
import { CREDENTIAL_REVEALS_PER_HOUR } from '../src/service.ts';
import { testDatabase } from './database.ts';

// Ephemeral in-memory signers and an RPC test double; no external service is contacted.
const configuration: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };
const headers = (token: string, key?: string) => ({ authorization: `Bearer ${token}`, ...(key ? { 'idempotency-key': key } : {}) });

async function walletApp(now: () => Date, issuer = new DemoIssuer()) {
  const db = testDatabase();
  const app = buildApp({ db, networkMode: 'testnet', issuer, now,
    auth: { configuration, dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }), now } } });
  await migrate(db);
  const signIn = async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
    const verified = await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: {
      challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) } });
    assert.equal(verified.statusCode, 200, verified.body);
    return verified.json<WalletSessionResponse>().access_token;
  };
  return { db, app, signIn };
}

test('a signed-in wallet issues exactly one DemoIssuer card; another wallet cannot read or change it', async t => {
  const { db, app, signIn } = await walletApp(() => new Date());
  t.after(async () => { await app.close(); await db.close(); });
  const alice = await signIn();
  const bob = await signIn();
  assert.equal((await app.inject({ url: '/v1/card', headers: headers(alice) })).json<CardResponse>().card, null);
  const created = await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(alice, 'create-card-1') });
  assert.equal(created.statusCode, 200, created.body);
  const card = created.json<CardResponse>().card;
  assert.ok(card);
  assert.equal(card.status, 'active');
  assert.match(card.last_four, /^[0-9]{4}$/);
  assert.equal(card.available_cents, '0');
  // Same key replays; a new key still cannot create a second card.
  assert.deepEqual((await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(alice, 'create-card-1') })).json(), created.json());
  assert.equal((await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(alice, 'create-card-2') })).json<CardResponse>().card?.id, card.id);
  assert.equal((await db.query('SELECT id FROM cards')).rows.length, 1);

  for (const action of ['freeze', 'unfreeze', 'credentials']) {
    const response: { statusCode: number; body: string } = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/${action}`, payload: {}, headers: headers(bob, `bob-${action}`) });
    assert.equal(response.statusCode, 404, `${action}: ${response.body}`);
  }
  assert.equal((await app.inject({ url: '/v1/card', headers: headers(bob) })).json<CardResponse>().card, null);
  const frozen = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/freeze`, payload: {}, headers: headers(alice, 'freeze-1') });
  assert.equal(frozen.json<CardResponse>().card?.status, 'frozen_by_user');

  // Events record the creation and the freeze; recovery starts after a known sequence.
  const events = (await app.inject({ url: '/v1/events', headers: headers(alice) })).json<EventsResponse>();
  assert.deepEqual(events.items.map(item => item.type), ['card', 'card']);
  const after = (await app.inject({ url: `/v1/events?after=${events.items[0]!.seq}`, headers: headers(alice) })).json<EventsResponse>();
  assert.equal(after.items.length, 1);
  assert.equal(after.latest_seq, events.latest_seq);
  assert.deepEqual((await app.inject({ url: '/v1/events', headers: headers(bob) })).json<EventsResponse>().items, []);

  // Logging out ends card access for that token only.
  assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: {}, headers: headers(alice) })).statusCode, 204);
  assert.equal((await app.inject({ url: '/v1/card', headers: headers(alice) })).statusCode, 401);
});

test('test details are synthetic, short-lived, rate limited and unavailable for blocked cards', async t => {
  const now = new Date('2026-10-09T10:00:00.000Z');
  const { db, app, signIn } = await walletApp(() => now);
  t.after(async () => { await app.close(); await db.close(); });
  const token = await signIn();
  const card = (await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(token, 'create-card') })).json<CardResponse>().card!;
  const reveal = () => app.inject({ method: 'POST', url: `/v1/cards/${card.id}/credentials`, payload: {}, headers: headers(token) });
  const first = await reveal();
  assert.equal(first.statusCode, 200, first.body);
  const details = first.json<CredentialsResponse>();
  assert.match(details.pan, /^9999[0-9]{12}$/);
  assert.ok(details.pan.endsWith(card.last_four));
  assert.equal(details.demonstration, true);
  assert.equal(details.expires_at, '2026-10-09T10:01:00.000Z');
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.deepEqual((await reveal()).json<CredentialsResponse>().pan, details.pan);
  for (let i = 2; i < CREDENTIAL_REVEALS_PER_HOUR; i++) assert.equal((await reveal()).statusCode, 200);
  assert.equal((await reveal()).statusCode, 429);
  // Older reveals leave the one-hour window.
  await db.query("UPDATE card_credential_reveals SET revealed_at = revealed_at - interval '61 minutes', expires_at = expires_at - interval '61 minutes'");
  assert.equal((await reveal()).statusCode, 200);
  // No card number is persisted anywhere: only the audit timestamps.
  const stored = JSON.stringify((await db.query('SELECT * FROM cards')).rows) + JSON.stringify((await db.query('SELECT * FROM card_credential_reveals')).rows);
  assert.ok(!stored.includes(details.pan));
  await db.query("UPDATE cards SET status = 'blocked_by_risk' WHERE id = $1", [card.id]);
  assert.equal((await reveal()).statusCode, 409);
  const unfreeze = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/unfreeze`, payload: {}, headers: headers(token, 'unfreeze-risk') });
  assert.equal(unfreeze.statusCode, 409);
});

test('UTC periods and limit boundaries: top-up 499.99/500/500.01, monthly reservations and spend with reversals', async t => {
  const db = testDatabase();
  t.after(async () => { await db.close(); });
  await migrate(db);
  const limits = new LimitsService();
  const now = new Date('2026-10-31T23:59:59.999Z');
  const periods = utcPeriods(now);
  assert.equal(periods.dayStart.toISOString(), '2026-10-31T00:00:00.000Z');
  assert.equal(periods.monthEnd.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(utcPeriods(new Date('2026-12-31T12:00:00Z')).monthEnd.toISOString(), '2027-01-01T00:00:00.000Z');

  const user = randomUUID(), card = randomUUID();
  await db.query("INSERT INTO app_users (id, authentication) VALUES ($1, 'fixture')", [user]);
  await db.query("INSERT INTO cards (id, user_id, status, last_four) VALUES ($1,$2,'active','1234')", [card, user]);
  await assert.rejects(limits.checkTopUp(db, card, 0n, now), { code: 'invalid_amount' });
  await assert.rejects(limits.checkTopUp(db, card, -1n, now), { code: 'invalid_amount' });
  await limits.checkTopUp(db, card, 49_999n, now);
  await limits.checkTopUp(db, card, 50_000n, now);
  await assert.rejects(limits.checkTopUp(db, card, 50_001n, now), { code: 'limit_single_top_up' });

  const intent = async (cents: number, status: string, createdAt: string) => db.query(`INSERT INTO top_up_intents
    (id, card_id, user_id, status, failure_reason, chain_id, asset, token_address, token_decimals, sender_address, recipient_address,
     amount_cents, token_units, created_at, quote_expires_at, submit_deadline, updated_at, transaction_hash)
    VALUES ($1,$2,$3,$4,$5,84532,'USDC',$6,6,$6,$6,$7,$8,$9,$10,$10,$9,$11)`,
  [randomUUID(), card, user, status, status === 'failed' ? 'test' : null, `0x${'1'.repeat(40)}`, cents, String(BigInt(cents) * 10_000n),
    createdAt, new Date(new Date(createdAt).getTime() + 600_000).toISOString(),
    ['credited', 'submitted'].includes(status) ? `0x${randomUUID().replaceAll('-', '').padEnd(64, '0')}` : null]);
  for (let i = 0; i < 9; i++) await intent(50_000, 'credited', '2026-10-05T10:00:00Z');
  await intent(49_999, 'awaiting_signature', '2026-10-31T23:00:00Z'); // Active reservation counts.
  await intent(50_000, 'failed', '2026-10-30T10:00:00Z'); // Released.
  await intent(50_000, 'expired', '2026-10-30T10:00:00Z'); // Released.
  await intent(50_000, 'credited', '2026-09-30T23:59:59Z'); // Previous month.
  assert.equal(await limits.topUpUsage(db, card, now), 499_999n);
  await limits.checkTopUp(db, card, 1n, now);
  await assert.rejects(limits.checkTopUp(db, card, 2n, now), { code: 'limit_monthly_top_up' });
  assert.equal(await limits.topUpUsage(db, card, new Date('2026-11-01T00:00:00Z')), 0n);

  const ledger = async (kind: string, cents: number, at: string, parent: string | null = null) => {
    const id = randomUUID();
    const deltas: Record<string, [number, number, string]> = { top_up: [cents, 0, 'credited'], authorization: [-cents, cents, 'held'],
      capture: [0, -cents, 'completed'], reversal: [cents, -cents, 'reversed'], refund: [cents, 0, 'credited'] };
    const [available, held, status] = deltas[kind]!;
    await db.query(`INSERT INTO ledger_entries (id, card_id, source_key, kind, status, amount_cents, available_delta_cents, held_delta_cents, title, occurred_at, parent_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'t',$9,$10)`, [id, card, id, kind, status, cents, available, held, at, parent]);
    return id;
  };
  await ledger('top_up', 600_000, '2026-10-01T00:00:00Z');
  const earlier = await ledger('authorization', 60_000, '2026-10-30T12:00:00Z');
  await ledger('capture', 60_000, '2026-10-30T13:00:00Z', earlier);
  await ledger('refund', 60_000, '2026-10-31T01:00:00Z', earlier); // Refund does not restore spend allowance.
  const today = await ledger('authorization', 90_000, '2026-10-31T00:00:00Z');
  await limits.checkSpend(db, card, 10_000n, now);
  await assert.rejects(limits.checkSpend(db, card, 10_001n, now), { code: 'limit_daily_spend' });
  await ledger('reversal', 90_000, '2026-10-31T02:00:00Z', today); // A reversal releases its authorization's period.
  await limits.checkSpend(db, card, 100_000n, now);
  for (let i = 0; i < 6; i++) await ledger('authorization', 70_000, `2026-10-0${i + 2}T10:00:00Z`);
  // Month: 60,000 + 420,000 = 480,000 spent; 20,000 remains.
  await limits.checkSpend(db, card, 20_000n, now);
  await assert.rejects(limits.checkSpend(db, card, 20_001n, now), { code: 'limit_monthly_spend' });
});

test('limits endpoint reports configured values and current usage for the caller only', async t => {
  const { db, app, signIn } = await walletApp(() => new Date('2026-10-09T10:00:00Z'));
  t.after(async () => { await app.close(); await db.close(); });
  const token = await signIn();
  const empty = (await app.inject({ url: '/v1/limits', headers: headers(token) })).json<LimitsResponse>();
  assert.deepEqual(empty.limits, { single_top_up_cents: '50000', monthly_top_up_cents: '500000', daily_spend_cents: '100000', monthly_spend_cents: '500000',
    period_timezone: 'UTC', top_ups_per_hour: 5, top_ups_per_day: 10, purchases_per_hour: 10, purchases_per_day: 30 });
  assert.deepEqual(empty.usage, { monthly_top_up_cents: '0', daily_spend_cents: '0', monthly_spend_cents: '0',
    top_ups_last_hour: 0, top_ups_last_day: 0, purchases_last_hour: 0, purchases_last_day: 0 });
  assert.equal((await app.inject({ url: '/v1/limits' })).statusCode, 401);
});
