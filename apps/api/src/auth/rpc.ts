import { randomUUID } from 'node:crypto';
import { isAddress } from 'viem';
import type { Hex } from 'viem';
import { KNOWN_CHAIN_IDS } from '../chain/networks.ts';
import type { AccountInspection, AuthDependencies } from './service.ts';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESPONSE_BYTES = 128 * 1024;
const QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;

export interface RpcEndpointConfiguration { chainId: number; url: string }
export interface RpcInspectorOptions {
  /** Deadline for the entire inspection, including all response bodies. Maximum 30 seconds. */
  timeoutMs?: number;
  /** Maximum decoded bytes per response. Maximum 1 MiB. */
  maxResponseBytes?: number;
  /** Test seam. Production uses the native fetch implementation and its TLS validation. */
  fetch?: typeof globalThis.fetch;
}
export type RpcInspectionErrorCode = 'invalid_configuration' | 'unsupported_chain' | 'invalid_address'
  | 'timeout' | 'transport' | 'http_error' | 'invalid_response' | 'rpc_error' | 'chain_mismatch' | 'response_too_large';

/** Deliberately excludes endpoint URLs, provider bodies and underlying errors (which may contain keys). */
export class RpcInspectionError extends Error {
  readonly code: RpcInspectionErrorCode;
  constructor(code: RpcInspectionErrorCode) {
    super(`Wallet RPC account inspection failed (${code}).`);
    this.name = 'RpcInspectionError';
    this.code = code;
  }
}

function endpointURL(value: string): string {
  try {
    if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\#]/.test(value)
        || /^https:\/\/[^/?#]*@/i.test(value)) throw new Error();
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) throw new Error();
    return url.href;
  } catch { throw new RpcInspectionError('invalid_configuration'); }
}

function quantity(value: unknown): bigint {
  if (typeof value !== 'string' || value.length > 66 || !QUANTITY.test(value)) {
    throw new RpcInspectionError('invalid_response');
  }
  return BigInt(value);
}

async function readJSON(response: Response, maxBytes: number, signal: AbortSignal): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!contentType || !/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/.test(contentType) || !response.body) {
    throw new RpcInspectionError('invalid_response');
  }
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) throw new RpcInspectionError('invalid_response');
    if (BigInt(declaredLength) > BigInt(maxBytes)) throw new RpcInspectionError('response_too_large');
  }
  const reader = response.body.getReader();
  // Cancellation is best effort: a custom stream's cancel() may never settle.
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        throw new RpcInspectionError('response_too_large');
      }
      chunks.push(chunk.value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new RpcInspectionError('invalid_response'); }
}

export type RpcRequest = (method: string, params: readonly unknown[]) => Promise<unknown>;
export interface RpcSessionLimits { timeoutMs: number; maxBytes: number; fetch: typeof globalThis.fetch }

export function rpcLimits(options: RpcInspectorOptions, defaultMaxBytes = DEFAULT_MAX_RESPONSE_BYTES): RpcSessionLimits {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxResponseBytes ?? defaultMaxBytes;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000 || !Number.isInteger(maxBytes) || maxBytes < 1
      || maxBytes > 1024 * 1024 || typeof fetchImpl !== 'function') throw new RpcInspectionError('invalid_configuration');
  return { timeoutMs, maxBytes, fetch: fetchImpl };
}

export function knownEndpoints(endpoints: readonly RpcEndpointConfiguration[]): Map<number, string> {
  if (!Array.isArray(endpoints) || endpoints.length === 0) throw new RpcInspectionError('invalid_configuration');
  const urls = new Map<number, string>();
  for (const endpoint of endpoints) {
    if (!endpoint || !KNOWN_CHAIN_IDS.has(endpoint.chainId) || urls.has(endpoint.chainId)) {
      throw new RpcInspectionError('invalid_configuration');
    }
    urls.set(endpoint.chainId, endpointURL(endpoint.url));
  }
  return urls;
}

export { quantity as rpcQuantity };

/**
 * One bounded JSON-RPC session: a single deadline covers every request and body, with no redirects,
 * retries or cache. Errors never carry endpoint URLs, provider bodies or underlying causes.
 */
export async function rpcSession<T>(url: string, limits: RpcSessionLimits, work: (request: RpcRequest) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RpcInspectionError('timeout'));
      controller.abort();
    }, limits.timeoutMs);
  });
  const request: RpcRequest = async (method, params) => {
    controller.signal.throwIfAborted();
    const id = randomUUID();
    const response = await limits.fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), redirect: 'error',
      credentials: 'omit', cache: 'no-store', signal: controller.signal,
    });
    try {
      controller.signal.throwIfAborted();
      if (!response.ok || response.redirected) throw new RpcInspectionError('http_error');
      const body = await readJSON(response, limits.maxBytes, controller.signal);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RpcInspectionError('invalid_response');
      const envelope = body as Record<string, unknown>;
      if (envelope.jsonrpc !== '2.0' || envelope.id !== id) throw new RpcInspectionError('invalid_response');
      if (Object.hasOwn(envelope, 'error')) throw new RpcInspectionError('rpc_error');
      if (!Object.hasOwn(envelope, 'result')) throw new RpcInspectionError('invalid_response');
      return envelope.result;
    } finally {
      // Also release bodies rejected before readJSON acquires a reader.
      if (response.body && !response.body.locked) void response.body.cancel().catch(() => {});
    }
  };
  try { return await Promise.race([work(request), deadline]); }
  catch (error) {
    if (error instanceof RpcInspectionError) throw error;
    throw new RpcInspectionError('transport');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * Explicit operator-selected endpoints of known networks only (the network mode decides which). No default provider, redirects, retries or cache.
 * Each call checks the endpoint's actual chain ID and reads account code at one recorded block number.
 * This is a trusted-node account check, not a proof of chain state or transaction finality.
 */
export function createRpcAccountInspector(
  endpoints: readonly RpcEndpointConfiguration[], options: RpcInspectorOptions = {},
): AuthDependencies['inspectAccount'] {
  const limits = rpcLimits(options);
  const urls = knownEndpoints(endpoints);

  return async (chainId, address) => {
    const url = urls.get(chainId);
    if (!url) throw new RpcInspectionError('unsupported_chain');
    if (typeof address !== 'string' || !isAddress(address, { strict: true }) || /^0x0{40}$/i.test(address)) {
      throw new RpcInspectionError('invalid_address');
    }
    return rpcSession(url, limits, async (request): Promise<AccountInspection> => {
      const actualChainId = quantity(await request('eth_chainId', []));
      if (actualChainId !== BigInt(chainId)) throw new RpcInspectionError('chain_mismatch');
      const block = await request('eth_blockNumber', []);
      quantity(block);
      const code = await request('eth_getCode', [address, block]);
      if (typeof code !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) {
        throw new RpcInspectionError('invalid_response');
      }
      return { chainId: Number(actualChainId), code: code as Hex };
    });
  };
}
