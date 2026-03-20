import { createPool } from '@acds/persistence-pg';
import type { Pool } from '@acds/persistence-pg';

let sharedPool: Pool | null = null;

export function getGritsPool(): Pool {
  if (!sharedPool) {
    const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/acds');
    sharedPool = createPool({
      host: databaseUrl.hostname,
      port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
      database: databaseUrl.pathname.replace(/^\//, ''),
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      ssl: databaseUrl.searchParams.get('sslmode') === 'require',
    });
  }
  return sharedPool;
}
