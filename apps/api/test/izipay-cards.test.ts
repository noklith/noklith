import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { APIConfig, AuthChallengeResponse, CardResponse, CredentialsResponse, HistoryResponse, LimitsResponse, PaymentCodeResponse, WalletSessionResponse } from '../../../packages/api-contracts/src/index.ts';
import { buildApp } from '../src/app.ts';
import type { AuthConfiguration } from '../src/auth/service.ts';
import { readConfig } from '../src/config.ts';
import { IzipayClient } from '../src/issuer/izipay.ts';
import { IzipayIssuer } from '../src/issuer/izipay-issuer.ts';
import { migrate } from '../src/migrate.ts';
import type { Database } from '../src/database.ts';
import { CardMailService, extractPaymentCode } from '../src/issuer/card-mail.ts';
import { createHmac } from 'node:crypto';
import { testDatabase } from './database.ts';

// An in-memory stand-in for the IZIPAY API; no external service is contacted.
const configuration: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };
const headers = (token: string, key?: string) => ({ authorization: `Bearer ${token}`, ...(key ? { 'idempotency-key': key } : {}) });

type FakeCard = { card_id: string; client_card_ref: string; cardholder_email: string; issue_status: string; frozen?: boolean; locked?: boolean };
function fakeIzipay(options: { issueStatus?: string; down?: boolean } = {}) {
  const cards: FakeCard[] = [];
  const calls: string[] = [];
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(status < 300 ? { success: true, data } : { success: false, error: data }), { status });
  const view = (card: FakeCard) => card.issue_status === 'issued'
    ? { ...card, card: { number: '4004 1234 5678 0646', last4: '0646', exp: '05/28', cvv: '321', balance: 0, pending_topup: 0, is_frozen: !!card.frozen } }
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
    const freezing = url.pathname.match(/^\/api\/v1\/cards\/([^/]+)\/(freeze|unfreeze)$/);
    const target = freezing && cards.find(item => item.card_id === freezing[1]);
    if (init.method === 'POST' && target) {
      // As documented by IZIPAY support: no body, repeat-safe, and a support lock refuses unfreeze with 403.
      if (init.body !== undefined) return reply(400, { code: 'UNEXPECTED_BODY' });
      if (freezing![2] === 'unfreeze' && target.locked) return reply(403, { code: 'CARD_LOCKED_BY_SUPPORT', message: 'Contact support.' });
      const already = target.frozen === (freezing![2] === 'freeze');
      target.frozen = freezing![2] === 'freeze';
      return reply(200, { card_id: target.card_id, status: target.frozen ? 'frozen' : 'active', is_frozen: target.frozen,
        ...(already ? { message: `Card is already ${target.frozen ? 'frozen' : 'active'}` } : {}) });
    }
    const match = url.pathname.match(/^\/api\/v1\/cards\/([^/]+)$/);
    const card = match && cards.find(item => item.card_id === match[1]);
    if (init.method === 'GET' && card) return reply(200, view(card));
    return reply(404, { code: 'NOT_FOUND' });
  }) as typeof fetch;
  const issuer = new IzipayIssuer({ client: new IzipayClient({ apiKey: 'izpk_test_fake', fetch: http }), cardholderEmailDomain: 'cards.example.test' });
  return { issuer, cards, calls };
}

async function izipayApp(issuer: IzipayIssuer, now: () => Date = () => new Date(), extra: { cardMail?: (db: Database) => CardMailService } = {}) {
  const db = testDatabase();
  const app = buildApp({ db, networkMode: 'testnet', issuer, now, cardMail: extra.cardMail?.(db),
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

  // A pause happens at IZIPAY first, then here; the same key replays without calling IZIPAY again.
  const freezeCalls = () => fake.calls.filter(call => /\/(freeze|unfreeze)$/.test(call)).length;
  const paused = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/freeze`, payload: {}, headers: headers(token, 'freeze-1') });
  assert.equal(paused.statusCode, 200, paused.body);
  assert.equal(paused.json<CardResponse>().card?.status, 'frozen_by_user');
  assert.equal(fake.cards[0]!.frozen, true);
  await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/freeze`, payload: {}, headers: headers(token, 'freeze-1') });
  assert.equal(freezeCalls(), 1);
  const resumed = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/unfreeze`, payload: {}, headers: headers(token, 'unfreeze-1') });
  assert.equal(resumed.json<CardResponse>().card?.status, 'active');
  assert.equal(fake.cards[0]!.frozen, false);
  // IZIPAY froze it for risk reasons: unfreezing is refused and the card stays paused, with a pointer to support.
  await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/freeze`, payload: {}, headers: headers(token, 'freeze-2') });
  fake.cards[0]!.locked = true;
  const refused = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/unfreeze`, payload: {}, headers: headers(token, 'unfreeze-2') });
  assert.deepEqual([refused.statusCode, refused.json().error.code], [409, 'card_locked_by_issuer']);
  assert.equal((await app.inject({ url: '/v1/card', headers: headers(token) })).json<CardResponse>().card?.status, 'frozen_by_user');
  assert.equal(fake.cards[0]!.frozen, true);
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

test('payment codes are found in issuer mail, in English or Russian, plain or HTML, and nothing else is taken for one', () => {
  assert.equal(extractPaymentCode('Your verification code', 'Use 482913 to confirm the payment of $12.40 at Shop.'), '482913');
  assert.equal(extractPaymentCode('3-D Secure', 'Your OTP is: 7731'), '7731');
  assert.equal(extractPaymentCode('Подтверждение оплаты', 'Ваш код подтверждения: 551920. Никому его не сообщайте.'), '551920');
  assert.equal(extractPaymentCode('Payment', undefined, '<html><style>p{}</style><p>Code&nbsp;<b>009912</b></p></html>'), '009912');
  assert.equal(extractPaymentCode('Your card statement', 'Balance 100.00, card ending 0646, order 123456 and 654321.'), undefined);
  assert.equal(extractPaymentCode('Payment of 25.50', 'Confirm with 314159 in your app.'), '314159');
});

test('signed cardholder mail stores the code for the card owner only, for ten minutes', async t => {
  const fake = fakeIzipay();
  let now = new Date('2026-10-21T10:00:00.000Z');
  const secret = 'card-mail-secret-for-tests-0123456789';
  const { db, app, token } = await izipayApp(fake.issuer, () => now,
    { cardMail: database => new CardMailService({ db: database, secret, domain: 'cards.example.test', now: () => now }) });
  t.after(async () => { await app.close(); await db.close(); });
  const card = (await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(token, 'mail-card') })).json<CardResponse>().card!;
  const address = `card-${card.id}@cards.example.test`;
  const raw = (subject: string, body: string) => Buffer.from(`From: IZIPAY <no-reply@izipay.me>
To: ${address}
Subject: ${subject}
` +
    `Content-Type: text/plain; charset=utf-8

${body}
`);
  const send = (message: Buffer, options: { to?: string; at?: number; key?: string } = {}) => {
    const timestamp = String(Math.floor((options.at ?? now.getTime()) / 1000));
    const signature = createHmac('sha256', options.key ?? secret).update(`${timestamp}.`).update(message).digest('hex');
    return app.inject({ method: 'POST', url: '/v1/issuer/card-mail', payload: message,
      headers: { 'content-type': 'message/rfc822', 'x-card-mail-to': options.to ?? address, 'x-card-mail-timestamp': timestamp, 'x-card-mail-signature': signature } });
  };
  const code = async () => (await app.inject({ url: `/v1/cards/${card.id}/payment-code`, headers: headers(token) })).json<PaymentCodeResponse>().payment_code;
  assert.equal(await code(), null);

  // Forged, replayed and misaddressed mail changes nothing.
  assert.equal((await send(raw('Code', 'Your code is 111111'), { key: 'another-secret-that-is-long-enough-000' })).statusCode, 401);
  assert.equal((await send(raw('Code', 'Your code is 222222'), { at: now.getTime() - 6 * 60_000 })).statusCode, 401);
  assert.deepEqual((await send(raw('Code', 'Your code is 333333'), { to: 'card-00000000-0000-4000-8000-000000000000@cards.example.test' })).json(), { stored: false });
  assert.deepEqual((await send(raw('Code', 'Your code is 444444'), { to: `card-${card.id}@elsewhere.example` })).json(), { stored: false });
  assert.deepEqual((await send(raw('Welcome', 'Your card is ready.'))).json(), { stored: false });
  assert.equal(await code(), null);

  const accepted = await send(raw('Verification code', 'Use 482913 to confirm your payment.'));
  assert.equal(accepted.statusCode, 202, accepted.body);
  assert.deepEqual(accepted.json(), { stored: true });
  const shown = await code();
  assert.equal(shown?.code, '482913');
  assert.equal(shown?.expires_at, '2026-10-21T10:10:00.000Z');
  // The message itself is not kept, and the owner's app is told that the card changed.
  assert.deepEqual((await db.query('SELECT code FROM card_payment_codes')).rows, [{ code: '482913' }]);
  assert.ok((await db.query("SELECT 1 FROM user_events WHERE type = 'card'")).rows.length > 0);

  // Someone else's session cannot read it.
  const other = await izipayApp(fake.issuer);
  t.after(async () => { await other.app.close(); await other.db.close(); });
  const stranger = buildApp({ db, networkMode: 'testnet', issuer: fake.issuer, now: () => now,
    cardMail: new CardMailService({ db, secret, domain: 'cards.example.test', now: () => now }),
    auth: { configuration, dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }), now: () => now } } });
  t.after(async () => { await stranger.close(); });
  const account = privateKeyToAccount(generatePrivateKey());
  const challenge = (await stranger.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
  const session = (await stranger.inject({ method: 'POST', url: '/v1/auth/verify', payload: {
    challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) } })).json<WalletSessionResponse>();
  assert.equal((await stranger.inject({ url: `/v1/cards/${card.id}/payment-code`, headers: headers(session.access_token) })).statusCode, 404);

  // A newer code replaces it on screen; ten minutes later nothing is shown.
  now = new Date(now.getTime() + 60_000);
  await send(raw('Verification code', 'Use 551920 to confirm your payment.'));
  assert.equal((await code())?.code, '551920');
  now = new Date(now.getTime() + 10 * 60_000);
  assert.equal(await code(), null);
});

test('the Cloudflare mail worker signs exactly what the API verifies, and rejects other mail', async t => {
  const fake = fakeIzipay();
  const secret = 'card-mail-secret-for-tests-0123456789';
  const { db, app, token } = await izipayApp(fake.issuer, () => new Date(),
    { cardMail: database => new CardMailService({ db: database, secret, domain: 'cards.example.test' }) });
  t.after(async () => { await app.close(); await db.close(); });
  const card = (await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: headers(token, 'worker-card') })).json<CardResponse>().card!;
  // Plain JavaScript for the Cloudflare editor, so it is loaded by path rather than type-checked here.
  const workerPath = '../../../deploy/cloudflare/card-mail-worker.js';
  const worker = (await import(workerPath)).default as { email: (message: unknown, env: unknown) => Promise<void> };
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const response = await app.inject({ method: 'POST', url: new URL(url).pathname, payload: Buffer.from(init.body as Uint8Array),
      headers: init.headers as Record<string, string> });
    return new Response(response.body, { status: response.statusCode });
  }) as typeof fetch;
  const env = { CARD_MAIL_URL: 'https://api.example.test/v1/issuer/card-mail', CARD_MAIL_SECRET: secret, ALLOWED_SENDERS: 'izipay.me' };
  const message = (to: string, from: string) => {
    const raw = Buffer.from(`From: ${from}\r\nTo: ${to}\r\nSubject: Verification code\r\n\r\nYour code is 734120\r\n`);
    const result = { rejected: '' };
    return { result, value: { to, from, rawSize: raw.length, raw: new Blob([raw]).stream(), setReject: (reason: string) => { result.rejected = reason; } } };
  };
  const code = async () => (await app.inject({ url: `/v1/cards/${card.id}/payment-code`, headers: headers(token) })).json<PaymentCodeResponse>().payment_code?.code;
  const stranger = message('hello@cards.example.test', 'someone@izipay.me');
  await worker.email(stranger.value, env);
  assert.equal(stranger.result.rejected, 'Unknown address');
  const spoofed = message(`card-${card.id}@cards.example.test`, 'phish@evil.example');
  await worker.email(spoofed.value, env);
  assert.equal(spoofed.result.rejected, 'Sender not accepted');
  assert.equal(await code(), undefined);
  const real = message(`Card-${card.id}@cards.example.test`, 'no-reply@mail.izipay.me');
  await worker.email(real.value, env);
  assert.equal(real.result.rejected, '');
  assert.equal(await code(), '734120');
});
