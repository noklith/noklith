import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app.ts';
import { migrate } from '../migrate.ts';
import { pgliteDatabase } from './pglite-database.ts';

export const fixtureDataDirectory = fileURLToPath(new URL('../../.local/fixture-db/', import.meta.url));

/** A separate explicit local entry point: never selected by ordinary server config. */
export async function startFixtureApp(options: { port?: number; logger?: boolean } = {}) {
  const port = options.port ?? 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid fixture port.');
  await mkdir(fixtureDataDirectory, { recursive: true });
  const db = pgliteDatabase(fixtureDataDirectory);
  const app = buildApp({ db, networkMode: 'fixture', logger: options.logger });
  app.addHook('onClose', async () => db.close());
  try {
    await migrate(db);
    const address = await app.listen({ host: '127.0.0.1', port });
    return { app, address };
  } catch (error) {
    await app.close();
    throw error;
  }
}
