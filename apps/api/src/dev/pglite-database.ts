import { PGlite } from '@electric-sql/pglite';
import type { Database, Row, SQLConnection } from '../database.ts';

/** Local development/test driver only. The production entry point uses pg.Pool. */
export function pgliteDatabase(directory?: string): Database {
  const pg = new PGlite(directory);
  return {
    async query<T extends Row>(text: string, values: unknown[] = []) { return pg.query<T>(text, values); },
    async transaction<T>(work: (connection: SQLConnection) => Promise<T>) {
      return pg.transaction(async tx => work({
        async query<R extends Row>(text: string, values: unknown[] = []) { return tx.query<R>(text, values); },
      }));
    },
    async listen(channel: string, onMessage: (payload: string) => void) {
      if (!/^[a-z_]{1,63}$/.test(channel)) throw new Error('Invalid channel.');
      return pg.listen(channel, onMessage);
    },
    async close() { await pg.close(); },
  };
}
