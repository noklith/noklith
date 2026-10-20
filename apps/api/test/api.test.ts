import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.ts';
import { readConfig } from '../src/config.ts';
import { migrate } from '../src/migrate.ts';
import { testDatabase } from './database.ts';
import type { CardResponse, HistoryResponse, SessionResponse } from '../../../packages/api-contracts/src/index.ts';

test('configuration fails closed; fixtures cannot bind publicly or become mainnet', () => {
  assert.equal(readConfig({ DATABASE_URL: 'postgresql://local/db' }).networkMode, 'testnet');
  for (const env of [{ NETWORK_MODE: 'mainnet' }, { ISSUER_MODE: 'live' }, { NETWORK_MODE: 'fixture', HOST: '0.0.0.0' }, { PORT: '3000oops' }]) {
    assert.throws(() => readConfig({ DATABASE_URL: 'postgresql://local/db', ...env }));
  }
});

test('ordinary mode has config but cannot issue synthetic sessions or accept fixture credentials', async t => {
  const db = testDatabase();
  const app = buildApp({ db, networkMode: 'testnet' });
  t.after(async () => { await app.close(); await db.close(); });
  const config = await app.inject('/v1/config');
  assert.equal(config.statusCode, 200);
  assert.deepEqual(config.json().networks, []);
  assert.equal(config.json().wallet_auth_enabled, false);
  assert.equal(config.json().top_up_enabled, false);
  assert.equal(config.json().limits.single_top_up_cents, '50000');
  assert.equal((await app.inject({ method: 'POST', url: '/v1/fixture/sessions', payload: { profile: 'standard' } })).statusCode, 404);
  assert.equal((await app.inject('/v1/card')).statusCode, 503);
  assert.equal((await app.inject('/ready')).statusCode, 503);
});

test('fixture API persists ownership, history and atomic idempotent freeze; risky cards cannot reactivate', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'crypto-card-pg-'));
  let db = testDatabase(directory);
  let now = new Date('2026-10-06T12:00:00.000Z');
  let app = buildApp({ db, networkMode: 'fixture', now: () => now });
  t.after(async () => {
    await app.close(); await db.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('crypto-card-pg-'));
    await rm(directory, { recursive: true, force: true });
  });
  await migrate(db);
  await migrate(db); // Repeat startup must not duplicate migrations or seed records.
  const session = async (profile: 'standard' | 'empty' | 'risk') => {
    const result = await app.inject({ method: 'POST', url: '/v1/fixture/sessions', payload: { profile } });
    assert.equal(result.statusCode, 200, result.body);
    return result.json<SessionResponse>();
  };
  const alice = await session('standard');
  const bob = await session('empty');
  const risk = await session('risk');
  const headers = (access_token: string) => ({ authorization: `Bearer ${access_token}` });
  const getCard = async (token: string) => (await app.inject({ url: '/v1/card', headers: headers(token) })).json<CardResponse>().card;
  const card = await getCard(alice.access_token);
  assert.ok(card);
  assert.equal(card.available_cents, '22310');
  assert.equal(card.held_cents, '850');
  assert.equal(await getCard(bob.access_token), null);
  assert.equal((await app.inject('/v1/card')).statusCode, 401);
  const change = (token: string, id: string, action: string, key: string) => app.inject({
    method: 'POST', url: `/v1/cards/${id}/${action}`, headers: { ...headers(token), 'idempotency-key': key }, payload: {},
  });
  assert.equal((await change(bob.access_token, card.id, 'freeze', 'other-user-key')).statusCode, 404);
  const parallel = await Promise.all(Array.from({ length: 6 }, () => change(alice.access_token, card.id, 'freeze', 'same-freeze-key')));
  for (const response of parallel) {
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json<CardResponse>().card?.status, 'frozen_by_user');
  }
  const eventCount = await db.query<{ count: string }>('SELECT count(*)::text FROM card_state_events WHERE card_id = $1', [card.id]);
  assert.equal(eventCount.rows[0]?.count, '1');
  assert.equal((await change(alice.access_token, card.id, 'unfreeze', 'same-freeze-key')).statusCode, 409);
  assert.equal((await change(alice.access_token, card.id, 'unfreeze', 'new-unfreeze-key')).statusCode, 200);
  const riskCard = await getCard(risk.access_token);
  assert.ok(riskCard);
  assert.equal((await change(risk.access_token, riskCard.id, 'unfreeze', 'risk-unfreeze-key')).statusCode, 409);
  assert.equal((await change(risk.access_token, riskCard.id, 'freeze', 'risk-freeze-key')).statusCode, 409);
  assert.equal((await getCard(risk.access_token))?.status, 'blocked_by_risk');

  const page1 = (await app.inject({ url: '/v1/history?limit=2', headers: headers(alice.access_token) })).json<HistoryResponse>();
  assert.equal(page1.items.length, 2);
  assert.ok(page1.next_cursor);
  assert.equal(page1.items[0]?.kind, 'authorization');
  assert.equal(page1.items[0]?.demonstration, true);
  assert.equal(page1.items[0]?.transaction_hash, null);
  const page2 = (await app.inject({ url: `/v1/history?limit=2&cursor=${page1.next_cursor}`, headers: headers(alice.access_token) })).json<HistoryResponse>();
  assert.equal(page2.items.length, 2);
  assert.equal(page2.next_cursor, null);
  assert.equal(new Set([...page1.items, ...page2.items].map(item => item.id)).size, 4);
  assert.equal((await app.inject({ url: `/v1/history?cursor=${page1.next_cursor}`, headers: headers(bob.access_token) })).statusCode, 400);
  assert.equal((await app.inject({ url: '/v1/history?limit=51', headers: headers(alice.access_token) })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/fixture/sessions', payload: { profile: 'standard', wallet_address: 'spoof' } })).statusCode, 400);

  const issued = await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: { ...headers(bob.access_token), 'idempotency-key': 'create-card-key' } });
  assert.equal(issued.statusCode, 200, issued.body);
  assert.equal(issued.json<CardResponse>().card?.available_cents, '0');
  // Close and reopen the embedded database: sessions, card state, journal, and request replay survive.
  await change(alice.access_token, card.id, 'freeze', 'persist-freeze-key');
  await app.close(); await db.close();
  db = testDatabase(directory);
  app = buildApp({ db, networkMode: 'fixture', now: () => now });
  await migrate(db);
  assert.equal((await getCard(alice.access_token))?.status, 'frozen_by_user');
  assert.equal((await getCard(alice.access_token))?.available_cents, '22310');
  assert.equal((await change(alice.access_token, card.id, 'freeze', 'persist-freeze-key')).statusCode, 200);
  const stored = await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE user_id = $1', [alice.user.id]);
  assert.notEqual(stored.rows[0]?.token_hash, alice.access_token);
  assert.equal(stored.rows[0]?.token_hash.length, 64);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: headers(alice.access_token), payload: {} })).statusCode, 204);
  assert.equal((await app.inject({ url: '/v1/card', headers: headers(alice.access_token) })).statusCode, 401);
  now = new Date('2026-10-06T13:00:00.000Z');
  assert.equal((await app.inject({ url: '/v1/card', headers: headers(bob.access_token) })).statusCode, 401);
});
