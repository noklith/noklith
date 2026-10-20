import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { AuthChallengeResponse, WalletSessionResponse } from '../../../packages/api-contracts/src/index.ts';
import { buildApp } from '../src/app.ts';
import { AuthRateLimiter, clientKey, networkKey } from '../src/auth/rate-limit.ts';
import { CHALLENGE_TTL_MS, WALLET_SESSION_TTL_MS } from '../src/auth/service.ts';
import type { AuthConfiguration, AuthDependencies } from '../src/auth/service.ts';
import { migrate } from '../src/migrate.ts';
import { testDatabase } from './database.ts';

// Signers exist only in test memory. The account inspector is a test double; no external RPC is called.
const signer = () => privateKeyToAccount(generatePrivateKey());
const configuration: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };
const initial = () => new Date('2026-10-08T01:00:00.000Z');
const eoa: AuthDependencies['inspectAccount'] = async chainId => ({ chainId, code: '0x' });
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
const signed = async (account: ReturnType<typeof signer>, challenge: AuthChallengeResponse) => ({
  challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }),
});
const numberedAddress = (i: number) => `0x${i.toString(16).padStart(40, '0')}`;

test('opt-in HTTP SIWE authenticates and revokes a wallet, exposes metadata, and never accesses fixture cards', async t => {
  const db = testDatabase();
  const auth = { configuration, dependencies: { inspectAccount: eoa, now: initial } };
  assert.throws(() => buildApp({ db, networkMode: 'fixture', auth }), /fixture/);
  const app = buildApp({ db, networkMode: 'testnet', auth });
  const fixture = buildApp({ db, networkMode: 'fixture', now: initial });
  const disabled = buildApp({ db, networkMode: 'testnet' });
  t.after(async () => { await app.close(); await fixture.close(); await disabled.close(); await db.close(); });
  await migrate(db);
  const config = (await app.inject('/v1/config')).json();
  assert.equal(config.wallet_auth_enabled, true);
  assert.deepEqual(config.wallet_auth, { origin: configuration.origin, uri: configuration.uri, chain_ids: [84532] });
  assert.equal(config.top_up_enabled, false);
  assert.deepEqual(config.networks, []);
  assert.equal((await disabled.inject('/v1/config')).json().wallet_auth, null);
  assert.equal((await disabled.inject({ method: 'POST', url: '/v1/auth/challenge', payload: {} })).statusCode, 404);
  assert.equal((await disabled.inject({ method: 'POST', url: '/v1/auth/logout', payload: {} })).statusCode, 503);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/fixture/sessions', payload: { profile: 'standard' } })).statusCode, 404);
  const account = signer();
  const challenge = await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } });
  assert.equal(challenge.statusCode, 200, challenge.body);
  assert.equal(challenge.headers['cache-control'], 'no-store');
  const body = await signed(account, challenge.json<AuthChallengeResponse>());
  const verified = await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: body });
  assert.equal(verified.statusCode, 200, verified.body);
  const session = verified.json<WalletSessionResponse>();
  const authorization = headers(session.access_token);
  assert.deepEqual((await app.inject({ url: '/v1/me', headers: authorization })).json(), session.user);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const overHTTP = await fetch(`${address}/v1/me`, { headers: authorization, signal: AbortSignal.timeout(5000) });
  assert.equal(overHTTP.status, 200);
  assert.deepEqual(await overHTTP.json(), session.user);
  assert.equal(session.user.wallet_address, account.address);
  assert.equal(session.user.authentication, 'siwe');
  const fixtureSession = (await fixture.inject({ method: 'POST', url: '/v1/fixture/sessions', payload: { profile: 'standard' } })).json();
  const fixtureAuthorization = headers(fixtureSession.access_token);
  assert.equal((await app.inject({ url: '/v1/me', headers: fixtureAuthorization })).statusCode, 401);
  assert.equal((await fixture.inject({ url: '/v1/me', headers: authorization })).statusCode, 401);
  // A logout in either mode cannot revoke the other mode's session.
  assert.equal((await fixture.inject({ method: 'POST', url: '/v1/auth/logout', payload: {}, headers: authorization })).statusCode, 204);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: {}, headers: fixtureAuthorization })).statusCode, 204);
  assert.equal((await app.inject({ url: '/v1/me', headers: authorization })).statusCode, 200);
  assert.equal((await fixture.inject({ url: '/v1/me', headers: fixtureAuthorization })).statusCode, 200);
  const card = (await fixture.inject({ url: '/v1/card', headers: fixtureAuthorization })).json().card;
  // The wallet owner has its own (empty) card space; a fixture card ID is just "not found".
  assert.equal((await app.inject({ url: '/v1/card', headers: authorization })).json().card, null);
  assert.deepEqual((await app.inject({ url: '/v1/history', headers: authorization })).json().items, []);
  for (const url of [`/v1/cards/${card.id}/freeze`, `/v1/cards/${card.id}/unfreeze`]) {
    const response = await app.inject({ method: 'POST', url, payload: {}, headers: { ...authorization, 'idempotency-key': 'isolated-test' } });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(response.json().error.code, 'card_not_found');
  }
  assert.equal((await fixture.inject({ url: '/v1/card', headers: fixtureAuthorization })).json().card.status, 'active');
  assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: body })).json().error.code, 'challenge_unavailable');
  assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: {}, headers: authorization })).statusCode, 204);
  assert.equal((await app.inject({ url: '/v1/me', headers: authorization })).statusCode, 401);
  const revokedOverHTTP = await fetch(`${address}/v1/me`, { headers: authorization, signal: AbortSignal.timeout(5000) });
  assert.equal(revokedOverHTTP.status, 401);
  assert.equal((await revokedOverHTTP.json() as { error: { code: string } }).error.code, 'session_expired');
});

test('wallet readiness fails closed when the rate-limit migration or its maintenance row is missing', async t => {
  const db = testDatabase();
  const app = buildApp({ db, networkMode: 'testnet', auth: { configuration, dependencies: { inspectAccount: eoa, now: initial } } });
  const disabled = buildApp({ db, networkMode: 'testnet' });
  t.after(async () => { await app.close(); await disabled.close(); await db.close(); });
  await migrate(db);
  assert.equal((await app.inject('/ready')).statusCode, 200);
  await db.query('DELETE FROM auth_maintenance');
  const absentRow = await app.inject('/ready');
  assert.equal(absentRow.statusCode, 503);
  assert.equal(absentRow.json().error.code, 'database_unavailable');
  await db.query('INSERT INTO auth_maintenance (id, cleaned_at) VALUES (1, $1)', [initial().toISOString()]);
  assert.equal((await app.inject('/ready')).statusCode, 200);
  await db.query('DROP TABLE auth_maintenance');
  assert.equal((await app.inject('/ready')).statusCode, 503);
  assert.equal((await disabled.inject('/ready')).statusCode, 200);
});

test('HTTP contracts reject substitutions, invalid signatures and code-bearing wallets without issuing sessions', async t => {
  const db = testDatabase();
  let inspections = 0;
  const app = buildApp({ db, networkMode: 'testnet', auth: { configuration, dependencies: {
    now: initial, inspectAccount: async chainId => { inspections++; return { chainId, code: '0x6000' }; },
  } } });
  t.after(async () => { await app.close(); await db.close(); });
  await migrate(db);
  const account = signer();
  const challenge = (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
  const body = await signed(account, challenge);
  const verify = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/v1/auth/verify', payload });
  assert.equal((await verify({ ...body, signature: '0x' + '00'.repeat(65) })).json().error.code, 'invalid_signature');
  assert.equal((await verify({ ...body, message: body.message.replace(configuration.uri, 'https://demo.example/other') })).json().error.code, 'message_mismatch');
  assert.equal((await verify({ ...body, extra: true })).statusCode, 400);
  assert.equal(inspections, 0);
  const unsupported = await verify(body);
  assert.equal(unsupported.statusCode, 422, unsupported.body);
  assert.equal(unsupported.json().error.code, 'unsupported_wallet');
  assert.equal(inspections, 1);
  assert.equal((await db.query('SELECT token_hash FROM siwe_sessions')).rows.length, 0);
  assert.equal((await db.query('SELECT consumed_at FROM siwe_challenges WHERE id = $1', [challenge.id])).rows[0]!.consumed_at, null);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 1 } })).json().error.code, 'unsupported_chain');
  assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: '84532' } })).statusCode, 400);
});

test('persistent request limits cannot be bypassed by proxy headers, new workers, concurrency or changing subjects', async t => {
  const db = testDatabase();
  let now = initial();
  const auth = { configuration, dependencies: { inspectAccount: eoa, now: () => now } };
  const app = buildApp({ db, networkMode: 'testnet', auth });
  const second = buildApp({ db, networkMode: 'testnet', auth });
  t.after(async () => { await app.close(); await second.close(); await db.close(); });
  await migrate(db);
  const challenge = (i: number, ip: string, worker = app) => worker.inject({ method: 'POST', url: '/v1/auth/challenge',
    remoteAddress: ip, headers: { 'x-forwarded-for': `198.51.100.${i}` }, payload: { address: numberedAddress(i), chain_id: 84532 } });
  const concurrent = await Promise.all(Array.from({ length: 6 }, (_, i) => challenge(1, `192.0.2.${i + 1}`, i % 2 ? second : app)));
  assert.equal(concurrent.filter(result => result.statusCode === 200).length, 3);
  assert.equal(concurrent.filter(result => result.statusCode === 429).length, 3);
  for (let i = 2; i < 12; i++) assert.equal((await challenge(i, '192.0.2.20')).statusCode, 200);
  const limited = await challenge(12, '192.0.2.20', second);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['retry-after'], '60');
  assert.equal(limited.json().error.code, 'auth_rate_limited');
  // Well-shaped but nonexistent challenges exercise verification limits before any cryptography/RPC.
  const verify = (id: number, ip: string) => app.inject({ method: 'POST', url: '/v1/auth/verify', remoteAddress: ip,
    payload: { challenge_id: `00000000-0000-4000-8000-${id.toString().padStart(12, '0')}`, message: 'test', signature: '0x' + '00'.repeat(65) } });
  for (let i = 0; i < 5; i++) assert.equal((await verify(1, `192.0.2.${30 + i}`)).statusCode, 401);
  assert.equal((await verify(1, '192.0.2.40')).statusCode, 429);
  for (let i = 2; i < 22; i++) assert.equal((await verify(i, '192.0.2.50')).statusCode, 401);
  assert.equal((await verify(22, '192.0.2.50')).statusCode, 429);
  const stored = await db.query<{ bucket_key: string; hits: number }>('SELECT bucket_key, hits FROM auth_rate_buckets');
  for (const row of stored.rows) { assert.match(row.bucket_key, /^[a-f0-9]{64}$/); assert.ok(row.hits <= 3001); }
  now = new Date(now.getTime() + 60_000);
  assert.equal((await challenge(1, '192.0.2.20', second)).statusCode, 200);
  // A dozen addresses can no longer use up the whole endpoint: the global ceiling is only an emergency bound.
  now = new Date(now.getTime() + 60_000);
  for (let i = 1; i <= 130; i++) assert.equal((await challenge(i + 100, `198.51.100.${i}`)).statusCode, 200);
  assert.equal((await challenge(231, '203.0.113.7')).statusCode, 200);
  assert.ok(Number((await db.query<{ count: string }>('SELECT count(*) AS count FROM auth_rate_buckets')).rows[0]!.count) <= 65536);
});

test('bounded buckets and lazy cleanup preserve active sessions and their challenges, then remove expired data', async t => {
  const db = testDatabase();
  let now = initial();
  const app = buildApp({ db, networkMode: 'testnet', auth: { configuration, dependencies: { inspectAccount: eoa, now: () => now } } });
  t.after(async () => { await app.close(); await db.close(); });
  await migrate(db);
  const account = signer();
  const makeChallenge = async () => (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
  const accepted = await makeChallenge();
  const abandoned = await makeChallenge();
  const response = await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: await signed(account, accepted) });
  assert.equal(response.statusCode, 200, response.body);
  const session = response.json<WalletSessionResponse>();
  now = new Date(now.getTime() + CHALLENGE_TTL_MS);
  await makeChallenge();
  assert.equal((await db.query('SELECT id FROM siwe_challenges WHERE id = $1', [abandoned.id])).rows.length, 0);
  assert.equal((await db.query('SELECT id FROM siwe_challenges WHERE id = $1', [accepted.id])).rows.length, 1);
  assert.equal((await app.inject({ url: '/v1/me', headers: headers(session.access_token) })).statusCode, 200);
  now = new Date(initial().getTime() + WALLET_SESSION_TTL_MS);
  await makeChallenge();
  assert.equal((await db.query('SELECT token_hash FROM siwe_sessions')).rows.length, 0);
  assert.equal((await db.query('SELECT id FROM siwe_challenges WHERE id = $1', [accepted.id])).rows.length, 0);
  assert.equal((await app.inject({ url: '/v1/me', headers: headers(session.access_token) })).statusCode, 401);
  // A full table never grows past the hard bound and never locks a new client out: the shared ceiling still applies.
  await db.query('DELETE FROM auth_rate_buckets');
  await db.query(`INSERT INTO auth_rate_buckets (bucket_key, hits, expires_at)
    SELECT md5(g::text) || md5('bucket' || g::text), 1, $1::timestamptz FROM generate_series(1, 65536) AS g`,
  [new Date(now.getTime() + 60_000).toISOString()]);
  const limiter = new AuthRateLimiter(db, () => now, { globalPerMinute: 2 });
  await limiter.consume('challenge', '192.0.2.1', account.address);
  await limiter.consume('challenge', '2001:db8:9::1', account.address);
  await assert.rejects(limiter.consume('challenge', '192.0.2.3', account.address), { code: 'auth_rate_limited' });
  assert.equal(Number((await db.query<{ count: string }>('SELECT count(*) AS count FROM auth_rate_buckets')).rows[0]!.count), 65537);
});

test('the global sign-in ceiling still refuses a flood from many addresses', async t => {
  const db = testDatabase();
  t.after(async () => { await db.close(); });
  await migrate(db);
  const now = initial();
  const limiter = new AuthRateLimiter(db, () => now, { globalPerMinute: 5 });
  for (let i = 1; i <= 5; i++) await limiter.consume('challenge', `198.51.100.${i}`, `0x${String(i).repeat(40)}`);
  await assert.rejects(limiter.consume('challenge', '198.51.100.6', `0x${'6'.repeat(40)}`), { code: 'auth_rate_limited' });
});

test('one client flooding sign-in cannot use up the shared ceiling or mint buckets', async t => {
  const db = testDatabase();
  t.after(async () => { await db.close(); });
  await migrate(db);
  const now = initial();
  const limiter = new AuthRateLimiter(db, () => now, { globalPerMinute: 100 });
  const count = async () => Number((await db.query<{ count: string }>('SELECT count(*) AS count FROM auth_rate_buckets')).rows[0]!.count);
  // Malformed and oversized subjects are refused before any bucket exists.
  for (const subject of ['junk', 'x'.repeat(200), 42, undefined, `0x${'g'.repeat(40)}`]) {
    await assert.rejects(limiter.consume('challenge', '203.0.113.9', subject), { code: 'invalid_request' });
  }
  assert.equal(await count(), 0);
  // Well-formed subjects from one address: only its first 10 requests get past its own bucket.
  const settled = await Promise.allSettled(Array.from({ length: 60 }, (_, i) => limiter.consume('challenge', '203.0.113.9', numberedAddress(i))));
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 10);
  // Its client bucket, 10 subjects and the ceiling.
  assert.equal(await count(), 12);
  // Honest users elsewhere still sign in: the ceiling (100) was charged only for the 10 admitted requests.
  for (let i = 1; i <= 80; i++) await limiter.consume('challenge', `198.51.100.${i}`, numberedAddress(1000 + i));
});

test('IPv6 clients are limited per /64 and per /48', async t => {
  const db = testDatabase();
  t.after(async () => { await db.close(); });
  await migrate(db);
  const now = initial();
  const limiter = new AuthRateLimiter(db, () => now);
  const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  // Twenty verifications from one /64 (any interface identifier), then that /64 is refused.
  for (let i = 0; i < 20; i++) await limiter.consume('verify', `2001:db8:1:2::${(i + 1).toString(16)}`, id(i));
  await assert.rejects(limiter.consume('verify', '2001:db8:1:2:ffff::1', id(99)), { code: 'auth_rate_limited' });
  // Other /64s of the same /48 share its budget of 60 attempts (the refused one above counted too).
  for (let i = 0; i < 39; i++) await limiter.consume('verify', `2001:db8:1:${(i + 16).toString(16)}::1`, id(100 + i));
  await assert.rejects(limiter.consume('verify', '2001:db8:1:ff::1', id(200)), { code: 'auth_rate_limited' });
  // A different /48 and IPv4 clients are unaffected.
  await limiter.consume('verify', '2001:db8:2::1', id(300));
  await limiter.consume('verify', '192.0.2.77', id(301));
});

test('client keys group IPv6 by /64 and keep IPv4 as is', () => {
  assert.equal(clientKey('192.0.2.1'), '192.0.2.1');
  assert.equal(clientKey('::ffff:192.0.2.1'), '192.0.2.1');
  assert.equal(clientKey('2001:db8:1:2::5'), '2001:db8:1:2::/64');
  assert.equal(clientKey('2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(clientKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(clientKey('::1'), '0:0:0:0::/64');
  assert.equal(networkKey('2001:db8:1:2::5'), '2001:db8:1::/48');
  assert.equal(networkKey('::ffff:192.0.2.1'), undefined);
  assert.equal(networkKey('192.0.2.1'), undefined);
});
