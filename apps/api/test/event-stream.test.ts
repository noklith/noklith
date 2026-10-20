import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import WebSocket from 'ws';
import type { AuthChallengeResponse, EventsResponse, WalletSessionResponse } from '../../../packages/api-contracts/src/index.ts';
import { buildApp } from '../src/app.ts';
import type { AuthConfiguration } from '../src/auth/service.ts';
import { migrate } from '../src/migrate.ts';
import { testDatabase } from './database.ts';

const configuration: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };

/** Collects text messages; `next` waits for the next one or fails after a deadline. */
function inbox(socket: WebSocket) {
  const queue: string[] = [];
  const waiters: ((value: string) => void)[] = [];
  socket.on('message', data => { const text = String(data); const waiter = waiters.shift(); if (waiter) waiter(text); else queue.push(text); });
  return {
    next: (ms = 3000) => new Promise<string>((resolve, reject) => {
      const queued = queue.shift();
      if (queued !== undefined) { resolve(queued); return; }
      const timer = setTimeout(() => reject(new Error('No WebSocket message')), ms);
      waiters.push(value => { clearTimeout(timer); resolve(value); });
    }),
    pending: () => queue.length,
  };
}

test('WebSocket signals committed changes to their owner only; REST recovery and session checks still apply', async t => {
  const db = testDatabase();
  const app = buildApp({ db, networkMode: 'testnet', eventStream: { revalidateMs: 200, pingMs: 1000 },
    auth: { configuration, dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }) } } });
  await migrate(db);
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  const sockets: WebSocket[] = [];
  t.after(async () => { for (const socket of sockets) socket.terminate(); await app.close(); await db.close(); });
  const signIn = async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
    return (await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: {
      challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) } })).json<WalletSessionResponse>().access_token;
  };
  const connect = (token?: string) => {
    const socket = new WebSocket(`${base.replace('http', 'ws')}/v1/events/stream`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    socket.on('error', () => {}); // Refused handshakes and test teardown close sockets abruptly.
    sockets.push(socket);
    return socket;
  };

  // No session: refused before the upgrade with an ordinary 401.
  const anonymous = connect();
  const [, refused] = await once(anonymous, 'unexpected-response') as [unknown, { statusCode: number }];
  assert.equal(refused.statusCode, 401);

  const alice = await signIn();
  const bob = await signIn();
  const aliceSocket = connect(alice);
  const aliceInbox = inbox(aliceSocket);
  await once(aliceSocket, 'open');
  assert.deepEqual(JSON.parse(await aliceInbox.next()), { type: 'ready', latest_seq: '0' });
  const bobSocket = connect(bob);
  const bobInbox = inbox(bobSocket);
  await once(bobSocket, 'open');
  await bobInbox.next();

  const created = await fetch(`${base}/v1/cards`, { method: 'POST', body: '{}',
    headers: { authorization: `Bearer ${alice}`, 'content-type': 'application/json', 'idempotency-key': 'stream-card-1' } });
  assert.equal(created.status, 200);
  assert.deepEqual(JSON.parse(await aliceInbox.next()), { type: 'changed' });
  // The signal carries nothing; recovery is by sequence over REST.
  const events = await (await fetch(`${base}/v1/events?after=0`, { headers: { authorization: `Bearer ${alice}` } })).json() as EventsResponse;
  assert.equal(events.items[0]?.type, 'card');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(bobInbox.pending(), 0, 'another wallet receives nothing');

  // A failed mutation commits nothing and signals nothing.
  const foreign = await fetch(`${base}/v1/cards/00000000-0000-4000-8000-000000000000/freeze`, { method: 'POST', body: '{}',
    headers: { authorization: `Bearer ${alice}`, 'content-type': 'application/json', 'idempotency-key': 'stream-card-2' } });
  assert.equal(foreign.status, 404);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(aliceInbox.pending(), 0);

  // Logout: the periodic session check closes the socket with 4401.
  await fetch(`${base}/v1/auth/logout`, { method: 'POST', body: '{}', headers: { authorization: `Bearer ${alice}`, 'content-type': 'application/json' } });
  const [code] = await once(aliceSocket, 'close') as [number];
  assert.equal(code, 4401);
});
