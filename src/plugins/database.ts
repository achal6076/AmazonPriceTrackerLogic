import fp from 'fastify-plugin';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
  }
}

async function runMigrations(pool: Pool, log: FastifyInstance['log']) {
  // Create migrations tracking table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id      SERIAL PRIMARY KEY,
      name    TEXT UNIQUE NOT NULL,
      run_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query('SELECT id FROM _migrations WHERE name = $1', [file]);
    if (rows.length > 0) continue; // already applied

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    log.info(`Migration applied: ${file}`);
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await pool.query('SELECT 1');
  fastify.log.info('PostgreSQL connected');

  await runMigrations(pool, fastify.log);

  fastify.decorate('db', pool);

  fastify.addHook('onClose', async () => {
    await pool.end();
  });
});
