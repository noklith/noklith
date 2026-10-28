import { getAddress } from 'viem';
import type { DepositAddressResponse } from '../../../../packages/api-contracts/src/index.ts';
import type { ChainAdapter } from '../chain/adapter.ts';
import type { Database } from '../database.ts';
import { APIProblem } from '../errors.ts';
import type { DepositKeys } from './deposit-keys.ts';
import type { FundingNetwork, FundingService } from './service.ts';

/** Blocks scanned per network and token in one step; public RPC endpoints cap eth_getLogs ranges. */
const DEFAULT_BATCH_BLOCKS = 2_000n;
/** Recipients per eth_getLogs call (topic OR-list). */
const RECIPIENTS_PER_QUERY = 100;

/**
 * Personal deposit addresses and the watcher that turns confirmed transfers to them into top-ups.
 * Restart-safe: the scan position and every recorded transfer live in the database, and a transfer is
 * recorded at most once, so a step can be repeated after a crash or run concurrently.
 */
export class DepositService {
  private readonly db: Database;
  private readonly chain: ChainAdapter;
  private readonly funding: FundingService;
  private readonly networks: FundingNetwork[];
  private readonly keys: DepositKeys;
  private readonly now: () => Date;
  private readonly batchBlocks: bigint;

  constructor(options: { db: Database; chain: ChainAdapter; funding: FundingService; networks: FundingNetwork[]; keys: DepositKeys;
    now?: () => Date; batchBlocks?: bigint }) {
    if (!options.chain.latestBlock || !options.chain.incomingTransfers) throw new Error('Deposits need a chain adapter that can scan transfers.');
    this.db = options.db; this.chain = options.chain; this.funding = options.funding; this.networks = options.networks; this.keys = options.keys;
    this.now = options.now ?? (() => new Date()); this.batchBlocks = options.batchBlocks ?? DEFAULT_BATCH_BLOCKS;
  }

  private view(address: string): DepositAddressResponse {
    return {
      address: getAddress(address),
      networks: this.networks.map(network => ({ chain_id: network.chainId, name: network.name, confirmations: network.confirmations,
        assets: network.assets.map(asset => ({ symbol: asset.symbol, name: asset.name, token_address: getAddress(asset.tokenAddress), decimals: asset.decimals })) })),
    };
  }

  /** The caller's address, created on first request. Only users with a card get one, so a deposit always has a card to credit. */
  async addressFor(userID: string): Promise<DepositAddressResponse> {
    const existing = await this.db.query<{ address: string }>('SELECT address FROM deposit_addresses WHERE user_id = $1', [userID]);
    if (existing.rows[0]) return this.view(existing.rows[0].address);
    const card = await this.db.query('SELECT 1 FROM cards WHERE user_id = $1', [userID]);
    if (!card.rows.length) throw new APIProblem(409, 'card_required', 'Create your card before topping it up.');
    // Scanning starts at the current block for networks without a cursor yet: earlier blocks cannot hold a
    // transfer to an address that did not exist.
    const starts = new Map<number, bigint>();
    for (const network of this.networks) {
      try { starts.set(network.chainId, await this.chain.latestBlock!(network.chainId)); }
      catch { throw new APIProblem(503, 'network_unavailable', 'The network is not reachable right now. Try again in a minute.'); }
    }
    return this.db.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(7340022)');
      const again = await tx.query<{ address: string }>('SELECT address FROM deposit_addresses WHERE user_id = $1', [userID]);
      if (again.rows[0]) return this.view(again.rows[0].address);
      const next = await tx.query<{ next: number }>('SELECT COALESCE(MAX(derivation_index) + 1, 0)::int AS next FROM deposit_addresses');
      const index = Number(next.rows[0]!.next);
      const address = this.keys.address(index);
      const now = this.now().toISOString();
      await tx.query('INSERT INTO deposit_addresses (user_id, derivation_index, address, created_at) VALUES ($1, $2, $3, $4)', [userID, index, address, now]);
      for (const network of this.networks) {
        for (const asset of network.assets) {
          await tx.query(`INSERT INTO deposit_scan_cursors (chain_id, token_address, last_block, updated_at) VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING`, [network.chainId, asset.tokenAddress.toLowerCase(), starts.get(network.chainId)!.toString(), now]);
        }
      }
      return this.view(address);
    });
  }

  /** One watcher step for every network and token. Returns the number of deposits recorded. */
  async scan(): Promise<number> {
    let recorded = 0;
    for (const network of this.networks) {
      for (const asset of network.assets) recorded += await this.scanToken(network, asset.tokenAddress.toLowerCase());
    }
    return recorded;
  }

  private async scanToken(network: FundingNetwork, token: string): Promise<number> {
    const cursor = await this.db.query<{ last_block: string }>('SELECT last_block::text AS last_block FROM deposit_scan_cursors WHERE chain_id = $1 AND token_address = $2',
      [network.chainId, token]);
    if (!cursor.rows[0]) return 0; // No address issued yet.
    const from = BigInt(cursor.rows[0].last_block) + 1n;
    const latest = await this.chain.latestBlock!(network.chainId);
    // Only blocks with the network's required confirmations are scanned, so a recorded deposit is final.
    const safe = latest - BigInt(network.confirmations - 1);
    if (safe < from) return 0;
    const to = safe - from + 1n > this.batchBlocks ? from + this.batchBlocks - 1n : safe;
    const owners = new Map((await this.db.query<{ address: string; user_id: string }>('SELECT address, user_id FROM deposit_addresses')).rows
      .map(row => [row.address, row.user_id]));
    const addresses = [...owners.keys()];
    const transfers = [];
    for (let i = 0; i < addresses.length; i += RECIPIENTS_PER_QUERY) {
      transfers.push(...await this.chain.incomingTransfers!(network.chainId, token, addresses.slice(i, i + RECIPIENTS_PER_QUERY), from, to));
    }
    transfers.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
    let recorded = 0;
    for (const transfer of transfers) {
      const userID = owners.get(transfer.to);
      if (!userID) continue;
      const id = await this.db.transaction(tx => this.funding.recordDeposit(tx, { userID, chainId: network.chainId, tokenAddress: token,
        from: transfer.from, to: transfer.to, transactionHash: transfer.transactionHash, logIndex: transfer.logIndex,
        blockNumber: transfer.blockNumber, units: transfer.units, confirmations: Number(latest - transfer.blockNumber + 1n) }));
      if (id) recorded++;
    }
    // Advanced only after every transfer in the range was recorded; a failure above retries the same range.
    await this.db.query('UPDATE deposit_scan_cursors SET last_block = $3, updated_at = $4 WHERE chain_id = $1 AND token_address = $2 AND last_block < $3',
      [network.chainId, token, to.toString(), this.now().toISOString()]);
    return recorded;
  }
}

export interface DepositWatcher { stop(): Promise<void> }
/** In-process loop; RPC failures are reported and retried on the next tick. */
export function startDepositWatcher(service: DepositService, intervalMs = 15_000, onError: (error: unknown) => void = () => {}): DepositWatcher {
  let stopped = false;
  let running: Promise<void> = Promise.resolve();
  const tick = () => {
    if (stopped) return;
    running = service.scan().then(() => undefined, onError).finally(() => { if (!stopped) timer = setTimeout(tick, intervalMs); });
  };
  let timer = setTimeout(tick, 0);
  return { async stop() { stopped = true; clearTimeout(timer); await running; } };
}
