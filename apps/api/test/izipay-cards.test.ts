import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { APIConfig, AuthChallengeResponse, CardResponse, CredentialsResponse, HistoryResponse, LimitsResponse, WalletSessionResponse } from '../../../packages/api-contracts/src/index.ts';
import { buildApp } from '../src/app.ts';
import type { AuthConfiguration } from '../src/auth/service.ts';
import { readConfig } from '../src/config.ts';
import { IzipayClient } from '../src/issuer/izipay.ts';
import { IzipayIssuer } from '../src/issuer/izipay-issuer.ts';
import { migrate } from '../src/migrate.ts';
import { testDatabase } from './database.ts';

// An in-memory stand-in for the IZIPAY API; no external service is contacted.
const configuration: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };
const headers = (token: string, key?: string) => ({ authorization: `Bearer ${token}`, ...(key ? { 'idempotency-key': key } : {}) });

type FakeCard = { card_id: string; client_card_ref: string; cardholder_email: string; issue_status: string };
function fakeIzipay(options: { issueStatus?: string; down?: boolean } = {}) {
  const cards: FakeCard[] = [];
  const calls: string[] = [];
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(status < 300 ? { success: true, data } : { success: false, error: data }), { status });
  const view = (card: FakeCard) => card.issue_status === 'issued'
    ? { ...card, card: { number: '4004 1234 5678 0646', last4: '0646', exp: '05/28', cvv: '321', balance: 0, pending_topup: 0, is_frozen: false } }
    : { ...card, card: { number: '4004 12** **** 0646', last4: '0646' } };
  const http = (async (input: URL, init: RequestInit) => {
    const url = new URL(input);
    calls.push(`${init.method} ${url.pathname}`);
    if (options.down) return new Response('<html>maintenance</html>', { status: 503 });
    if (init.method === 'GET' && url.pathname === '/api/v1/cards') {
      return reply(200, { cards: cards.map(card => ({ ...card, last4: '0646' })), page: 1, limit: 500, total: cards.length, total_pages: 1 });
    }
    if (init.method === 'POST' && url.pathname === '/api/v1/cards/issue') {
      const body = JSON.parse(String(init.body));
      const card = { card_id: `card_test_${cards.length + 1}`, client_card_ref: body.client_card_ref, cardholder_email: body.cardholder_email, issue_status: options.issueStatus ?? 'issued' };
      cards.push(card);
      return reply(201, card);
    }
    const match = url.pathname.match(/^\/api\/v1\/cards\/([^/]+)$/);
    const card = match && cards.find(item => item.card_id === match[1]);
    if (init.method === 'GET' && card) return reply(200, view(card));
    return reply(404, { code: 'NOT_FOUND' });
  }) as typeof fetch;
  const issuer = new IzipayIssuer({ client: new IzipayClient({ apiKey: 'izpk_test_fake', fetch: http }), cardholderEmailDomain: 'cards.example.test' });
  return { issuer, cards, calls };
}

async function izipayApp(issuer: IzipayIssuer, now: () => Date = () => new Date()) {
  const db = testDatabase();
  const app = buildApp({ db, networkMode: 'testnet', issuer, now,
    auth: { configuration, dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }), now } } });
  await migrate(db);
  const account = privateKeyToAccount(generatePrivateKey());
  const challenge = (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
  const verified = await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: {
    challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) } });
  assert.equal(verified.statusCode, 200, verified.body);
  return { db, app, token: verified.json<WalletSessionResponse>().access_token };
}

test('an IZIPAY card is issued once, shows real details and is not labelled as a demo', async t => {
  const fake = fakeIzipay();
  const { db, app, token } = await izipayApp(fake.issuer);
  t.after(async () => { await app.close(); await db.close(); });

  assert.equal((await app.inject({ url: '/v1/config' })).json<APIConfig>().issuer_mode, 'izipay');
  const created = await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(token, 'create-card-1') });
  assert.equal(created.statusCode, 200, created.body);
  const card = created.json<CardResponse>().card!;
  assert.deepEqual([card.status, card.last_four, card.issuer_mode, card.available_cents], ['active', '0646', 'izipay', '0']);
  assert.equal((await db.query<{ issuer_card_id: string }>('SELECT issuer_card_id FROM cards')).rows[0]?.issuer_card_id, 'card_test_1');
  // The cardholder address is per card on our domain, and the reference is the user, not anything secret.
  assert.match(fake.cards[0]!.cardholder_email, /^card-[0-9a-f-]{36}@cards\.example\.test$/);

  assert.equal((await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(token, 'create-card-2') })).json<CardResponse>().card?.id, card.id);
  assert.equal(fake.cards.length, 1);

  const details = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/credentials`, payload: {}, headers: headers(token) });
  assert.equal(details.statusCode, 200, details.body);
  const revealed = details.json<CredentialsResponse>();
  assert.deepEqual([revealed.pan, revealed.expiry_month, revealed.expiry_year, revealed.cvv, revealed.demonstration], ['4004123456780646', 5, 2028, '321', false]);
  // Card numbers are never stored.
  const stored = JSON.stringify((await db.query('SELECT * FROM cards')).rows) + JSON.stringify((await db.query('SELECT * FROM card_credential_reveals')).rows);
  assert.ok(!stored.includes('4004123456780646') && !stored.includes('321"'));

  const history = (await app.inject({ url: '/v1/history', headers: headers(token) })).json<HistoryResponse>();
  assert.ok(history.items.every(item => item.demonstration === false));
  const simulated = await app.inject({ method: 'POST', url: '/v1/demo/card-events', payload: { type: 'authorization', amount_cents: '100' }, headers: headers(token) });
  assert.equal(simulated.statusCode, 404);

  // IZIPAY has no freeze operation: the app must not show a pause the issuer would ignore.
  const paused = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/freeze`, payload: {}, headers: headers(token, 'freeze-1') });
  assert.deepEqual([paused.statusCode, paused.json().error.code], [409, 'freeze_unavailable']);
  assert.equal((await app.inject({ url: '/v1/card', headers: headers(token) })).json<CardResponse>().card?.status, 'active');
  // IZIPAY authorizes purchases itself, so our spend limits are reported as not applying.
  assert.equal((await app.inject({ url: '/v1/config' })).json<APIConfig>().spend_limits_enforced, false);
  assert.equal((await app.inject({ url: '/v1/limits', headers: headers(token) })).json<LimitsResponse>().spend_limits_enforced, false);
});

test('a card the issuer is still preparing becomes active on a later read', async t => {
  const fake = fakeIzipay({ issueStatus: 'paid_pending_issue' });
  let clock = Date.parse('2026-10-14T12:00:00Z');
  const { db, app, token } = await izipayApp(fake.issuer, () => new Date(clock));
  t.after(async () => { await app.close(); await db.close(); });

  const created = (await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(token, 'create-card-1') })).json<CardResponse>().card!;
  assert.equal(created.status, 'provisioning');
  const reveal = await app.inject({ method: 'POST', url: `/v1/cards/${created.id}/credentials`, payload: {}, headers: headers(token) });
  assert.equal(reveal.statusCode, 409);

  fake.cards[0]!.issue_status = 'issued';
  clock += 10_000;
  const read = (await app.inject({ url: '/v1/card', headers: headers(token) })).json<CardResponse>().card!;
  assert.deepEqual([read.status, read.last_four], ['active', '0646']);
  // Reads within the throttle window do not call the issuer again.
  const before = fake.calls.length;
  await app.inject({ url: '/v1/card', headers: headers(token) });
  assert.equal(fake.calls.length, before);
});

test('a card the issuer already made for this user is adopted instead of buying another', async t => {
  const fake = fakeIzipay();
  const { db, app, token } = await izipayApp(fake.issuer);
  t.after(async () => { await app.close(); await db.close(); });
  await app.inject({ url: '/v1/card', headers: headers(token) }); // Creates the wallet's card owner.
  const userID = (await db.query<{ id: string }>("SELECT id FROM app_users WHERE authentication = 'siwe'")).rows[0]!.id;
  // As if an earlier issue request succeeded at IZIPAY but our transaction rolled back.
  fake.cards.push({ card_id: 'card_test_orphan', client_card_ref: userID, cardholder_email: 'card-x@cards.example.test', issue_status: 'issued' });

  const card = (await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(token, 'create-card-1') })).json<CardResponse>().card!;
  assert.equal(card.status, 'active');
  assert.equal(fake.cards.length, 1);
  assert.ok(!fake.calls.includes('POST /api/v1/cards/issue'));
  assert.equal((await db.query<{ issuer_card_id: string }>('SELECT issuer_card_id FROM cards')).rows[0]?.issuer_card_id, 'card_test_orphan');
});

test('an issuer outage is a retryable 503 and leaves no card behind', async t => {
  const { issuer } = fakeIzipay({ down: true });
  const { db, app, token } = await izipayApp(issuer);
  t.after(async () => { await app.close(); await db.close(); });
  const response = await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(token, 'create-card-1') });
  assert.equal(response.statusCode, 503, response.body);
  assert.equal(response.json<{ error: { code: string } }>().error.code, 'issuer_unavailable');
  assert.equal((await db.query('SELECT id FROM cards')).rows.length, 0);
});

test('IZIPAY configuration refuses live keys without opt-in and top-ups for now', () => {
  const base = { DATABASE_URL: 'postgres://localhost/test', NETWORK_MODE: 'testnet', ISSUER_MODE: 'izipay', IZIPAY_CARDHOLDER_EMAIL_DOMAIN: 'cards.example.test' };
  assert.equal(readConfig({ ...base, IZIPAY_API_KEY: 'izpk_test_abc' }).issuer.mode, 'izipay');
  assert.throws(() => readConfig({ ...base, IZIPAY_API_KEY: 'izpk_live_abc' }), /IZIPAY_ALLOW_LIVE/);
  assert.equal(readConfig({ ...base, IZIPAY_API_KEY: 'izpk_live_abc', IZIPAY_ALLOW_LIVE: 'true' }).issuer.mode, 'izipay');
  assert.throws(() => readConfig({ ...base, IZIPAY_API_KEY: '' }), /IZIPAY_API_KEY/);
  assert.throws(() => readConfig({ ...base, IZIPAY_API_KEY: 'izpk_test_abc', IZIPAY_CARDHOLDER_EMAIL_DOMAIN: 'not a domain' }), /DOMAIN/);
  assert.throws(() => readConfig({ ...base, IZIPAY_API_KEY: 'izpk_test_abc', IZIPAY_CARD_TYPE: 'amex' }), /IZIPAY_CARD_TYPE/);
  assert.throws(() => readConfig({ ...base, ISSUER_MODE: 'other' }), /ISSUER_MODE/);
});
