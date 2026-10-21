import { isIP } from 'node:net';
import type { APIConfig, IssuerMode, LimitValues, NetworkMode } from '../../../packages/api-contracts/src/index.ts';
import type { VelocityLimits } from './limits.ts';
import { DEFAULT_VELOCITY } from './limits.ts';
import type { RiskRules } from './risk.ts';
import { DEFAULT_RISK_RULES } from './risk.ts';
import type { AuthConfiguration } from './auth/service.ts';
import type { RpcEndpointConfiguration } from './auth/rpc.ts';
import { MAINNET_IDS, NETWORKS, TESTNETS, TESTNET_IDS } from './chain/networks.ts';
import type { FundingConfiguration } from './funding/service.ts';
import { DEFAULT_FUNDING_TIMING } from './funding/service.ts';

export interface WalletAuthRuntimeConfiguration {
  configuration: AuthConfiguration;
  endpoints: RpcEndpointConfiguration[];
}
export interface RuntimeConfig {
  host: string; port: number; databaseURL: string; networkMode: NetworkMode;
  walletAuth?: WalletAuthRuntimeConfiguration;
  funding?: FundingConfiguration;
  demoIssuerWebhookSecret?: string;
  /** HMAC secret shared with the Cloudflare Email Routing worker that forwards IZIPAY cardholder mail. */
  cardMailSecret?: string;
  /** Reown (WalletConnect) project ID the website uses to list mobile wallets. */
  walletconnectProjectId?: string;
  /** Account-level extended public key for personal deposit addresses (<xpub>/0/<index>); needs funding. */
  depositXpub?: string;
  issuer: IssuerConfig;
  /** Reverse proxy address or CIDR whose X-Forwarded-For is trusted; absent means the socket address is the client. */
  trustedProxy?: string;
  velocity: VelocityLimits;
  risk: RiskRules;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^[0-9]{1,6}$/.test(raw) || Number(raw) < min || Number(raw) > max) throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return Number(raw);
}
function flag(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw !== 'true' && raw !== 'false') throw new Error(`${name} must be true or false.`);
  return raw === 'true';
}

/** Velocity limits and automatic risk rules. Defaults are documented working assumptions. */
export function readRiskConfig(env: NodeJS.ProcessEnv): { velocity: VelocityLimits; risk: RiskRules } {
  const v = DEFAULT_VELOCITY, series = DEFAULT_RISK_RULES.maxTopUpSeries, drain = DEFAULT_RISK_RULES.drainAfterTopUp;
  return {
    velocity: {
      topUpsPerHour: integer(env, 'TOP_UPS_PER_HOUR', v.topUpsPerHour, 1, 1000), topUpsPerDay: integer(env, 'TOP_UPS_PER_DAY', v.topUpsPerDay, 1, 10000),
      purchasesPerHour: integer(env, 'PURCHASES_PER_HOUR', v.purchasesPerHour, 1, 1000), purchasesPerDay: integer(env, 'PURCHASES_PER_DAY', v.purchasesPerDay, 1, 10000),
    },
    risk: {
      maxTopUpSeries: { enabled: flag(env, 'RISK_TOP_UP_SERIES_ENABLED', series.enabled), count: integer(env, 'RISK_TOP_UP_SERIES_COUNT', series.count, 2, 100),
        windowMinutes: integer(env, 'RISK_TOP_UP_SERIES_WINDOW_MINUTES', series.windowMinutes, 1, 10080),
        minPercentOfSingleLimit: integer(env, 'RISK_TOP_UP_SERIES_MIN_PERCENT', series.minPercentOfSingleLimit, 1, 100) },
      drainAfterTopUp: { enabled: flag(env, 'RISK_DRAIN_ENABLED', drain.enabled), windowMinutes: integer(env, 'RISK_DRAIN_WINDOW_MINUTES', drain.windowMinutes, 1, 10080),
        minPercentOfAvailable: integer(env, 'RISK_DRAIN_MIN_PERCENT', drain.minPercentOfAvailable, 1, 100),
        minAvailableCents: BigInt(integer(env, 'RISK_DRAIN_MIN_AVAILABLE_CENTS', Number(drain.minAvailableCents), 0, 500000)) },
    },
  };
}
/** One proxy address or CIDR block. Never "true": trusting every hop would let any client choose its own IP. */
export function readTrustedProxy(env: NodeJS.ProcessEnv): string | undefined {
  const raw = env.TRUSTED_PROXY ?? '';
  if (raw === '') return undefined;
  const [address, prefix, extra] = raw.split('/');
  const family = isIP(address ?? '');
  const maxPrefix = family === 4 ? 32 : 128;
  if (!family || extra !== undefined || (prefix !== undefined && (!/^[1-9][0-9]{0,2}$/.test(prefix) || Number(prefix) > maxPrefix))) {
    throw new Error('TRUSTED_PROXY must be one IP address or CIDR block.');
  }
  return raw;
}
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Operator markup on refills, the same on test and real networks. */
function readServiceFeeBps(env: NodeJS.ProcessEnv): number {
  const raw = env.TOP_UP_SERVICE_FEE_BPS ?? '0';
  if (!/^(0|[1-9][0-9]{0,3})$/.test(raw) || Number(raw) > 5000) throw new Error('TOP_UP_SERVICE_FEE_BPS must be an integer from 0 to 5000 (basis points).');
  return Number(raw);
}

/**
 * Funding is opt-in and fully explicit: network, token contract, recipient and confirmations. On real networks
 * (NETWORK_MODE=mainnet) TOP_UP_ASSETS picks stablecoins from the fixed list in chain/networks.ts, e.g. "137:USDT,56:USDT".
 */
export function readFundingConfig(env: NodeJS.ProcessEnv, walletAuth: WalletAuthRuntimeConfiguration | undefined,
  networkMode: NetworkMode = 'testnet'): FundingConfiguration | undefined {
  if (env.TOP_UP_ENABLED !== undefined && !['true', 'false'].includes(env.TOP_UP_ENABLED)) throw new Error('TOP_UP_ENABLED must be true or false.');
  if (env.TOP_UP_ENABLED !== 'true') return undefined;
  if (networkMode === 'mainnet') return readMainnetFunding(env, walletAuth);
  const chainId = Number(env.TOP_UP_CHAIN_ID ?? '84532');
  const network = TESTNETS[chainId];
  if (!network || String(chainId) !== (env.TOP_UP_CHAIN_ID ?? '84532')) throw new Error('TOP_UP_CHAIN_ID must be one of the supported testnet IDs.');
  if (!walletAuth || !walletAuth.configuration.allowedChainIds.includes(chainId)) {
    throw new Error(`Top-ups require wallet authentication with AUTH_CHAIN_IDS including ${chainId} (${network.name}).`);
  }
  const recipient = env.TOP_UP_RECIPIENT_ADDRESS ?? '';
  // BASE_SEPOLIA_USDC_ADDRESS is the earlier name of the same setting and only applies to Base Sepolia.
  const token = env.TOP_UP_TOKEN_ADDRESS ?? (chainId === 84532 ? env.BASE_SEPOLIA_USDC_ADDRESS : undefined) ?? '';
  const symbol = env.TOP_UP_TOKEN_SYMBOL ?? 'USDC';
  if (!ADDRESS.test(recipient) || /^0x0{40}$/i.test(recipient)) throw new Error('TOP_UP_RECIPIENT_ADDRESS must be an explicit testnet address you control.');
  if (!ADDRESS.test(token)) throw new Error('TOP_UP_TOKEN_ADDRESS must be the explicit test token contract.');
  if (!/^[A-Za-z0-9]{2,10}$/.test(symbol)) throw new Error('TOP_UP_TOKEN_SYMBOL must be 2 to 10 letters or digits.');
  const rawConfirmations = env.TOP_UP_CONFIRMATIONS ?? '5';
  if (!/^[1-9][0-9]{0,2}$/.test(rawConfirmations)) throw new Error('TOP_UP_CONFIRMATIONS must be an integer from 1 to 999.');
  return {
    recipient, ...DEFAULT_FUNDING_TIMING, serviceFeeBps: readServiceFeeBps(env),
    networks: [{ chainId, name: network.name, confirmations: Number(rawConfirmations), explorerTxURL: network.explorerTxURL,
      nativeSymbol: network.nativeSymbol, mainnet: false,
      assets: [{ symbol, name: `${symbol} (${network.name} test token)`, tokenAddress: token, decimals: 6 }] }],
  };
}

/** Real stablecoin refills: only listed networks and their fixed token contracts, to an explicit recipient. */
function readMainnetFunding(env: NodeJS.ProcessEnv, walletAuth: WalletAuthRuntimeConfiguration | undefined): FundingConfiguration {
  const recipient = env.TOP_UP_RECIPIENT_ADDRESS ?? '';
  if (!ADDRESS.test(recipient) || /^0x0{40}$/i.test(recipient)) throw new Error('TOP_UP_RECIPIENT_ADDRESS must be the explicit address that receives refills.');
  const picks = (env.TOP_UP_ASSETS ?? '').split(',').map(item => item.trim()).filter(Boolean);
  if (!picks.length) throw new Error('TOP_UP_ASSETS must list the refill stablecoins, e.g. 137:USDT,56:USDT.');
  const rawConfirmations = env.TOP_UP_CONFIRMATIONS;
  if (rawConfirmations !== undefined && !/^[1-9][0-9]{0,2}$/.test(rawConfirmations)) throw new Error('TOP_UP_CONFIRMATIONS must be an integer from 1 to 999.');
  const byChain = new Map<number, FundingConfiguration['networks'][number]>();
  for (const pick of picks) {
    const match = /^([1-9][0-9]*):([A-Z0-9]{2,10})$/.exec(pick);
    const chainId = Number(match?.[1]);
    const network = NETWORKS[chainId];
    const token = network?.mainnet ? network.tokens.find(item => item.symbol === match?.[2]) : undefined;
    if (!match || !network || !token) throw new Error(`TOP_UP_ASSETS entry ${pick} is not a supported real-network stablecoin.`);
    if (!walletAuth || !walletAuth.configuration.allowedChainIds.includes(chainId)) {
      throw new Error(`Refills on ${network.name} require AUTH_CHAIN_IDS including ${chainId}.`);
    }
    const entry = byChain.get(chainId) ?? { chainId, name: network.name, explorerTxURL: network.explorerTxURL, nativeSymbol: network.nativeSymbol,
      mainnet: true, confirmations: rawConfirmations ? Number(rawConfirmations) : network.confirmations, assets: [] };
    if (entry.assets.some(asset => asset.symbol === token.symbol)) throw new Error(`TOP_UP_ASSETS lists ${pick} twice.`);
    entry.assets.push({ symbol: token.symbol, name: token.name, tokenAddress: token.address, decimals: token.decimals });
    byChain.set(chainId, entry);
  }
  return { recipient, ...DEFAULT_FUNDING_TIMING, serviceFeeBps: readServiceFeeBps(env), networks: [...byChain.values()] };
}

/** All service endpoints are explicit operator configuration. No inferred network or host-header origin. */
export function readWalletAuthConfig(env: NodeJS.ProcessEnv, networkMode: NetworkMode): WalletAuthRuntimeConfiguration | undefined {
  if (env.WALLET_AUTH_ENABLED !== undefined && !['true', 'false'].includes(env.WALLET_AUTH_ENABLED)) {
    throw new Error('WALLET_AUTH_ENABLED must be true or false.');
  }
  if (env.WALLET_AUTH_ENABLED !== 'true') return undefined;
  if (networkMode === 'fixture') throw new Error('Wallet authentication cannot be enabled in fixture mode.');
  const allowed = networkMode === 'mainnet' ? MAINNET_IDS : TESTNET_IDS;
  let origin: URL;
  let uri: URL;
  try {
    origin = new URL(env.SIWE_ORIGIN ?? '');
    uri = new URL(env.SIWE_URI ?? '');
  } catch { throw new Error('SIWE_ORIGIN and SIWE_URI must be explicit HTTPS URLs.'); }
  if (origin.protocol !== 'https:' || origin.origin !== env.SIWE_ORIGIN || origin.username || origin.password
      || uri.origin !== origin.origin || uri.username || uri.password || uri.hash || uri.href !== env.SIWE_URI) {
    throw new Error('SIWE_ORIGIN must be a canonical HTTPS origin and SIWE_URI a canonical same-origin URL.');
  }
  const chainNames = (env.AUTH_CHAIN_IDS ?? '').split(',');
  if (!chainNames.length || chainNames.some(id => !/^[1-9][0-9]*$/.test(id) || !allowed.has(Number(id)))
      || new Set(chainNames).size !== chainNames.length) {
    throw new Error(`AUTH_CHAIN_IDS requires unique explicitly selected ${networkMode === 'mainnet' ? 'real-network' : 'testnet'} IDs, separated by commas.`);
  }
  const endpoints = chainNames.map(id => {
    const variable = NETWORKS[Number(id)]!.rpcVariable;
    const rawEndpoint = env[variable] ?? '';
    if (/[\u0000-\u0020\u007f\\#]/.test(rawEndpoint) || /^https:\/\/[^/?#]*@/i.test(rawEndpoint)) {
      throw new Error(`${variable} must be an explicit HTTPS endpoint without whitespace, user information or a fragment.`);
    }
    let endpoint: URL;
    try { endpoint = new URL(rawEndpoint); }
    catch { throw new Error(`${variable} is required for the selected chain.`); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) {
      throw new Error(`${variable} must use HTTPS without user information or a fragment.`);
    }
    return { chainId: Number(id), url: endpoint.href };
  });
  return { configuration: { origin: origin.origin, uri: uri.href, allowedChainIds: endpoints.map(item => item.chainId) }, endpoints };
}
export type IssuerConfig =
  | { mode: 'demo' }
  | { mode: 'izipay'; apiKey: string; signingSecret?: string; cardholderEmailDomain: string; cardType: string; baseUrl?: string;
      topUpFeeBps: bigint; topUpFixedFeeCents: bigint };

const IZIPAY_CARD_TYPES = ['visa', 'visa_us', 'mastercard_standard', 'mastercard'];

/** ISSUER_MODE=izipay selects IZIPAY Business. Live keys need an explicit opt-in. */
export function readIssuerConfig(env: NodeJS.ProcessEnv): IssuerConfig {
  const mode = env.ISSUER_MODE ?? 'demo';
  if (mode === 'demo') return { mode };
  if (mode !== 'izipay') throw new Error('ISSUER_MODE must be demo or izipay.');
  const apiKey = env.IZIPAY_API_KEY ?? '';
  if (!/^izpk_(test|live)_[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error('IZIPAY_API_KEY is required for ISSUER_MODE=izipay.');
  if (apiKey.startsWith('izpk_live_') && env.IZIPAY_ALLOW_LIVE !== 'true') {
    throw new Error('A live IZIPAY key needs IZIPAY_ALLOW_LIVE=true: it issues real cards paid from the account balance.');
  }
  const signingSecret = env.IZIPAY_SIGNING_SECRET || undefined;
  if (signingSecret !== undefined && !/^izps_[A-Za-z0-9_-]+$/.test(signingSecret)) throw new Error('IZIPAY_SIGNING_SECRET has an unexpected format.');
  const cardholderEmailDomain = env.IZIPAY_CARDHOLDER_EMAIL_DOMAIN ?? '';
  if (!/^(?=.{3,120}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cardholderEmailDomain)) throw new Error('IZIPAY_CARDHOLDER_EMAIL_DOMAIN must be a domain name.');
  const cardType = env.IZIPAY_CARD_TYPE ?? 'visa';
  if (!IZIPAY_CARD_TYPES.includes(cardType)) throw new Error(`IZIPAY_CARD_TYPE must be one of ${IZIPAY_CARD_TYPES.join(', ')}.`);
  const baseUrl = env.IZIPAY_BASE_URL || undefined;
  if (baseUrl !== undefined && !/^https:\/\/[^\s@#]+$/.test(baseUrl)) throw new Error('IZIPAY_BASE_URL must be an HTTPS URL.');
  const feeBps = env.IZIPAY_TOPUP_FEE_BPS ?? '300';
  const fixedFee = env.IZIPAY_TOPUP_FIXED_FEE_CENTS ?? '170';
  if (!/^(0|[1-9][0-9]{0,3})$/.test(feeBps) || !/^(0|[1-9][0-9]{0,4})$/.test(fixedFee)) {
    throw new Error('IZIPAY_TOPUP_FEE_BPS and IZIPAY_TOPUP_FIXED_FEE_CENTS must be whole numbers (basis points, cents).');
  }
  return { mode, apiKey, signingSecret, cardholderEmailDomain, cardType, baseUrl, topUpFeeBps: BigInt(feeBps), topUpFixedFeeCents: BigInt(fixedFee) };
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const networkMode = env.NETWORK_MODE ?? 'testnet';
  if (networkMode !== 'fixture' && networkMode !== 'testnet' && networkMode !== 'mainnet') throw new Error('NETWORK_MODE must be fixture, testnet or mainnet.');
  // Real money: a second, deliberate switch, like IZIPAY_ALLOW_LIVE for the card issuer.
  if (networkMode === 'mainnet' && env.MAINNET_ENABLED !== 'true') throw new Error('NETWORK_MODE=mainnet needs MAINNET_ENABLED=true: refills then move real stablecoins.');
  const issuer = readIssuerConfig(env);
  // Real stablecoins must buy a real card: never accept them for a DemoIssuer card that cannot pay.
  if (networkMode === 'mainnet' && (issuer.mode !== 'izipay' || !issuer.apiKey.startsWith('izpk_live_'))) {
    throw new Error('NETWORK_MODE=mainnet requires ISSUER_MODE=izipay with a live IZIPAY key.');
  }
  const host = env.HOST ?? '127.0.0.1';
  if (networkMode === 'fixture' && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Fixture mode must bind only to a loopback address.');
  const rawPort = env.PORT ?? '3000';
  if (!/^[0-9]+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('Invalid PORT.');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const walletAuth = readWalletAuthConfig(env, networkMode);
  const webhookSecret = env.DEMO_ISSUER_WEBHOOK_SECRET || undefined;
  if (webhookSecret !== undefined && webhookSecret.length < 32) throw new Error('DEMO_ISSUER_WEBHOOK_SECRET must contain at least 32 characters.');
  const funding = readFundingConfig(env, walletAuth, networkMode);
  const cardMailSecret = env.CARD_MAIL_SECRET || undefined;
  if (cardMailSecret !== undefined && (cardMailSecret.length < 32 || issuer.mode !== 'izipay')) {
    throw new Error('CARD_MAIL_SECRET needs at least 32 characters and ISSUER_MODE=izipay.');
  }
  const walletconnectProjectId = env.REOWN_PROJECT_ID || undefined;
  if (walletconnectProjectId !== undefined && !/^[0-9a-f]{32}$/.test(walletconnectProjectId)) {
    throw new Error('REOWN_PROJECT_ID must be the 32 lowercase hex characters of a Reown project ID.');
  }
  const depositXpub = env.DEPOSIT_XPUB || undefined;
  if (depositXpub !== undefined && (!funding || !/^[xt]pub[1-9A-HJ-NP-Za-km-z]{100,120}$/.test(depositXpub))) {
    throw new Error('DEPOSIT_XPUB must be an extended public key (xpub...) and needs top-ups (funding) to be configured.');
  }
  return { host, port: Number(rawPort), databaseURL: env.DATABASE_URL, networkMode, walletAuth, issuer,
    funding, demoIssuerWebhookSecret: webhookSecret, cardMailSecret, walletconnectProjectId, depositXpub,
    trustedProxy: readTrustedProxy(env), ...readRiskConfig(env) };
}
export function publicConfig(networkMode: NetworkMode, limits: LimitValues, issuerMode: IssuerMode = 'demo'): APIConfig {
  return {
    schema_version: 1, issuer_mode: issuerMode, network_mode: networkMode,
    wallet_auth_enabled: false, wallet_auth: null, top_up_enabled: false, networks: [],
    spend_limits_enforced: issuerMode !== 'izipay', limits, walletconnect_project_id: null, deposits_enabled: false,
  };
}
