import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createPublicClient, createWalletClient, defineChain, erc20Abi, formatEther, formatUnits, http, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type {
  APIConfig, AuthChallengeResponse, CardResponse, HistoryResponse, TopUpAcceptResponse, TopUpResponse, WalletSessionResponse,
} from '../../../../packages/api-contracts/src/index.ts';

// End-to-end testnet top-up against a deployed API, without the iOS app:
// sign-in (SIWE) → card → quote → token transfer on the API's testnet → credit.
// Uses a throwaway test-only key kept in the git-ignored .local folder; it never holds real funds.
// Usage: node src/dev/testnet-topup.ts [amount_cents]   (API_URL, default https://api.noklith.com; RPC_URL overrides the public RPC)

const api = process.env.API_URL ?? 'https://api.noklith.com';
const amountCents = process.argv[2] ?? '100';
const keyFile = resolve(import.meta.dirname, '../../.local/testnet-wallet.json');
// Public, rate-limited RPCs of the supported testnets. Mainnet IDs are deliberately absent.
const PUBLIC_RPC: Record<number, string> = { 84532: 'https://sepolia.base.org', 46630: 'https://rpc.testnet.chain.robinhood.com' };

if (!existsSync(keyFile)) {
  mkdirSync(dirname(keyFile), { recursive: true });
  writeFileSync(keyFile, JSON.stringify({ note: 'Base Sepolia test-only key. Never fund with real assets.', key: generatePrivateKey() }), { mode: 0o600 });
}
const account = privateKeyToAccount(JSON.parse(readFileSync(keyFile, 'utf8')).key as Hex);
const log = (...parts: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...parts);

async function call<T>(path: string, init: { method?: string; token?: string; body?: unknown; idempotent?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.idempotent) headers['idempotency-key'] = randomUUID();
  const response = await fetch(`${api}${path}`, {
    method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const config = await call<APIConfig>('/v1/config');
if (config.network_mode !== 'testnet') throw new Error('Refusing to run against a non-testnet API.');
const network = config.networks[0];
const usdc = network?.assets[0];
const rpc = process.env.RPC_URL ?? (network ? PUBLIC_RPC[network.chain_id] : undefined);
if (!config.wallet_auth_enabled || !config.top_up_enabled || !network || !usdc || !rpc) throw new Error('Top-ups on a supported testnet are not enabled on this API.');
const testnet = defineChain({ id: network.chain_id, name: network.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const chain = createPublicClient({ chain: testnet, transport: http(rpc) });
const signer = createWalletClient({ account, chain: testnet, transport: http(rpc) });
if (await chain.getChainId() !== network.chain_id) throw new Error('The RPC answers for a different chain.');

const token = usdc.token_address as Hex;
const [eth, units] = await Promise.all([
  chain.getBalance({ address: account.address }),
  chain.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] }),
]);
log(`${network.name}, test wallet ${account.address}: ${formatEther(eth)} ETH, ${formatUnits(units, usdc.decimals)} ${usdc.symbol}`);
const neededUnits = BigInt(amountCents) * 10n ** BigInt(usdc.decimals - 2);
if (eth === 0n || units < neededUnits) {
  log(`Not enough test funds. Needed: a little test ETH for gas and ${formatUnits(neededUnits, usdc.decimals)} test ${usdc.symbol}.`);
  process.exit(2);
}

// Sign-in exactly as the app does: the server builds the message, the wallet signs it.
const challenge = await call<AuthChallengeResponse>('/v1/auth/challenge', { method: 'POST', body: { address: account.address, chain_id: network.chain_id } });
const signature = await account.signMessage({ message: challenge.message });
const session = await call<WalletSessionResponse>('/v1/auth/verify', { method: 'POST', body: { challenge_id: challenge.id, message: challenge.message, signature } });
const auth = session.access_token;
log(`Signed in as user ${session.user.id}`);

try {
  let card = (await call<CardResponse>('/v1/card', { token: auth })).card;
  if (!card) card = (await call<CardResponse>('/v1/cards', { method: 'POST', token: auth, body: {}, idempotent: true })).card;
  if (!card) throw new Error('No card after creation.');
  const before = BigInt(card.available_cents);
  log(`Card •••• ${card.last_four} (${card.status}), available ${before} cents`);

  const quoted = (await call<TopUpResponse>('/v1/top-ups', {
    method: 'POST', token: auth, idempotent: true, body: { chain_id: network.chain_id, asset: usdc.symbol, amount_cents: amountCents },
  })).top_up;
  log(`Quote ${quoted.id}: ${quoted.amount_cents} cents = ${quoted.token_units} units, status ${quoted.status}`);
  const accepted = await call<TopUpAcceptResponse>(`/v1/top-ups/${quoted.id}/accept`, { method: 'POST', token: auth, body: {} });
  const request = accepted.transaction;
  if (request.to.toLowerCase() !== token.toLowerCase() || request.chain_id !== network.chain_id) throw new Error('Unexpected transaction request.');

  const hash = await signer.sendTransaction({ to: request.to as Hex, data: request.data as Hex, value: 0n });
  log(`Sent ${network.explorer_tx_url}${hash}`);
  await call<TopUpResponse>(`/v1/top-ups/${quoted.id}/transaction`, { method: 'POST', token: auth, body: { transaction_hash: hash } });

  const deadline = Date.now() + 10 * 60_000;
  let status = '';
  while (Date.now() < deadline) {
    const current = (await call<TopUpResponse>(`/v1/top-ups/${quoted.id}/check`, { method: 'POST', token: auth, body: {} })).top_up;
    if (current.status !== status) log(`Status ${current.status}, confirmations ${current.confirmations}/${current.required_confirmations}${current.failure_reason ? `, ${current.failure_reason}` : ''}`);
    status = current.status;
    if (['credited', 'failed', 'cancelled', 'expired'].includes(status)) break;
    await new Promise(r => setTimeout(r, 5000));
  }
  const after = BigInt((await call<CardResponse>('/v1/card', { token: auth })).card!.available_cents);
  const history = await call<HistoryResponse>('/v1/history?limit=3', { token: auth });
  log(`Available ${before} → ${after} cents (difference ${after - before})`);
  log(`Latest history: ${history.items.map(i => `${i.kind} ${i.amount_cents} ${i.status}`).join('; ')}`);
  if (status !== 'credited' || after - before !== BigInt(amountCents)) { log('RESULT: FAILED'); process.exitCode = 1; }
  else log('RESULT: PASSED');
} finally {
  await call('/v1/auth/logout', { method: 'POST', token: auth, body: {} }).catch(() => {});
}
