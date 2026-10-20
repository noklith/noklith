import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { AuthService, CHALLENGE_TTL_MS } from '../src/auth/service.ts';
import type { AuthConfiguration, AuthDependencies } from '../src/auth/service.ts';
import { AuthRateLimiter } from '../src/auth/rate-limit.ts';
import { postgresDatabase } from '../src/database.ts';
import type { Database, Row, SQLConnection } from '../src/database.ts';
import { migrate } from '../src/migrate.ts';

// Opt-in CI-only PostgreSQL checks. No user wallet, provider, persisted key or local database is used.
const configuredURL = process.env.TEST_POSTGRES_URL;
const skipped = configuredURL === undefined ? 'TEST_POSTGRES_URL is absent; real PostgreSQL concurrency is not verified' : false;
const config: AuthConfiguration = { origin: 'https://demo.example', uri: 'https://demo.example/sign-in', allowedChainIds: [84532] };
const eoa: AuthDependencies['inspectAccount'] = async chainId => ({ chainId, code: '0x' });
const start = () => new Date('2026-10-08T12:00:00.000Z');

function guardedURL(): URL {
  try {
    const url = new URL(configuredURL!);
    // Query options could override the validated host/database, so none are accepted from the operator.
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
        || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || url.pathname !== '/crypto_card_ci_test' || url.search || url.hash
        || /[\u0000-\u0020\u007f\\]/.test(configuredURL!)) throw new Error();
    return url;
  } catch { throw new Error('TEST_POSTGRES_URL must target loopback /crypto_card_ci_test without query options or a fragment.'); }
}

interface Context { databases: [Database, Database]; control: pg.Pool }
async function isolated(work: (context: Context) => Promise<void>): Promise<void> {
  const url = guardedURL();
  const control = new pg.Pool({ connectionString: url.href, max: 2, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
  const schema = `crypto_card_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^crypto_card_test_[a-f0-9]{32}$/);
  let namespaceOID: number | undefined;
  const databases: Database[] = [];
  try {
    const peer = (await control.query<{ database: string; address: string }>(
      'SELECT current_database() AS database, inet_server_addr()::text AS address',
    )).rows[0]!;
    assert.equal(peer.database, 'crypto_card_ci_test');
    // The connection target is guarded loopback. A Docker service can report its private bridge
    // address here because GitHub forwards the runner's localhost port into that container.
    assert.ok(peer.address, 'PostgreSQL must report a TCP server address');
    assert.equal((await control.query('SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = $1', [schema])).rows.length, 0);
    // Identifier contains only the validated generated prefix and lowercase hexadecimal UUID.
    await control.query(`CREATE SCHEMA "${schema}"`);
    namespaceOID = (await control.query<{ oid: number }>('SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = $1', [schema])).rows[0]!.oid;
    const scopedURL = new URL(url.href);
    scopedURL.searchParams.set('options', `-c search_path=${schema}`);
    databases.push(postgresDatabase(scopedURL.href), postgresDatabase(scopedURL.href));
    for (const database of databases) {
      assert.equal((await database.query<{ schema: string }>('SELECT current_schema() AS schema')).rows[0]!.schema, schema);
    }
    await migrate(databases[0]!);
    await work({ databases: databases as [Database, Database], control });
  } finally {
    const closed = await Promise.allSettled(databases.map(database => database.close()));
    try {
      if (namespaceOID !== undefined) {
        assert.match(schema, /^crypto_card_test_[a-f0-9]{32}$/);
        const namespace = (await control.query<{ oid: number; owned: boolean }>(
          'SELECT oid, pg_get_userbyid(nspowner) = current_user AS owned FROM pg_catalog.pg_namespace WHERE nspname = $1', [schema],
        )).rows[0];
        assert.equal(namespace?.oid, namespaceOID, 'Refuse to remove a replaced test namespace');
        assert.equal(namespace?.owned, true, 'Refuse to remove a namespace owned by another role');
        await control.query(`DROP SCHEMA "${schema}" CASCADE`);
        assert.equal((await control.query('SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = $1', [schema])).rows.length, 0);
      }
    } finally { await control.end(); }
    for (const result of closed) if (result.status === 'rejected') throw result.reason;
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

/** Hold all connections after BEGIN, before application SQL; prevents a serial pool from passing. */
function rendezvous(count: number) {
  let arrived = 0;
  const ready = deferred();
  return async () => {
    if (++arrived === count) ready.resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([ready.promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Independent PostgreSQL transactions did not rendezvous')), 5_000);
      })]);
    } finally { clearTimeout(timer); }
  };
}

function observe(database: Database, enter: (tx: SQLConnection) => Promise<void>, after?: (sql: string) => Promise<void>): Database {
  return {
    query: database.query.bind(database), close: database.close.bind(database), listen: database.listen.bind(database),
    transaction: work => database.transaction(async tx => {
      await enter(tx);
      return work({
        async query<T extends Row>(sql: string, values?: unknown[]) {
          const result = await tx.query<T>(sql, values);
          await after?.(sql);
          return result;
        },
      });
    }),
  };
}

test('real PostgreSQL: six independent concurrent SIWE verifications issue exactly one session', { skip: skipped, timeout: 30_000 }, async () => {
  await isolated(async ({ databases }) => {
    const account = privateKeyToAccount(generatePrivateKey());
    const creator = new AuthService(databases[0], config, { inspectAccount: eoa, now: start });
    const challenge = await creator.createChallenge(account.address, 84532);
    const input = { challengeId: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) };
    const pids = new Set<number>();
    const meet = rendezvous(6);
    const workers = databases.map(database => new AuthService(observe(database, async tx => {
      pids.add((await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
      await meet();
    }), config, { inspectAccount: eoa, now: start }));
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => workers[index % 2]!.verify(input)));
    assert.equal(pids.size, 6, 'Six different PostgreSQL connections must contend');
    const accepted = attempts.filter(attempt => attempt.status === 'fulfilled');
    assert.equal(accepted.length, 1);
    for (const attempt of attempts) if (attempt.status === 'rejected') assert.equal(attempt.reason.code, 'challenge_unavailable');
    assert.equal((await databases[0].query('SELECT token_hash FROM siwe_sessions')).rows.length, 1);
    assert.equal((await databases[1].query('SELECT id FROM wallet_identities')).rows.length, 1);
    const session = accepted[0]!.value;
    assert.deepEqual(await creator.authenticate(`Bearer ${session.access_token}`), session.user);
    const stored = (await databases[0].query<{ consumed_at: unknown }>('SELECT consumed_at FROM siwe_challenges WHERE id = $1', [challenge.id])).rows[0]!;
    assert.ok(stored.consumed_at);
  });
});

test('real PostgreSQL: rate limits share state across pools and maintenance waits for in-flight session creation', { skip: skipped, timeout: 30_000 }, async () => {
  await isolated(async ({ databases, control }) => {
    const pids = new Set<number>();
    const meet = rendezvous(10);
    const limiters = databases.map(database => new AuthRateLimiter(observe(database, async tx => {
      pids.add((await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
      await meet();
    }), start));
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, (_, index) =>
      limiters[index % 2]!.consume('challenge', '127.0.0.42', '0x1111111111111111111111111111111111111111')));
    assert.equal(pids.size, 10);
    assert.equal(attempts.filter(attempt => attempt.status === 'fulfilled').length, 3);
    for (const attempt of attempts) if (attempt.status === 'rejected') assert.equal(attempt.reason.code, 'auth_rate_limited');
    assert.equal((await databases[0].query('SELECT bucket_key FROM auth_rate_buckets')).rows.length, 3);

    // Separate pools also share the verify subject limit within this minute.
    const verifiers = databases.map(database => new AuthRateLimiter(database, start));
    const verificationAttempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      verifiers[index % 2]!.consume('verify', '127.0.0.43', '00000000-0000-4000-8000-000000000043')));
    assert.equal(verificationAttempts.filter(attempt => attempt.status === 'fulfilled').length, 5);
    for (const attempt of verificationAttempts) if (attempt.status === 'rejected') assert.equal(attempt.reason.code, 'auth_rate_limited');

    // Pause a valid verifier after consumption but before session INSERT. Maintenance's clock is
    // past challenge expiry; without the shared lock its snapshot can miss the future session FK.
    const consumed = deferred();
    const resume = deferred();
    const maintenanceEntered = deferred<number>();
    let verifierPID = 0;
    const observed = observe(databases[0], async tx => {
      verifierPID = (await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
    }, async sql => {
      if (sql.includes('UPDATE siwe_challenges SET consumed_at')) {
        consumed.resolve();
        await resume.promise;
      }
    });
    const auth = new AuthService(observed, config, { inspectAccount: eoa, now: start });
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = await auth.createChallenge(account.address, 84532);
    const signingInput = { challengeId: challenge.id, message: challenge.message, signature: await account.signMessage({ message: challenge.message }) };
    const signing = auth.verify(signingInput);
    // Observe rejection immediately even if setup fails before the final await.
    void signing.catch(() => {});
    let maintenance: Promise<void> | undefined;
    try {
      await Promise.race([consumed.promise, signing.then(() => { throw new Error('Session creation was not paused'); })]);
      const later = () => new Date(start().getTime() + CHALLENGE_TTL_MS + 1);
      const cleanup = new AuthRateLimiter(observe(databases[1], async tx => {
        maintenanceEntered.resolve((await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
      }), later);
      maintenance = cleanup.consume('challenge', '127.0.0.44', '0x4444444444444444444444444444444444444444');
      void maintenance.catch(() => {});
      const cleanupPID = await maintenanceEntered.promise;
      let blocked = false;
      const until = Date.now() + 5_000;
      while (Date.now() < until) {
        const activity = (await control.query<{ wait_event_type: string | null; blockers: number[] }>(
          'SELECT wait_event_type, pg_blocking_pids(pid) AS blockers FROM pg_catalog.pg_stat_activity WHERE pid = $1', [cleanupPID],
        )).rows[0];
        if (activity?.wait_event_type === 'Lock' && activity.blockers.includes(verifierPID)) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(blocked, true, 'Maintenance must wait for the verifier before taking its cleanup snapshot');
    } finally {
      resume.resolve();
      // Drain both operations before closing pools or dropping the isolated schema on any failure.
      await Promise.allSettled([signing, ...(maintenance ? [maintenance] : [])]);
    }
    const session = await signing;
    await maintenance;
    assert.deepEqual(await auth.authenticate(`Bearer ${session.access_token}`), session.user);
    assert.equal((await databases[1].query('SELECT id FROM siwe_challenges WHERE id = $1', [challenge.id])).rows.length, 1);
    assert.equal((await databases[1].query('SELECT token_hash FROM siwe_sessions WHERE challenge_id = $1', [challenge.id])).rows.length, 1);
    // Old limiter windows were removed, and the new request created only its three current buckets.
    assert.equal((await databases[1].query('SELECT bucket_key FROM auth_rate_buckets')).rows.length, 3);
  });
});

test('real PostgreSQL: concurrent top-up quotes from separate pools cannot exceed the monthly limit', { skip: skipped, timeout: 30_000 }, async () => {
  await isolated(async ({ databases }) => {
    const { DemoIssuer } = await import('../src/issuer/issuer.ts');
    const { LimitsService } = await import('../src/limits.ts');
    const { DEFAULT_FUNDING_TIMING, FundingService } = await import('../src/funding/service.ts');
    const user = randomUUID(), identity = randomUUID(), card = randomUUID();
    const address = privateKeyToAccount(generatePrivateKey()).address;
    await databases[0].query('INSERT INTO wallet_identities (id, address, created_at) VALUES ($1,$2,$3)', [identity, address.toLowerCase(), start().toISOString()]);
    await databases[0].query("INSERT INTO app_users (id, authentication, wallet_identity_id) VALUES ($1,'siwe',$2)", [user, identity]);
    await databases[0].query("INSERT INTO cards (id, user_id, status, last_four) VALUES ($1,$2,'active','1234')", [card, user]);
    // 4,700 USD already reserved: exactly one of six concurrent 300 USD quotes fits.
    for (let i = 0; i < 47; i++) {
      await databases[0].query(`INSERT INTO top_up_intents (id, card_id, user_id, status, chain_id, asset, token_address, token_decimals,
        sender_address, recipient_address, amount_cents, token_units, created_at, quote_expires_at, submit_deadline, updated_at)
        VALUES ($1,$2,$3,'quoted',84532,'USDC',$4,6,$4,$4,10000,100000000,$5,$6,$6,$5)`,
      [randomUUID(), card, user, address.toLowerCase(), start().toISOString(), new Date(start().getTime() + 600_000).toISOString()]);
    }
    const chain = { chainIds: [84532], checkTransfer: async () => ({ state: 'not_found' as const }) };
    const config = { recipient: '0x1111111111111111111111111111111111111111', ...DEFAULT_FUNDING_TIMING,
      networks: [{ chainId: 84532, name: 'Base Sepolia', confirmations: 3, explorerTxURL: 'https://sepolia.basescan.org/tx/',
        assets: [{ symbol: 'USDC', name: 'USDC', tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6 }] }] };
    const pids = new Set<number>();
    const meet = rendezvous(6);
    const services = databases.map(database => ({ database: observe(database, async tx => {
      pids.add((await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
      await meet();
    }), service: new FundingService({ db: database, chain, issuer: new DemoIssuer(),
      limits: new LimitsService(undefined, { topUpsPerHour: 100, topUpsPerDay: 100, purchasesPerHour: 100, purchasesPerDay: 100 }), config, now: start }) }));
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => {
      const { database, service } = services[index % 2]!;
      return database.transaction(tx => service.create(tx, { userID: user, walletAddress: address, chainID: 84532, asset: 'USDC', amountCents: '30000' }));
    }));
    assert.equal(pids.size, 6, 'Six different PostgreSQL connections must contend');
    assert.equal(attempts.filter(attempt => attempt.status === 'fulfilled').length, 1);
    for (const attempt of attempts) if (attempt.status === 'rejected') assert.equal(attempt.reason.code, 'limit_monthly_top_up');
    const total = (await databases[1].query<{ total: string }>("SELECT sum(amount_cents)::text AS total FROM top_up_intents WHERE status = 'quoted'")).rows[0]!.total;
    assert.equal(total, '500000');
  });
});

test('real PostgreSQL: concurrent top-up quotes and test purchases cannot exceed hourly velocity limits', { skip: skipped, timeout: 30_000 }, async () => {
  await isolated(async ({ databases }) => {
    const { DemoIssuer } = await import('../src/issuer/issuer.ts');
    const { LimitsService } = await import('../src/limits.ts');
    const { DEFAULT_FUNDING_TIMING, FundingService } = await import('../src/funding/service.ts');
    const { CardEventProcessor } = await import('../src/issuer/events.ts');
    const user = randomUUID(), identity = randomUUID(), card = randomUUID();
    const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    await databases[0].query('INSERT INTO wallet_identities (id, address, created_at) VALUES ($1,$2,$3)', [identity, address, start().toISOString()]);
    await databases[0].query("INSERT INTO app_users (id, authentication, wallet_identity_id) VALUES ($1,'siwe',$2)", [user, identity]);
    await databases[0].query("INSERT INTO cards (id, user_id, status, last_four) VALUES ($1,$2,'active','1234')", [card, user]);
    await databases[0].query(`INSERT INTO ledger_entries (id, card_id, source_key, kind, status, amount_cents, available_delta_cents, held_delta_cents, title, occurred_at)
      VALUES ($1,$2,'seed','top_up','credited',100000,100000,0,'Seed',$3)`, [randomUUID(), card, new Date(start().getTime() - 86_400_000).toISOString()]);
    // Four counted top-ups and nine purchases already in the last hour: exactly one more of each fits.
    for (let i = 0; i < 4; i++) {
      await databases[0].query(`INSERT INTO top_up_intents (id, card_id, user_id, status, chain_id, asset, token_address, token_decimals,
        sender_address, recipient_address, amount_cents, token_units, created_at, quote_expires_at, submit_deadline, updated_at)
        VALUES ($1,$2,$3,'quoted',84532,'USDC',$4,6,$4,$4,100,1000000,$5,$6,$6,$5)`,
      [randomUUID(), card, user, address, new Date(start().getTime() - 60_000).toISOString(), new Date(start().getTime() + 600_000).toISOString()]);
    }
    for (let i = 0; i < 9; i++) {
      const id = randomUUID();
      await databases[0].query(`INSERT INTO ledger_entries (id, card_id, source_key, kind, status, amount_cents, available_delta_cents, held_delta_cents, title, merchant, occurred_at)
        VALUES ($1,$2,$3,'authorization','held',100,-100,100,'Store','Store',$4)`, [id, card, id, new Date(start().getTime() - 120_000).toISOString()]);
    }
    const config = { recipient: '0x1111111111111111111111111111111111111111', ...DEFAULT_FUNDING_TIMING,
      networks: [{ chainId: 84532, name: 'Base Sepolia', confirmations: 3, explorerTxURL: 'https://sepolia.basescan.org/tx/',
        assets: [{ symbol: 'USDC', name: 'USDC', tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6 }] }] };
    const chain = { chainIds: [84532], checkTransfer: async () => ({ state: 'not_found' as const }) };

    const topUpPids = new Set<number>();
    const meetTopUps = rendezvous(6);
    const funding = databases.map(database => ({ database: observe(database, async tx => {
      topUpPids.add((await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
      await meetTopUps();
    }), service: new FundingService({ db: database, chain, issuer: new DemoIssuer(), limits: new LimitsService(), config, now: start }) }));
    const quotes = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => {
      const { database, service } = funding[index % 2]!;
      return database.transaction(tx => service.create(tx, { userID: user, walletAddress: address, chainID: 84532, asset: 'USDC', amountCents: '100' }));
    }));
    assert.equal(topUpPids.size, 6, 'Six different PostgreSQL connections must contend');
    assert.equal(quotes.filter(attempt => attempt.status === 'fulfilled').length, 1);
    for (const attempt of quotes) if (attempt.status === 'rejected') assert.equal(attempt.reason.code, 'limit_top_ups_per_hour');

    const purchasePids = new Set<number>();
    const meetPurchases = rendezvous(6);
    const processors = databases.map(database => new CardEventProcessor(observe(database, async tx => {
      purchasePids.add((await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
      await meetPurchases();
    }), new DemoIssuer(), new LimitsService(), start));
    const purchases = await Promise.all(Array.from({ length: 6 }, (_, index) =>
      processors[index % 2]!.simulate(user, { type: 'authorization', amount_cents: '100', merchant: 'Store' })));
    assert.equal(purchasePids.size, 6, 'Six different PostgreSQL connections must contend');
    assert.equal(purchases.filter(result => result.decision === 'approved').length, 1);
    assert.ok(purchases.filter(result => result.decision === 'declined').every(result => result.reason === 'limit_purchases_per_hour'));
    const held = (await databases[1].query<{ count: string }>("SELECT count(*)::text AS count FROM ledger_entries WHERE kind = 'authorization'")).rows[0]!.count;
    assert.equal(held, '10');
  });
});
