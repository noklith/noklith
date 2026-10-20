import pg from 'pg';

export type Row = Record<string, unknown>;
export interface SQLConnection { query<T extends Row = Row>(text: string, values?: unknown[]): Promise<{ rows: T[] }> }
export interface Database extends SQLConnection {
  transaction<T>(work: (connection: SQLConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  /** LISTEN on a channel; notifications arrive only after the notifying transaction commits. Returns an unsubscribe. */
  listen(channel: string, onMessage: (payload: string) => void): Promise<() => Promise<void>>;
}
export function postgresDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  return {
    async query<T extends Row>(text: string, values: unknown[] = []) { return pool.query<T>(text, values); },
    async transaction<T>(work: (connection: SQLConnection) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async listen(channel, onMessage) {
      if (!/^[a-z_]{1,63}$/.test(channel)) throw new Error('Invalid channel.');
      let client: pg.PoolClient | undefined;
      let stopped = false;
      let retry: ReturnType<typeof setTimeout> | undefined;
      // A dedicated connection; reconnects after errors so signals resume without a restart.
      const connect = async () => {
        try {
          client = await pool.connect();
          client.on('notification', message => { if (message.channel === channel) onMessage(message.payload ?? ''); });
          client.on('error', () => { client?.release(true); client = undefined; if (!stopped) retry = setTimeout(connect, 5_000); });
          await client.query(`LISTEN ${channel}`);
        } catch {
          client?.release(true);
          client = undefined;
          if (!stopped) retry = setTimeout(connect, 5_000);
        }
      };
      await connect();
      return async () => {
        stopped = true;
        clearTimeout(retry);
        if (client) {
          try { await client.query(`UNLISTEN ${channel}`); } catch { /* connection already gone */ }
          client.release();
        }
      };
    },
    async close() { await pool.end(); },
  };
}
