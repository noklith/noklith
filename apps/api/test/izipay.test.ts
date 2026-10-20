import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { IzipayClient, IzipayError, centsToDollars, dollarsToCents, verifyIzipayWebhook } from '../src/issuer/izipay.ts';

const KEY = 'izpk_test_unit0000';
const SECRET = 'izps_unit_secret';

function fakeIssuer(reply: (request: { method: string; url: URL; headers: Record<string, string>; body: string }) => { status?: number; text: string }) {
  const calls: { method: string; url: URL; headers: Record<string, string>; body: string }[] = [];
  const http = (async (input: URL, init: RequestInit) => {
    const request = { method: String(init.method), url: new URL(input), headers: init.headers as Record<string, string>, body: String(init.body ?? '') };
    calls.push(request);
    const { status = 200, text } = reply(request);
    return new Response(text, { status });
  }) as typeof fetch;
  return { http, calls };
}

test('dollar amounts convert to integer cents exactly', () => {
  assert.equal(dollarsToCents('97.02'), 9702n);
  assert.equal(dollarsToCents('0.1'), 10n);
  assert.equal(dollarsToCents('100'), 10000n);
  assert.equal(dollarsToCents('0'), 0n);
  for (const bad of ['1.001', '-1', '1e2', '01', '', '.5', '1.']) assert.throws(() => dollarsToCents(bad), IzipayError);
  assert.equal(centsToDollars(9702n), '97.02');
  assert.equal(centsToDollars(5n), '0.05');
  assert.equal(centsToDollars(10000n), '100.00');
  assert.throws(() => centsToDollars(0n));
});

test('top-up from balance sends exact dollars, idempotency key and a valid request signature', async () => {
  const { http, calls } = fakeIssuer(() => ({
    text: '{"success":true,"data":{"topup_id":"ctopup_1","card_id":"card_1","status":"credited","amount_usd":100.10,"amount_on_card":97.09,"balance_usd":900.00,"funded_from":"balance"}}',
  }));
  const client = new IzipayClient({ apiKey: KEY, signingSecret: SECRET, fetch: http, now: () => 1_725_465_600_000 });
  const result = await client.topUpFromBalance({ cardId: 'card_1', amountCents: 10010n, idempotencyKey: 'key-1' });

  assert.deepEqual(result, { topUpId: 'ctopup_1', cardId: 'card_1', status: 'credited', amountCents: 10010n, onCardCents: 9709n });
  const call = calls[0]!;
  assert.equal(call.url.href, 'https://izipay.me/api/v1/cards/card_1/topup');
  assert.equal(call.body, '{"amount":100.10,"pay_currency":"balance"}');
  assert.equal(call.headers.authorization, `Bearer ${KEY}`);
  assert.equal(call.headers['x-idempotency-key'], 'key-1');
  assert.equal(call.headers['x-timestamp'], '1725465600');
  const expected = createHmac('sha256', SECRET).update(`1725465600\nPOST\n/api/v1/cards/card_1/topup\n${call.body}`).digest('hex');
  assert.equal(call.headers['x-signature'], expected);
});

test('card details are exposed only for issued cards with unmasked numbers', async () => {
  let body = '{"success":true,"data":{"card_id":"card_1","issue_status":"issued","card":{"number":"4004 1234 5678 0646","last4":"0646","exp":"05/28","cvv":"123","balance":12.5,"pending_topup":0.00,"is_frozen":false}}}';
  const { http, calls } = fakeIssuer(() => ({ text: body }));
  const client = new IzipayClient({ apiKey: KEY, fetch: http });

  const issued = await client.getCard('card_1', true);
  assert.equal(calls[0]!.url.search, '?live=1');
  assert.equal(calls[0]!.headers['x-signature'], undefined);
  assert.equal(issued.lastFour, '0646');
  assert.equal(issued.balanceCents, 1250n);
  assert.equal(issued.isFrozen, false);
  assert.deepEqual(issued.details, { number: '4004 1234 5678 0646', expiry: '05/28', cvv: '123' });

  body = '{"success":true,"data":{"card_id":"card_1","issue_status":"paid_pending_issue","card":{"number":"4004 12** **** 0646","last4":"0646"}}}';
  assert.equal((await client.getCard('card_1')).details, undefined);
});

test('issuer errors surface status and code without the API key', async () => {
  const { http } = fakeIssuer(() => ({ status: 402, text: '{"success":false,"error":{"code":"INSUFFICIENT_BALANCE","message":"Top up first"}}' }));
  const client = new IzipayClient({ apiKey: KEY, fetch: http });
  await assert.rejects(client.topUpFromBalance({ cardId: 'card_1', amountCents: 500n, idempotencyKey: 'k' }), (error: unknown) => {
    assert.ok(error instanceof IzipayError);
    assert.equal(error.status, 402);
    assert.equal(error.code, 'INSUFFICIENT_BALANCE');
    assert.ok(!error.message.includes(KEY));
    return true;
  });
  const html = fakeIssuer(() => ({ status: 503, text: '<html>down</html>' }));
  await assert.rejects(new IzipayClient({ apiKey: KEY, fetch: html.http }).getTopUp('ctopup_1'), { code: 'http_503' });
});

test('issuing a card charges the account balance and keeps the internal reference', async () => {
  const { http, calls } = fakeIssuer(() => ({ text: '{"success":true,"data":{"card_id":"card_9","issue_status":"paid_pending_issue"}}' }));
  const card = await new IzipayClient({ apiKey: KEY, fetch: http }).issueCard({ email: 'a@b.test', reference: 'user-1', idempotencyKey: 'issue-1' });
  assert.equal(card.cardId, 'card_9');
  assert.deepEqual(JSON.parse(calls[0]!.body), { cardholder_email: 'a@b.test', client_card_ref: 'user-1', card_type: 'visa', pay_currency: 'balance' });
  assert.equal(calls[0]!.headers['x-idempotency-key'], 'issue-1');
});

test('API key format and webhook signatures are checked', () => {
  assert.throws(() => new IzipayClient({ apiKey: 'sk_live_x' }));
  assert.equal(new IzipayClient({ apiKey: KEY }).isSandbox, true);
  const body = '{"id":"evt_1","type":"card.issued"}';
  const good = createHmac('sha256', 'whsec').update(body).digest('hex');
  assert.equal(verifyIzipayWebhook(body, good, 'whsec'), true);
  assert.equal(verifyIzipayWebhook(body + ' ', good, 'whsec'), false);
  assert.equal(verifyIzipayWebhook(body, good.slice(2), 'whsec'), false);
  assert.equal(verifyIzipayWebhook(body, undefined, 'whsec'), false);
  assert.equal(verifyIzipayWebhook(body, good, ''), false);
});
