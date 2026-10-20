import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { CardResponse, HistoryResponse, SessionResponse } from '../../../../packages/api-contracts/src/index.ts';
import { startFixtureApp } from './fixture-app.ts';

// Exercise an actual TCP listener, not Fastify.inject. Token values never go to output.
const { app, address } = await startFixtureApp({ port: 0, logger: false });
const request = (path: string, init?: RequestInit) => fetch(`${address}${path}`, { ...init, signal: AbortSignal.timeout(10000) });
try {
  assert.equal((await request('/health')).status, 200);
  assert.equal((await request('/ready')).status, 200);
  const config = await (await request('/v1/config')).json() as { network_mode: string; wallet_auth_enabled: boolean };
  assert.equal(config.network_mode, 'fixture');
  assert.equal(config.wallet_auth_enabled, false);
  const sessionResponse = await request('/v1/fixture/sessions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: 'standard' }),
  });
  assert.equal(sessionResponse.status, 200, 'Fixture session HTTP status');
  const session = await sessionResponse.json() as SessionResponse;
  const headers = { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' };
  const cardResponse = await request('/v1/card', { headers });
  assert.equal(cardResponse.status, 200);
  const { card } = await cardResponse.json() as CardResponse;
  assert.ok(card);
  assert.equal(card.available_cents, '22310');
  assert.equal(card.held_cents, '850');
  const history = await (await request('/v1/history', { headers })).json() as HistoryResponse;
  assert.equal(history.items.length, 4);
  assert.ok(history.items.every(item => item.demonstration && item.transaction_hash === null));
  for (const [action, state] of [['freeze', 'frozen_by_user'], ['unfreeze', 'active']]) {
    const response = await request(`/v1/cards/${card.id}/${action}`, {
      method: 'POST', headers: { ...headers, 'idempotency-key': randomUUID() }, body: '{}',
    });
    assert.equal(response.status, 200, `${action} HTTP status`);
    assert.equal(((await response.json()) as CardResponse).card?.status, state);
  }
  assert.equal((await request('/v1/auth/logout', { method: 'POST', headers, body: '{}' })).status, 204);
  assert.equal((await request('/v1/card', { headers })).status, 401);
  console.log('PASS: actual loopback HTTP health, ready, config, fixture session, card, history, freeze, unfreeze, logout, revoked access.');
} finally {
  await app.close();
  assert.equal(app.server.listening, false);
  console.log('Fixture HTTP listener and database closed. No server process remains.');
}
