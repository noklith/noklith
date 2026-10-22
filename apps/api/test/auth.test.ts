import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseSiweMessage } from 'viem/siwe';
import type { Hex } from 'viem';
import { AuthService, CHALLENGE_TTL_MS, WALLET_SESSION_TTL_MS } from '../src/auth/service.ts';
import type { AuthConfiguration, AuthDependencies, AuthChallenge } from '../src/auth/service.ts';
import type { Database, Row, SQLConnection } from '../src/database.ts';
import { migrate } from '../src/migrate.ts';
import { CardService } from '../src/service.ts';
import { buildApp } from '../src/app.ts';
import { testDatabase } from './database.ts';

// Ephemeral signers are generated in memory only. No user keys, RPC or wallet connection is used.
const signer = () => privateKeyToAccount(generatePrivateKey());
const config: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };
const initialTime = () => new Date('2026-10-07T01:00:00.123Z');
const eoa: AuthDependencies['inspectAccount'] = async chainId => ({ chainId, code: '0x' });
const signed = async (account: ReturnType<typeof signer>, challenge: AuthChallenge) => ({
  challengeId: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }),
});

test('SIWE setup fails closed; challenges contain server nonce, audience, address, chain and exact expiry', async t => {
  const db = testDatabase();
  t.after(() => db.close());
  await migrate(db);
  for (const change of [
    { origin: 'http://demo.example' }, { origin: 'https://demo.example/path' },
    { uri: 'https://other.example/sign-in' }, { uri: 'https://demo.example/sign-in#fragment' },
    { uri: 'https://user:password@demo.example/sign-in' }, { allowedChainIds: [] }, { allowedChainIds: [1] },
    { allowedChainIds: [10] }, { allowedChainIds: [NaN] },
  ]) assert.throws(() => new AuthService(db, { ...config, ...change }, { inspectAccount: eoa }));
  assert.throws(() => new AuthService(db, config, {} as AuthDependencies));
  const now = initialTime();
  const service = new AuthService(db, config, { inspectAccount: eoa, now: () => now });
  const account = signer();
  const a = await service.createChallenge(account.address, 84532);
  const b = await service.createChallenge(account.address.toLowerCase(), 84532);
  const parsed = parseSiweMessage(a.message);
  assert.equal(parsed.scheme, 'https');
  assert.equal(parsed.domain, 'demo.example');
  assert.equal(parsed.uri, config.uri);
  assert.equal(parsed.address, account.address);
  assert.equal(parsed.chainId, 84532);
  assert.equal(parsed.version, '1');
  assert.equal(parsed.requestId, a.id);
  assert.equal(parsed.issuedAt?.getTime(), now.getTime());
  assert.equal(parsed.expirationTime?.getTime(), now.getTime() + CHALLENGE_TTL_MS);
  assert.match(parsed.nonce!, /^[0-9a-f]{64}$/);
  assert.notEqual(parsed.nonce, parseSiweMessage(b.message).nonce);
  assert.notEqual(a.id, b.id);
  for (const address of [null, '', '0x' + '0'.repeat(40), '0x' + 'g'.repeat(40), account.address + '\n']) {
    await assert.rejects(service.createChallenge(address, 84532), { code: 'invalid_address' });
  }
  for (const chain of [1, 10, 11155111, '84532', null, NaN]) {
    await assert.rejects(service.createChallenge(account.address, chain), { code: 'unsupported_chain' });
  }
});

test('cryptographic EOA sign-in is single-use under concurrent requests and never crosses fixture sessions', async t => {
  const db = testDatabase();
  t.after(() => db.close());
  await migrate(db);
  const service = new AuthService(db, config, { inspectAccount: eoa, now: initialTime });
  const account = signer();
  const challenge = await service.createChallenge(account.address, 84532);
  const input = await signed(account, challenge);
  const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => service.verify(input)));
  const accepted = attempts.filter(attempt => attempt.status === 'fulfilled');
  assert.equal(accepted.length, 1);
  for (const attempt of attempts) {
    if (attempt.status === 'rejected') assert.equal(attempt.reason.code, 'challenge_unavailable');
  }
  const session = accepted[0]!.value;
  const authorization = `Bearer ${session.access_token}`;
  assert.deepEqual(await service.authenticate(authorization), session.user);
  assert.equal(session.user.wallet_address, account.address);
  assert.equal(session.user.chain_id, 84532);
  assert.equal(session.user.authentication, 'siwe');
  const tokens = await db.query<{ token_hash: string }>('SELECT token_hash FROM siwe_sessions');
  assert.equal(tokens.rows.length, 1);
  assert.match(tokens.rows[0]!.token_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(tokens.rows[0]!.token_hash, session.access_token);
  const fixtures = new CardService(db, initialTime);
  const fixture = await fixtures.createFixtureSession('empty');
  await assert.rejects(fixtures.authenticate(authorization), { statusCode: 401 });
  await assert.rejects(service.authenticate(`Bearer ${fixture.access_token}`), { statusCode: 401 });
  const another = await service.verify(await signed(account, await service.createChallenge(account.address.toLowerCase(), 84532)));
  assert.equal(another.user.id, session.user.id);
  await service.logout(authorization);
  await service.logout(authorization);
  await assert.rejects(service.authenticate(authorization), { statusCode: 401 });
  assert.equal((await service.authenticate(`Bearer ${another.access_token}`)).id, session.user.id);
  const changedAudience = new AuthService(db, { ...config, uri: 'https://demo.example/other-sign-in' }, { inspectAccount: eoa, now: initialTime });
  await assert.rejects(changedAudience.authenticate(`Bearer ${another.access_token}`), { statusCode: 401 });
  const app = buildApp({ db, networkMode: 'testnet' });
  t.after(() => app.close());
  assert.equal((await app.inject('/v1/config')).json().wallet_auth_enabled, false);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: input })).statusCode, 404);
});

test('signed substitutions, appended fields, another wallet and malformed signatures cannot consume a challenge', async t => {
  const db = testDatabase();
  t.after(() => db.close());
  await migrate(db);
  let inspections = 0;
  const service = new AuthService(db, config, { now: initialTime, inspectAccount: async chainId => { inspections++; return eoa(chainId, '0x0000000000000000000000000000000000000000'); } });
  const account = signer();
  const other = signer();
  const challenge = await service.createChallenge(account.address, 84532);
  const parsed = parseSiweMessage(challenge.message);
  const alternatives = [
    challenge.message.replace('https://demo.example wants', 'https://attacker.example wants'),
    challenge.message.replace(config.uri, 'https://demo.example/another-resource'),
    challenge.message.replace('Chain ID: 84532', 'Chain ID: 11155111'),
    challenge.message.replace('Version: 1', 'Version: 2'),
    challenge.message.replace(parsed.nonce!, 'f'.repeat(64)),
    challenge.message.replace(account.address, other.address),
    challenge.message.replace('Issued At: 2026', 'Issued At: 2025'),
    challenge.message.replace('Expiration Time: 2026', 'Expiration Time: 2027'),
    challenge.message + '\nResources:\n- https://attacker.example',
    challenge.message + '\n',
  ];
  for (const message of alternatives) {
    await assert.rejects(service.verify({ challengeId: challenge.id, message, signature: await account.signMessage({ message }) }), { code: 'message_mismatch' });
  }
  await assert.rejects(service.verify(await signed(other, challenge)), { code: 'invalid_signature' });
  const valid = await signed(account, challenge);
  await assert.rejects(service.verify({ ...valid, signature: '0x' + '00'.repeat(65) }), { code: 'invalid_signature' });
  for (const signature of [null, '0x1234', '0x' + '00'.repeat(66)]) {
    await assert.rejects(service.verify({ ...valid, signature }), { code: 'invalid_sign_in' });
  }
  await assert.rejects(service.verify({ ...valid, message: 'a'.repeat(2049) }), { code: 'invalid_sign_in' });
  assert.equal(inspections, 0);
  await service.verify(valid);
  assert.equal(inspections, 1);
});

test('challenge and session expire at exact boundaries, including expiry while RPC validation is running', async t => {
  const db = testDatabase();
  t.after(() => db.close());
  await migrate(db);
  let now = initialTime();
  const service = new AuthService(db, config, { inspectAccount: eoa, now: () => now });
  const account = signer();
  const input = await signed(account, await service.createChallenge(account.address, 84532));
  now = new Date(initialTime().getTime() - 1);
  await assert.rejects(service.verify(input), { code: 'challenge_unavailable' });
  now = new Date(initialTime().getTime() + CHALLENGE_TTL_MS);
  await assert.rejects(service.verify(input), { code: 'challenge_unavailable' });
  now = initialTime();
  const slow = new AuthService(db, config, { now: () => now, inspectAccount: async chainId => {
    now = new Date(now.getTime() + CHALLENGE_TTL_MS);
    return { chainId, code: '0x' };
  } });
  await assert.rejects(slow.verify(await signed(account, await slow.createChallenge(account.address, 84532))), { code: 'challenge_unavailable' });
  assert.equal((await db.query('SELECT token_hash FROM siwe_sessions')).rows.length, 0);
  const session = await service.verify(await signed(account, await service.createChallenge(account.address, 84532)));
  now = new Date(now.getTime() + WALLET_SESSION_TTL_MS - 1);
  assert.equal((await service.authenticate(`Bearer ${session.access_token}`)).id, session.user.id);
  now = new Date(now.getTime() + 1);
  await assert.rejects(service.authenticate(`Bearer ${session.access_token}`), { statusCode: 401 });
});

test('wrong RPC chain, unavailable code and contract/delegated wallets fail closed before session creation', async t => {
  const db = testDatabase();
  t.after(() => db.close());
  await migrate(db);
  const account = signer();
  const cases: Array<[AuthDependencies['inspectAccount'], string]> = [
    [async () => { throw new Error('RPC down'); }, 'account_check_unavailable'],
    [async () => ({ chainId: 1, code: '0x' }), 'account_check_unavailable'],
    [async chainId => ({ chainId, code: undefined as unknown as Hex }), 'account_check_unavailable'],
    [async chainId => ({ chainId, code: '0xz' as Hex }), 'account_check_unavailable'],
    [async chainId => ({ chainId, code: '0x6000' }), 'unsupported_wallet'],
    [async chainId => ({ chainId, code: '0xef0100' }), 'unsupported_wallet'],
  ];
  for (const [inspectAccount, code] of cases) {
    const service = new AuthService(db, config, { inspectAccount, now: initialTime });
    const challenge = await service.createChallenge(account.address, 84532);
    await assert.rejects(service.verify(await signed(account, challenge)), { code });
    const stored = await db.query<{ consumed_at: unknown }>('SELECT consumed_at FROM siwe_challenges WHERE id = $1', [challenge.id]);
    assert.equal(stored.rows[0]!.consumed_at, null);
  }
  assert.equal((await db.query('SELECT id FROM wallet_identities')).rows.length, 0);
  assert.equal((await db.query('SELECT token_hash FROM siwe_sessions')).rows.length, 0);
});

test('failed session insert rolls back nonce consumption and identity; a correct retry can sign in', async t => {
  const db = testDatabase();
  t.after(() => db.close());
  await migrate(db);
  let fail = true;
  const faulty: Database = {
    query: db.query.bind(db), close: db.close.bind(db), listen: db.listen.bind(db),
    transaction: async <T>(work: (tx: SQLConnection) => Promise<T>) => db.transaction(tx => work({
      async query<R extends Row>(sql: string, values?: unknown[]) {
        if (fail && sql.includes('INSERT INTO siwe_sessions')) throw new Error('Injected session insert failure');
        return tx.query<R>(sql, values);
      },
    })),
  };
  const service = new AuthService(faulty, config, { inspectAccount: eoa, now: initialTime });
  const account = signer();
  const input = await signed(account, await service.createChallenge(account.address, 84532));
  await assert.rejects(service.verify(input), /Injected session insert failure/);
  assert.equal((await db.query('SELECT id FROM wallet_identities')).rows.length, 0);
  fail = false;
  await service.verify(input);
  await assert.rejects(service.verify(input), { code: 'challenge_unavailable' });
});

test('consumed nonce, identity, revocation and expiry survive database close and reopen', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'crypto-card-auth-'));
  let db = testDatabase(directory);
  t.after(async () => {
    await db.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('crypto-card-auth-'));
    await rm(directory, { recursive: true, force: true });
  });
  await migrate(db);
  let now = initialTime();
  let service = new AuthService(db, config, { inspectAccount: eoa, now: () => now });
  const account = signer();
  const input = await signed(account, await service.createChallenge(account.address, 84532));
  const session = await service.verify(input);
  await db.close();
  db = testDatabase(directory);
  await migrate(db);
  service = new AuthService(db, config, { inspectAccount: eoa, now: () => now });
  assert.deepEqual(await service.authenticate(`Bearer ${session.access_token}`), session.user);
  await assert.rejects(service.verify(input), { code: 'challenge_unavailable' });
  await service.logout(`Bearer ${session.access_token}`);
  const next = await service.verify(await signed(account, await service.createChallenge(account.address, 84532)));
  assert.equal(next.user.id, session.user.id);
  await db.close();
  db = testDatabase(directory);
  await migrate(db);
  service = new AuthService(db, config, { inspectAccount: eoa, now: () => now });
  await assert.rejects(service.authenticate(`Bearer ${session.access_token}`), { statusCode: 401 });
  now = new Date(now.getTime() + WALLET_SESSION_TTL_MS);
  await assert.rejects(service.authenticate(`Bearer ${next.access_token}`), { statusCode: 401 });
});
