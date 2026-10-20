import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { test } from 'node:test';
import { createRpcAccountInspector, RpcInspectionError } from '../src/auth/rpc.ts';
import type { RpcEndpointConfiguration, RpcInspectorOptions } from '../src/auth/rpc.ts';

// All transports below are in-memory mocks. No provider, wallet or private key is used.
const address = '0x1111111111111111111111111111111111111111';
const endpoint = { chainId: 84532, url: 'https://rpc.example/test-key?token=test-secret' };
interface Request { jsonrpc: string; id: string; method: string; params: unknown[] }
function mockFetch(handler: (request: Request, init: RequestInit, url: string) => Response | Promise<Response>): typeof fetch {
  return async (input, init) => {
    assert.ok(init);
    assert.equal(typeof init.body, 'string');
    return handler(JSON.parse(init.body as string) as Request, init, String(input));
  };
}
function reply(request: Request, result: unknown): Response {
  return Response.json({ jsonrpc: '2.0', id: request.id, result });
}
function validResult(request: Request, chainId = 84532, code = '0x'): unknown {
  if (request.method === 'eth_chainId') return `0x${chainId.toString(16)}`;
  if (request.method === 'eth_blockNumber') return '0x123abc';
  assert.equal(request.method, 'eth_getCode');
  return code;
}
const errorCode = (code: string) => (error: unknown) => {
  assert.ok(error instanceof RpcInspectionError);
  assert.equal(error.code, code);
  return true;
};

test('RPC inspection uses explicit HTTPS, actual chain ID, and one recorded block for account code', async () => {
  const requests: Request[] = [];
  const signals: AbortSignal[] = [];
  const adapter = createRpcAccountInspector([endpoint], { fetch: mockFetch((request, init, url) => {
    requests.push(request);
    signals.push(init.signal!);
    assert.equal(url, endpoint.url);
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
    assert.equal(new Headers(init.headers).get('content-type'), 'application/json');
    assert.equal(request.jsonrpc, '2.0');
    return reply(request, validResult(request));
  }) });
  assert.deepEqual(await adapter(84532, address), { chainId: 84532, code: '0x' });
  assert.deepEqual(requests.map(({ method, params }) => ({ method, params })), [
    { method: 'eth_chainId', params: [] },
    { method: 'eth_blockNumber', params: [] },
    { method: 'eth_getCode', params: [address, '0x123abc'] },
  ]);
  assert.equal(new Set(requests.map(request => request.id)).size, 3);
  assert.ok(signals.every(signal => signal === signals[0] && signal.aborted));
});

test('RPC configuration rejects defaults, mainnets, duplicates, insecure URLs and invalid limits', () => {
  const invalidEndpoints = [
    [], [endpoint, endpoint], [{ ...endpoint, chainId: 1 }], [{ ...endpoint, chainId: 8453 }],
    [{ ...endpoint, chainId: NaN }], [{ ...endpoint, chainId: '84532' }],
    ...['http://rpc.example', 'file:///rpc', 'wss://rpc.example', 'https://user:password@rpc.example',
      'https://@rpc.example', 'https://rpc.example/#fragment', 'https://rpc.example/#',
      'https://rpc.example/line\nbreak', 'https://rpc.example/back\\slash', ' https://rpc.example', ''].map(url => [{ ...endpoint, url }]),
  ];
  for (const value of invalidEndpoints) {
    assert.throws(() => createRpcAccountInspector(value as RpcEndpointConfiguration[]), errorCode('invalid_configuration'));
  }
  for (const options of [
    { timeoutMs: 0 }, { timeoutMs: 30_001 }, { timeoutMs: 1.5 }, { timeoutMs: NaN },
    { maxResponseBytes: 0 }, { maxResponseBytes: 1024 * 1024 + 1 }, { maxResponseBytes: 1.1 }, { fetch: false },
  ]) assert.throws(() => createRpcAccountInspector([endpoint], options as RpcInspectorOptions), errorCode('invalid_configuration'));
});

test('unsupported chains and invalid accounts fail before transport; both configured testnets are isolated', async () => {
  let calls = 0;
  const adapter = createRpcAccountInspector([endpoint, { chainId: 11155111, url: 'https://sepolia.example' }], {
    fetch: mockFetch((request, _init, url) => {
      calls++;
      return reply(request, validResult(request, url === endpoint.url ? 84532 : 11155111));
    }),
  });
  for (const chainId of [1, 8453, 0, NaN]) await assert.rejects(adapter(chainId, address), errorCode('unsupported_chain'));
  for (const value of ['', '0x' + '0'.repeat(40), '0x' + 'g'.repeat(40), address + '\n']) {
    await assert.rejects(adapter(84532, value as typeof address), errorCode('invalid_address'));
  }
  assert.equal(calls, 0);
  assert.deepEqual(await adapter(11155111, address), { chainId: 11155111, code: '0x' });
  assert.deepEqual(await adapter(84532, address), { chainId: 84532, code: '0x' });
  assert.equal(calls, 6);
});

test('actual chain mismatch stops inspection before reading a block or code', async () => {
  const methods: string[] = [];
  const adapter = createRpcAccountInspector([endpoint], { fetch: mockFetch(request => {
    methods.push(request.method);
    return reply(request, '0x1');
  }) });
  await assert.rejects(adapter(84532, address), errorCode('chain_mismatch'));
  assert.deepEqual(methods, ['eth_chainId']);
});

test('JSON-RPC envelopes require matching ID/version and fail closed on errors', async () => {
  const cases: Array<{ envelope: (request: Request) => unknown; code: string }> = [
    { envelope: () => null, code: 'invalid_response' },
    { envelope: () => [], code: 'invalid_response' },
    { envelope: () => '0x14a34', code: 'invalid_response' },
    { envelope: request => ({ jsonrpc: '1.0', id: request.id, result: '0x14a34' }), code: 'invalid_response' },
    { envelope: () => ({ jsonrpc: '2.0', id: 'other', result: '0x14a34' }), code: 'invalid_response' },
    { envelope: request => ({ jsonrpc: '2.0', id: request.id }), code: 'invalid_response' },
    { envelope: request => ({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: 'test-secret' } }), code: 'rpc_error' },
    { envelope: request => ({ jsonrpc: '2.0', id: request.id, result: '0x14a34', error: null }), code: 'rpc_error' },
  ];
  for (const { envelope, code } of cases) {
    const adapter = createRpcAccountInspector([endpoint], { fetch: mockFetch(request => Response.json(envelope(request))) });
    await assert.rejects(adapter(84532, address), errorCode(code));
  }
});

test('quantities and bytecode reject malformed encodings; nonempty code is returned for auth policy to reject', async () => {
  for (const method of ['eth_chainId', 'eth_blockNumber', 'eth_getCode']) {
    const values = method === 'eth_getCode' ? ['0x0', '0xz0', '00', null, 0] : ['0x', '0x00', '0x01', '1', '0x-1', '0x' + 'f'.repeat(65), null, 1];
    for (const value of values) {
      const adapter = createRpcAccountInspector([endpoint], { fetch: mockFetch(request => reply(request,
        request.method === method ? value : validResult(request))) });
      await assert.rejects(adapter(84532, address), errorCode('invalid_response'));
    }
  }
  for (const code of ['0x00', '0x6000', '0xef0100' + '11'.repeat(20)]) {
    const adapter = createRpcAccountInspector([endpoint], { fetch: mockFetch(request => reply(request, validResult(request, 84532, code))) });
    assert.equal((await adapter(84532, address)).code, code);
  }
});

test('response parsing rejects non-JSON types, missing bodies, invalid UTF-8 and malformed JSON', async () => {
  const responses = [
    () => new Response('{}'),
    () => new Response('{}', { headers: { 'content-type': 'text/html' } }),
    () => new Response(null, { headers: { 'content-type': 'application/json' } }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } }),
    () => new Response(new Uint8Array([0xc3, 0x28]), { headers: { 'content-type': 'application/json' } }),
    () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '-1' } }),
  ];
  for (const response of responses) {
    const adapter = createRpcAccountInspector([endpoint], { fetch: mockFetch(response) });
    await assert.rejects(adapter(84532, address), errorCode('invalid_response'));
  }
  const adapter = createRpcAccountInspector([endpoint], { fetch: mockFetch(request => {
    const response = reply(request, validResult(request));
    response.headers.set('content-type', 'Application/JSON; charset=utf-8');
    return response;
  }) });
  assert.equal((await adapter(84532, address)).code, '0x');
});

test('response byte budget applies to declared and streamed bytes, even with uncooperative cancellation', async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { if (!declared) controller.enqueue(new Uint8Array(65)); },
      cancel() { cancelled = true; return new Promise<void>(() => {}); },
    });
    const adapter = createRpcAccountInspector([endpoint], {
      timeoutMs: 1_000, maxResponseBytes: 64,
      fetch: mockFetch(() => new Response(stream, { headers: { 'content-type': 'application/json', ...(declared ? { 'content-length': '65' } : {}) } })),
    });
    await assert.rejects(adapter(84532, address), errorCode('response_too_large'));
    assert.equal(cancelled, true);
  }
  const adapter = createRpcAccountInspector([endpoint], { maxResponseBytes: 100, fetch: mockFetch(request => {
    // Fewer than 100 characters, but more than 100 UTF-8 bytes; header intentionally understates it.
    const body = JSON.stringify({ jsonrpc: '2.0', id: request.id, result: 'é'.repeat(15) });
    assert.ok(body.length <= 100);
    assert.ok(Buffer.byteLength(body) > 100);
    return new Response(body, { headers: { 'content-type': 'application/json', 'content-length': '1' } });
  }) });
  await assert.rejects(adapter(84532, address), errorCode('response_too_large'));
});

test('deadline bounds an uncooperative transport and aborts its signal', { timeout: 2_000 }, async () => {
  let signal: AbortSignal | undefined;
  const adapter = createRpcAccountInspector([endpoint], { timeoutMs: 25, fetch: mockFetch((_request, init) => {
    signal = init.signal!;
    return new Promise<Response>(() => {});
  }) });
  await assert.rejects(adapter(84532, address), errorCode('timeout'));
  assert.equal(signal?.aborted, true);
});

test('deadline bounds a stalled body and cancels it without awaiting a stalled cancel promise', { timeout: 2_000 }, async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; return new Promise<void>(() => {}); } });
  const adapter = createRpcAccountInspector([endpoint], {
    timeoutMs: 25, fetch: mockFetch(() => new Response(stream, { headers: { 'content-type': 'application/json' } })),
  });
  await assert.rejects(adapter(84532, address), errorCode('timeout'));
  assert.equal(cancelled, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stream.locked, false);
});

test('one deadline covers the complete inspection rather than resetting for each request', { timeout: 2_000 }, async () => {
  let calls = 0;
  const adapter = createRpcAccountInspector([endpoint], { timeoutMs: 45, fetch: mockFetch(async request => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 30));
    return reply(request, validResult(request));
  }) });
  await assert.rejects(adapter(84532, address), errorCode('timeout'));
  assert.ok(calls <= 2);
});

test('HTTP failure and redirected responses are rejected and their bodies cancelled', async () => {
  for (const status of [302, 429, 503, 200]) {
    let cancelled = false;
    const adapter = createRpcAccountInspector([endpoint], { fetch: mockFetch(() => {
      const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status });
      if (status === 200) Object.defineProperty(response, 'redirected', { value: true });
      return response;
    }) });
    await assert.rejects(adapter(84532, address), errorCode('http_error'));
    assert.equal(cancelled, true);
  }
});

test('TLS/transport and provider errors do not expose endpoint credentials, bodies or underlying causes', async () => {
  for (const failure of ['tls', 'redirect', 'rpc']) {
    const adapter = createRpcAccountInspector([endpoint], { fetch: mockFetch(request => {
      if (failure === 'rpc') return Response.json({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: endpoint.url } });
      throw new TypeError(`test-secret ${failure} ${endpoint.url}`, { cause: new Error('test-secret') });
    }) });
    await assert.rejects(adapter(84532, address), (error: unknown) => {
      assert.ok(error instanceof RpcInspectionError);
      assert.equal(error.code, failure === 'rpc' ? 'rpc_error' : 'transport');
      for (const rendered of [String(error), inspect(error), JSON.stringify(error)]) {
        assert.doesNotMatch(rendered, /test-secret|test-key|rpc\.example/);
      }
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});
