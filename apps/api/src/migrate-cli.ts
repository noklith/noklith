import { readConfig } from './config.ts';
import { postgresDatabase } from './database.ts';
import { migrate } from './migrate.ts';
const db = postgresDatabase(readConfig().databaseURL);
try { await migrate(db); console.log('Migrations applied.'); }
finally { await db.close(); }
