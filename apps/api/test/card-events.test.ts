import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { AuthChallengeResponse, CardEventResult, CardResponse, HistoryResponse, WalletSessionResponse } from '../../../packages/api-contracts/src/index.ts';
import { buildApp } from '../src/app.ts';
import type { AuthConfiguration } from '../src/auth/service.ts';
import { DemoIssuer } from '../src/issuer/issuer.ts';
import { migrate } from '../src/migrate.ts';
import { testDatabase } from './database.ts';

const SECRET = 'test-only-demo-issuer-secret-0123456789abcdef';
const authConfig: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };

async function setup() {
  const now = new Date('2026-10-09T12:00:00.000Z');
  const clock = () => now;
  const db = testDatabase();
  const issuer = new DemoIssuer({ webhookSecret: SECRET });
  const app = buildApp({ db, networkMode: 'testnet', issuer, now: clock,
    auth: { configuration: authConfig, dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }), now: clock } } });
  await migrate(db);
  const signIn = async (fundCents: number) => {
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
    const session = (await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: {
      challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) } })).json<WalletSessionResponse>();
    const auth = { authorization: `Bearer ${session.access_token}` };
    let n = 0;
    const post = (url: string, payload: object = {}) => app.inject({ method: 'POST', url, payload, headers: { ...auth, 'idempotency-key': `key-${n++}-abcdef` } });
    const card = (await post('/v1/cards')).json<CardResponse>().card!;
    if (fundCents) {
      // Seeded credit stands in for a verified top-up (covered separately in funding tests).
      await db.query(`INSERT INTO ledger_entries (id, card_id, source_key, kind, status, amount_cents, available_delta_cents, held_delta_cents, title, occurred_at)
        VALUES ($1,$2,'seed-credit','top_up','credited',$3,$3,0,'Seed',$4)`, [randomUUID(), card.id, fundCents, '2026-10-01T00:00:00Z']);
    }
    const event = async (payload: object) => {
      const response = await post('/v1/demo/card-events', payload);
      assert.equal(response.statusCode, 200, response.body);
      return response.json<CardEventResult>();
    };
    const balance = async () => {
      const value = (await app.inject({ url: '/v1/card', headers: auth })).json<CardResponse>().card!;
      return [value.available_cents, value.held_cents];
    };
    return { auth, post, card, event, balance };
  };
  return { db, app, issuer, signIn, now };
}

test('test purchases: hold, capture, partial refunds, reversal; held funds stay separate and the ledger reconciles', async t => {
  const { db, app, signIn } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn(100_000);
  const auth = await user.event({ type: 'authorization', amount_cents: '2500', merchant: 'Corner Bookstore with a very long demonstration merchant name' });
  assert.equal(auth.decision, 'approved');
  assert.deepEqual(await user.balance(), ['97500', '2500']);
  let history = (await app.inject({ url: '/v1/history', headers: user.auth })).json<HistoryResponse>();
  assert.equal(history.items.find(item => item.id === auth.ledger_entry_id)?.current_status, 'held');

  const capture = await user.event({ type: 'capture', amount_cents: '2500', authorization_id: auth.ledger_entry_id! });
  assert.equal(capture.decision, 'approved');
  assert.deepEqual(await user.balance(), ['97500', '0']);
  assert.equal((await user.post('/v1/demo/card-events', { type: 'capture', amount_cents: '2500', authorization_id: auth.ledger_entry_id! })).json().error.code, 'authorization_settled');
  assert.equal((await user.post('/v1/demo/card-events', { type: 'reversal', amount_cents: '2500', authorization_id: auth.ledger_entry_id! })).json().error.code, 'authorization_settled');

  await user.event({ type: 'refund', amount_cents: '1000', authorization_id: auth.ledger_entry_id! });
  await user.event({ type: 'refund', amount_cents: '1500', authorization_id: auth.ledger_entry_id! });
  assert.equal((await user.post('/v1/demo/card-events', { type: 'refund', amount_cents: '1', authorization_id: auth.ledger_entry_id! })).json().error.code, 'refund_exceeds_capture');
  assert.deepEqual(await user.balance(), ['100000', '0']);

  const second = await user.event({ type: 'authorization', amount_cents: '700', merchant: 'Coffee' });
  assert.equal((await user.post('/v1/demo/card-events', { type: 'refund', amount_cents: '700', authorization_id: second.ledger_entry_id! })).json().error.code, 'not_captured');
  assert.equal((await user.post('/v1/demo/card-events', { type: 'capture', amount_cents: '699', authorization_id: second.ledger_entry_id! })).json().error.code, 'capture_amount_mismatch');
  await user.event({ type: 'reversal', amount_cents: '700', authorization_id: second.ledger_entry_id! });
  assert.deepEqual(await user.balance(), ['100000', '0']);
  history = (await app.inject({ url: '/v1/history', headers: user.auth })).json<HistoryResponse>();
  assert.equal(history.items.find(item => item.id === second.ledger_entry_id)?.current_status, 'reversed');
  assert.equal(history.items.find(item => item.id === auth.ledger_entry_id)?.current_status, 'completed');
  assert.ok(history.items.every(item => item.kind === 'top_up' || item.merchant));
  // Ledger reconciliation: balances are only sums of immutable entries.
  const sums = (await db.query<{ available: string; held: string }>(`SELECT sum(available_delta_cents)::text AS available,
    sum(held_delta_cents)::text AS held FROM ledger_entries WHERE card_id = $1`, [user.card.id])).rows[0]!;
  assert.deepEqual([sums.available, sums.held], await user.balance());
});

test('freeze declines new authorizations, settlements of earlier holds still apply, risk blocks cannot be bypassed', async t => {
  const { db, app, signIn } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn(10_000);
  const hold = await user.event({ type: 'authorization', amount_cents: '1000', merchant: 'Store' });
  assert.equal((await user.post(`/v1/cards/${user.card.id}/freeze`)).statusCode, 200);
  const declined = await user.event({ type: 'authorization', amount_cents: '100', merchant: 'Store' });
  assert.deepEqual([declined.decision, declined.reason, declined.ledger_entry_id], ['declined', 'card_frozen', null]);
  assert.equal((await user.event({ type: 'capture', amount_cents: '1000', authorization_id: hold.ledger_entry_id! })).decision, 'approved');
  assert.equal((await user.post(`/v1/cards/${user.card.id}/unfreeze`)).statusCode, 200);
  assert.equal((await user.event({ type: 'authorization', amount_cents: '100', merchant: 'Store' })).decision, 'approved');
  await db.query("UPDATE cards SET status = 'blocked_by_risk' WHERE id = $1", [user.card.id]);
  assert.equal((await user.event({ type: 'authorization', amount_cents: '100', merchant: 'Store' })).reason, 'card_blocked');
  assert.equal((await user.post(`/v1/cards/${user.card.id}/unfreeze`)).statusCode, 409);
  assert.equal((await user.post(`/v1/cards/${user.card.id}/freeze`)).statusCode, 409);
});

test('authorizations respect available balance and spend limits; declines change nothing', async t => {
  const { db, app, signIn } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const user = await signIn(150_000);
  assert.equal((await user.event({ type: 'authorization', amount_cents: '150001', merchant: 'Store' })).reason, 'insufficient_funds');
  assert.equal((await user.event({ type: 'authorization', amount_cents: '100001', merchant: 'Store' })).reason, 'limit_daily_spend');
  assert.equal((await user.event({ type: 'authorization', amount_cents: '100000', merchant: 'Store' })).decision, 'approved');
  assert.equal((await user.event({ type: 'authorization', amount_cents: '1', merchant: 'Store' })).reason, 'limit_daily_spend');
  assert.deepEqual(await user.balance(), ['50000', '100000']);
  for (const amount of ['0', '-5', '1.25']) assert.equal((await user.post('/v1/demo/card-events', { type: 'authorization', amount_cents: amount, merchant: 'Store' })).statusCode, 400);
  assert.equal((await user.post('/v1/demo/card-events', { type: 'authorization', amount_cents: '5' })).json().error.code, 'merchant_required');
});

test('signed notifications are verified on the raw body, processed once, and cannot reach another card', async t => {
  const { db, app, issuer, signIn, now } = await setup();
  t.after(async () => { await app.close(); await db.close(); });
  const alice = await signIn(10_000);
  const bob = await signIn(10_000);
  const body = JSON.stringify({ id: 'evt_webhook_0001', type: 'authorization', card_id: alice.card.id, amount_cents: '300',
    merchant: 'Webhook Store', authorization_id: null, occurred_at: now.toISOString() });
  const send = (raw: string, timestamp = now.getTime(), signature = issuer.signNotification(raw, timestamp)) => app.inject({
    method: 'POST', url: '/v1/issuer/demo/notifications', payload: raw,
    headers: { 'content-type': 'application/json', 'x-demo-issuer-timestamp': String(timestamp), 'x-demo-issuer-signature': signature } });
  const first = await send(body);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json<CardEventResult>().duplicate, false);
  const again = await send(body);
  assert.equal(again.json<CardEventResult>().duplicate, true);
  assert.equal(again.json<CardEventResult>().ledger_entry_id, first.json<CardEventResult>().ledger_entry_id);
  assert.deepEqual(await alice.balance(), ['9700', '300']);
  const event = (await db.query<{ status: string; attempts: number }>("SELECT status, attempts FROM issuer_events WHERE id = 'evt_webhook_0001'")).rows[0];
  assert.equal(event?.status, 'processed');

  const tampered = body.replace('"300"', '"3000"');
  assert.equal((await send(tampered, now.getTime(), issuer.signNotification(body, now.getTime()))).statusCode, 401);
  assert.equal((await send(body.replace('0001', '0002'), now.getTime() - 6 * 60_000)).statusCode, 401);
  assert.equal((await send(body.replace('0001', '0003'), now.getTime(), '0'.repeat(64))).statusCode, 401);
  const otherKey = new DemoIssuer({ webhookSecret: 'another-secret-that-is-at-least-32-chars' });
  const forged = body.replace('0001', '0004');
  assert.equal((await send(forged, now.getTime(), otherKey.signNotification(forged, now.getTime()))).statusCode, 401);
  assert.deepEqual(await alice.balance(), ['9700', '300']);

  // Bob's tool only reaches Bob's card; Alice's authorization ID is unknown there.
  const aliceAuth = first.json<CardEventResult>().ledger_entry_id!;
  assert.equal((await bob.post('/v1/demo/card-events', { type: 'capture', amount_cents: '300', authorization_id: aliceAuth })).statusCode, 404);
  assert.equal((await bob.event({ type: 'authorization', amount_cents: '100', merchant: 'Store' })).card_id, bob.card.id);
  assert.deepEqual(await alice.balance(), ['9700', '300']);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/demo/card-events', payload: { type: 'authorization', amount_cents: '1', merchant: 'x' } })).statusCode, 401);
});
