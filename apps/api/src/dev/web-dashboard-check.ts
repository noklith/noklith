import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import type { Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { buildApp } from '../app.ts';
import type { ChainAdapter, ExpectedTransfer } from '../chain/adapter.ts';
import { DEFAULT_FUNDING_TIMING, FundingService } from '../funding/service.ts';
import { DemoIssuer } from '../issuer/issuer.ts';
import { LimitsService } from '../limits.ts';
import { migrate } from '../migrate.ts';
import { pgliteDatabase } from './pglite-database.ts';

// Browser check of the website dashboard (apps/web/dist) against our API, both on one local origin.
// Headless Chrome, a scripted EIP-1193 wallet (fresh key, signs locally), DemoIssuer and a chain double
// that confirms the exact transfer the server prepared. No external service, wallet or funds.
// Usage: node src/dev/web-dashboard-check.ts [path-to-chrome] [screenshot.png]

const CHROME = process.argv[2] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOT = process.argv[3];
const DIST = resolve(import.meta.dirname, '../../../web/dist');
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const log = (...parts: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...parts);

const sent = new Map<string, ExpectedTransfer['units']>();
const chain: ChainAdapter = {
  chainIds: [84532],
  async checkTransfer(expected) {
    if (!sent.has(expected.transactionHash.toLowerCase())) return { state: 'not_found' };
    return { state: 'confirmed', confirmations: 5, transfer: { logIndex: 0, blockNumber: 1n, from: expected.from, to: expected.to, token: expected.token, units: expected.units } };
  },
};
const db = pgliteDatabase();
const now = () => new Date();
const issuer = new DemoIssuer();
const limits = new LimitsService();
const funding = new FundingService({ db, chain, issuer, limits, now, config: { recipient: RECIPIENT, ...DEFAULT_FUNDING_TIMING,
  networks: [{ chainId: 84532, name: 'Base Sepolia', confirmations: 5, explorerTxURL: 'https://sepolia.basescan.org/tx/',
    assets: [{ symbol: 'USDC', name: 'USDC (Base Sepolia test token)', tokenAddress: TOKEN, decimals: 6 }] }] } });
const api = buildApp({ db, networkMode: 'testnet', issuer, limits, funding, now, auth: {
  configuration: { origin: 'https://noklith.com', uri: 'https://noklith.com/sign-in', allowedChainIds: [84532] },
  dependencies: { inspectAccount: async chainId => ({ chainId, code: '0x' }), now } } });

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.mp4': 'video/mp4' };
const site = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://local');
  if (url.pathname.startsWith('/v1/')) {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([k]) => !['host', 'content-length', 'connection'].includes(k))) as Record<string, string>;
    const reply = await api.inject({ method: request.method as 'GET', url: url.pathname + url.search, headers, payload: chunks.length ? Buffer.concat(chunks) : undefined });
    response.writeHead(reply.statusCode, { 'content-type': String(reply.headers['content-type'] ?? 'application/json') }).end(reply.rawPayload);
    return;
  }
  const file = normalize(join(DIST, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(DIST)) { response.writeHead(403).end(); return; }
  try { response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file)); }
  catch { response.writeHead(404).end(); }
});

const account = privateKeyToAccount(generatePrivateKey());
const profile = mkdtempSync(join(tmpdir(), 'nk-chrome-'));
let chrome: ReturnType<typeof spawn> | undefined;
try {
  await migrate(db);
  await new Promise<void>(r => site.listen(0, '127.0.0.1', r));
  const port = (site.address() as { port: number }).port;
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1366,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsBrowser = await new Promise<string>((ok, fail) => {
    let text = '';
    chrome!.stderr!.on('data', (d: Buffer) => { text += d; const m = /DevTools listening on (ws:\S+)/.exec(text); if (m) ok(m[1]!); });
    setTimeout(() => fail(new Error('Chrome did not start')), 20_000);
  });
  const debugPort = new URL(wsBrowser).port;
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json() as { webSocketDebuggerUrl: string };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let seq = 0;
  const pending = new Map<number, (v: { result?: unknown; error?: unknown }) => void>();
  const send = (method: string, params: object = {}) => new Promise<Record<string, unknown>>((ok, fail) => {
    const id = ++seq; pending.set(id, m => (m.error ? fail(new Error(JSON.stringify(m.error))) : ok(m.result as Record<string, unknown>)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression: string) => ((await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result as { value?: unknown }).value;
  const errors: string[] = [];

  // Scripted wallet: the page calls a CDP binding; this process answers through window.__nkWalletReply.
  ws.addEventListener('message', async event => {
    const message = JSON.parse(String(event.data));
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); return; }
    if (message.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text));
    if (message.method !== 'Runtime.bindingCalled' || message.params.name !== 'nkWalletCall') return;
    const { id, method, params } = JSON.parse(message.params.payload);
    let result: unknown = null;
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') result = [account.address];
    else if (method === 'eth_chainId') result = '0x14a34';
    else if (method === 'personal_sign') result = await account.signMessage({ message: { raw: params[0] as Hex } });
    else if (method === 'eth_sendTransaction') { const hash = `0x${randomBytes(32).toString('hex')}`; sent.set(hash, 0n); result = hash; log(`Wallet sent transfer to ${params[0].to}`); }
    await send('Runtime.evaluate', { expression: `window.__nkWalletReply(${JSON.stringify(id)}, ${JSON.stringify(result)})` });
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Runtime.addBinding', { name: 'nkWalletCall' });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const waiting = new Map(); let n = 0;
    window.__nkWalletReply = (id, value) => { waiting.get(id)?.(value); waiting.delete(id); };
    window.ethereum = { isMetaMask: true, request: ({ method, params }) => new Promise(ok => { const id = ++n; waiting.set(id, ok); nkWalletCall(JSON.stringify({ id, method, params: params ?? [] })); }) };
  })();` });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/dashboard.html?nk_direct=1` });

  const until = async (what: string, expression: string, timeoutMs = 30_000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) { if (await evaluate(expression)) { log(`OK: ${what}`); return; } await new Promise(r => setTimeout(r, 300)); }
    throw new Error(`Timed out: ${what}. Dialog: ${await evaluate("document.querySelector('#action-dialog')?.innerText")}`);
  };
  const click = (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click(), true`);
  const text = (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`) as Promise<string>;

  await until('dashboard loaded', "!!window.nkDashboard && document.querySelector('#card-state')?.textContent === 'Not connected'");
  await click('[data-action="connect"]');
  await until('wallet sign-in, no card yet', "document.querySelector('#card-state').textContent === 'No card yet'");
  assert.match(await text('.balance-sub'), new RegExp(account.address.slice(0, 6)));

  await click('#view-overview [data-action="refill"]');
  await until('card offer shown', "!!document.querySelector('[data-nk=issue]')");
  await click('[data-nk="issue"]');
  await until('card issued and active', "document.querySelector('#card-state').textContent === 'Active'");

  await click('[data-action="card-details"]');
  await until('card details shown', "/number/i.test(document.querySelector('#action-dialog').innerText)");
  assert.match(await text('#action-dialog'), /9999 \d{4} \d{4} \d{4}/);
  assert.match(await text('#action-dialog'), /can’t be used for payments/);
  await click('[data-close-dialog]');

  await click('#freeze-card');
  await until('card paused', "document.querySelector('#card-state').textContent === 'Paused'");
  await click('#freeze-card');
  await until('card resumed', "document.querySelector('#card-state').textContent === 'Active'");

  await click('#view-overview [data-action="refill"]');
  await until('refill amount form', "!!document.querySelector('#nk-refill-amount')");
  await evaluate("document.querySelector('#nk-refill-amount').value = '25.50', document.querySelector('#nk-refill-form').requestSubmit(), true");
  await until('refill terms', "/to your card/i.test(document.querySelector('#action-dialog').innerText)");
  assert.match(await text('#action-dialog'), /25\.50 USDC/);
  await click('[data-nk="send-refill"]');
  await until('refill credited', "/Done\\. The money is on your card/.test(document.querySelector('#action-dialog').innerText)", 60_000);
  await until('card balance updated', "document.querySelector('[data-card-balance]').textContent === '$25.50'");
  await until('activity lists the refill', "/\\+\\$25\\.50/.test(document.querySelector('#recent-activity').innerText)");

  if (SHOT) {
    await click('[data-close-dialog]');
    writeFileSync(SHOT, Buffer.from(String((await send('Page.captureScreenshot', { format: 'png' })).data), 'base64'));
    log(`Screenshot: ${SHOT}`);
  }
  assert.deepEqual(errors, [], 'page script errors');
  log('RESULT: PASSED');
} catch (error) {
  log('RESULT: FAILED', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  chrome?.kill();
  site.close();
  await api.close();
  await db.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
}
