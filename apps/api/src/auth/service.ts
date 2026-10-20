import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getAddress, isAddress, verifyMessage } from 'viem';
import type { Address, Hex } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import type { Database } from '../database.ts';
import { KNOWN_CHAIN_IDS } from '../chain/networks.ts';
import { APIProblem } from '../errors.ts';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const WALLET_SESSION_TTL_MS = 60 * 60 * 1000;
const STATEMENT = 'Sign in to Card. This does not authorize a transfer.';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const iso = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString();

export interface AuthConfiguration {
  /** Explicit HTTPS origin and same-origin sign-in URI; never inferred from an HTTP Host header. */
  origin: string;
  uri: string;
  allowedChainIds: readonly number[];
}
export interface AccountInspection { chainId: number; code: Hex }
export interface AuthDependencies {
  /** Required trusted RPC adapter; must read both actual RPC chain ID and account code. No default. */
  inspectAccount(chainId: number, address: Address): Promise<AccountInspection>;
  now?: () => Date;
}
export interface AuthChallenge { id: string; message: string; expires_at: string }
export interface WalletIdentity {
  id: string; wallet_address: Address; authentication: 'siwe'; chain_id: number;
}
export interface WalletSession { access_token: string; expires_at: string; user: WalletIdentity }
type ChallengeRow = {
  id: string; nonce: string; address: string; chain_id: string;
  message: string; issued_at: unknown; expires_at: unknown; consumed_at: unknown;
};

/** EOA authentication with separate identities and sessions; never authenticates fixture API users. */
export class AuthService {
  private readonly db: Database;
  private readonly origin: string;
  private readonly domain: string;
  private readonly uri: string;
  private readonly chains: Set<number>;
  private readonly now: () => Date;
  private readonly inspectAccount: AuthDependencies['inspectAccount'];

  constructor(db: Database, config: AuthConfiguration, dependencies: AuthDependencies) {
    const origin = new URL(config.origin);
    const uri = new URL(config.uri);
    if (origin.protocol !== 'https:' || origin.origin !== config.origin || origin.username || origin.password
        || uri.origin !== origin.origin || uri.username || uri.password || uri.hash || uri.href !== config.uri) {
      throw new Error('Authentication requires an explicit canonical HTTPS origin and same-origin URI.');
    }
    // Which of these may be used (test or real networks) is decided by the network mode in the configuration.
    if (!config.allowedChainIds.length || config.allowedChainIds.some(id => !KNOWN_CHAIN_IDS.has(id))) {
      throw new Error('Explicit chain IDs of known networks are required.');
    }
    if (typeof dependencies.inspectAccount !== 'function') throw new Error('A trusted account inspection adapter is required.');
    this.db = db;
    this.origin = origin.origin;
    this.domain = origin.host;
    this.uri = uri.href;
    this.chains = new Set(config.allowedChainIds);
    this.now = dependencies.now ?? (() => new Date());
    this.inspectAccount = dependencies.inspectAccount;
  }

  private time(): Date {
    const now = this.now();
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid authentication clock.');
    return now;
  }

  private makeMessage(row: Pick<ChallengeRow, 'id' | 'nonce' | 'address' | 'chain_id' | 'issued_at' | 'expires_at'>): string {
    return createSiweMessage({
      scheme: 'https', domain: this.domain, uri: this.uri, version: '1', statement: STATEMENT,
      address: getAddress(row.address), chainId: Number(row.chain_id), nonce: row.nonce,
      issuedAt: new Date(iso(row.issued_at)), expirationTime: new Date(iso(row.expires_at)), requestId: row.id,
    });
  }

  async createChallenge(address: unknown, chainId: unknown): Promise<AuthChallenge> {
    if (typeof address !== 'string' || address.length !== 42 || !isAddress(address, { strict: true })
        || /^0x0{40}$/i.test(address)) throw new APIProblem(400, 'invalid_address', 'A valid wallet address is required.');
    if (typeof chainId !== 'number' || !this.chains.has(chainId)) {
      throw new APIProblem(400, 'unsupported_chain', 'This chain is not enabled for sign-in.');
    }
    const issuedAt = this.time();
    const row = {
      id: randomUUID(), nonce: randomBytes(32).toString('hex'), address: address.toLowerCase(), chain_id: String(chainId),
      issued_at: issuedAt.toISOString(), expires_at: new Date(issuedAt.getTime() + CHALLENGE_TTL_MS).toISOString(),
    };
    const message = this.makeMessage(row);
    await this.db.query(`INSERT INTO siwe_challenges (id, nonce, address, chain_id, message, issued_at, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [row.id, row.nonce, row.address, row.chain_id, message, row.issued_at, row.expires_at]);
    return { id: row.id, message, expires_at: row.expires_at };
  }

  async verify(input: { challengeId: unknown; message: unknown; signature: unknown }): Promise<WalletSession> {
    if (typeof input.challengeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.challengeId)
        || typeof input.message !== 'string' || input.message.length > 2048
        || typeof input.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) {
      throw new APIProblem(400, 'invalid_sign_in', 'A challenge and a 65-byte EOA signature are required.');
    }
    const result = await this.db.query<ChallengeRow>('SELECT * FROM siwe_challenges WHERE id = $1', [input.challengeId]);
    const row = result.rows[0];
    const checkedAt = this.time();
    if (!row || row.consumed_at || new Date(iso(row.issued_at)) > checkedAt || new Date(iso(row.expires_at)) <= checkedAt) {
      throw new APIProblem(401, 'challenge_unavailable', 'The sign-in request expired or has already been used.');
    }
    const chainId = Number(row.chain_id);
    // Exact server message equality rejects appended fields, altered domain/URI/chain/nonce/time,
    // ambiguous parsing and signatures over a differently reconstructed message.
    if (!this.chains.has(chainId) || input.message !== row.message || row.message !== this.makeMessage(row)
        || new Date(iso(row.expires_at)).getTime() - new Date(iso(row.issued_at)).getTime() !== CHALLENGE_TTL_MS) {
      throw new APIProblem(401, 'message_mismatch', 'Sign the exact message supplied by this server.');
    }
    const address = getAddress(row.address);
    let valid = false;
    try { valid = await verifyMessage({ address, message: row.message, signature: input.signature as Hex }); }
    catch { /* Malformed curve/recovery values are an invalid signature, not a server error. */ }
    if (!valid) throw new APIProblem(401, 'invalid_signature', 'The signature does not match this wallet and message.');

    let account: AccountInspection;
    try { account = await this.inspectAccount(chainId, address); }
    catch { throw new APIProblem(503, 'account_check_unavailable', 'The wallet account could not be checked.'); }
    if (!account || account.chainId !== chainId || typeof account.code !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(account.code)) {
      throw new APIProblem(503, 'account_check_unavailable', 'The wallet account could not be checked.');
    }
    if (account.code !== '0x') {
      throw new APIProblem(422, 'unsupported_wallet', 'Contract and delegated-code wallets are not supported in this implementation.');
    }

    const token = randomBytes(32).toString('base64url');
    return this.db.transaction(async tx => {
      // Coordinate with expired-challenge cleanup before selecting the commit-time validity window.
      await tx.query('SELECT pg_advisory_xact_lock(483972)');
      const committedAt = this.time();
      // Recheck time after signature/RPC work; one conditional write wins even with concurrent connections.
      const consumed = await tx.query(`UPDATE siwe_challenges SET consumed_at = $2
        WHERE id = $1 AND consumed_at IS NULL AND issued_at <= $2 AND expires_at > $2 RETURNING id`,
      [row.id, committedAt.toISOString()]);
      if (!consumed.rows.length) throw new APIProblem(401, 'challenge_unavailable', 'The sign-in request expired or has already been used.');
      const identity = await tx.query<{ id: string }>(`INSERT INTO wallet_identities (id, address, created_at) VALUES ($1,$2,$3)
        ON CONFLICT (address) DO UPDATE SET address = EXCLUDED.address RETURNING id`,
      [randomUUID(), row.address, committedAt.toISOString()]);
      const id = identity.rows[0]?.id;
      if (!id) throw new Error('Identity creation failed.');
      const expires = new Date(committedAt.getTime() + WALLET_SESSION_TTL_MS).toISOString();
      await tx.query(`INSERT INTO siwe_sessions
        (token_hash, identity_id, challenge_id, chain_id, origin, uri, created_at, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [hash(token), id, row.id, chainId, this.origin, this.uri, committedAt.toISOString(), expires]);
      return { access_token: token, expires_at: expires, user: { id, wallet_address: address, authentication: 'siwe', chain_id: chainId } };
    });
  }

  async authenticate(authorization: string | undefined): Promise<WalletIdentity> {
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new APIProblem(401, 'unauthorized', 'A valid wallet session is required.');
    const result = await this.db.query<{ id: string; address: string; chain_id: string }>(`SELECT i.id, i.address, s.chain_id
      FROM siwe_sessions s JOIN wallet_identities i ON i.id = s.identity_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.created_at <= $2 AND s.expires_at > $2
      AND s.origin = $3 AND s.uri = $4`, [hash(token), this.time().toISOString(), this.origin, this.uri]);
    const row = result.rows[0];
    if (!row || !this.chains.has(Number(row.chain_id))) throw new APIProblem(401, 'session_expired', 'The wallet session is expired or revoked.');
    return { id: row.id, wallet_address: getAddress(row.address), authentication: 'siwe', chain_id: Number(row.chain_id) };
  }

  async logout(authorization: string | undefined): Promise<void> {
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (token) await this.db.query('UPDATE siwe_sessions SET revoked_at = coalesce(revoked_at, $2) WHERE token_hash = $1',
      [hash(token), this.time().toISOString()]);
  }
}
