import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { AuthChallengeResponse, CardResponse, CredentialsResponse, HistoryResponse, WalletSessionResponse } from '../../../../packages/api-contracts/src/index.ts';
import { buildApp } from '../app.ts';
import { IzipayClient } from '../issuer/izipay.ts';
import { IzipayIssuer } from '../issuer/izipay-issuer.ts';
import { migrate } from '../migrate.ts';
import { pgliteDatabase } from './pglite-database.ts';

// Our API in-process (in-memory database) with the real IZIPAY sandbox as issuer:
// wallet sign-in → POST /v1/cards → card details → pause and resume at IZIPAY → top-up from the balance
// (twice, one reference) → a sandbox purchase reflected in our balance and history.
// Refuses live keys; prints no card numbers.
// Usage: node --env-file=.local/izipay.env src/dev/izipay-card-sandbox.ts

const apiKey = process.env.IZIPAY_API_KEY ?? '';
if (!apiKey.startsWith('izpk_test_')) throw new Error('This check runs only with a sandbox key (izpk_test_…).');
const client = new IzipayClient({ apiKey, signingSecret: process.env.IZIPAY_SIGNING_SECRET || undefined });
const issuer = new IzipayIssuer({ client, cardholderEmailDomain: 'cards.example.com' });
const db = pgliteDatabase();
const now = () => new Date();
const app = buildApp({ db, networkMode: 'testnet', issuer, now, auth: {
  configuration: { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] },
  dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }), now },
} });
const log = (...parts: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...parts);

try {
  await migrate(db);
  const account = privateKeyToAccount(generatePrivateKey());
  const challenge = (await app.inject({ method: 'POST', url: '/v1/auth/challenge', payload: { address: account.address, chain_id: 84532 } })).json<AuthChallengeResponse>();
  const session = (await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: {
    challenge_id: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) } })).json<WalletSessionResponse>();
  const auth = { authorization: `Bearer ${session.access_token}` };

  const created = await app.inject({ method: 'POST', url: '/v1/cards', payload: {}, headers: { ...auth, 'idempotency-key': 'sandbox-card-1' } });
  assert.equal(created.statusCode, 200, created.body);
  let card = created.json<CardResponse>().card!;
  log(`Card ${card.status}, •••• ${card.last_four}, issuer ${card.issuer_mode}`);
  for (let i = 0; card.status === 'provisioning' && i < 12; i++) {
    await new Promise(r => setTimeout(r, 10_000));
    card = (await app.inject({ url: '/v1/card', headers: auth })).json<CardResponse>().card!;
    log(`Card ${card.status}, •••• ${card.last_four}`);
  }
  assert.equal(card.status, 'active');
  const reveal = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/credentials`, payload: {}, headers: auth });
  assert.equal(reveal.statusCode, 200, reveal.body);
  const details = reveal.json<CredentialsResponse>();
  assert.equal(details.pan.slice(-4), card.last_four);
  log(`Details: number ending ${details.pan.slice(-4)} (${details.pan.length} digits), expiry present ${details.expiry_month > 0}, demonstration ${details.demonstration}`);
  const issuerCardId = (await db.query<{ issuer_card_id: string }>('SELECT issuer_card_id FROM cards WHERE id = $1', [card.id])).rows[0]!.issuer_card_id;
  // Pause and resume go to IZIPAY, which confirms each with is_frozen in its answer (checked by the client).
  // Observed 2026-10-20: the sandbox confirms both but its card record keeps is_frozen false, so that is
  // only logged here, not asserted.
  const paused = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/freeze`, payload: {}, headers: { ...auth, 'idempotency-key': 'sandbox-freeze-1' } });
  assert.equal(paused.statusCode, 200, paused.body);
  assert.equal(paused.json<CardResponse>().card!.status, 'frozen_by_user');
  log(`Paused at IZIPAY; its card record now says is_frozen ${(await client.getCard(issuerCardId, true)).isFrozen}`);
  await new Promise(r => setTimeout(r, 1_500));
  const resumed = await app.inject({ method: 'POST', url: `/v1/cards/${card.id}/unfreeze`, payload: {}, headers: { ...auth, 'idempotency-key': 'sandbox-unfreeze-1' } });
  assert.equal(resumed.statusCode, 200, resumed.body);
  assert.equal(resumed.json<CardResponse>().card!.status, 'active');
  log('Resumed at IZIPAY');
  // Top-up from the sandbox balance, sent twice with one reference: IZIPAY must load the card once.
  const request = { cardId: card.id, issuerCardId, reference: `top_up:sandbox-${card.id}`, amountCents: 500n };
  const before = await issuer.fundingCapacityCents();
  const first = await issuer.fund(request);
  // IZIPAY rejects an identically signed request within the same second (replay protection); real retries are later.
  await new Promise(r => setTimeout(r, 1_500));
  const second = await issuer.fund(request);
  assert.equal(second.issuerReference, first.issuerReference);
  assert.equal(second.creditedCents, first.creditedCents);
  log(`Top-up $5.00 from balance: ${first.creditedCents} cents on card (expected about ${500n - issuer.topUpFeeCents(500n)}), repeat replayed the same top-up`);
  const after = await issuer.fundingCapacityCents();
  assert.equal(before - after, 500n);
  log(`Balance ${before} → ${after} cents: charged once`);
  // A purchase at IZIPAY (sandbox simulation), then our API: the card balance and history follow the issuer.
  const credited = BigInt((await app.inject({ url: '/v1/card', headers: auth })).json<CardResponse>().card!.available_cents);
  const purchase = await fetch('https://izipay.me/api/v1/sandbox/transaction', { method: 'POST', body: JSON.stringify({ card_id: issuerCardId, amount: 0.5, merchant: 'Sandbox store' }),
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'x-idempotency-key': crypto.randomUUID() } });
  const purchaseResult = await purchase.json() as { data?: { status?: string } };
  log(`Sandbox purchase $0.50: ${purchaseResult.data?.status}`);
  await new Promise(r => setTimeout(r, 31_000)); // Balance reads are throttled to one per 30 s per card.
  const afterPurchase = (await app.inject({ url: '/v1/card', headers: auth })).json<CardResponse>().card!;
  const history = (await app.inject({ url: '/v1/history', headers: auth })).json<HistoryResponse>().items;
  log(`Card ${credited} → ${afterPurchase.available_cents} cents; history: ${history.map(i => `${i.title} ${i.amount_cents}`).join(', ')}`);
  assert.equal(BigInt(afterPurchase.available_cents), credited - 50n);
  assert.ok(history.some(i => i.title === 'Card purchases' && i.amount_cents === '50'));
  log('RESULT: PASSED');
} catch (error) {
  log('RESULT: FAILED', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.close();
  await db.close();
}
