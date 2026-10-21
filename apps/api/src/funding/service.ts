import { randomUUID } from 'node:crypto';
import { encodeFunctionData, erc20Abi, getAddress } from 'viem';
import type { Hex } from 'viem';
import type { NetworkConfig, TopUp, TopUpStatus, TopUpTransactionRequest, WalletBalancesResponse } from '../../../../packages/api-contracts/src/index.ts';
import type { ChainAdapter, TransferFailure } from '../chain/adapter.ts';
import type { Database, SQLConnection } from '../database.ts';
import { centsToStablecoinUnits, parsePositiveCents } from '../domain/money.ts';
import { APIProblem } from '../errors.ts';
import type { CardIssuerAdapter } from '../issuer/issuer.ts';
import type { LimitsService } from '../limits.ts';
import { RiskService } from '../risk.ts';
import { recordUserEvent } from '../service.ts';

export interface FundingAsset { symbol: string; tokenAddress: string; decimals: number; name: string }
export interface FundingNetwork { chainId: number; name: string; assets: FundingAsset[]; confirmations: number; explorerTxURL: string;
  /** Gas currency, e.g. POL on Polygon. */
  nativeSymbol?: string; mainnet?: boolean }
export interface FundingConfiguration {
  networks: FundingNetwork[];
  /** Explicit operator-controlled recipient. Never an issuer address that does not exist. */
  recipient: string;
  quoteTtlMs: number;
  /** Extra time to submit a hash after the quote expired (the wallet may have broadcast late). */
  submitGraceMs: number;
  /** A submitted hash that never appears on chain fails after this time. */
  notFoundTimeoutMs: number;
  /** Our own fee on each top-up, in basis points of the paid amount (0 = none). */
  serviceFeeBps?: number;
}
export const DEFAULT_FUNDING_TIMING = { quoteTtlMs: 10 * 60_000, submitGraceMs: 60 * 60_000, notFoundTimeoutMs: 30 * 60_000 };

type IntentRow = {
  id: string; card_id: string; user_id: string; status: TopUpStatus; failure_reason: string | null; chain_id: string; asset: string;
  token_address: string; token_decimals: number; sender_address: string; recipient_address: string; amount_cents: string;
  token_units: string; service_fee_cents: string; credited_cents: string | null; transaction_hash: string | null; confirmations: number; funding_attempts: number; created_at: unknown;
  quote_expires_at: unknown; submit_deadline: unknown; updated_at: unknown; next_check_at: unknown; credited_at: unknown; submitted_at: unknown;
  needs_review_at: unknown;
};
/** How long one worker owns an issuer load before another may retry it. Longer than the issuer request timeout. */
const FUNDING_LEASE_MS = 2 * 60_000;
const FUNDING_ATTEMPTS_BEFORE_REVIEW = 24;
const WALLET_BALANCE_CACHE_MS = 15_000;
const ACTIVE: TopUpStatus[] = ['submitted', 'confirming', 'funding_pending'];
const iso = (value: unknown) => new Date(String(value)).toISOString();
const isoOrNull = (value: unknown) => (value === null || value === undefined ? null : iso(value));
const FAILURE_TEXT: Record<TransferFailure | 'transaction_not_found' | 'transfer_already_used', string> = {
  reverted: 'transaction_reverted', no_matching_transfer: 'no_matching_transfer', amount_mismatch: 'amount_mismatch',
  transaction_not_found: 'transaction_not_found', transfer_already_used: 'transfer_already_used',
};

export function publicNetworks(config: FundingConfiguration, recipient: string): NetworkConfig[] {
  return config.networks.map(network => ({
    chain_id: network.chainId, caip2: `eip155:${network.chainId}`, name: network.name, confirmations: network.confirmations,
    recipient_address: getAddress(recipient), explorer_tx_url: network.explorerTxURL,
    assets: network.assets.map(asset => ({ symbol: asset.symbol, name: asset.name, token_address: getAddress(asset.tokenAddress), decimals: asset.decimals })),
  }));
}

/**
 * Top-up intents: quoted → awaiting_signature → submitted → confirming → funding_pending → credited.
 * failed/cancelled/expired end an intent with a reason. A confirmed transfer and the issuer credit are
 * separate stages; a failed credit is retried from funding_pending and never asks for a new transfer.
 */
export class FundingService {
  private readonly db: Database;
  private readonly chain: ChainAdapter;
  private readonly issuer: CardIssuerAdapter;
  private readonly limits: LimitsService;
  private readonly config: FundingConfiguration;
  private readonly now: () => Date;
  private readonly risk: RiskService;
  /** Operator notice for a refill that needs a look (logged by the server). */
  private readonly onAlert?: (message: string) => void;

  constructor(options: { db: Database; chain: ChainAdapter; issuer: CardIssuerAdapter; limits: LimitsService; config: FundingConfiguration;
    now?: () => Date; risk?: RiskService; onAlert?: (message: string) => void }) {
    const { config } = options;
    if (!/^0x[0-9a-fA-F]{40}$/.test(config.recipient) || /^0x0{40}$/i.test(config.recipient)) throw new Error('A funding recipient address is required.');
    for (const network of config.networks) {
      if (!options.chain.chainIds.includes(network.chainId)) throw new Error('Every funding network requires a configured RPC endpoint.');
      if (!Number.isInteger(network.confirmations) || network.confirmations < 1 || network.confirmations > 1000) throw new Error('Invalid confirmation policy.');
      for (const asset of network.assets) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(asset.tokenAddress) || asset.decimals < 2 || asset.decimals > 36) throw new Error('Invalid funding asset.');
      }
    }
    this.db = options.db; this.chain = options.chain; this.issuer = options.issuer; this.limits = options.limits;
    this.config = config; this.now = options.now ?? (() => new Date()); this.onAlert = options.onAlert;
    this.risk = options.risk ?? new RiskService(options.limits);
  }

  get networks() { return publicNetworks(this.config, this.config.recipient); }

  private view(row: IntentRow): TopUp {
    const network = this.config.networks.find(item => item.chainId === Number(row.chain_id));
    const asset = network?.assets.find(item => item.symbol === row.asset);
    return {
      id: row.id, status: row.status, failure_reason: row.failure_reason, card_id: row.card_id,
      chain_id: Number(row.chain_id), network_name: network?.name ?? `eip155:${row.chain_id}`,
      asset: row.asset, asset_name: asset?.name ?? row.asset, token_address: getAddress(row.token_address), token_decimals: row.token_decimals,
      sender_address: getAddress(row.sender_address), recipient_address: getAddress(row.recipient_address),
      amount_cents: row.amount_cents, token_units: row.token_units,
      card_amount_cents: row.credited_cents ?? this.expectedCredit(row).toString(), minimum_card_amount_cents: row.credited_cents ?? this.expectedCredit(row).toString(),
      service_fee_cents: row.service_fee_cents,
      network_fee_note: `The network fee is paid in ${network?.mainnet ? '' : 'test '}${network?.nativeSymbol ?? 'ETH'} by your wallet and is shown there before you approve.`,
      simulated: false, transaction_hash: row.transaction_hash, confirmations: row.confirmations,
      required_confirmations: network?.confirmations ?? 1, created_at: iso(row.created_at), quote_expires_at: iso(row.quote_expires_at),
      submit_deadline: iso(row.submit_deadline), updated_at: iso(row.updated_at), credited_at: isoOrNull(row.credited_at),
      explorer_url: row.transaction_hash && network ? `${network.explorerTxURL}${row.transaction_hash}` : null,
    };
  }

  private serviceFee(cents: bigint) { return cents * BigInt(this.config.serviceFeeBps ?? 0) / 10_000n; }

  /** Card credit before the issuer answered: paid amount minus our fee and the issuer's expected fee. */
  private expectedCredit(row: { amount_cents: string; service_fee_cents: string }) {
    const toIssuer = BigInt(row.amount_cents) - BigInt(row.service_fee_cents);
    return toIssuer - this.issuer.topUpFeeCents(toIssuer);
  }

  private async own(connection: SQLConnection, userID: string, intentID: string, lock = false): Promise<IntentRow> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(intentID)) throw new APIProblem(404, 'top_up_not_found', 'Top-up not found.');
    const result = await connection.query<IntentRow>(`SELECT * FROM top_up_intents WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`, [intentID, userID]);
    const row = result.rows[0];
    if (!row) throw new APIProblem(404, 'top_up_not_found', 'Top-up not found.');
    return row;
  }

  private async update(tx: SQLConnection, id: string, fields: Record<string, unknown>): Promise<IntentRow> {
    const keys = Object.keys(fields);
    const assignments = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
    const result = await tx.query<IntentRow>(`UPDATE top_up_intents SET ${assignments}, updated_at = $${keys.length + 2} WHERE id = $1 RETURNING *`,
      [id, ...keys.map(key => fields[key]), this.now().toISOString()]);
    return result.rows[0]!;
  }

  /**
   * With a prefunded issuer balance (IZIPAY), a new quote must fit in what the balance still covers after
   * every open top-up, so a user's payment can never arrive with nothing to load the card from.
   * Quotes are serialized by a transaction lock so two users cannot both claim the last dollars.
   */
  private async checkCapacity(tx: SQLConnection, toIssuerCents: bigint): Promise<void> {
    if (!this.issuer.fundingCapacityCents) return;
    await tx.query('SELECT pg_advisory_xact_lock(7340021)');
    let balance: bigint;
    try { balance = await this.issuer.fundingCapacityCents(); }
    catch { throw new APIProblem(503, 'issuer_unavailable', 'Top-ups are temporarily unavailable. Try again in a few minutes.'); }
    const open = await tx.query<{ total: string | null }>(`SELECT SUM(amount_cents - service_fee_cents)::text AS total FROM top_up_intents
      WHERE status IN ('awaiting_signature', 'submitted', 'confirming', 'funding_pending')
         OR (status = 'quoted' AND quote_expires_at > $1)`, [this.now().toISOString()]);
    const available = balance - BigInt(open.rows[0]?.total ?? '0');
    if (toIssuerCents > available) {
      const most = available > 0n ? `$${available / 100n}.${String(available % 100n).padStart(2, '0')}` : null;
      throw new APIProblem(409, 'top_up_capacity', most ? `Top-ups up to ${most} are available right now.` : 'Top-ups are temporarily unavailable. Try again later.');
    }
  }

  /** Quote and reserve: the intent itself is the monthly limit reservation. */
  async create(tx: SQLConnection, input: { userID: string; walletAddress: string; chainID: number; asset: string; amountCents: unknown }): Promise<TopUp> {
    const network = this.config.networks.find(item => item.chainId === input.chainID);
    const asset = network?.assets.find(item => item.symbol === input.asset);
    if (!network || !asset) throw new APIProblem(422, 'unsupported_asset', 'This asset is not available on the selected network.');
    let cents: bigint;
    try { cents = parsePositiveCents(input.amountCents); }
    catch { throw new APIProblem(400, 'invalid_amount', 'Enter an amount in whole cents greater than zero.'); }
    const card = await tx.query<{ id: string; status: string }>('SELECT id, status FROM cards WHERE user_id = $1 FOR UPDATE', [input.userID]);
    const row = card.rows[0];
    if (!row) throw new APIProblem(409, 'card_required', 'Create your card before topping it up.');
    if (row.status === 'blocked_by_risk' || row.status === 'closed' || row.status === 'replaced') {
      throw new APIProblem(409, 'card_state_conflict', 'This card cannot be topped up.');
    }
    const now = this.now();
    await this.limits.checkTopUp(tx, row.id, cents, now);
    await this.limits.checkTopUpVelocity(tx, row.id, now);
    const serviceFee = this.serviceFee(cents);
    if (this.expectedCredit({ amount_cents: String(cents), service_fee_cents: String(serviceFee) }) <= 0n) {
      throw new APIProblem(422, 'amount_below_fees', 'This amount does not cover the top-up fees.');
    }
    await this.checkCapacity(tx, cents - serviceFee);
    const units = centsToStablecoinUnits(String(cents), asset.decimals);
    const id = randomUUID();
    const quoteExpires = new Date(now.getTime() + this.config.quoteTtlMs);
    const inserted = await tx.query<IntentRow>(`INSERT INTO top_up_intents
      (id, card_id, user_id, status, chain_id, asset, token_address, token_decimals, sender_address, recipient_address,
       amount_cents, token_units, created_at, quote_expires_at, submit_deadline, updated_at, service_fee_cents)
      VALUES ($1,$2,$3,'quoted',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$12,$15) RETURNING *`,
    [id, row.id, input.userID, network.chainId, asset.symbol, asset.tokenAddress.toLowerCase(), asset.decimals,
      input.walletAddress.toLowerCase(), this.config.recipient.toLowerCase(), cents.toString(), units.toString(), now.toISOString(),
      quoteExpires.toISOString(), new Date(quoteExpires.getTime() + this.config.submitGraceMs).toISOString(), serviceFee.toString()]);
    await recordUserEvent(tx, input.userID, 'top_up', id, now);
    return this.view(inserted.rows[0]!);
  }

  async get(userID: string, intentID: string): Promise<TopUp> {
    await this.expireDue();
    return this.view(await this.own(this.db, userID, intentID));
  }

  async list(userID: string): Promise<TopUp[]> {
    await this.expireDue();
    const result = await this.db.query<IntentRow>('SELECT * FROM top_up_intents WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20', [userID]);
    return result.rows.map(row => this.view(row));
  }

  /** The user accepted the terms; returns the exact ERC-20 transfer to approve in the external wallet. */
  async accept(tx: SQLConnection, userID: string, intentID: string): Promise<{ top_up: TopUp; transaction: TopUpTransactionRequest }> {
    let row = await this.own(tx, userID, intentID, true);
    const now = this.now();
    if (row.status === 'quoted' && new Date(iso(row.quote_expires_at)) <= now) {
      row = await this.update(tx, row.id, { status: 'expired', failure_reason: 'quote_expired' });
    }
    if (row.status !== 'quoted' && row.status !== 'awaiting_signature') {
      throw new APIProblem(409, 'top_up_state_conflict', row.status === 'expired' ? 'These terms expired. Start a new top-up.' : 'This top-up can no longer be signed.');
    }
    if (row.status === 'quoted') {
      row = await this.update(tx, row.id, { status: 'awaiting_signature' });
      await recordUserEvent(tx, userID, 'top_up', row.id, now);
    }
    return { top_up: this.view(row), transaction: this.transactionRequest(row) };
  }

  transactionRequest(row: IntentRow): TopUpTransactionRequest {
    return {
      chain_id: Number(row.chain_id), from: getAddress(row.sender_address), to: getAddress(row.token_address), value: '0x0',
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [getAddress(row.recipient_address), BigInt(row.token_units)] }),
    };
  }

  /** The hash is only a lookup key for verification; it never credits anything by itself. */
  async submitHash(tx: SQLConnection, userID: string, intentID: string, transactionHash: string): Promise<TopUp> {
    const hash = transactionHash.toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new APIProblem(400, 'invalid_transaction_hash', 'A 32-byte transaction hash is required.');
    const row = await this.own(tx, userID, intentID, true);
    if (row.transaction_hash === hash && ACTIVE.concat('credited').includes(row.status)) return this.view(row); // Safe retry.
    if (row.status !== 'awaiting_signature') throw new APIProblem(409, 'top_up_state_conflict', 'This top-up is not waiting for a transaction.');
    if (new Date(iso(row.submit_deadline)) <= this.now()) {
      await this.update(tx, row.id, { status: 'expired', failure_reason: 'submit_deadline_passed' });
      throw new APIProblem(409, 'top_up_state_conflict', 'This top-up expired before a transaction was received.');
    }
    const claimed = await tx.query(`SELECT id FROM top_up_intents WHERE chain_id = $1 AND transaction_hash = $2
      AND status NOT IN ('failed', 'cancelled', 'expired')`, [row.chain_id, hash]);
    const used = await tx.query('SELECT 1 FROM chain_transfers WHERE chain_id = $1 AND transaction_hash = $2', [row.chain_id, hash]);
    if (claimed.rows.length || used.rows.length) throw new APIProblem(409, 'transaction_already_used', 'This transaction is already linked to a top-up.');
    const updated = await this.update(tx, row.id, { status: 'submitted', transaction_hash: hash, submitted_at: this.now().toISOString(), next_check_at: this.now().toISOString() });
    await recordUserEvent(tx, userID, 'top_up', row.id, this.now());
    return this.view(updated);
  }

  async cancel(tx: SQLConnection, userID: string, intentID: string): Promise<TopUp> {
    const row = await this.own(tx, userID, intentID, true);
    if (row.status === 'cancelled') return this.view(row);
    if (row.status !== 'quoted' && row.status !== 'awaiting_signature') {
      throw new APIProblem(409, 'top_up_state_conflict', 'A submitted transaction cannot be cancelled here.');
    }
    const updated = await this.update(tx, row.id, { status: 'cancelled', failure_reason: 'user_cancelled' });
    await recordUserEvent(tx, userID, 'top_up', row.id, this.now());
    return this.view(updated);
  }

  /** Quotes past their deadlines release their limit reservation. */
  async expireDue(): Promise<void> {
    const now = this.now().toISOString();
    const expired = await this.db.query<{ id: string; user_id: string }>(`UPDATE top_up_intents SET status = 'expired',
      failure_reason = CASE WHEN status = 'quoted' THEN 'quote_expired' ELSE 'submit_deadline_passed' END, updated_at = $1
      WHERE (status = 'quoted' AND quote_expires_at <= $1) OR (status = 'awaiting_signature' AND submit_deadline <= $1)
      RETURNING id, user_id`, [now]);
    for (const row of expired.rows) await recordUserEvent(this.db, row.user_id, 'top_up', row.id, this.now());
  }

  private readonly balanceCache = new Map<string, { at: number; value: Promise<WalletBalancesResponse> }>();

  /**
   * Wallet balances on each funding network, for the top-up screen. Unavailable RPC is reported, not hidden.
   * Cached briefly per address, so polling cannot crowd out the RPC calls that verify refills.
   */
  async walletBalances(address: string): Promise<WalletBalancesResponse> {
    const key = address.toLowerCase(), now = this.now().getTime();
    const cached = this.balanceCache.get(key);
    if (cached && now - cached.at < WALLET_BALANCE_CACHE_MS) return cached.value;
    for (const [item, entry] of this.balanceCache) if (now - entry.at >= WALLET_BALANCE_CACHE_MS) this.balanceCache.delete(item);
    const value = this.readWalletBalances(address);
    this.balanceCache.set(key, { at: now, value });
    return value;
  }

  private async readWalletBalances(address: string): Promise<WalletBalancesResponse> {
    const networks: WalletBalancesResponse['networks'] = [];
    for (const network of this.config.networks) {
      try {
        if (!this.chain.balances) throw new Error('unsupported');
        const result = await this.chain.balances(network.chainId, address, network.assets.map(asset => asset.tokenAddress));
        networks.push({ chain_id: network.chainId, available: true, native_symbol: network.nativeSymbol ?? 'ETH', native_units: result.nativeUnits.toString(),
          assets: network.assets.map(asset => ({ symbol: asset.symbol, decimals: asset.decimals,
            units: (result.tokens.find(item => item.token.toLowerCase() === asset.tokenAddress.toLowerCase())?.units ?? 0n).toString() })) });
      } catch {
        networks.push({ chain_id: network.chainId, available: false, native_symbol: network.nativeSymbol ?? 'ETH', native_units: null,
          assets: network.assets.map(asset => ({ symbol: asset.symbol, decimals: asset.decimals, units: null })) });
      }
    }
    return { address: getAddress(address), networks };
  }

  /**
   * A confirmed transfer to a user's personal deposit address becomes a top-up that is already
   * funding_pending, so the usual card credit, retries and history apply. A deposit outside the limits,
   * below the fees, beyond the issuer capacity or for a card that cannot be topped up is still recorded,
   * but waits for the operator: the money has arrived and must never be ignored. Returns null for a
   * transfer that was already recorded, an unknown token, or dust below one cent.
   */
  async recordDeposit(tx: SQLConnection, deposit: { userID: string; chainId: number; tokenAddress: string; from: string; to: string;
    transactionHash: string; logIndex: number; blockNumber: bigint; units: bigint; confirmations: number }): Promise<string | null> {
    const network = this.config.networks.find(item => item.chainId === deposit.chainId);
    const asset = network?.assets.find(item => item.tokenAddress.toLowerCase() === deposit.tokenAddress.toLowerCase());
    if (!network || !asset) return null;
    const known = await tx.query('SELECT 1 FROM chain_transfers WHERE chain_id = $1 AND transaction_hash = $2 AND log_index = $3',
      [deposit.chainId, deposit.transactionHash.toLowerCase(), deposit.logIndex]);
    if (known.rows.length) return null;
    const cents = deposit.units / 10n ** BigInt(asset.decimals - 2);
    if (cents <= 0n) return null;
    const card = (await tx.query<{ id: string; status: string }>('SELECT id, status FROM cards WHERE user_id = $1 FOR UPDATE', [deposit.userID])).rows[0];
    if (!card) { this.onAlert?.(`Deposit ${deposit.transactionHash}:${deposit.logIndex} arrived for a user without a card; not recorded.`); return null; }
    const now = this.now();
    const serviceFee = this.serviceFee(cents);
    let problem: string | null = null;
    if (card.status === 'blocked_by_risk' || card.status === 'closed' || card.status === 'replaced') problem = `arrived for a card in state ${card.status}`;
    else if (this.expectedCredit({ amount_cents: String(cents), service_fee_cents: String(serviceFee) }) <= 0n) problem = 'does not cover the top-up fees';
    else {
      try {
        await this.limits.checkTopUp(tx, card.id, cents, now);
        await this.limits.checkTopUpVelocity(tx, card.id, now);
        await this.checkCapacity(tx, cents - serviceFee);
      } catch (error) {
        if (!(error instanceof APIProblem)) throw error;
        problem = `is outside the top-up limits or issuer capacity (${error.code})`;
      }
    }
    const id = randomUUID();
    const quoteExpires = new Date(now.getTime() + 1000).toISOString();
    await tx.query(`INSERT INTO top_up_intents
      (id, card_id, user_id, status, chain_id, asset, token_address, token_decimals, sender_address, recipient_address, amount_cents, token_units,
       transaction_hash, confirmations, created_at, quote_expires_at, submit_deadline, updated_at, submitted_at, next_check_at, needs_review_at,
       service_fee_cents, source)
      VALUES ($1,$2,$3,'funding_pending',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$14,$14,$16,$17,$18,'deposit')`,
    [id, card.id, deposit.userID, network.chainId, asset.symbol, asset.tokenAddress.toLowerCase(), asset.decimals, deposit.from.toLowerCase(),
      deposit.to.toLowerCase(), cents.toString(), deposit.units.toString(), deposit.transactionHash.toLowerCase(), deposit.confirmations,
      now.toISOString(), quoteExpires, problem ? null : now.toISOString(), problem ? now.toISOString() : null, serviceFee.toString()]);
    await tx.query(`INSERT INTO chain_transfers (chain_id, transaction_hash, log_index, intent_id, block_number, token_address,
      sender_address, recipient_address, token_units, verified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [network.chainId, deposit.transactionHash.toLowerCase(), deposit.logIndex, id, deposit.blockNumber.toString(), asset.tokenAddress.toLowerCase(),
      deposit.from.toLowerCase(), deposit.to.toLowerCase(), deposit.units.toString(), now.toISOString()]);
    await recordUserEvent(tx, deposit.userID, 'top_up', id, now);
    if (problem) this.onAlert?.(`Deposit top-up ${id} ${problem}; it waits for the operator (needs_review_at).`);
    return id;
  }

  /** Client-triggered refresh. Runs a verification step only when one is due, so polling cannot flood the RPC provider. */
  async check(userID: string, intentID: string): Promise<TopUp> {
    const row = await this.own(this.db, userID, intentID);
    const due = row.next_check_at === null || new Date(iso(row.next_check_at)) <= this.now();
    if (ACTIVE.includes(row.status) && due) await this.process(row.id);
    return this.get(userID, intentID);
  }

  /** Background step: verifies due intents. Restart-safe because all progress lives in the database. */
  async processDue(limit = 20): Promise<number> {
    await this.expireDue();
    const due = await this.db.query<{ id: string }>(`SELECT id FROM top_up_intents WHERE status IN ('submitted', 'confirming', 'funding_pending')
      AND needs_review_at IS NULL AND (next_check_at IS NULL OR next_check_at <= $1) ORDER BY next_check_at NULLS FIRST LIMIT $2`, [this.now().toISOString(), limit]);
    for (const { id } of due.rows) await this.process(id);
    return due.rows.length;
  }

  /** One verification/funding step for an intent. Safe to run concurrently or repeatedly. */
  async process(intentID: string): Promise<void> {
    const current = (await this.db.query<IntentRow>('SELECT * FROM top_up_intents WHERE id = $1', [intentID])).rows[0];
    if (!current) return;
    if (current.status === 'submitted' || current.status === 'confirming') await this.verify(current);
    const refreshed = (await this.db.query<IntentRow>('SELECT * FROM top_up_intents WHERE id = $1', [intentID])).rows[0];
    if (refreshed?.status === 'funding_pending') await this.fund(refreshed);
  }

  private later(ms: number) { return new Date(this.now().getTime() + ms).toISOString(); }

  private async verify(row: IntentRow): Promise<void> {
    const network = this.config.networks.find(item => item.chainId === Number(row.chain_id));
    if (!network || !row.transaction_hash) return;
    const credited = await this.db.query<{ log_index: number }>('SELECT log_index FROM chain_transfers WHERE chain_id = $1 AND transaction_hash = $2',
      [row.chain_id, row.transaction_hash]);
    let check;
    try {
      check = await this.chain.checkTransfer({
        chainId: network.chainId, transactionHash: row.transaction_hash as Hex, token: row.token_address, from: row.sender_address,
        to: row.recipient_address, units: BigInt(row.token_units), excludedLogIndexes: credited.rows.map(item => Number(item.log_index)),
      }, network.confirmations);
    } catch {
      // RPC unavailable: keep the state and retry; never fail a transfer because a provider is down.
      await this.db.transaction(tx => this.guarded(tx, row, { next_check_at: this.later(30_000) }));
      return;
    }
    await this.db.transaction(async tx => {
      const locked = (await tx.query<IntentRow>('SELECT * FROM top_up_intents WHERE id = $1 FOR UPDATE', [row.id])).rows[0];
      if (!locked || (locked.status !== 'submitted' && locked.status !== 'confirming')) return;
      const now = this.now();
      if (check.state === 'not_found') {
        const submittedAt = new Date(iso(locked.submitted_at ?? locked.updated_at));
        const deadline = new Date(Math.max(submittedAt.getTime(), new Date(iso(locked.quote_expires_at)).getTime()) + this.config.notFoundTimeoutMs);
        if (locked.status === 'submitted' && now >= deadline) await this.fail(tx, locked, 'transaction_not_found');
        else await this.update(tx, locked.id, { status: locked.status === 'confirming' ? 'submitted' : locked.status, confirmations: 0, next_check_at: this.later(15_000) });
        if (locked.status === 'confirming') await recordUserEvent(tx, locked.user_id, 'top_up', locked.id, now); // Reorganized out.
        return;
      }
      if (check.state === 'failed') { await this.fail(tx, locked, check.reason); return; }
      if (check.state === 'pending') {
        await this.update(tx, locked.id, { status: 'confirming', confirmations: check.confirmations, next_check_at: this.later(8_000) });
        if (locked.status !== 'confirming' || locked.confirmations !== check.confirmations) await recordUserEvent(tx, locked.user_id, 'top_up', locked.id, now);
        return;
      }
      const transfer = check.transfer;
      const inserted = await tx.query(`INSERT INTO chain_transfers (chain_id, transaction_hash, log_index, intent_id, block_number, token_address,
        sender_address, recipient_address, token_units, verified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT DO NOTHING RETURNING intent_id`, [locked.chain_id, locked.transaction_hash, transfer.logIndex, locked.id,
        transfer.blockNumber.toString(), transfer.token.toLowerCase(), transfer.from.toLowerCase(), transfer.to.toLowerCase(), transfer.units.toString(), now.toISOString()]);
      if (!inserted.rows.length) { await this.fail(tx, locked, 'transfer_already_used'); return; }
      await this.update(tx, locked.id, { status: 'funding_pending', confirmations: check.confirmations, next_check_at: now.toISOString() });
      await recordUserEvent(tx, locked.user_id, 'top_up', locked.id, now);
    });
  }

  private async guarded(tx: SQLConnection, row: IntentRow, fields: Record<string, unknown>) {
    const locked = (await tx.query<IntentRow>('SELECT status FROM top_up_intents WHERE id = $1 FOR UPDATE', [row.id])).rows[0];
    if (locked?.status === row.status) await this.update(tx, row.id, fields);
  }

  private async review(row: IntentRow, fields: Record<string, unknown>, problem: string) {
    await this.db.transaction(tx => this.guarded(tx, row, { ...fields, needs_review_at: this.now().toISOString(), next_check_at: null }));
    this.onAlert?.(`Top-up ${row.id} ${problem}; automatic retries stopped until the operator clears needs_review_at.`);
  }

  private async fail(tx: SQLConnection, row: IntentRow, reason: keyof typeof FAILURE_TEXT) {
    await this.update(tx, row.id, { status: 'failed', failure_reason: FAILURE_TEXT[reason], next_check_at: null });
    await recordUserEvent(tx, row.user_id, 'top_up', row.id, this.now());
  }

  private async fund(candidate: IntentRow): Promise<void> {
    // Claim the step before calling the issuer, so a worker tick and a client check never send two
    // concurrent loads. The lease outlasts the issuer timeout; a crash simply lets it expire and retry.
    const claimed = (await this.db.query<IntentRow>(`UPDATE top_up_intents SET next_check_at = $3
      WHERE id = $1 AND status = 'funding_pending' AND needs_review_at IS NULL AND (next_check_at IS NULL OR next_check_at <= $2) RETURNING *`,
    [candidate.id, this.now().toISOString(), this.later(FUNDING_LEASE_MS)])).rows[0];
    if (!claimed) return;
    const row = claimed;
    // Our service fee stays with the operator; the rest goes to the card.
    const requested = BigInt(row.amount_cents) - BigInt(row.service_fee_cents);
    let credited: bigint;
    try {
      const card = (await this.db.query<{ issuer_card_id: string | null }>('SELECT issuer_card_id FROM cards WHERE id = $1', [row.card_id])).rows[0];
      // Idempotent per intent: a retry after a crash cannot load the card twice at the issuer.
      ({ creditedCents: credited } = await this.issuer.fund({ cardId: row.card_id, issuerCardId: card?.issuer_card_id ?? null,
        reference: `top_up:${row.id}`, amountCents: requested }));
    } catch {
      const attempts = row.funding_attempts + 1;
      // Backoff up to 10 minutes. After many failures automatic retries stop, so a load the issuer may have
      // completed is never re-sent after its idempotency window; the operator checks it at the issuer first.
      if (attempts >= FUNDING_ATTEMPTS_BEFORE_REVIEW) {
        await this.review(row, { funding_attempts: attempts }, `could not be loaded onto the card after ${attempts} attempts`);
        return;
      }
      const delay = Math.min(10_000 * 2 ** Math.min(attempts - 1, 6), 10 * 60_000);
      await this.db.transaction(tx => this.guarded(tx, row, { funding_attempts: attempts, next_check_at: this.later(delay) }));
      return;
    }
    // The issuer may keep its own fee, never add to the load. Anything else means the call reached the
    // issuer: retrying could load it twice, so it waits for the operator instead of crediting a wrong amount.
    if (credited <= 0n || credited > requested) {
      await this.review(row, { funding_attempts: row.funding_attempts + 1 }, `got an unexpected card credit of ${credited} cents for ${requested} requested`);
      return;
    }
    await this.db.transaction(async tx => {
      const locked = (await tx.query<IntentRow>('SELECT * FROM top_up_intents WHERE id = $1 FOR UPDATE', [row.id])).rows[0];
      if (!locked || locked.status !== 'funding_pending') return;
      const network = this.config.networks.find(item => item.chainId === Number(locked.chain_id));
      const now = this.now();
      await tx.query(`INSERT INTO ledger_entries (id, card_id, source_key, kind, status, amount_cents, available_delta_cents, held_delta_cents,
        title, network, transaction_hash, occurred_at) VALUES ($1,$2,$3,'top_up','credited',$4,$4,0,$5,$6,$7,$8)
        ON CONFLICT (card_id, source_key) DO NOTHING`, [randomUUID(), locked.card_id, `top_up:${locked.id}`, credited.toString(),
        `Top-up · ${locked.asset} on ${network?.name ?? 'test network'}`, `eip155:${locked.chain_id}`, locked.transaction_hash, now.toISOString()]);
      await this.update(tx, locked.id, { status: 'credited', credited_cents: credited.toString(), funding_attempts: locked.funding_attempts + 1, credited_at: now.toISOString(), next_check_at: null });
      await recordUserEvent(tx, locked.user_id, 'top_up', locked.id, now);
      await recordUserEvent(tx, locked.user_id, 'history', locked.id, now);
      await recordUserEvent(tx, locked.user_id, 'card', locked.card_id, now);
      // Rules run after the credit: the funds arrived either way; a match pauses new spending. An IZIPAY card
      // cannot be paused at the issuer, so a pause recorded only here would mislead; the rules skip it.
      const card = (await tx.query<{ id: string; user_id: string; status: string; issuer_mode: string }>(
        'SELECT id, user_id, status, issuer_mode FROM cards WHERE id = $1 FOR UPDATE', [locked.card_id])).rows[0];
      const reason = card && card.issuer_mode !== 'izipay' ? await this.risk.afterTopUpCredited(tx, card.id, now) : null;
      if (card && reason) await this.risk.pause(tx, card, reason, now);
    });
  }
}

export interface FundingWorker { stop(): Promise<void> }
/** In-process background processor. One API process with a loop, not a separate service. */
export function startFundingWorker(service: FundingService, intervalMs = 5_000, onError: (error: unknown) => void = () => {}): FundingWorker {
  let stopped = false;
  let running: Promise<void> = Promise.resolve();
  const tick = () => {
    if (stopped) return;
    running = service.processDue().then(() => undefined, onError).finally(() => { if (!stopped) timer = setTimeout(tick, intervalMs); });
  };
  let timer = setTimeout(tick, 0);
  return { async stop() { stopped = true; clearTimeout(timer); await running; } };
}
