import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthRateLimiter } from '../src/auth/rate-limit.ts';
import type { Database, Row, SQLConnection } from '../src/database.ts';

test('a request queued across a minute boundary obtains its time only after acquiring the database lock', async () => {
  let now = new Date('2026-10-08T01:00:59.999Z');
  let clockReads = 0;
  const insertExpiries: unknown[] = [];
  const deletedBefore: unknown[] = [];
  const tx: SQLConnection = {
    async query<T extends Row>(sql: string, values: unknown[] = []) {
      let rows: Row[] = [];
      if (sql.includes('pg_advisory_xact_lock')) {
        assert.equal(clockReads, 0);
        // Represents the time spent waiting for a pool connection or another worker's lock.
        now = new Date('2026-10-08T01:01:00.000Z');
      } else if (sql.startsWith('DELETE FROM auth_rate_buckets')) deletedBefore.push(values[0]);
      else if (sql.startsWith('SELECT count(*)')) rows = [{ count: '0' }];
      else if (sql.startsWith('INSERT INTO auth_rate_buckets')) {
        insertExpiries.push(values[1]);
        rows = [{ hits: 1 }];
      }
      return { rows: rows as T[] };
    },
  };
  const db: Database = {
    query: async () => { throw new Error('Rate-limit operations must run in their transaction.'); },
    transaction: async work => work(tx), close: async () => {}, listen: async () => async () => {},
  };
  const limiter = new AuthRateLimiter(db, () => { clockReads++; return now; });
  await limiter.consume('challenge', '192.0.2.1', '0x0000000000000000000000000000000000000001');
  assert.equal(clockReads, 1);
  assert.deepEqual(deletedBefore, ['2026-10-08T01:01:00.000Z']);
  assert.deepEqual(insertExpiries, Array(3).fill('2026-10-08T01:02:00.000Z'));
});
