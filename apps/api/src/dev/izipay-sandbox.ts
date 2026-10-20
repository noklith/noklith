import { randomUUID } from 'node:crypto';
import { IzipayClient } from '../issuer/izipay.ts';

// Sandbox round trip against the real IZIPAY API: issue a test card from the test balance,
// wait until it is issued, top it up, read the balance back. Refuses live keys.
// Usage: node --env-file=.local/izipay.env src/dev/izipay-sandbox.ts [top_up_cents]

const apiKey = process.env.IZIPAY_API_KEY ?? '';
if (!apiKey.startsWith('izpk_test_')) throw new Error('This check runs only with a sandbox key (izpk_test_…).');
const client = new IzipayClient({ apiKey, signingSecret: process.env.IZIPAY_SIGNING_SECRET || undefined });
const topUpCents = BigInt(process.argv[2] ?? '500');
const log = (...parts: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...parts);

const issued = await client.issueCard({ email: 'sandbox-check@example.com', alias: 'Sandbox check', reference: `sandbox-${Date.now()}`, idempotencyKey: randomUUID() });
log(`Issued request ${issued.cardId}: ${issued.issueStatus}`);

let card = issued;
const deadline = Date.now() + 5 * 60_000;
while (card.issueStatus !== 'issued' && card.issueStatus !== 'failed' && Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 10_000));
  card = await client.getCard(issued.cardId);
  log(`Status ${card.issueStatus}`);
}
if (card.issueStatus !== 'issued') { log('RESULT: FAILED (card not issued)'); process.exit(1); }
log(`Card •••• ${card.lastFour}, balance ${card.balanceCents} cents, details ${card.details ? 'present' : 'absent'}`);

const topUp = await client.topUpFromBalance({ cardId: card.cardId, amountCents: topUpCents, idempotencyKey: randomUUID() });
log(`Top-up ${topUp.topUpId}: ${topUp.status}, paid ${topUp.amountCents} cents, on card ${topUp.onCardCents} cents`);
const check = await client.getTopUp(topUp.topUpId);
const after = await client.getCard(card.cardId, true);
log(`Top-up check ${check.status}; card balance now ${after.balanceCents} cents`);
log(check.status === 'credited' || check.status === 'pending' ? 'RESULT: PASSED' : 'RESULT: FAILED');
