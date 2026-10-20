import { decodeEventLog, decodeFunctionResult, encodeFunctionData, erc20Abi, getAddress, isAddress, toEventSelector } from 'viem';
import type { Hex } from 'viem';
import type { RpcEndpointConfiguration, RpcInspectorOptions, RpcRequest } from '../auth/rpc.ts';
import { RpcInspectionError, rpcLimits, rpcQuantity, rpcSession, testnetEndpoints } from '../auth/rpc.ts';

export const TRANSFER_TOPIC = toEventSelector('Transfer(address,address,uint256)');

export interface ExpectedTransfer {
  chainId: number;
  transactionHash: Hex;
  token: string;
  from: string;
  to: string;
  units: bigint;
  /** Log indexes already credited for this hash; one hash may contain several transfers. */
  excludedLogIndexes?: readonly number[];
}
export interface VerifiedTransfer { logIndex: number; blockNumber: bigint; from: string; to: string; token: string; units: bigint }
export type TransferFailure = 'reverted' | 'no_matching_transfer' | 'amount_mismatch';
export type TransferCheck =
  | { state: 'not_found' }
  | { state: 'pending'; confirmations: number }
  | { state: 'failed'; reason: TransferFailure }
  | { state: 'confirmed'; confirmations: number; transfer: VerifiedTransfer };

/**
 * Reads chain state for funding. A client-supplied hash is only a lookup key: the receipt,
 * logs and confirmations decide. Implementations must not trust any client-provided field.
 */
export interface WalletBalances { nativeUnits: bigint; tokens: { token: string; units: bigint }[] }
export interface ChainAdapter {
  readonly chainIds: readonly number[];
  checkTransfer(expected: ExpectedTransfer, requiredConfirmations: number): Promise<TransferCheck>;
  /** Native (gas) and ERC-20 balances at the latest block. Display only; never used for crediting. */
  balances?(chainId: number, address: string, tokens: readonly string[]): Promise<WalletBalances>;
}

export interface ReceiptLog { address: string; topics: Hex[]; data: Hex; logIndex: number; removed: boolean }
export interface ReceiptShape { status: 'success' | 'reverted'; blockNumber: bigint; blockHash: string; transactionHash: string; logs: ReceiptLog[] }

const HEX_DATA = /^0x(?:[0-9a-fA-F]{2})*$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

function parseReceipt(value: unknown, hash: string): ReceiptShape | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RpcInspectionError('invalid_response');
  const receipt = value as Record<string, unknown>;
  if (typeof receipt.transactionHash !== 'string' || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()
      || typeof receipt.blockHash !== 'string' || !HASH.test(receipt.blockHash)
      || !Array.isArray(receipt.logs) || receipt.logs.length > 2048
      || (receipt.status !== '0x1' && receipt.status !== '0x0')) throw new RpcInspectionError('invalid_response');
  const logs = receipt.logs.map((entry: unknown): ReceiptLog => {
    if (!entry || typeof entry !== 'object') throw new RpcInspectionError('invalid_response');
    const log = entry as Record<string, unknown>;
    if (typeof log.address !== 'string' || !isAddress(log.address, { strict: false }) || !Array.isArray(log.topics)
        || log.topics.length > 4 || log.topics.some(topic => typeof topic !== 'string' || !HASH.test(topic))
        || typeof log.data !== 'string' || !HEX_DATA.test(log.data)) throw new RpcInspectionError('invalid_response');
    const logIndex = rpcQuantity(log.logIndex);
    if (logIndex > 1_000_000n) throw new RpcInspectionError('invalid_response');
    return { address: log.address.toLowerCase(), topics: log.topics as Hex[], data: log.data as Hex,
      logIndex: Number(logIndex), removed: log.removed === true };
  });
  return { status: receipt.status === '0x1' ? 'success' : 'reverted', blockNumber: rpcQuantity(receipt.blockNumber),
    blockHash: receipt.blockHash, transactionHash: receipt.transactionHash, logs };
}

/** Pure evaluation of one receipt; exported for tests. */
export function evaluateReceipt(receipt: ReceiptShape | null, latestBlock: bigint, expected: ExpectedTransfer, required: number): TransferCheck {
  if (!receipt) return { state: 'not_found' };
  if (receipt.blockNumber > latestBlock) return { state: 'pending', confirmations: 0 };
  const confirmations = Number(latestBlock - receipt.blockNumber + 1n);
  if (receipt.status === 'reverted') return { state: 'failed', reason: 'reverted' };
  const token = expected.token.toLowerCase(), from = expected.from.toLowerCase(), to = expected.to.toLowerCase();
  const excluded = new Set(expected.excludedLogIndexes ?? []);
  let sawWrongAmount = false;
  const matches: VerifiedTransfer[] = [];
  for (const log of receipt.logs) {
    if (log.removed || log.address !== token || log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
    let decoded;
    try { decoded = decodeEventLog({ abi: erc20Abi, eventName: 'Transfer', topics: log.topics as [Hex, ...Hex[]], data: log.data, strict: true }); }
    catch { continue; }
    const args = decoded.args;
    if (args.from.toLowerCase() !== from || args.to.toLowerCase() !== to) continue;
    if (args.value !== expected.units) { sawWrongAmount = true; continue; }
    if (excluded.has(log.logIndex)) continue;
    matches.push({ logIndex: log.logIndex, blockNumber: receipt.blockNumber, from: getAddress(args.from), to: getAddress(args.to),
      token: getAddress(log.address), units: args.value });
  }
  const first = matches.sort((a, b) => a.logIndex - b.logIndex)[0];
  if (!first) return { state: 'failed', reason: sawWrongAmount ? 'amount_mismatch' : 'no_matching_transfer' };
  if (confirmations < required) return { state: 'pending', confirmations };
  return { state: 'confirmed', confirmations, transfer: first };
}

/** JSON-RPC implementation over the bounded transport used for wallet sign-in checks. */
export function createEvmChainAdapter(endpoints: readonly RpcEndpointConfiguration[], options: RpcInspectorOptions = {}): ChainAdapter {
  const limits = rpcLimits(options, 1024 * 1024);
  const urls = testnetEndpoints(endpoints);
  return {
    chainIds: [...urls.keys()],
    async checkTransfer(expected, required) {
      const url = urls.get(expected.chainId);
      if (!url) throw new RpcInspectionError('unsupported_chain');
      if (!HASH.test(expected.transactionHash) || !Number.isInteger(required) || required < 1 || required > 1000) {
        throw new RpcInspectionError('invalid_configuration');
      }
      return rpcSession(url, limits, async (request: RpcRequest) => {
        const actual = rpcQuantity(await request('eth_chainId', []));
        if (actual !== BigInt(expected.chainId)) throw new RpcInspectionError('chain_mismatch');
        const receipt = parseReceipt(await request('eth_getTransactionReceipt', [expected.transactionHash]), expected.transactionHash);
        const latest = rpcQuantity(await request('eth_blockNumber', []));
        return evaluateReceipt(receipt, latest, expected, required);
      });
    },
    async balances(chainId, address, tokens) {
      const url = urls.get(chainId);
      if (!url) throw new RpcInspectionError('unsupported_chain');
      if (!isAddress(address, { strict: false }) || tokens.length > 4 || tokens.some(token => !isAddress(token, { strict: false }))) {
        throw new RpcInspectionError('invalid_address');
      }
      return rpcSession(url, limits, async request => {
        if (rpcQuantity(await request('eth_chainId', [])) !== BigInt(chainId)) throw new RpcInspectionError('chain_mismatch');
        const nativeUnits = rpcQuantity(await request('eth_getBalance', [address, 'latest']));
        const results = [];
        for (const token of tokens) {
          const data = encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(address)] });
          const raw = await request('eth_call', [{ to: token, data }, 'latest']);
          if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(raw)) throw new RpcInspectionError('invalid_response');
          results.push({ token: getAddress(token), units: decodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', data: raw as Hex }) });
        }
        return { nativeUnits, tokens: results };
      });
    },
  };
}
