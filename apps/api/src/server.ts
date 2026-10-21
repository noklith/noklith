import { buildApp } from './app.ts';
import { readConfig } from './config.ts';
import { postgresDatabase } from './database.ts';
import { createRpcAccountInspector } from './auth/rpc.ts';
import { createEvmChainAdapter } from './chain/adapter.ts';
import { FundingService, startFundingWorker } from './funding/service.ts';
import { DepositService, startDepositWatcher } from './funding/deposits.ts';
import type { DepositWatcher } from './funding/deposits.ts';
import { DepositKeys } from './funding/deposit-keys.ts';
import type { FundingWorker } from './funding/service.ts';
import { DemoIssuer } from './issuer/issuer.ts';
import { IzipayClient } from './issuer/izipay.ts';
import { IzipayIssuer } from './issuer/izipay-issuer.ts';
import { CardMailService } from './issuer/card-mail.ts';
import { LimitsService } from './limits.ts';
import { RiskService } from './risk.ts';

const config = readConfig();
const db = postgresDatabase(config.databaseURL);
const issuer = config.issuer.mode === 'izipay'
  ? new IzipayIssuer({
    client: new IzipayClient({ apiKey: config.issuer.apiKey, signingSecret: config.issuer.signingSecret, baseUrl: config.issuer.baseUrl }),
    cardholderEmailDomain: config.issuer.cardholderEmailDomain, cardType: config.issuer.cardType,
    topUpFeeBps: config.issuer.topUpFeeBps, topUpFixedFeeCents: config.issuer.topUpFixedFeeCents,
  })
  : new DemoIssuer({ webhookSecret: config.demoIssuerWebhookSecret });
const limits = new LimitsService(undefined, config.velocity);
const risk = new RiskService(limits, config.risk);
const chain = config.walletAuth ? createEvmChainAdapter(config.walletAuth.endpoints, { timeoutMs: 10_000 }) : undefined;
const funding = config.funding && chain ? new FundingService({
  db, issuer, limits, risk, config: config.funding, chain,
  onAlert: message => app.log.error({ alert: 'funding_needs_review' }, message),
}) : undefined;
// Personal deposit addresses: derived from a public key only; the server can see deposits, never move them.
const deposits = funding && chain && config.funding && config.depositXpub
  ? new DepositService({ db, chain, funding, networks: config.funding.networks, keys: new DepositKeys(config.depositXpub) })
  : undefined;
const cardMail = config.cardMailSecret && config.issuer.mode === 'izipay'
  ? new CardMailService({ db, secret: config.cardMailSecret, domain: config.issuer.cardholderEmailDomain })
  : undefined;
const release = /^[0-9a-f]{40}$/.test(process.env.RELEASE_COMMIT ?? '') ? process.env.RELEASE_COMMIT : undefined;
const app = buildApp({ db, networkMode: config.networkMode, logger: true, release, issuer, limits, funding, risk, trustedProxy: config.trustedProxy, cardMail,
  walletconnectProjectId: config.walletconnectProjectId, deposits,
  auth: config.walletAuth ? {
    configuration: config.walletAuth.configuration,
    dependencies: { inspectAccount: createRpcAccountInspector(config.walletAuth.endpoints) },
  } : undefined,
});
let worker: FundingWorker | undefined;
let watcher: DepositWatcher | undefined;
app.addHook('onClose', async () => { await watcher?.stop(); await worker?.stop(); await db.close(); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { await app.close(); });
try {
  await app.listen({ host: config.host, port: config.port });
  // Pending top-ups resume from the database after every restart.
  if (funding) worker = startFundingWorker(funding, 5_000, error => app.log.error({ err: error }, 'Funding worker step failed'));
  if (deposits) watcher = startDepositWatcher(deposits, 15_000, error => app.log.error({ err: error }, 'Deposit watcher step failed'));
}
catch (error) { app.log.error(error); await app.close(); process.exitCode = 1; }
