import { fixtureDataDirectory, startFixtureApp } from './fixture-app.ts';

const rawPort = process.env.FIXTURE_PORT ?? '3000';
if (!/^[0-9]+$/.test(rawPort)) throw new Error('FIXTURE_PORT must be an integer port.');
const { app, address } = await startFixtureApp({ port: Number(rawPort), logger: true });
console.log(`Local fixture API: ${address}. PostgreSQL WASM data: ${fixtureDataDirectory}`);
console.log('Synthetic sessions and card data only. No wallet or blockchain connection. Press Ctrl+C to stop.');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { await app.close(); });
