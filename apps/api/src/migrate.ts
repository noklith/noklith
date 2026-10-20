import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { Database } from './database.ts';

export async function migrate(db: Database): Promise<void> {
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(name => /^[0-9]+_[a-z0-9_]+\.sql$/.test(name)).sort();
  await db.transaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(483971)');
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of files) {
      const sql = await readFile(new URL(file, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await tx.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE name = $1', [file]);
      if (previous.rows[0]) {
        if (previous.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${file}`);
        continue;
      }
      // This baseline uses statement-only SQL, with no embedded semicolons or function bodies.
      for (const statement of sql.split(';').filter(statement => statement.trim())) await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
    }
  });
}
